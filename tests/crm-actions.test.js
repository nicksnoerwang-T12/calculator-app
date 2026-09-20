'use strict';
// Test de pure logica van CRM-pakket 1 (crm/crm.js): automatische acties, zwevende-klus-
// detectie, verwaarlozingsdrempels, afronden/verzetten, dagstart. Geen DOM nodig.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const full = fs.readFileSync('crm/crm.js', 'utf8');
const src = full.slice(0, full.indexOf('/* ==================== UI ===================='));
let storageData = {}, uidSerial = 0;
const context = {
  console, Math, Number, Object, Array, String, Date, JSON, isFinite,
  safeGet: (key, fallback) => (key in storageData ? storageData[key] : fallback),
  safeSet: (key, value) => { storageData[key] = value; return true; },
  uid: () => 'a' + (++uidSerial),
  TERMINAL_FASES: new Set(['gefactureerd', 'afgewezen', 'vervallen']),
};
vm.createContext(context);
vm.runInContext(src + '\nthis.api = { crmActions, crmSaveActions, crmSettings, crmSaveSettings, crmMakeAction, crmAutoActionForNewJob, crmAutoActionForFaseChange, crmIsJobFloating, crmFloatingJobs, crmLastTouch, crmIsRotting, crmRottingJobs, crmCompleteAction, crmRescheduleAction, crmOpenActions, crmOverdueActions, crmTodayActions, crmUpcomingActions, crmNeedsDagstart, crmMarkDagstart };', context);
const { api } = context;

const NOW = new Date('2026-09-20T10:00:00.000Z'); // zondag

function jobRow(id, fase, faseSince) { return { id, datum: faseSince || NOW.toISOString(), data: { job: { fase, faseSince: faseSince || NOW.toISOString() } } }; }

/* ---------- Automatische regels (exact 3, zie crm/README.md) ---------- */
{
  const a1 = api.crmAutoActionForNewJob('p1', 'c1', NOW);
  assert.equal(a1.type, 'opname');
  assert.equal(new Date(a1.dueAt).toISOString().slice(0, 10), '2026-09-21', 'nieuwe klus -> opname-actie morgen');
  assert.equal(a1.projectId, 'p1'); assert.equal(a1.customerId, 'c1');

  const a2 = api.crmAutoActionForFaseChange('offerte_verzonden', 'p1', 'c1', NOW);
  assert.equal(a2.type, 'bellen');
  assert.equal(new Date(a2.dueAt).toISOString().slice(0, 10), '2026-09-25', 'offerte verzonden -> bellen over 5 dagen');

  const a3 = api.crmAutoActionForFaseChange('geleverd', 'p1', 'c1', NOW);
  assert.equal(a3.type, 'factuur');
  assert.equal(new Date(a3.dueAt).toISOString().slice(0, 10), '2026-09-21', 'geleverd -> factureren morgen');

  assert.equal(api.crmAutoActionForFaseChange('montage', 'p1', 'c1', NOW), null, 'geen automatische actie buiten de 3 gedefinieerde overgangen');
}

/* ---------- Zwevende klussen ---------- */
{
  const rows = [jobRow('p1', 'opname'), jobRow('p2', 'offerte_verzonden'), jobRow('p3', 'gefactureerd')];
  const actions = [api.crmMakeAction({ type: 'bellen', title: 'x', dueAt: NOW.toISOString(), projectId: 'p2' }, NOW)];
  assert.equal(api.crmIsJobFloating(rows[0], actions), true, 'p1 heeft geen open actie -> zwevend');
  assert.equal(api.crmIsJobFloating(rows[1], actions), false, 'p2 heeft een open actie -> niet zwevend');
  assert.equal(api.crmIsJobFloating(rows[2], actions), false, 'p3 is een terminale fase -> nooit zwevend, ook zonder actie');
  assert.deepEqual(api.crmFloatingJobs(rows, actions).map(r => r.id), ['p1']);

  // Een afgeronde (done) actie telt niet meer als open -> klus wordt weer zwevend.
  const doneActions = api.crmCompleteAction(actions, actions[0].id, 'Geen gehoor', NOW);
  assert.equal(api.crmIsJobFloating(rows[1], doneActions), true, 'afgeronde actie maakt de klus weer zwevend zonder vervolgactie');
}

