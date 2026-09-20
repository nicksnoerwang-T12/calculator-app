/* Live 2D-schets bij de snelprijs-parameters: een simpele lijntekening (elevatie) per sjabloon-
   familie, in echte mm, die live meebeweegt met elke parameterwijziging. Bewust géén exacte maat-
   aanduidingen in de SVG zelf (fragiele positionering); de live cijfers staan al in de velden
   ernaast. Puur: elke schematicFn(params) -> {width, height, lines:[{x1,y1,x2,y2}]} in mm, los
   van schaal/weergave (die zit in intakeRenderSchematicSvg, wél in de UI-laag). */

function fenceSchematic(lengthMm, heightMm, spacingMm) {
  const w = Math.max(1, lengthMm), h = Math.max(1, heightMm), sp = Math.max(10, spacingMm);
  const lines = [{ x1: 0, y1: 0, x2: w, y2: 0 }, { x1: 0, y1: h, x2: w, y2: h }];
  const count = Math.max(2, Math.round(w / sp) + 1);
  for (let i = 0; i < count; i++) { const x = Math.min(w, i * sp); lines.push({ x1: x, y1: 0, x2: x, y2: h }); }
  return { width: w, height: h, lines };
}
function gateSchematic(widthMm, heightMm, leaves) {
  const w = Math.max(1, widthMm), h = Math.max(1, heightMm), n = Math.max(1, leaves);
  const leafW = w / n, gap = w * 0.02;
  const lines = [];
  for (let L = 0; L < n; L++) {
    const x0 = L * leafW + (L > 0 ? gap / 2 : 0), x1 = (L + 1) * leafW - (L < n - 1 ? gap / 2 : 0);
    lines.push({ x1: x0, y1: 0, x2: x1, y2: 0 }, { x1: x0, y1: h, x2: x1, y2: h }, { x1: x0, y1: 0, x2: x0, y2: h }, { x1: x1, y1: 0, x2: x1, y2: h });
    const spindles = Math.max(2, Math.round((x1 - x0) / 110));
    for (let i = 1; i < spindles; i++) { const x = x0 + (x1 - x0) * i / spindles; lines.push({ x1: x, y1: 8, x2: x, y2: h - 8 }); }
  }
  return { width: w, height: h, lines };
}
function stairSchematic(riseMm) {
  const rise = Math.max(1, riseMm), treads = Math.max(2, Math.round(rise / 180)), stepH = rise / treads, stepD = 250;
  const lines = [];
  let x = 0, y = 0;
  for (let i = 0; i < treads; i++) { lines.push({ x1: x, y1: y, x2: x, y2: y + stepH }); y += stepH; lines.push({ x1: x, y1: y, x2: x + stepD, y2: y }); x += stepD; }
  return { width: x, height: rise, lines };
}
function platformSchematic(widthMm, depthMm, heightMm) {
  const d = Math.max(1, depthMm), h = Math.max(1, heightMm), deckT = 30;
  return {
    width: d, height: h + deckT, lines: [
      { x1: 0, y1: h, x2: d, y2: h }, { x1: 0, y1: h + deckT, x2: d, y2: h + deckT },
      { x1: 0, y1: h, x2: 0, y2: h + deckT }, { x1: d, y1: h, x2: d, y2: h + deckT },
      { x1: 20, y1: 0, x2: 20, y2: h }, { x1: d - 20, y1: 0, x2: d - 20, y2: h }
    ]
  };
}
function beamSchematic(spanMm) {
  const w = Math.max(1, spanMm), h = Math.max(10, w / 20);
  return { width: w, height: h, lines: [{ x1: 0, y1: 0, x2: w, y2: 0 }, { x1: 0, y1: h, x2: w, y2: h }, { x1: 0, y1: 0, x2: 0, y2: h }, { x1: w, y1: 0, x2: w, y2: h }] };
}
function frameSchematic(widthMm, heightMm) {
  const w = Math.max(1, widthMm), h = Math.max(1, heightMm);
  return { width: w, height: h, lines: [{ x1: 0, y1: 0, x2: 0, y2: h }, { x1: w, y1: 0, x2: w, y2: h }, { x1: 0, y1: h, x2: w, y2: h }] };
}
function tableSchematic(widthMm, heightMm) {
  const w = Math.max(1, widthMm), h = Math.max(1, heightMm);
  return { width: w, height: h, lines: [{ x1: 0, y1: h, x2: w, y2: h }, { x1: 10, y1: 0, x2: 10, y2: h }, { x1: w - 10, y1: 0, x2: w - 10, y2: h }] };
}
// Eén dispatcher per sjabloon-id -> geen schets voor maatwerk (geen vaste vorm om te tekenen).
function intakeSchematicFor(templateId, p) {
  switch (templateId) {
    case 'hekwerk-spijlen': return fenceSchematic(p.length * 1000, p.height, p.spacing);
    case 'balustrade-handregel': return fenceSchematic(p.length * 1000, p.height, p.postSpacing);
    case 'trapleuning': return fenceSchematic(p.length * 1000 / Math.cos(p.angle * Math.PI / 180), p.height, 900);
    case 'draaipoort': return gateSchematic(p.width, p.height, p.leaves === 'Dubbel' ? 2 : 1);
    case 'schuifpoort': return gateSchematic(p.width, p.height, 1);
    case 'stalen-deur': return gateSchematic(p.width, p.height, 1);
    case 'trap-recht': return stairSchematic(p.rise);
    case 'bordes-leuning': return platformSchematic(p.width, p.depth, p.height);
    case 'draagbalk': return beamSchematic(p.span * 1000);
    case 'kolom-balk-frame': return frameSchematic(p.width * 1000, p.height * 1000);
    case 'werktafel-frame': return tableSchematic(p.width, p.height);
    default: return null;
  }
}
// Past de mm-coördinaten in een viewBox met marge, en spiegelt de y-as (bouwkundig: omhoog is
// positief; SVG: omlaag is positief) — puur, en dus apart testbaar van de SVG-stringopbouw.
function schematicFit(width, height, viewW, viewH, pad) {
  const availW = Math.max(1, viewW - 2 * pad), availH = Math.max(1, viewH - 2 * pad);
  const scale = Math.min(availW / Math.max(1, width), availH / Math.max(1, height));
  return { scale, offsetX: (viewW - width * scale) / 2, offsetY: (viewH - height * scale) / 2 };
}
function intakeSchematicSvg(schematic, viewW, viewH) {
  if (!schematic || !schematic.lines.length) return '';
  viewW = viewW || 320; viewH = viewH || 180;
  const fit = schematicFit(schematic.width, schematic.height, viewW, viewH, 20);
  const tx = x => Math.round((x * fit.scale + fit.offsetX) * 10) / 10;
  const ty = y => Math.round((viewH - (y * fit.scale + fit.offsetY)) * 10) / 10;
  const lines = schematic.lines.map(l => '<line x1="' + tx(l.x1) + '" y1="' + ty(l.y1) + '" x2="' + tx(l.x2) + '" y2="' + ty(l.y2) + '" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="round"/>').join('');
  return '<svg viewBox="0 0 ' + viewW + ' ' + viewH + '" class="intake-schematic-svg" role="img" aria-label="Schematische weergave, geen exacte maatvoering">' + lines + '</svg>';
}
