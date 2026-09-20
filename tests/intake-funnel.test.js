'use strict';
// Test de pure helpers van de snelprijs-funnel (intake/intake.js): zekerheidsniveau,
// bandbreedte, prijszin, en het diff-percentage voor eigen producten. Geen DOM nodig.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync('intake/intake.js', 'utf8');
const pureSource = src.slice(src.indexOf('const INTAKE_LEVELS'), src.indexOf('/* ---------- Instellingen'));

const context = { console, Math, Number, Object, Array, String, JSON };
vm.createContext(context);
vm.runInContext(pureSource + '\nthis.api = { intakeAutoLevel, intakeResolveLevel, intakeBandFor, intakePriceBand, intakeBandCopy, intakeMaterialsComplete, intakeMaterialsConfirmed, intakeWorkTotalCents, intakePriceDiff, intakeApplyWorkOverrides };', context);
const { api } = context;
const euro = c => '€ ' + (c).toFixed(2).replace('.', ',');

// Automatisch niveau: geen opname/materiaal -> indicatie; met maten/foto's -> opname;
// alle materiaalregels compleet -> offerte.
assert.equal(api.intakeAutoLevel({ measurements: [], photos: [] }, false), 'indicatie');
assert.equal(api.intakeAutoLevel({ measurements: [{ name: 'breedte', value: 1, unit: 'm' }], photos: [] }, false), 'opname');
assert.equal(api.intakeAutoLevel({ measurements: [], photos: [{ id: 'p1' }] }, false), 'opname');
assert.equal(api.intakeAutoLevel({ measurements: [], photos: [] }, true), 'offerte');

// Handmatig niveau kan alleen omhoog, nooit stilzwijgend omlaag.
assert.equal(api.intakeResolveLevel('indicatie', 'opname'), 'opname', 'handmatig omhoog werkt');
assert.equal(api.intakeResolveLevel('opname', 'indicatie'), 'opname', 'handmatig omlaag wordt genegeerd');
assert.equal(api.intakeResolveLevel('offerte', 'opname'), 'offerte', 'auto-niveau wint als het al hoger is');

// Bandbreedte: indicatie=15%, opname=7%, offerte=0% (vast bedrag), instelbaar via rates.
const rates = { bandIndicatie: 15, bandOpname: 7 };
assert.equal(api.intakeBandFor('indicatie', rates), 0.15);
assert.equal(api.intakeBandFor('opname', rates), 0.07);
assert.equal(api.intakeBandFor('offerte', rates), 0);
{
  const band = api.intakePriceBand(200000, 'indicatie', rates); // € 2.000,00
  assert.ok(Math.abs(band.low - 1700) < 0.01 && Math.abs(band.high - 2300) < 0.01, 'band 2000 ±15% = 1700-2300');
  assert.equal(band.single, false);
}
{
  const band = api.intakePriceBand(200000, 'offerte', rates);
  assert.equal(band.single, true);
  assert.equal(band.low, band.high);
}
{
  // Instelbaar: een aangepaste band in de instellingen moet doorwerken.
  const band = api.intakePriceBand(100000, 'indicatie', { bandIndicatie: 25, bandOpname: 7 });
  assert.ok(Math.abs(band.low - 750) < 0.01 && Math.abs(band.high - 1250) < 0.01);
}

// Prijszin: exacte letterlijke tekst die de gebruiker voorleest aan de telefoon.
{
  const band = api.intakePriceBand(215000, 'indicatie', rates);
  const zin = api.intakeBandCopy('hekwerk 6 m', band, 'indicatie', euro);
  assert.ok(zin.startsWith('Indicatie voor hekwerk 6 m: '), zin);
  assert.ok(zin.includes(' excl. btw.'));
  assert.ok(zin.includes('Onder voorbehoud van opname.'));
}
{
  const band = api.intakePriceBand(215000, 'offerte', rates);
  const zin = api.intakeBandCopy('hekwerk 6 m', band, 'offerte', euro);
  assert.ok(!zin.includes('Onder voorbehoud'), 'offerte-niveau: geen voorbehoud-tekst, één vast bedrag');
  assert.ok(!zin.includes('–'), 'offerte-niveau: geen bandbreedte-streepje');
}

