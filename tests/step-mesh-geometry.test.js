'use strict';
// Test de mesh-naar-geometrie-wiskunde (step/mesh-geometry.js) tegen bekende primitieven (kubus,
// balk) waarvan bounding box en volume met de hand te controleren zijn. Puur, geen WASM nodig —
// dit is de brug tussen occt-import-js's echte (ongeverifieerde) meshoutput en classify.js.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync('step/mesh-geometry.js', 'utf8');
const context = { console, Math, Number, Array };
vm.createContext(context);
vm.runInContext(src + '\nthis.api = { meshBoundingBoxMm, meshVolumeMm3, meshToStepBody };', context);
const { api } = context;

// Eenheidskubus (0,0,0)-(1,1,1), 12 driehoeken (2 per zijde), buitenwaartse normalen (rechtsom
// gezien van buiten) zodat het volume-teken klopt met de divergentiestelling.
function unitCube() {
  const v = [
    0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, // onder z=0: 0,1,2,3
    0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1  // boven z=1: 4,5,6,7
  ];
  const idx = [
    0, 2, 1, 0, 3, 2, // onder (normaal -z)
    4, 5, 6, 4, 6, 7, // boven (normaal +z)
    0, 1, 5, 0, 5, 4, // -y
    1, 2, 6, 1, 6, 5, // +x
    2, 3, 7, 2, 7, 6, // +y
    3, 0, 4, 3, 4, 7  // -x
  ];
  return { positions: v, indices: idx };
}

{
  const cube = unitCube();
  const bbox = api.meshBoundingBoxMm(cube.positions);
  assert.deepEqual(bbox.min, [0, 0, 0]); assert.deepEqual(bbox.max, [1, 1, 1]); assert.deepEqual(bbox.sizeMm, [1, 1, 1]);
  const volume = api.meshVolumeMm3(cube.positions, cube.indices);
  assert.ok(Math.abs(volume - 1) < 1e-9, 'eenheidskubus heeft volume 1: kreeg ' + volume);
}

// Balk 40x40x1000 (bijvoorbeeld een koker-achtige bounding box), volume moet 40*40*1000 zijn.
{
  const w = 40, h = 40, l = 1000;
  const v = [0, 0, 0, w, 0, 0, w, h, 0, 0, h, 0, 0, 0, l, w, 0, l, w, h, l, 0, h, l];
  const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  const volume = api.meshVolumeMm3(v, idx);
  assert.ok(Math.abs(volume - w * h * l) < 1, 'balkvolume klopt: kreeg ' + volume + ', verwacht ' + (w * h * l));
  const bbox = api.meshBoundingBoxMm(v);
  assert.deepEqual(bbox.sizeMm, [w, h, l]);
}

// meshToStepBody: combineert bbox+volume tot het {name, bboxMm, volumeMm3, instances}-contract
// dat classify.js verwacht, met optionele eenheidsschaal (m -> mm als het STEP-bestand in meters is).
{
  const cube = unitCube();
  const bodyMm = api.meshToStepBody('Testdeel', cube.positions, cube.indices, 3, 1);
  assert.deepEqual(bodyMm.bboxMm, [1, 1, 1]); assert.equal(bodyMm.instances, 3);
  const bodyFromMeters = api.meshToStepBody('Testdeel', cube.positions, cube.indices, 1, 1000);
  assert.deepEqual(bodyFromMeters.bboxMm, [1000, 1000, 1000], 'schaal 1000 zet meters om naar mm');
  assert.ok(Math.abs(bodyFromMeters.volumeMm3 - 1e9) < 1, '1 m3 = 1e9 mm3');
}

console.log('STEP mesh-geometrie: bounding box en volume kloppen op bekende primitieven (kubus, balk)');
