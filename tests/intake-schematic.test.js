'use strict';
// Test de live-schets-generatoren (intake/schematic.js): elke sjabloon-familie levert geldige,
// altijd-positieve mm-coördinaten (nodig voor de schaal-aanpassing), en schaalt correct naar een
// SVG-viewBox. Puur, geen DOM nodig.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync('intake/schematic.js', 'utf8');
const context = { console, Math, Number, Object, Array, String };
vm.createContext(context);
vm.runInContext(src + '\nthis.api = { fenceSchematic, gateSchematic, stairSchematic, platformSchematic, beamSchematic, frameSchematic, tableSchematic, intakeSchematicFor, schematicFit, intakeSchematicSvg };', context);
const { api } = context;

function assertAllPositive(schematic, label) {
  assert.ok(schematic.width > 0 && schematic.height > 0, label + ': breedte/hoogte positief');
  for (const l of schematic.lines) for (const v of [l.x1, l.y1, l.x2, l.y2]) assert.ok(v >= 0 && Number.isFinite(v), label + ': coördinaat ' + v + ' is negatief of ongeldig');
}

// Hekwerk: meer spijlen bij een kleinere spijlafstand (dit is precies het "live zichtbaar maken").
{
  const wijd = api.fenceSchematic(3000, 1000, 200);
  const smal = api.fenceSchematic(3000, 1000, 100);
  assertAllPositive(wijd, 'hekwerk breed'); assertAllPositive(smal, 'hekwerk smal');
  assert.ok(smal.lines.length > wijd.lines.length, 'kleinere spijlafstand geeft meer lijnen (meer spijlen)');
  assert.equal(wijd.width, 3000); assert.equal(wijd.height, 1000);
}

// Poort: dubbele uitvoering geeft twee losse kaders i.p.v. één.
{
  const enkel = api.gateSchematic(3000, 1500, 1);
  const dubbel = api.gateSchematic(3000, 1500, 2);
  assertAllPositive(enkel, 'poort enkel'); assertAllPositive(dubbel, 'poort dubbel');
  assert.ok(dubbel.lines.length > enkel.lines.length, 'dubbele poort heeft meer lijnen (twee kaders)');
}

// Trap: hogere stijgingshoogte geeft meer treden en dus een langere aanloop (width).
{
  const laag = api.stairSchematic(1000);
  const hoog = api.stairSchematic(3000);
  assertAllPositive(laag, 'trap laag'); assertAllPositive(hoog, 'trap hoog');
  assert.ok(hoog.width > laag.width, 'meer hoogte te overbruggen geeft een langere trap (meer treden)');
  assert.equal(hoog.height, 3000);
}

// Bordes, balk, frame, tafel: basisvorm klopt (positief, juiste breedte/hoogte-orde van grootte).
assertAllPositive(api.platformSchematic(1000, 1200, 900), 'bordes');
assertAllPositive(api.beamSchematic(4000), 'draagbalk');
assertAllPositive(api.frameSchematic(4000, 3000), 'kolom-balk-frame');
assertAllPositive(api.tableSchematic(1200, 850), 'werktafel');

// Dispatcher: elk van de 11 sjablonen-met-vaste-vorm levert een schets, maatwerk bewust niet.
{
  const cases = [
    ['hekwerk-spijlen', { length: 3, height: 1000, spacing: 110 }],
    ['balustrade-handregel', { length: 4, height: 1000, postSpacing: 1200 }],
    ['trapleuning', { length: 3, height: 1000, angle: 30 }],
    ['draaipoort', { width: 3000, height: 1500, leaves: 'Enkel' }],
    ['schuifpoort', { width: 4000, height: 1500 }],
    ['stalen-deur', { width: 900, height: 2100 }],
    ['trap-recht', { rise: 2500 }],
    ['bordes-leuning', { width: 1000, depth: 1000, height: 900 }],
    ['draagbalk', { span: 4 }],
    ['kolom-balk-frame', { width: 4, height: 3 }],
    ['werktafel-frame', { width: 1200, height: 850 }]
  ];
  for (const [id, params] of cases) {
    const schematic = api.intakeSchematicFor(id, params);
    assert.ok(schematic, id + ': levert een schets');
    assertAllPositive(schematic, id);
  }
  assert.equal(api.intakeSchematicFor('maatwerk', {}), null, 'maatwerk heeft bewust geen vaste-vorm-schets');
}

// Schaal/fit: een grote werkelijke maat past binnen de viewBox, en de y-as wordt gespiegeld
// (bouwkundig boven = SVG-y klein).
{
  const fit = api.schematicFit(3000, 1000, 320, 180, 20);
  assert.ok(fit.scale > 0 && fit.scale < 1, 'een reële maat van meters wordt teruggeschaald naar SVG-pixels');
  const svg = api.intakeSchematicSvg(api.fenceSchematic(3000, 1000, 110), 320, 180);
  assert.ok(svg.startsWith('<svg viewBox="0 0 320 180"'));
  assert.ok(svg.includes('<line'));
  assert.equal(api.intakeSchematicSvg(null), '', 'geen schets -> lege string, geen crash');
}

console.log('live 2D-schets: alle 11 sjabloon-vormen leveren geldige, altijd-positieve coördinaten die live meebewegen met de parameters');
