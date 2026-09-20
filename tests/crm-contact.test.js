'use strict';
// Test de pure logica van CRM-pakket 2 (crm/crm.js): E.164-normalisatie, wa.me/mailto/tel-links,
// sjabloon-placeholders, haversine-afstand, tijdlijn-opbouw. Geen DOM nodig.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const full = fs.readFileSync('crm/crm.js', 'utf8');
const src = full.slice(0, full.indexOf('/* ==================== UI ===================='));
let storageData = {}, uidSerial = 0;
const context = {
  console, Math, Number, Object, Array, String, Date, JSON, isFinite, encodeURIComponent,
  safeGet: (key, fallback) => (key in storageData ? storageData[key] : fallback),
  safeSet: (key, value) => { storageData[key] = value; return true; },
  uid: () => 'a' + (++uidSerial),
  TERMINAL_FASES: new Set(['gefactureerd', 'afgewezen', 'vervallen']),
};
vm.createContext(context);
vm.runInContext(src + '\nthis.api = { crmLog, crmSaveLog, crmMakeLogEntry, crmNormalizePhone, crmWaLink, crmMailtoLink, crmTelLink, crmFillTemplate, crmDefaultTemplates, crmTemplates, crmSaveTemplates, crmHaversineKm, crmNearbyCustomers, crmTimelineFor, crmGroupTimelineByDay };', context);
const { api } = context;

/* ---------- E.164-normalisatie (10 gevallen) ---------- */
{
  const cases = [
    ['06-12345678', '+31612345678'],
    ['0612345678', '+31612345678'],
    ['+31612345678', '+31612345678'],
    ['0031612345678', '+31612345678'],
    ['020 1234567', '+31201234567'],
    ['(020) 1234567', '+31201234567'],
    ['', ''],
    [null, ''],
    ['0044 20 1234 567', '+442012345 67'.replace(/\s/g, '')], // buitenlands via 00-prefix
    ['+44 20 1234 5678', '+442012345678'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(api.crmNormalizePhone(input), expected, 'normaliseer ' + JSON.stringify(input));
  }
}

/* ---------- Links ---------- */
{
  assert.equal(api.crmTelLink('06 12345678'), 'tel:+31612345678');
  const wa = api.crmWaLink('06-12345678', 'Hallo daar');
  assert.equal(wa, 'https://wa.me/31612345678?text=' + encodeURIComponent('Hallo daar'));
  assert.equal(api.crmWaLink('0612345678'), 'https://wa.me/31612345678', 'zonder tekst geen ?text=');
  const mail = api.crmMailtoLink('klant@voorbeeld.nl', 'Offerte', 'Hallo klant');
  assert.equal(mail, 'mailto:klant@voorbeeld.nl?subject=' + encodeURIComponent('Offerte') + '&body=' + encodeURIComponent('Hallo klant'));
  assert.equal(api.crmMailtoLink('klant@voorbeeld.nl'), 'mailto:klant@voorbeeld.nl', 'zonder subject/body geen ?');
}

/* ---------- Sjabloon-placeholders ---------- */
{
  const filled = api.crmFillTemplate('Hallo {klant}, over {klus} ({bedrag}) op {datum} — groet, {bedrijf}', { klant: 'Jansen', klus: 'Hekwerk', bedrag: '€ 500,00' });
  assert.equal(filled, 'Hallo Jansen, over Hekwerk (€ 500,00) op  — groet, ', 'ontbrekende variabelen worden stil leeg, geen "undefined"');
  assert.equal(api.crmDefaultTemplates().length, 5, 'precies 5 standaardsjablonen, zoals gevraagd');
  assert.ok(api.crmDefaultTemplates().every(t => t.text.length > 0));
}

/* ---------- Haversine ---------- */
{
  // Amsterdam Dam (52.3730,4.8926) naar Utrecht Domtoren (52.0908,5.1214) is ca. 35-36 km hemelsbreed.
  const km = api.crmHaversineKm(52.3730, 4.8926, 52.0908, 5.1214);
  assert.ok(km > 33 && km < 38, 'Amsterdam-Utrecht is ~35 km, kreeg ' + km);
  assert.equal(api.crmHaversineKm(52, 5, 52, 5), 0, 'afstand tot zichzelf is 0');

  const list = [
    { id: 'c1', name: 'Dichtbij', lat: 52.3731, lng: 4.8927 },
    { id: 'c2', name: 'Ver weg', lat: 51.9, lng: 4.5 },
    { id: 'c3', name: 'Geen coördinaten' }
  ];
  const nearby = api.crmNearbyCustomers(list, 52.3730, 4.8926, 15);
  assert.deepEqual(nearby.map(x => x.customer.id), ['c1'], 'alleen binnen de straal, klanten zonder coördinaten worden overgeslagen');
}

/* ---------- Tijdlijn ---------- */
{
  const logs = [api.crmMakeLogEntry({ customerId: 'c1', channel: 'bellen', note: '' }, new Date('2026-09-18T10:00:00Z'))];
  const actions = [
    Object.assign(api.crmMakeLogEntry({}, new Date('2026-09-19T09:00:00Z')), { id: 'act1', customerId: 'c1', type: 'bellen', title: 'x', done: true, doneAt: '2026-09-19T15:00:00Z', createdAt: '2026-09-19T09:00:00Z' })
  ];
  const rows = [{ id: 'p1', data: { project: 'Hekwerk', job: { customerId: 'c1', faseHistory: [{ fase: 'indicatie', at: '2026-09-17T08:00:00Z' }, { fase: 'opname', at: '2026-09-20T08:00:00Z' }] } } }];
  const items = api.crmTimelineFor('c1', logs, actions, rows);
  // Verwacht: fase opname (20/9) > actie afgerond (19/9 15u) > actie aangemaakt (19/9 9u) > log (18/9) > fase indicatie (17/9) — nieuwste boven.
  assert.deepEqual(items.map(x => x.kind), ['fase', 'action-done', 'action-created', 'log', 'fase']);
  const grouped = api.crmGroupTimelineByDay(items);
  assert.equal(grouped.length, 4, 'gegroepeerd per dag: 20/9, 19/9, 18/9, 17/9');
  assert.equal(grouped[1].items.length, 2, '19/9 bevat zowel de aangemaakte als de afgeronde actie');

  // Een klant zonder gekoppelde acties/logs/klussen krijgt een lege tijdlijn, geen crash.
  assert.deepEqual(api.crmTimelineFor('onbekend', logs, actions, rows), []);

  // Verzonden offerte-/factuurdocumenten (quotes/) horen ook in de tijdlijn, zoals gevraagd —
  // optioneel argument, dus bestaande aanroepen zonder quotes (hierboven) blijven werken.
  const quotes = [{ jobId: 'p1', number: 'OFF-2026-0001', sentAt: '2026-09-21T09:00:00Z', sentChannel: 'whatsapp' }, { jobId: 'p1', number: 'OFF-2026-0002', sentAt: null }];
  const withDocs = api.crmTimelineFor('c1', logs, actions, rows, quotes);
  assert.equal(withDocs[0].kind, 'document', 'het verstuurde document (21/9) staat bovenaan, ná de fase van 20/9');
  assert.equal(withDocs[0].entry.number, 'OFF-2026-0001');
  assert.equal(withDocs.filter(x => x.kind === 'document').length, 1, 'een niet-verzonden offerte (sentAt: null) komt niet in de tijdlijn');
}

console.log('crm-contact: E.164-normalisatie, wa.me/mailto/tel-links, sjabloon-placeholders, haversine en tijdlijn-opbouw kloppen');
