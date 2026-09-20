/* Geometrie uit een getrianguleerde mesh (wat occt-import-js daadwerkelijk teruggeeft: platte
   vertex-posities + driehoeksindices — géén kant-en-klare bounding box/volume). Puur wiskunde,
   dus wél volledig testbaar zonder WASM/browser; dit is de brug tussen step-worker.js's ruwe
   mesh-output en classify.js's {bboxMm, volumeMm3}-input. */

function meshBoundingBoxMm(positions) {
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) { const v = positions[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  }
  return { min, max, sizeMm: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}
// Volume van een gesloten driehoeksmesh via de divergentiestelling (som van getekende
// tetraëdervolumes t.o.v. de oorsprong) — standaardtechniek, onafhankelijk van de oorsprongkeuze
// zolang de mesh gesloten is.
function meshVolumeMm3(positions, indices) {
  let volume = 0;
  const tri = (i0, i1, i2) => {
    const ax = positions[i0 * 3], ay = positions[i0 * 3 + 1], az = positions[i0 * 3 + 2];
    const bx = positions[i1 * 3], by = positions[i1 * 3 + 1], bz = positions[i1 * 3 + 2];
    const cx = positions[i2 * 3], cy = positions[i2 * 3 + 1], cz = positions[i2 * 3 + 2];
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  };
  if (indices && indices.length) { for (let i = 0; i < indices.length; i += 3) tri(indices[i], indices[i + 1], indices[i + 2]); }
  else { for (let i = 0; i < positions.length / 3; i += 3) tri(i, i + 1, i + 2); }
  return Math.abs(volume);
}
// occt-import-js geeft meshes in de eenheid van het STEP-bestand (meestal mm, soms m — 3.2 vraagt
// om dit te lezen en bij ontbreken mm aan te nemen). schaal=1 laat mm ongemoeid, 1000 zet m om.
function meshToStepBody(name, positions, indices, instances, schaal) {
  const s = schaal || 1;
  const scaled = new Array(positions.length);
  for (let i = 0; i < positions.length; i++) scaled[i] = positions[i] * s;
  const bbox = meshBoundingBoxMm(scaled);
  const volumeMm3 = meshVolumeMm3(scaled, indices);
  return { name, bboxMm: bbox.sizeMm, volumeMm3, instances: instances || 1 };
}
