'use strict';
// Test de sjabloon-engine (intake/templates.js) tegen de echte, ongewijzigde rekenkern uit
// werkbank-v2.html: elk sjabloon moet met zijn standaardwaarden geldige materiaal- en
// werkregels opleveren die zonder fouten door calculateMaterialLine() worden verwerkt.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync('werkbank-v2.html', 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const catalogSource = script.slice(script.indexOf('const SECTIONS ='), script.indexOf('function sectionOptions'));
const escSource = script.slice(script.indexOf('const esc ='), script.indexOf('const rad ='));
const coreSource = script.slice(script.indexOf('const MATERIAL_SCHEMA='), script.indexOf('function readCostInput'));
const templatesSource = fs.readFileSync('intake/templates.js', 'utf8');

let serial = 0;
const context = {
  console, Math, Number, Object, Array, String, Date, JSON, Intl, Set, Map, isFinite, parseFloat,
  safeGet: (key, fallback) => fallback, getPrices: () => ({ s235: 1.35, s355: 1.55, rvs304: 6.2, rvs316: 8.9, alu: 5.4, messing: 9.8, koper: 11.2 }),
  finiteNonNegative: v => Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0,
  uid: () => `id-${++serial}`, SECTIONS: null
};
vm.createContext(context);
vm.runInContext(escSource + '\n' + catalogSource + '\n' + coreSource + '\n' + templatesSource +
  '\nthis.api = { TEMPLATES, PROFILES, MATERIALS, SECTIONS, validateLine, calculateMaterialLine, beamSize, CATALOG_ARTICLES, sizeLabels, dimsFromLabel, findCatalogArticle };', context);
const { api } = context;

function ctxFor() {
  return {
    uid: api => `t-${++serial}`,
    hourlyRate: 65, montageRate: 55, voorrijkosten: 45, poedercoatM2: 18,
    sections: api.SECTIONS, densities: Object.fromEntries(Object.entries(api.MATERIALS).map(([k, v]) => [k, v.density])),
    materialNames: Object.fromEntries(Object.entries(api.MATERIALS).map(([k, v]) => [k, v.name]))
  };
}
const prices = context.getPrices();

// Elk sjabloon: bevat exact de 12 verplichte plus maatwerk, en elk levert met zijn eigen
// standaardwaarden geldige regels op (zero validateLine-fouten) die de rekenkern zonder
// fouten doorrekent.
assert.equal(api.TEMPLATES.length, 12, 'alle 11 catalogus-sjablonen plus maatwerk');
assert.equal(api.TEMPLATES.filter(t => t.id === 'maatwerk').length, 1);

for (const tpl of api.TEMPLATES) {
  const ctx = ctxFor();
  ctx.uid = () => `t-${++serial}`;
  const defaults = Object.fromEntries(tpl.params.map(p => [p.id, p.default]));
  const result = tpl.build(defaults, ctx);
  assert.ok(Array.isArray(result.materials) && result.materials.length > 0, tpl.id + ': levert materiaalregels op');
  assert.ok(Array.isArray(result.work) && result.work.length > 0, tpl.id + ': levert werkregels op');
  assert.ok(['indicatie', 'opname'].includes(result.confidence), tpl.id + ': geldig zekerheidsniveau');
  for (const line of result.materials) {
    const errors = api.validateLine(line, 1);
    const isPlaceholder = line.profile === 'purchasedItem' && line.priceMode === 'manual' && line.unitPrice === '';
    if (isPlaceholder) {
      // "Prijs op aanvraag" (O/B/M-status): mag ontbreken, blokkeert bewust alleen de
      // klantweergave/offerte later (saleView().complete), niet de funnel zelf.
      assert.deepEqual(Object.keys(errors), ['unitPrice'], tpl.id + ': prijs-op-aanvraag-regel mist alleen de prijs');
    } else {
      assert.deepEqual(errors, {}, tpl.id + ': materiaalregel "' + (line.note || line.description || line.profile) + '" moet foutloos zijn: ' + JSON.stringify(errors));
      const calc = api.calculateMaterialLine(line, 1, prices);
      assert.ok(!calc.errors, tpl.id + ': rekenkern verwerkt de regel zonder fouten');
    }
    assert.equal(line.source, 'template', tpl.id + ': regel is gemarkeerd als sjabloonregel');
  }
  for (const w of result.work) {
    assert.ok(Number.isFinite(w.quantity) && w.quantity > 0, tpl.id + ': werkregel "' + w.name + '" heeft een positieve hoeveelheid');
    assert.ok(Number.isFinite(w.rate) && w.rate >= 0, tpl.id + ': werkregel "' + w.name + '" heeft een geldig tarief');
  }
}

