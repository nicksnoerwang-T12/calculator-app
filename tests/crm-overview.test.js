'use strict';
// Test de pure logica van CRM-pakket 3 (crm/crm.js): conversie-/doorlooptijd-/openstaand-KPI's
// op een fixture van 15 klussen met statushistorie, en .ics-agendabestanden (RFC 5545: CRLF,
// regels gevouwen op 75 tekens, verplichte velden). Geen DOM nodig.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync('werkbank-v2.html', 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const catalogSource = script.slice(script.indexOf('const SECTIONS ='), script.indexOf('function sectionOptions'));
const escSource = script.slice(script.indexOf('const esc ='), script.indexOf('const rad ='));
const coreSource = script.slice(script.indexOf('const MATERIAL_SCHEMA='), script.indexOf('function readCostInput'));
const full = fs.readFileSync('crm/crm.js', 'utf8');
const crmSource = full.slice(0, full.indexOf('/* ==================== UI ===================='));

let storageData = {};
const context = {
  console, Math, Number, Object, Array, String, Date, JSON, isFinite, parseFloat,
  safeGet: (key, fallback) => (key in storageData ? storageData[key] : fallback),
  safeSet: (key, value) => { storageData[key] = value; return true; },
  uid: () => 'id-' + Math.random().toString(36).slice(2),
  getPrices: () => ({ s235: 1.35 }),
  cloudSession: null, TERMINAL_FASES: new Set(['gefactureerd', 'afgewezen', 'vervallen']),
  CRM_ACTION_TYPES: { bellen: 'Bellen', factuur: 'Factuur', opname: 'Opname' },
};
vm.createContext(context);
vm.runInContext(escSource + '\n' + catalogSource + '\n' + coreSource + '\n' + crmSource +
  '\nthis.api = { crmConversionKpi, crmMedianDaysBetween, crmOutstandingKpi, crmProjectSaleTotal, icsFoldLine, icsEscapeText, icsDate, crmBuildIcs, CRM_PIPELINE_FASES };', context);
const { api } = context;

const NOW = new Date('2026-09-20T10:00:00.000Z');
const daysAgo = n => new Date(NOW.getTime() - n * 86400000).toISOString();

// Fixture: 15 klussen met verschillende statushistorie-patronen.
function job(id, history, saleFields) {
  return { id, data: { job: { fase: history[history.length - 1].fase, faseHistory: history }, ...(saleFields || {}) } };
}
const rows = [
  // 1-5: offerte_verzonden binnen 90 dagen, 3 geconverteerd naar opdracht, 2 niet.
  job('j1', [{ fase: 'offerte_verzonden', at: daysAgo(10) }, { fase: 'opdracht', at: daysAgo(5) }]),
  job('j2', [{ fase: 'offerte_verzonden', at: daysAgo(20) }, { fase: 'opdracht', at: daysAgo(12) }]),
  job('j3', [{ fase: 'offerte_verzonden', at: daysAgo(30) }, { fase: 'opdracht', at: daysAgo(18) }]),
  job('j4', [{ fase: 'offerte_verzonden', at: daysAgo(15) }]), // nog geen opdracht
  job('j5', [{ fase: 'offerte_verzonden', at: daysAgo(40) }]), // nog geen opdracht
  // 6: offerte_verzonden buiten de 90-dagen-cutoff -> telt niet mee in "laatste 90 dagen".
  job('j6', [{ fase: 'offerte_verzonden', at: daysAgo(120) }, { fase: 'opdracht', at: daysAgo(100) }]),
  // 7-9: opdracht -> geleverd, voor doorlooptijd-mediaan (7, 9, 11 dagen -> mediaan 9).
  job('j7', [{ fase: 'opdracht', at: daysAgo(30) }, { fase: 'geleverd', at: daysAgo(23) }]),
  job('j8', [{ fase: 'opdracht', at: daysAgo(30) }, { fase: 'geleverd', at: daysAgo(21) }]),
  job('j9', [{ fase: 'opdracht', at: daysAgo(30) }, { fase: 'geleverd', at: daysAgo(19) }]),
  // 10: geen relevante historie (alleen indicatie) -> telt nergens in mee, geen crash.
  job('j10', [{ fase: 'indicatie', at: daysAgo(2) }]),
  // 11-12: openstaand — offerte_verzonden en geleverd, met materiaal voor een echt bedrag.
  job('j11', [{ fase: 'offerte_verzonden', at: daysAgo(5) }], { qty: 1, materials: [{ id: 'm1', profile: 'plate', material: 's235', count: 1, countMode: 'project', priceBasis: 'kg', priceMode: 'manual', unitPrice: 100, waste: 0, dims: { length: 1000, width: 1000, t: 10 } }], overhead: 0, margin: 0 }),
  job('j12', [{ fase: 'geleverd', at: daysAgo(1) }], { qty: 1, materials: [{ id: 'm2', profile: 'plate', material: 's235', count: 1, countMode: 'project', priceBasis: 'kg', priceMode: 'manual', unitPrice: 50, waste: 0, dims: { length: 1000, width: 1000, t: 10 } }], overhead: 0, margin: 0 }),
  // 13-15: afgewezen/vervallen/gefactureerd — bewust niet meetellend in de openstaand-KPI.
  job('j13', [{ fase: 'afgewezen', at: daysAgo(3) }]),
  job('j14', [{ fase: 'vervallen', at: daysAgo(3) }]),
  job('j15', [{ fase: 'offerte_verzonden', at: daysAgo(2) }, { fase: 'gefactureerd', at: daysAgo(1) }]),
];
assert.equal(rows.length, 15, 'fixture van precies 15 klussen, zoals de acceptatie-eis vraagt');