/* ---------- Verwaarlozing per fase ---------- */
{
  const settings = api.crmSettings();
  assert.equal(settings.rotting.opname, 5, 'standaarddrempel opname = 5 dagen');
  const old = jobRow('p1', 'opname', '2026-09-10T10:00:00.000Z'); // 10 dagen geleden
  const fresh = jobRow('p2', 'opname', '2026-09-19T10:00:00.000Z'); // 1 dag geleden
  const r1 = api.crmIsRotting(old, [], [], settings, NOW);
  assert.equal(r1.rotting, true); assert.equal(r1.days, 10);
  const r2 = api.crmIsRotting(fresh, [], [], settings, NOW);
  assert.equal(r2.rotting, false); assert.equal(r2.days, 1);

  // Een afgeronde actie ná faseSince telt als recenter contact.
  const touched = jobRow('p3', 'opname', '2026-09-10T10:00:00.000Z');
  const recentAction = [Object.assign(api.crmMakeAction({ type: 'bellen', title: 'x', dueAt: NOW.toISOString(), projectId: 'p3' }, NOW), { done: true, doneAt: '2026-09-19T10:00:00.000Z' })];
  const r3 = api.crmIsRotting(touched, recentAction, [], settings, NOW);
  assert.equal(r3.days, 1, 'laatste afgeronde actie telt als contactmoment, niet alleen faseSince');

  // Terminale fase verwaarloost nooit.
  const done = jobRow('p4', 'gefactureerd', '2026-01-01T00:00:00.000Z');
  assert.equal(api.crmIsRotting(done, [], [], settings, NOW).rotting, false);

  const rotten = api.crmRottingJobs([old, fresh, touched, done], recentAction, [], settings, NOW);
  assert.deepEqual(rotten.map(x => x.row.id), ['p1'], 'alleen de echt verwaarloosde klus komt terug, gesorteerd op langst stil');
}

/* ---------- Afronden en verzetten ---------- */
{
  let actions = [api.crmMakeAction({ type: 'bellen', title: 'Bel Jansen', dueAt: NOW.toISOString(), projectId: 'p1' }, NOW)];
  const id = actions[0].id;
  actions = api.crmCompleteAction(actions, id, 'Afspraak gemaakt', NOW);
  assert.equal(actions[0].done, true); assert.equal(actions[0].outcome, 'Afspraak gemaakt');
  assert.equal(api.crmOpenActions(actions).length, 0);

  let reschedulable = [api.crmMakeAction({ type: 'bellen', title: 'x', dueAt: '2026-09-15T10:00:00.000Z', projectId: 'p1' }, NOW)];
  reschedulable = api.crmRescheduleAction(reschedulable, reschedulable[0].id, '2026-09-22T10:00:00.000Z', NOW);
  assert.equal(reschedulable[0].dueAt, '2026-09-22T10:00:00.000Z');
}

/* ---------- Vandaag/achterstallig/komende week-selecties ---------- */
{
  // Dagvensters hangen af van de lokale tijdzone van de testrunner (setHours in crm.js) —
  // hier daarom relatief aan NOW opgebouwd i.p.v. met hardgecodeerde UTC-tijden, zodat de test
  // overal slaagt ongeacht de tijdzone van de machine.
  const dayMs = 86400000;
  const localStart = d => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c.getTime(); };
  const todayStart = localStart(NOW);
  const actions = [
    api.crmMakeAction({ type: 'bellen', title: 'achterstallig', dueAt: new Date(todayStart - dayMs + 3600000).toISOString(), projectId: 'p1' }, NOW),
    api.crmMakeAction({ type: 'bellen', title: 'vandaag-vroeg', dueAt: new Date(todayStart + 3600000).toISOString(), projectId: 'p1' }, NOW),
    api.crmMakeAction({ type: 'bellen', title: 'vandaag-laat', dueAt: new Date(todayStart + dayMs - 3600000).toISOString(), projectId: 'p1' }, NOW),
    api.crmMakeAction({ type: 'bellen', title: 'over-3-dagen', dueAt: new Date(todayStart + 3 * dayMs).toISOString(), projectId: 'p1' }, NOW),
    api.crmMakeAction({ type: 'bellen', title: 'over-10-dagen', dueAt: new Date(todayStart + 10 * dayMs).toISOString(), projectId: 'p1' }, NOW),
  ];
  assert.deepEqual(api.crmOverdueActions(actions, NOW).map(a => a.title), ['achterstallig']);
  assert.deepEqual(api.crmTodayActions(actions, NOW).map(a => a.title).sort(), ['vandaag-laat', 'vandaag-vroeg']);
  assert.deepEqual(api.crmUpcomingActions(actions, NOW, 7).map(a => a.title), ['over-3-dagen'], 'komende 7 dagen sluit vandaag en de 10-dagen-actie uit');
}

/* ---------- Dagstart: één keer per kalenderdag ---------- */
{
  assert.equal(api.crmNeedsDagstart(NOW), true, 'nog geen dagstart getoond');
  api.crmMarkDagstart(NOW);
  assert.equal(api.crmNeedsDagstart(NOW), false, 'zelfde dag -> niet nogmaals tonen');
  assert.equal(api.crmNeedsDagstart(new Date('2026-09-21T08:00:00.000Z')), true, 'volgende dag -> weer tonen');
}

console.log('crm-acties: automatische regels, zwevende-klus- en verwaarlozingsdetectie, afronden/verzetten, dagstart kloppen');
