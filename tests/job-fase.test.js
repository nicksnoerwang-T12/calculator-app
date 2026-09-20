'use strict';
// Test de pure fase-pipeline-logica (setJobFase, projectsKpi) uit werkbank-v2.html in isolatie.
// Fase 2.3: statusreeks Indicatie -> Opname -> Offerte verzonden -> Opdracht -> In werkplaats ->
// Montage -> Geleverd -> Gefactureerd, plus de zijtakken Afgewezen/Vervallen (met reden).
// De badge-opmaak/dropdown-binding en de echte dashboardkaart zijn afhankelijk van de DOM en
// worden hier niet nagebootst — handmatig gecontroleerd in de browser-pane, zelfde bekende
// beperking als bij de vorige stappen.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync('werkbank-v2.html', 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const escSource = script.slice(script.indexOf('const esc ='), script.indexOf('const rad ='));
const fnSource = script.slice(script.indexOf('function ensureJob'), script.indexOf('function customers(){const r=storageAdapter'));

const context = { console, Math, Number, Object, Array, String, Date, JSON, Set };
vm.createContext(context);
vm.runInContext(escSource + '\n' + fnSource + '\nthis.api = { JOB_FASES, JOB_FASE_LABELS, TERMINAL_FASES, faseBadgeHtml, setJobFase, projectsKpi };', context);
const { api } = context;

// setJobFase: kent een nieuwe fase + tijdstempel toe, en is puur (origineel object blijft onveranderd).
{
  const job = { fase: 'indicatie' };
  const now = new Date('2026-09-19T10:00:00.000Z');
  const job2 = api.setJobFase(job, 'in_werkplaats', now);
  assert.equal(job2.fase, 'in_werkplaats');
  assert.equal(job2.faseSince, now.toISOString());
  assert.equal(job.fase, 'indicatie', 'origineel job-object blijft onveranderd (puur)');
}

// setJobFase: onbekende fase wordt genegeerd, geeft hetzelfde object terug.
{
  const job = { fase: 'indicatie' };
  const job2 = api.setJobFase(job, 'onzin');
  assert.equal(job2, job, 'onbekende fase verandert niets');
}

// setJobFase: opnieuw dezelfde fase kiezen is een no-op (geen nieuwe faseSince), tenzij er een
// reden wordt meegegeven (afgewezen/vervallen kunnen een bijgewerkte reden krijgen).
{
  const job = { fase: 'montage', faseSince: '2026-01-01T00:00:00.000Z' };
  const job2 = api.setJobFase(job, 'montage', new Date('2026-09-19T10:00:00.000Z'));
  assert.equal(job2, job, 'zelfde fase opnieuw kiezen is een no-op');
}

// Afgewezen/vervallen dragen een reden; andere statussen niet.
{
  const job = { fase: 'opdracht' };
  const now = new Date('2026-09-19T10:00:00.000Z');
  const afgewezen = api.setJobFase(job, 'afgewezen', now, 'Klant koos een andere aannemer');
  assert.equal(afgewezen.faseReason, 'Klant koos een andere aannemer');
  const terugNaarOpdracht = api.setJobFase(afgewezen, 'opdracht', now);
  assert.equal(terugNaarOpdracht.faseReason, undefined, 'reden verdwijnt weer buiten afgewezen/vervallen');
}

// Alle 10 statussen (8 hoofdstappen + 2 zijtakken) hebben een label en een geldige toon.
{
  assert.equal(api.JOB_FASES.length, 10);
  const keys = api.JOB_FASES.map(([k]) => k);
  assert.deepEqual(keys, ['indicatie', 'opname', 'offerte_verzonden', 'opdracht', 'in_werkplaats', 'montage', 'geleverd', 'gefactureerd', 'afgewezen', 'vervallen']);
  for (const [key] of api.JOB_FASES) assert.ok(api.faseBadgeHtml(key).includes(api.JOB_FASE_LABELS[key]));
  assert.ok(api.faseBadgeHtml('niet-bestaand').includes('Indicatie'), 'onbekende/ontbrekende fase valt terug op Indicatie');
}

// Alleen gefactureerd/afgewezen/vervallen zijn terminaal; "geleverd" blijft lopend (moet nog
// gefactureerd worden — next-best-action "Factureer", zie 2.3).
{
  assert.deepEqual([...api.TERMINAL_FASES].sort(), ['afgewezen', 'gefactureerd', 'vervallen']);
  assert.ok(!api.TERMINAL_FASES.has('geleverd'), 'geleverd is niet terminaal: moet nog gefactureerd worden');
}

// projectsKpi: telt alleen niet-terminale klussen mee, en splitst per fase-bucket.
{
  const now = new Date('2026-09-19T10:00:00.000Z');
  const row = (fase, daysAgo) => {
    const d = new Date(now); d.setDate(d.getDate() - daysAgo);
    return { datum: d.toISOString(), data: { job: { fase } } };
  };
  const rows = [
    row('in_werkplaats', 5),
    row('in_werkplaats', 5),
    row('montage', 10),
    row('offerte_verzonden', 40),
    row('geleverd', 3),      // telt wel mee: geleverd is niet terminaal (nog te factureren)
    row('gefactureerd', 2),  // telt niet mee: terminaal
    row('afgewezen', 45),    // telt niet mee: terminaal
    row(undefined, 1),       // geen fase -> valt terug op indicatie, telt wel mee als lopend
  ];
  const kpi = api.projectsKpi(rows, now);
  assert.equal(kpi.total, 6, 'gefactureerd/afgewezen/vervallen tellen niet mee, geleverd wel');
  assert.equal(kpi.werkplaats, 2);
  assert.equal(kpi.montage, 1);
  assert.equal(kpi.wachtOpMateriaal, 1, 'derde bucket is nu offerte_verzonden');
}

// projectsKpi: delta vergelijkt lopende klussen aangemaakt in de laatste 30 dagen met de 30 dagen daarvoor.
{
  const now = new Date('2026-09-19T10:00:00.000Z');
  const row = (fase, daysAgo) => {
    const d = new Date(now); d.setDate(d.getDate() - daysAgo);
    return { datum: d.toISOString(), data: { job: { fase } } };
  };
  const rows = [row('in_werkplaats', 5), row('in_werkplaats', 10), row('montage', 20), row('in_werkplaats', 45)];
  const kpi = api.projectsKpi(rows, now);
  assert.equal(kpi.delta, 2, '3 lopende klussen in de laatste 30 dagen, 1 in de 30 dagen daarvoor');
}

console.log('fase-pipeline: statusovergangen (incl. reden) en dashboard-kpi-telling geslaagd');
