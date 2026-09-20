/* Snijlijst/DXF (Fase 3.4, "experimenteel" — zo gelabeld in de UI). Pure tekstgeneratie: ASCII
   DXF R12, uitsluitend LWPOLYLINE/CIRCLE/TEXT-entiteiten, zelf geschreven (geen extra library,
   harde randvoorwaarde 1). Werkt op contourdata (polylijnen/cirkels in mm) — waar die data
   vandaan komt (een geprojecteerd STEP-vlak) is het onverifieerde deel, zie step/README.md. */

function dxfNum(n) { return String(Math.round(n * 1000) / 1000); }
function dxfPolylineLines(points, closed) {
  const lines = ['0', 'LWPOLYLINE', '8', '0', '90', String(points.length), '70', closed === false ? '0' : '1'];
  for (const [x, y] of points) lines.push('10', dxfNum(x), '20', dxfNum(y));
  return lines;
}
function dxfCircleLines(cx, cy, r) { return ['0', 'CIRCLE', '8', '0', '10', dxfNum(cx), '20', dxfNum(cy), '40', dxfNum(r)]; }
// entities: [{type:'polyline', points:[[x,y],...], closed}, {type:'circle', cx, cy, r}]
function buildDxf(entities, label) {
  const body = [];
  for (const e of entities || []) {
    if (e.type === 'polyline' && Array.isArray(e.points) && e.points.length >= 2) body.push(...dxfPolylineLines(e.points, e.closed));
    else if (e.type === 'circle' && Number.isFinite(e.r)) body.push(...dxfCircleLines(e.cx, e.cy, e.r));
  }
  const controle = ['0', 'TEXT', '8', 'WERKBANK-CONTROLE', '10', '0', '20', '-10', '40', '5', '1',
    'Automatisch afgeleid uit STEP (' + (label || 'onbekend') + ') — controleer maten voor snijden'];
  return ['0', 'SECTION', '2', 'ENTITIES', ...body, ...controle, '0', 'ENDSEC', '0', 'EOF'].join('\n') + '\n';
}
// Hoek tussen een eindvlak-normaal en de lengte-as van een profiel: 0deg = haaks afgezaagd
// (normaal evenwijdig aan de as), anders een verstekhoek. Puur vectorwiskunde; de echte
// vlaknormalen komen in productie uit de STEP-geometrie (onverifieerd deel, zie README).
function miterAngleDeg(axisVector, faceNormalVector) {
  const dot = axisVector[0] * faceNormalVector[0] + axisVector[1] * faceNormalVector[1] + axisVector[2] * faceNormalVector[2];
  const magA = Math.hypot(...axisVector), magN = Math.hypot(...faceNormalVector);
  if (!magA || !magN) return null;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magA * magN)));
  return Math.round(Math.acos(Math.abs(cosAngle)) * 180 / Math.PI * 10) / 10;
}
// Zaaglijst: profiel/lengte/aantal(/hoek) -> CSV, hergebruikt door de werkplaatskaart-print.
function zaaglijstRows(profielBodies) {
  return (profielBodies || []).map(b => ({ profiel: b.profile, lengteMm: b.lengthMm, aantal: b.count || 1, hoekGraden: b.miterDeg != null ? b.miterDeg : null }));
}
function zaaglijstCsv(rows) {
  const esc = v => v == null ? '' : String(v);
  const header = 'Profiel;Lengte (mm);Aantal;Hoek (graden)';
  return [header, ...rows.map(r => [esc(r.profiel), esc(r.lengteMm), esc(r.aantal), esc(r.hoekGraden)].join(';'))].join('\n');
}
function plaatlijstRows(plaatBodies) {
  return (plaatBodies || []).map(b => ({ dikteMm: b.thicknessMm, lengteMm: b.lengthMm, breedteMm: b.widthMm, aantal: b.count || 1, gewichtKg: b.weightKg }));
}