// Maatwerk werkt zonder één catalogusartikel: de gegenereerde plaatregel moet puur op het
// algemene €/kg-tarief prijzen (geen catalogArticleId, geen catalogSize).
{
  const maatwerk = api.TEMPLATES.find(t => t.id === 'maatwerk');
  const ctx = ctxFor(); ctx.uid = () => `t-${++serial}`;
  const p = { omschrijving: 'Reparatie hek', material: 's235', kg: 20, uren: 2 };
  const result = maatwerk.build(p, ctx);
  const line = result.materials[0];
  assert.equal(line.catalogArticleId, undefined, 'maatwerk-regel heeft geen catalogusartikel');
  const calc = api.calculateMaterialLine(line, 1, prices);
  assert.ok(!calc.errors);
  const expectedWeightKg = 20; // de synthetische plaatmaat is zo gekozen dat het gewicht exact klopt
  assert.ok(Math.abs(calc.weight - expectedWeightKg) < 0.5, 'gegenereerde plaatmaat geeft het opgegeven gewicht terug (±0,5 kg)');
}

// Handmatig gecontroleerde referentiewaarde: Spijlenhekwerk, 3 m, standaardwaarden. De
// standaard regelmaat (rectTube 40×20×2, s235) heeft een exacte catalogusmatch (Twentse
// Staalhandel, €3,20/m) — dus geen algemene €/kg-vuistregel meer voor deze regel, maar een
// echte leveranciersprijs. De spijlmaat (squareBar 12 mm, s235) heeft géén catalogusmatch en
// blijft op de algemene €/kg-vuistregel (s235 = €1,35/kg hierboven).
{
  const tpl = api.TEMPLATES.find(t => t.id === 'hekwerk-spijlen');
  const ctx = ctxFor(); ctx.uid = () => `t-${++serial}`;
  const p = { length: 3, height: 1000, spacing: 110, material: 's235', railSize: '40×20×2', spindleSize: '12', finish: 'Gepoedercoat', mount: true };
  const result = tpl.build(p, ctx);
  // Regel 1: 2x rectTube 40x20x2, 3000 mm, waste 5%, exacte catalogusmatch.
  const rail = result.materials[0];
  assert.equal(rail.count, 2); assert.equal(rail.dims.length, 3000); assert.equal(rail.waste, 5);
  assert.deepEqual(rail.dims, { length: 3000, b: 40, h: 20, t: 2 });
  assert.ok(rail.catalogArticleId, 'standaard regelmaat heeft een exacte catalogusmatch');
  const railCalc = api.calculateMaterialLine(rail, 1, prices);
  assert.equal(railCalc.priceSource, 'Catalogusrichtprijs · twentse');
  // 6 m totaal (2x 3 m), x1.05 verlies, x €3,20/m.
  assert.equal(railCalc.lineCents, Math.round(6 * 1.05 * 3.20 * 100), 'railprijs klopt (catalogus €/m, incl. 5% verlies)');
  // Regel 2: spijlen, ceil(3000/110)+1 = 29 stuks, lengte 1000 mm, géén catalogusmatch (s235
  // squareBar staat niet in de catalogus) -> blijft op de algemene €/kg-vuistregel.
  const spindle = result.materials[1];
  assert.equal(spindle.count, 29);
  assert.equal(spindle.dims.length, 1000);
  assert.equal(spindle.catalogArticleId, undefined, 's235 vierkantstaf heeft geen catalogusmatch');
  const spindleCalc = api.calculateMaterialLine(spindle, 1, prices);
  assert.equal(spindleCalc.priceSource, 'Algemene materiaalprijs');
  const spindleArea = 12 * 12; // PROFILES.squareBar.rekenfunctie
  const spindleWeight = spindleArea * api.MATERIALS.s235.density * 1e-6 * (1000 / 1000) * 29;
  assert.ok(Math.abs(spindleCalc.weight - spindleWeight) < 0.01, 'spijlgewicht klopt met de rekenkern-formule');
  // Werkregels: lassen (29*2*0.08=4.64u), montage (3*0.35=1.05u), voorrijden (1), poedercoat (3*1=3 m²)
  // — ongewijzigd t.o.v. vóór de materiaal-/maatkeuze, want werkregels hangen niet af van de
  // gekozen catalogusmaat.
  const lasRegel = result.work.find(w => w.name.includes('Lassen'));
  assert.ok(Math.abs(lasRegel.quantity - 4.64) < 0.001);
  const montageRegel = result.work.find(w => w.category === 'Montage');
  assert.ok(Math.abs(montageRegel.quantity - 1.05) < 0.001);
  const poedercoatRegel = result.work.find(w => w.name === 'Poedercoating');
  assert.ok(Math.abs(poedercoatRegel.quantity - 3) < 0.001);
}

