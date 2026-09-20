'use strict';
// Test de pure validatie/limiet-logica van bijlagen (step/attachments.js): bestandstype, 25 MB
// per bestand, 100 MB per klus. De echte IndexedDB-opslag (attachmentPutBytes/Get/Delete) is
// browser-only en is interactief geverifieerd in de Browser-pane, niet hier — zelfde bekende
// beperking als bij de vorige fases.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync('step/attachments.js', 'utf8');
const pureSource = src.slice(src.indexOf('const ATTACHMENT_MAX_FILE_BYTES'), src.indexOf('/* ---------- SHA-256'));
const context = { console, Math, Number, Object, Array, String, esc: s => String(s), fmt: (n, d) => n.toFixed(d != null ? d : 1) };
vm.createContext(context);
vm.runInContext(pureSource + '\nthis.api = { attachmentExt, attachmentTypeAllowed, attachmentIsStep, attachmentSizeOk, attachmentUsageBytes, attachmentBudgetOk, attachmentValidate, attachmentUsageLabel, ATTACHMENT_MAX_FILE_BYTES, ATTACHMENT_MAX_JOB_BYTES };', context);
const { api } = context;

assert.equal(api.attachmentExt('onderdeel.STEP'), '.step', 'extensie ongeacht hoofdletters');
assert.equal(api.attachmentExt('foto.jpeg'), '.jpeg');
assert.equal(api.attachmentExt('geen-extensie'), '');
assert.equal(api.attachmentTypeAllowed('tekening.dxf'), true);
assert.equal(api.attachmentTypeAllowed('virus.exe'), false);
assert.equal(api.attachmentIsStep('deel.stp'), true);
assert.equal(api.attachmentIsStep('deel.step'), true);
assert.equal(api.attachmentIsStep('deel.dxf'), false);

// 25 MB per bestand.
assert.equal(api.attachmentSizeOk(10 * 1024 * 1024), true);
assert.equal(api.attachmentSizeOk(25 * 1024 * 1024), true, 'exact op de grens mag nog');
assert.equal(api.attachmentSizeOk(25 * 1024 * 1024 + 1), false);
assert.equal(api.attachmentSizeOk(0), false, 'leeg bestand is geen geldige bijlage');

// 100 MB per klus, som van bestaande bijlagen.
{
  const existing = [{ size: 60 * 1024 * 1024 }, { size: 30 * 1024 * 1024 }];
  assert.equal(api.attachmentUsageBytes(existing), 90 * 1024 * 1024);
  assert.equal(api.attachmentBudgetOk(existing, 10 * 1024 * 1024), true, 'past nog precies');
  assert.equal(api.attachmentBudgetOk(existing, 10 * 1024 * 1024 + 1), false);
}

// attachmentValidate combineert alle drie de regels tot één Nederlandse melding, of null.
{
  const existing = [{ size: 95 * 1024 * 1024 }];
  assert.equal(api.attachmentValidate({ name: 'deel.step', size: 1024 }, []), null, 'geldig bestand: geen fout');
  assert.ok(api.attachmentValidate({ name: 'virus.exe', size: 1024 }, []).includes('niet ondersteund'));
  assert.ok(api.attachmentValidate({ name: 'groot.step', size: 30 * 1024 * 1024 }, []).includes('25 MB'));
  assert.ok(api.attachmentValidate({ name: 'nietmeer.step', size: 10 * 1024 * 1024 }, existing).includes('100 MB'));
}

console.log('bijlagen: type/grootte/budget-validatie geslaagd (IndexedDB zelf: zie browserverificatie in step/README.md)');
