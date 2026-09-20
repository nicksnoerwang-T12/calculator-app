'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync('werkbank-v2.html', 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const catalog = script.slice(script.indexOf('const SECTIONS ='), script.indexOf('function sectionOptions'));
const escSource = script.slice(script.indexOf('const esc ='), script.indexOf('const rad ='));
const material = script.slice(script.indexOf('const MATERIAL_SCHEMA='), script.indexOf('function readCostInput'));
let storageData = {};
let serial = 0;
const context = {
  console, Math, Number, Object, Array, String, Date, JSON, Intl, Set, Map,
  isFinite, parseFloat,
  safeGet: (key, fallback) => storageData[key] ?? fallback,
  getPrices: () => ({ s235: 1.35 }),
  finiteNonNegative: value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0,
  uid: () => `id-${++serial}`,
  SECTIONS: null
};
vm.createContext(context);
vm.runInContext(escSource + '\n' + catalog + '\n' + material + `
this.api={planBars,planPlates,buildPurchasePlan,purchaseSummary,calculateMaterialList,
 CATALOG_ARTICLES,catalogArticle,validateLine};`, context);
const { api } = context;
const clone = value => JSON.parse(JSON.stringify(value));
const base = { id: 'x', material: 'rvs304', count: 1, countMode: 'project', priceBasis: 'm', priceMode: 'catalog', unitPrice: '', waste: 0 };

// Synthetische fixture uit het bouwrapport (hoofdstuk F): stock 6m, drie delen 3500mm, kerf 0.
let bars = api.planBars([3500, 3500, 3500], 6000, 0);
assert.equal(bars.stockCount, 3, 'drie stangen, niet twee');
assert.equal(bars.purchasedMm, 18000, 'aankoop 18m');
assert.equal(bars.netMm, 10500, 'netto 10,5m');

// Synthetische fixture plaat: 1000x1000 plaat, drie delen 600x600, marge 0.
let plates = api.planPlates([{ w: 600, h: 600 }, { w: 600, h: 600 }, { w: 600, h: 600 }], 1000, 1000, 0);
assert.equal(plates.stockCount, 3, 'drie platen, niet twee op basis van oppervlak');

// Echt Twentse artikel zonder bewezen handelslengte: nooit stangen verzinnen, blijft bij netto verbruik.
const rectTube = api.CATALOG_ARTICLES.find(a => a.profileType === 'rectTube' && a.label === '50 × 30 × 2 mm');
assert(rectTube && rectTube.knownStockLengthsMm.length === 0, 'Twentse koker heeft geen bewezen stocklengte in de bron');
const twentseLine = { ...base, profile: 'rectTube', catalogArticleId: rectTube.id, count: 4, dims: { b: 50, h: 30, t: 2, length: 1000 } };
let plan = api.buildPurchasePlan([twentseLine], 1, 0);
assert.equal(plan.groups.length, 0, 'geen groep zonder bewezen handelslengte');
const summaryNoStock = api.purchaseSummary([twentseLine], 1, {});
assert.equal(summaryNoStock.netCents, 1716, 'netto materiaalwaarde ongewijzigd (€17,16)');

// Echt FNF-artikel mét bewezen stocklengtes (RVS304 rondstaf Ø20, [3000,6000]) — meerdere regels dezelfde SKU
// samen ingepland. Prijs is in de onderzochte catalogus 'op aanvraag' (status O); voor deze test wordt een
// bevestigde eigen richtprijs gesimuleerd zoals ook production-catalog.test.js met CATALOG_ARTICLES doet.
const roundBar = api.CATALOG_ARTICLES.find(a => a.profileType === 'roundBar' && a.material === 'rvs304' && a.label === 'Ø 20 mm' && a.supplierId === 'fnf');
assert(roundBar && JSON.stringify(roundBar.knownStockLengthsMm) === JSON.stringify([3000, 6000]));
roundBar.price = { ...roundBar.price, status: 'P', amount: 5 };
const groupLines = [2000, 2500, 1800].map((length, i) => ({
  ...base, id: `rb-${i}`, profile: 'roundBar', catalogArticleId: roundBar.id, dims: { D: 20, length }
}));
plan = api.buildPurchasePlan(groupLines, 1, 0);
assert.equal(plan.groups.length, 1, 'de drie regels delen één aankoopgroep');
let g = plan.groups[0];
assert.equal(g.chosenStockLengthMm, 3000, 'kortste stocklengte geeft hier de minste ingekochte lengte');
assert.equal(g.stockCount, 3);
assert.equal(g.netMm, 6300);
assert.equal(g.purchasedMm, 9000);
assert.equal(g.restMm, 2700);
assert.equal(g.costCents, 4500, '9m x €5/m');
assert.equal(g.priceConflict, false);
assert.equal(g.alternatives.length, 1);
assert.equal(g.alternatives[0].stockLengthMm, 6000);
assert.equal(g.alternatives[0].purchasedMm, 12000);
let summaryGrouped = api.purchaseSummary(groupLines, 1, {});
assert(summaryGrouped.purchaseKnownCents >= 4500, 'aankoopgroepkosten tellen mee in het projecttotaal');

// Prijsconflict binnen dezelfde SKU: nooit stilzwijgend middelen, kosten blijven open.
const conflictLines = [
  { ...base, id: 'c1', profile: 'roundBar', catalogArticleId: roundBar.id, dims: { D: 20, length: 2000 } },
  { ...base, id: 'c2', profile: 'roundBar', catalogArticleId: roundBar.id, priceMode: 'manual', unitPrice: 7, dims: { D: 20, length: 2000 } }
];
plan = api.buildPurchasePlan(conflictLines, 1, 0);
assert.equal(plan.groups.length, 1);
assert.equal(plan.groups[0].priceConflict, true, 'verschillende eenheidsprijzen binnen dezelfde SKU worden gemarkeerd');
assert.equal(plan.groups[0].costCents, null, 'geconflicteerde groep krijgt geen gemiddelde prijs');

// Echte aluminiumplaat met bewezen handelsformaat en drie deelmaten van 600x600 uit de synthetische fixture.
const plateArticle = api.CATALOG_ARTICLES.find(a => a.profileType === 'plate' && a.material === 'alu' && a.label === '2000 × 1000 × 2 mm');
assert(plateArticle && plateArticle.price.basis === 'wholePlate');
plateArticle.price = { ...plateArticle.price, status: 'P', amount: 50 };
const plateLines = [0, 1, 2].map(i => ({
  ...base, id: `pl-${i}`, profile: 'plate', catalogArticleId: plateArticle.id, dims: { length: 600, width: 600, t: 2 }
}));
plan = api.buildPurchasePlan(plateLines, 1, 0);
assert.equal(plan.groups.length, 1);
g = plan.groups[0];
assert.equal(g.type, 'plate');
// Het echte handelsformaat (2000x1000mm) is groter dan de synthetische fixture hierboven: alle drie
// deelmaten passen op één plaat. Dit bewijst dat de echte catalogusafmeting wordt gebruikt (geen
// aanname van 1000x1000), niet dat drie platen altijd nodig zijn.
assert.equal(g.stockCount, 1, 'drie deelmaten van 600x600 passen op één 2000x1000mm plaat');
assert.equal(g.costCents, 5000, '1 plaat x €50');

// Regressie: bestaande materiaalrekenkern blijft ongewijzigd door de nieuwe aankoopplanning.
assert.equal(api.calculateMaterialList([twentseLine], 1, { s235: 1.35 }).cents, 1716);

console.log('aankoopplanning: zaagplan, nestvoorstel, groepering, prijsconflict en regressietests geslaagd');