/* ---------- KPI 1: conversie ---------- */
{
  const kpi = api.crmConversionKpi(rows, NOW, 90);
  // j1-j5 + j11 (openstaand-fixture) + j15 (gefactureerd-fixture) hebben allemaal een
  // offerte_verzonden binnen 90 dagen = 7; j6 (120 dagen geleden) telt niet mee.
  assert.equal(kpi.sent, 7, 'j1-j5, j11 en j15 verzonden binnen 90 dagen, j6 (120 dagen) telt niet mee');
  assert.equal(kpi.converted, 3, 'alleen j1-j3 zijn geconverteerd naar opdracht');
  assert.equal(kpi.pct, 43, '3 van de 7 ≈ 43%');
}

/* ---------- KPI 2: doorlooptijd ---------- */
{
  const median = api.crmMedianDaysBetween(rows, 'opdracht', 'geleverd');
  assert.equal(median, 9, 'mediaan van 7, 9, 11 dagen is 9');
  assert.equal(api.crmMedianDaysBetween(rows, 'geleverd', 'gefactureerd'), null, 'geen enkele klus doorloopt dit traject -> null, geen crash of 0');
}

/* ---------- KPI 3: openstaand ---------- */
{
  const kpi = api.crmOutstandingKpi(rows);
  assert.equal(kpi.verwachtCount, 1); assert.equal(kpi.teFacturerenCount, 1);
  assert.ok(kpi.verwachtCents > 0, 'j11 heeft een echt materiaalbedrag');
  assert.ok(kpi.teFacturerenCents > 0 && kpi.teFacturerenCents < kpi.verwachtCents, 'j12 is goedkoper dan j11');
}

/* ---------- .ics: opbouw en RFC 5545-vormvereisten ---------- */
{
  const action = { id: 'act-1', type: 'bellen', title: 'Offerte opvolgen bij een klant met een best wel lange naam die de regel breekt', dueAt: '2026-09-25T09:00:00.000Z' };
  const ics = api.crmBuildIcs([action], () => 'Jansen BV — Hekwerk', 'https://nicksnoerwang-t12.github.io/calculator-app/werkbank-v2.html', NOW);

  assert.ok(ics.includes('BEGIN:VCALENDAR\r\n'), 'CRLF-regeleinden');
  assert.ok(ics.includes('VERSION:2.0'));
  assert.ok(ics.includes('BEGIN:VEVENT') && ics.includes('END:VEVENT'));
  assert.ok(ics.includes('UID:act-1@werkbank.app'));
  assert.ok(ics.includes('DTSTART:20260925T090000Z'));
  assert.ok(ics.includes('BEGIN:VALARM') && ics.includes('TRIGGER:-PT30M'));
  assert.ok(ics.trim().endsWith('END:VCALENDAR'));

  // Elke fysieke regel (gescheiden door \r\n) mag niet langer zijn dan 75 tekens.
  const lines = ics.split('\r\n').filter(Boolean);
  for (const line of lines) assert.ok(line.length <= 75, 'regel te lang (' + line.length + '): ' + line);
  // Een gevouwen vervolgregel begint met precies één spatie.
  const summaryStart = lines.findIndex(l => l.startsWith('SUMMARY:'));
  assert.ok(lines[summaryStart + 1].startsWith(' '), 'de lange SUMMARY-regel is gevouwen naar een vervolgregel');

  // Meerdere acties -> één kalender met meerdere VEVENTs.
  const multi = api.crmBuildIcs([action, Object.assign({}, action, { id: 'act-2' })], () => 'x', null, NOW);
  assert.equal((multi.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.equal((multi.match(/BEGIN:VCALENDAR/g) || []).length, 1, 'nog steeds maar één VCALENDAR-omhulsel');
}

/* ---------- Foldhulpfuncties los ---------- */
{
  assert.equal(api.icsFoldLine('kort'), 'kort');
  const long = 'x'.repeat(100);
  const folded = api.icsFoldLine(long);
  assert.ok(folded.includes('\r\n '));
  assert.equal(api.icsEscapeText('a;b,c\nd'), 'a\\;b\\,c\\nd');
  assert.equal(api.icsDate('2026-01-05T08:30:00.000Z'), '20260105T083000Z');
}

console.log('crm-overzicht: conversie-/doorlooptijd-/openstaand-KPI\'s en .ics-agenda-export kloppen (15-klussen-fixture, RFC 5545-regelvouwing)');
