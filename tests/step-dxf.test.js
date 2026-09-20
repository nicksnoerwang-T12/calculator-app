'use strict';
// Test de pure DXF-schrijver en zaaglijst/plaatlijst-opbouw (step/dxf.js). Zelf geschreven ASCII
// DXF R12 (LWPOLYLINE/CIRCLE/TEXT), geen library. Geen WASM/DOM/echt STEP-bestand nodig — dit is
// precies het stuk van Fase 3.4 dat zonder CAD-kernel volledig te verifiëren is.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync('step/dxf.js', 'utf8');
const context = { console, Math, Number, Object, Array, String };
vm.createContext(context);
vm.runInContext(src + '\nthis.api = { buildDxf, miterAngleDeg, zaaglijstRows, zaaglijstCsv, plaatlijstRows };', context);
const { api } = context;

// buildDxf: geldige minimale structuur, alleen de toegestane entiteiten, en de verplichte
// WERKBANK-CONTROLE-tekstlaag.
{
  const dxf = api.buildDxf([
    { type: 'polyline', points: [[0, 0], [100, 0], [100, 50], [0, 50]], closed: true },
    { type: 'circle', cx: 20, cy: 20, r: 5 }
  ], 'Deksel_plaat');
  assert.ok(dxf.startsWith('0\nSECTION\n2\nENTITIES\n'), 'begint met een geldige ENTITIES-sectie');
  assert.ok(dxf.includes('0\nLWPOLYLINE'));
  assert.ok(dxf.includes('0\nCIRCLE'));
  assert.ok(dxf.includes('40\n5'), 'cirkelstraal aanwezig');
  assert.ok(dxf.includes('WERKBANK-CONTROLE'), 'controle-tekstlaag altijd aanwezig');
  assert.ok(dxf.includes('controleer maten'));
  assert.ok(dxf.trim().endsWith('0\nEOF'), 'eindigt geldig');
  assert.ok(!dxf.includes('SPLINE') && !dxf.includes('ARC'), 'geen andere entiteiten dan gevraagd');
}

// Lege entiteitenlijst geeft nog steeds een geldig (leeg) bestand met de controle-tekst.
{
  const dxf = api.buildDxf([], 'Leeg');
  assert.ok(dxf.includes('WERKBANK-CONTROLE'));
  assert.ok(dxf.includes('0\nEOF'));
}

// Ongeldige entiteiten (te weinig punten, geen straal) worden overgeslagen, niet gecrasht.
{
  const dxf = api.buildDxf([{ type: 'polyline', points: [[0, 0]] }, { type: 'circle', cx: 1, cy: 1 }], 'Test');
  assert.ok(!dxf.includes('LWPOLYLINE'));
  assert.ok(!dxf.includes('CIRCLE'));
}

// Versteksehoek uit vlaknormaal: 0 graden bij een haakse snede (normaal evenwijdig aan de as),
// 45 graden bij een normaal onder 45 graden met de as.
{
  assert.equal(api.miterAngleDeg([0, 0, 1], [0, 0, 1]), 0, 'normaal evenwijdig aan de as = haakse snede');
  assert.equal(api.miterAngleDeg([0, 0, 1], [0, 0, -1]), 0, 'tegengestelde richting is ook haaks (vlak wijst de andere kant op)');
  const angle = api.miterAngleDeg([0, 0, 1], [1, 0, 1]);
  assert.ok(Math.abs(angle - 45) < 0.1, '45 graden verstek: kreeg ' + angle);
  assert.equal(api.miterAngleDeg([0, 0, 0], [1, 0, 0]), null, 'nul-vector kan geen hoek geven');
}

// Zaaglijst: profiel/lengte/aantal/hoek -> rijen -> CSV met kopregel.
{
  const rows = api.zaaglijstRows([
    { profile: 'squareTube 40x40x3', lengthMm: 1000, count: 2, miterDeg: 0 },
    { profile: 'squareTube 40x40x3', lengthMm: 600, count: 2 }
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].hoekGraden, null, 'geen hoek meegegeven blijft null, geen gegokte 0');
  const csv = api.zaaglijstCsv(rows);
  assert.ok(csv.startsWith('Profiel;Lengte (mm);Aantal;Hoek (graden)\n'));
  assert.ok(csv.includes('squareTube 40x40x3;1000;2;0'));
  assert.ok(csv.includes('squareTube 40x40x3;600;2;\n') || csv.endsWith('squareTube 40x40x3;600;2;'));
}

// Plaatlijst: dikte/afmeting/aantal/gewicht.
{
  const rows = api.plaatlijstRows([{ thicknessMm: 5, lengthMm: 500, widthMm: 300, count: 1, weightKg: 5.6 }]);
  assert.equal(rows[0].dikteMm, 5); assert.equal(rows[0].gewichtKg, 5.6);
}

console.log('STEP-snijlijst/DXF: geldige ASCII DXF R12, versteksehoek-wiskunde, zaaglijst/plaatlijst-opbouw geslaagd');
