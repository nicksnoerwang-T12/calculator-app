'use strict';
// Test de "kleine bug"-fix: een opgeslagen klus kon nergens uit de lijst verwijderd worden.
// Puur-logica test van deleteProject() (jobs/jobs.js) en de opruim-wrap in crm/crm.js
// (verwijdert gekoppelde crm_actions/crm_log bij het verwijderen van een klus). Geen DOM nodig.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const jobsSrc = fs.readFileSync('jobs/jobs.js', 'utf8');
const deleteProjectLine = jobsSrc.split('\n').find(l => l.includes('function deleteProject('));
assert.ok(deleteProjectLine, 'deleteProject() niet gevonden in jobs/jobs.js');

const crmFull = fs.readFileSync('crm/crm.js', 'utf8');
const crmPure = crmFull.slice(0, crmFull.indexOf('/* ==================== UI ==================== */'));
const wrapStart = crmFull.indexOf("if (typeof deleteProject === 'function')");
const wrapEnd = crmFull.indexOf('\n}\n', wrapStart) + 3;
const crmDeleteWrap = crmFull.slice(wrapStart, wrapEnd);
assert.ok(crmDeleteWrap.includes('crmBaseDeleteProject'), 'crm.js opruim-wrap voor deleteProject niet gevonden');

const STORE = { calculations: 'werkbank.v2.calculations' };
let storageData = {};
const context = {
  console, Array, JSON,
  safeGet: (key, fallback) => (key in storageData ? storageData[key] : fallback),
  safeSet: (key, value) => { storageData[key] = value; return true; },
  STORE,
};
vm.createContext(context);

// Eerst alleen jobs.js: geen CRM-laag aanwezig.
vm.runInContext(deleteProjectLine + '\nthis.deleteProjectOnly = deleteProject;', context);

{
  storageData = { [STORE.calculations]: [{ id: 'p1', data: { project: 'Reling' } }] };
  context.safeGet = (key, fallback) => (key in storageData ? storageData[key] : fallback);
  context.safeSet = (key, value) => { storageData[key] = value; return true; };

  assert.equal(context.deleteProjectOnly('geen-bestaand-id', () => true), false, 'onbekend id -> geen crash, geeft false');
  assert.equal(storageData[STORE.calculations].length, 1, 'lijst blijft ongewijzigd bij onbekend id');

  assert.equal(context.deleteProjectOnly('p1', () => false), false, 'geannuleerde confirm -> niet verwijderd');
  assert.equal(storageData[STORE.calculations].length, 1, 'lijst blijft ongewijzigd bij annuleren');

  assert.equal(context.deleteProjectOnly('p1', () => true), true, 'bevestigde confirm -> verwijderd');
  assert.equal(storageData[STORE.calculations].length, 0, 'klus is weg uit STORE.calculations');
}

// Nu met de crm.js-laag erbovenop: verwijderen moet ook gekoppelde crm_actions/crm_log opruimen.
vm.runInContext(crmPure + '\n' + deleteProjectLine + '\n' + crmDeleteWrap + '\nthis.deleteProjectWithCrm = deleteProject;', context);

{
  storageData = {
    [STORE.calculations]: [
      { id: 'p1', data: { project: 'Reling' } },
      { id: 'p2', data: { project: 'Trap' } },
    ],
    'werkbank.v2.crm.actions': [
      { id: 'a1', projectId: 'p1', type: 'bellen' },
      { id: 'a2', projectId: 'p2', type: 'bellen' },
    ],
    'werkbank.v2.crm.log': [
      { id: 'l1', projectId: 'p1', channel: 'telefoon' },
      { id: 'l2', projectId: 'p2', channel: 'telefoon' },
    ],
  };
  context.safeGet = (key, fallback) => (key in storageData ? storageData[key] : fallback);
  context.safeSet = (key, value) => { storageData[key] = value; return true; };

  assert.equal(context.deleteProjectWithCrm('p1', () => true), true, 'klus p1 wordt verwijderd');
  assert.deepEqual(storageData[STORE.calculations].map(x => x.id), ['p2'], 'p1 weg uit klussenlijst, p2 blijft');
  assert.deepEqual(storageData['werkbank.v2.crm.actions'].map(a => a.id), ['a2'], 'CRM-actie van p1 opgeruimd, p2 blijft');
  assert.deepEqual(storageData['werkbank.v2.crm.log'].map(l => l.id), ['l2'], 'CRM-logregel van p1 opgeruimd, p2 blijft');
}

console.log('deleteProject: onbekend id, annuleren, verwijderen, en CRM-opruiming (crm_actions/crm_log) getest');
