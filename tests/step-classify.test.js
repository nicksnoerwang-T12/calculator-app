'use strict';
// Test de STEP-classificatieheuristiek (step/classify.js) tegen de drie synthetische
// geometriefixtures uit tests/fixtures/step/ (bounding box/volume, zoals occt-import-js dat per
// body teruggeeft) — zie die bestanden en step/README.md voor waarom dit geen echte .step-
// bestanden zijn. Puur, geen WASM/DOM nodig.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync('step/classify.js', 'utf8');
const context = { console, Math, Number, Object, Array, String, JSON };
vm.createContext(context);
vm.runInContext(src + '\nthis.api = { classifyStepBody, matchPlateThickness, matchProfileCrossSection, stepBodyWeightKg, stepProposalLine, sortedDims };', context);
const { api } = context;

const squareTube40 = { label: '40x40x3', profile: 'squareTube', dims: { b: 40, t: 3 }, crossSectionMm2: 40 * 40 - (40 - 6) * (40 - 6) };
const squareTube60 = { label: '60x60x3', profile: 'squareTube', dims: { b: 60, t: 3 }, crossSectionMm2: 60 * 60 - (60 - 6) * (60 - 6) };
const roundTube42 = { label: 'D42x2', profile: 'roundTube', dims: { D: 42, t: 2 }, crossSectionMm2: Math.PI * (42 * 42 - (42 - 4) * (42 - 4)) / 4 };
const candidates = [squareTube40, squareTube60, roundTube42];

// matchPlateThickness: standaardmaten met 0,3 mm tolerantie, geen gok daarbuiten.
assert.equal(api.matchPlateThickness(5), 5);
assert.equal(api.matchPlateThickness(5.2), 5, 'binnen tolerantie');
assert.equal(api.matchPlateThickness(5.4), null, 'buiten tolerantie: geen standaardmaat');
assert.equal(api.matchPlateThickness(2.9), 3);

// Fixture 1: plaat met gaten -> plaat, dikte 5 mm herkend.
{
  const fixture = JSON.parse(fs.readFileSync('tests/fixtures/step/plaat-met-gaten.json', 'utf8'));
  const body = fixture.bodies[0];
  const result = api.classifyStepBody(body, []);
  assert.equal(result.kind, 'plate');
  assert.equal(result.matchedThicknessMm, 5);
  assert.equal(result.confident, true);
  assert.equal(result.lengthMm, 500);
  assert.equal(result.widthMm, 300);
}

// Fixture 2: kokerframe -> beide bodies herkend als profiel, matchen op de 40x40x3-kandidaat.
{
  const fixture = JSON.parse(fs.readFileSync('tests/fixtures/step/kokerframe.json', 'utf8'));
  for (const body of fixture.bodies) {
    const result = api.classifyStepBody(body, candidates);
    assert.equal(result.kind, 'profile', body.name + ' is een profiel');
    assert.equal(result.candidates[0].profile, 'squareTube');
    assert.equal(result.candidates[0].label, '40x40x3');
    assert.equal(result.confident, true, 'precies één kandidaat binnen tolerantie');
  }
}

// Fixture 3: samengesteld bordes -> plaat, twee profielmaten, en een "overig" die geen van
// beide vuistregels haalt (niet geraden, expliciet overig).
{
  const fixture = JSON.parse(fs.readFileSync('tests/fixtures/step/samengesteld-bordes.json', 'utf8'));
  const [plaat, poot, leuning, beugel] = fixture.bodies;
  assert.equal(api.classifyStepBody(plaat, []).kind, 'plate');
  const pootResult = api.classifyStepBody(poot, candidates);
  assert.equal(pootResult.kind, 'profile'); assert.equal(pootResult.candidates[0].label, '60x60x3');
  const leuningResult = api.classifyStepBody(leuning, candidates);
  assert.equal(leuningResult.kind, 'profile'); assert.equal(leuningResult.candidates[0].label, 'D42x2');
  const beugelResult = api.classifyStepBody(beugel, candidates);
  assert.equal(beugelResult.kind, 'overig', 'bbox 80x80x80: geen enkele dimensie is dun genoeg voor plaat, geen enkele is 5x de andere twee voor profiel');
}

// Geen kandidaten binnen tolerantie: profiel-kind, maar lege kandidatenlijst (UI zet dit in
// "Handmatig", raadt niet naar de dichtstbijzijnde match ondanks een grote afwijking).
{
  const oddProfile = { name: 'Onbekend_profiel', bboxMm: [25, 25, 800], volumeMm3: 25 * 25 * 800 * 0.3, instances: 1 };
  const result = api.classifyStepBody(oddProfile, candidates);
  assert.equal(result.kind, 'profile');
  assert.equal(result.candidates.length, 0, 'buiten de 5%-tolerantie van alle kandidaten');
  assert.equal(result.confident, false);
}

// Gewicht: volume (mm3) x dichtheid, herbruikt dezelfde dichtheden als MATERIALS in de hoofd-app.
assert.ok(Math.abs(api.stepBodyWeightKg(712500, 's235') - 712500 * 7850 * 1e-9) < 1e-9);
assert.ok(Math.abs(api.stepBodyWeightKg(1e9, 'alu') - 2700) < 1e-6, '1 m3 aluminium = 2700 kg');

// Materiaalregel-voorstel volgt het contract uit intake/README.md: source:'step', geen gok bij
// classification.kind==='overig' (levert null, geen regel).
{
  const uidFn = (() => { let n = 0; return () => 'step-' + (++n); })();
  const plaatClass = { kind: 'plate', lengthMm: 500, widthMm: 300, matchedThicknessMm: 5, thicknessMm: 5.1 };
  const line = api.stepProposalLine({ name: 'Deksel_plaat', instances: 1, attachmentId: 'att-1' }, plaatClass, 's235', uidFn);
  assert.equal(line.profile, 'plate'); assert.equal(line.source, 'step'); assert.equal(line.attachmentId, 'att-1');
  assert.equal(line.dims.t, 5, 'gebruikt de gematchte standaarddikte, niet de rauwe gemeten waarde');

  const geenVoorstel = api.stepProposalLine({ name: 'X', instances: 1 }, { kind: 'overig' }, 's235', uidFn);
  assert.equal(geenVoorstel, null, 'overig-classificatie levert bewust geen materiaalregel-gok op');
}

console.log('STEP-classificatie: plaat/profiel/overig-heuristiek klopt op alle drie de fixtures, geen giswerk buiten tolerantie');