// Materiaalsoort en profielmaat zijn per sjabloon kiesbaar en wijzigen de gebouwde regels echt
// (niet alleen het label) — dat is de kern van deze uitbreiding. Test tegen twee templates die
// elk een ander mechanisme raken: een gewone maatkeuze (sizeChoice) en een kaderprofielkeuze
// die tussen koker en hoeklijn (profielvorm!) kan wisselen (framedChoice).
{
  const tpl = api.TEMPLATES.find(t => t.id === 'hekwerk-spijlen');
  const ctx = ctxFor(); ctx.uid = () => `t-${++serial}`;
  const p1 = { length: 3, height: 1000, spacing: 110, material: 's235', railSize: '40×20×2', spindleSize: '12', finish: 'Blank', mount: false };
  const p2 = Object.assign({}, p1, { material: 'rvs304', railSize: '60×40×3' });
  const r1 = tpl.build(p1, ctx), r2 = tpl.build(p2, ctx);
  assert.notEqual(r1.materials[0].material, r2.materials[0].material, 'andere materiaalkeuze verandert de regel');
  assert.notDeepEqual(r1.materials[0].dims, r2.materials[0].dims, 'andere maatkeuze verandert de dims');
  assert.equal(r2.materials[0].material, 'rvs304');
  assert.deepEqual(r2.materials[0].dims, { length: 3000, b: 60, h: 40, t: 3 });

  const poort = api.TEMPLATES.find(t => t.id === 'draaipoort');
  const ctxP = ctxFor(); ctxP.uid = () => `t-${++serial}`;
  const defaults = Object.fromEntries(poort.params.map(spec => [spec.id, spec.default]));
  const koker = poort.build(defaults, ctxP);
  assert.equal(koker.materials[0].profile, 'squareTube', 'standaard kaderprofiel is koker (squareTube)');
  const hoeklijn = poort.build(Object.assign({}, defaults, { kaderProfile: 'Hoeklijn 50×5' }), ctxP);
  assert.equal(hoeklijn.materials[0].profile, 'equalAngle', 'hoeklijn-keuze wisselt daadwerkelijk van profielvorm');
  assert.deepEqual(hoeklijn.materials[0].dims, { length: koker.materials[0].dims.length, a: 50, t: 5 });
}

console.log('sjabloon-engine: 12 sjablonen leveren geldige regels op, maatwerk werkt zonder catalogus, materiaal/maatkeuze werkt echt door, referentiewaarden Spijlenhekwerk kloppen');
