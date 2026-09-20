'use strict';
// Test de pure fase-pipeline-logica (setJobFase, projectsKpi) uit werkbank-v2.html in isolatie.
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
  const job = { fase: 'offerte' };
  const now = new Date('2026-09-19T10:00:00.000Z');
  const job2 = api.setJobFase(job, 'werkplaats', now);
  assert.equal(job2.fase, 'werkplaats');
  assert.equal(job2.faseSince, now.toISOString());
  assert.equal(job.fase, 'offerte', 'origineel job-object blijft onveranderd (puur)');
}

// setJobFase: onbekende fase wordt genegeerd, geeft hetzelfde object terug.
{
  const job = { fase: 'offerte' };
  const job2 = api.setJobFase(job, 'onzin');
  assert.equal(job2, job, 'onbekende fase verandert niets');
}

// setJobFase: opnieuw dezelfde fase kiezen is een no-op (geen nieuwe faseSince).
{
  const job = { fase: 'montage', faseSince: '2026-01-01T00:00:00.000Z' };
  const job2 = api.setJobFase(job, 'montage', new Date('2026-09-19T10:00:00.000Z'));
  assert.equal(job2, job, 'zelfde fase opnieuw kiezen is een no-op');
}

// Alle 7 statussen hebben een label en een geldige toon.
{
  assert.equal(api.JOB_FASES.length, 7);
  for (const [key] of api.JOB_FASES) assert.ok(api.faseBadgeHtml(key).includes(api.JOB_FASE_LABELS[key]));
  assert.ok(api.faseBadgeHtml('niet-bestaand').includes('Offerte'), 'onbekende/ontbrekende fase valt terug op Offerte');
}

// geleverd/afgekeurd zijn de enige terminale (niet-lopende) statussen.
{
  assert.deepEqual([...api.TERMINAL_FASES].sort(), ['afgekeurd', 'geleverd']);
}

// projectsKpi: telt alleen niet-terminale klussen mee, en splitst per fase-bucket.
{
  const now = new Date('2026-09-19T10:00:00.000Z');
  const row = (fase, daysAgo) => {
    const d = new Date(now); d.setDate(d.getDate() - daysAgo);
    return { datum: d.toISOString(), data: { job: { fase } } };
  };
  const rows = [
    row('werkplaats', 5),
    row('werkplaats', 5),
    row('montage', 10),
    row('wacht_op_materiaal', 40),
    row('geleverd', 3),   // telt niet mee: terminaal
    row('afgekeurd', 45), // telt niet mee: terminaal
    row(undefined, 1),    // geen fase -> valt terug op offerte, telt wel mee als lopend
  ];
  const kpi = api.projectsKpi(rows, now);
  assert.equal(kpi.total, 5, 'geleverd/afgekeurd tellen niet mee bij lopende projecten');
  assert.equal(kpi.werkplaats, 2);
  assert.equal(kpi.montage, 1);
  assert.equal(kpi.wachtOpMateriaal, 1);
}

// projectsKpi: delta vergelijkt lopende klussen aangemaakt in de laatste 30 dagen met de 30 dagen daarvoor.
{
  const now = new Date('2026-09-19T10:00:00.000Z');
  const row = (fase, daysAgo) => {
    const d = new Date(now); d.setDate(d.getDate() - daysAgo);
    return { datum: d.toISOString(), data: { job: { fase } } };
  };
  const rows = [row('werkplaats', 5), row('werkplaats', 10), row('montage', 20), row('werkplaats', 45)];
  const kpi = api.projectsKpi(rows, now);
  assert.equal(kpi.delta, 2, '3 lopende klussen in de laatste 30 dagen, 1 in de 30 dagen daarvoor');
}

console.log('fase-pipeline: statusovergangen en dashboard-kpi-telling geslaagd');