// Materiaalregels compleet: alleen true als er regels zijn en geen enkele fouten/ontbrekende prijs heeft.
assert.equal(api.intakeMaterialsComplete([]), false, 'geen regels = niet compleet');
assert.equal(api.intakeMaterialsComplete([{ result: { lineCents: 100 } }]), true);
assert.equal(api.intakeMaterialsComplete([{ result: { lineCents: 100 } }, { result: { lineCents: null } }]), false, 'één ontbrekende prijs blokkeert');
assert.equal(api.intakeMaterialsComplete([{ result: { errors: { x: 'y' } } }]), false);

// Bevestigd (offerteniveau) is strenger dan compleet (funnel niet geblokkeerd): een regel die
// alleen via de algemene €/kg-vuistregel prijst is wél "compleet" maar NIET "bevestigd" — dat
// is precies het verschil tussen een snelle indicatie en een vastgelegde offerteprijs.
{
  const viaAlgemeenTarief = [{ line: { priceOrigin: 'catalog' }, result: { lineCents: 100, priceSource: 'Algemene materiaalprijs' } }];
  assert.equal(api.intakeMaterialsComplete(viaAlgemeenTarief), true, 'algemeen tarief is genoeg om een prijs te tonen');
  assert.equal(api.intakeMaterialsConfirmed(viaAlgemeenTarief), false, 'algemeen tarief is niet genoeg voor offerteniveau');

  const viaEigenPrijs = [{ line: { priceOrigin: 'user' }, result: { lineCents: 100, priceSource: 'Expliciet op regel' } }];
  assert.equal(api.intakeMaterialsConfirmed(viaEigenPrijs), true, 'eigen ingevulde prijs telt wel als bevestigd');

  const viaExacteCatalogus = [{ line: { priceOrigin: 'catalog' }, result: { lineCents: 100, priceSource: 'Exact catalogusartikel' } }];
  assert.equal(api.intakeMaterialsConfirmed(viaExacteCatalogus), true, 'exacte catalogusmatch telt wel als bevestigd');

  const viaFamilieSchatting = [{ line: { priceOrigin: 'catalog' }, result: { lineCents: 100, priceSource: 'Materiaal en profielfamilie' } }];
  assert.equal(api.intakeMaterialsConfirmed(viaFamilieSchatting), false, 'familie-schatting is niet bevestigd genoeg');
}

// Werkregeltotaal in centen (hoeveelheid x tarief), zelfde rekenwijze als jobs.js workTotal().
assert.equal(api.intakeWorkTotalCents([{ quantity: 2, rate: 55 }, { quantity: 1, rate: 45 }]), 15500);

// Diff-percentage voor eigen producten: geen vorig totaal -> null; anders afgerond op 0,1%.
assert.equal(api.intakePriceDiff(null, 1000), null);
assert.equal(api.intakePriceDiff(0, 1000), null);
assert.equal(api.intakePriceDiff(10000, 10400), 4, '+4% t.o.v. vorige keer');
assert.equal(api.intakePriceDiff(10000, 9500), -5);

// Aanpasbare ureninschatting (harmonica "prijsopbouw ter controle"): een override vervangt
// alleen de hoeveelheid van de regel met die naam, de rest van de werkregelset blijft ongemoeid
// (geen namen die matchen -> ongewijzigd; geen overrides -> exact dezelfde array-inhoud terug).
{
  const work = [{ name: 'Lassen', quantity: 2, rate: 65, unit: 'uur' }, { name: 'Voorrijden', quantity: 1, rate: 45, unit: 'rit' }];
  assert.deepEqual(api.intakeApplyWorkOverrides(work, null), work, 'geen overrides -> ongewijzigd');
  assert.deepEqual(api.intakeApplyWorkOverrides(work, {}), work, 'lege overrides -> ongewijzigd');
  const overridden = api.intakeApplyWorkOverrides(work, { Lassen: 3.5 });
  assert.equal(overridden[0].quantity, 3.5, 'override past alleen de gematchte regel aan');
  assert.equal(overridden[1].quantity, 1, 'niet-gematchte regel blijft op de berekende hoeveelheid');
  assert.equal(work[0].quantity, 2, 'origineel werkregel-object blijft onveranderd (geen mutatie)');
  const unmatched = api.intakeApplyWorkOverrides(work, { 'Bestaat niet': 9 });
  assert.deepEqual(unmatched, work, 'override op een niet-bestaande naam raakt niets');
}

console.log('snelprijs-funnel: zekerheidsniveau, bandbreedte, prijszin, diff-berekening en aanpasbare ureninschatting geslaagd');
