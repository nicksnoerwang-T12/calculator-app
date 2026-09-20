/* STEP-classificatie (Fase 3.2): pure functies op geometriedata (bounding box, volume) zoals
   occt-import-js die per body/solid teruggeeft. Bewust losgekoppeld van het inlezen van het
   bestand zelf (zie step/step-worker.js) zodat deze heuristiek zonder WASM/browser/echt
   STEP-bestand getest kan worden — zie step/README.md voor waarom dat in deze omgeving nodig was.
   Alles hier is een "voorstel", nooit een stille correctie van de rekenkern (Bijlage B). */

const STANDARD_PLATE_THICKNESSES_MM = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
const PLATE_THICKNESS_TOLERANCE_MM = 0.3;
const PROFILE_LENGTH_RATIO = 5;
const PROFILE_CROSS_SECTION_TOLERANCE = 0.05;
const STEP_DENSITIES = { s235: 7850, s355: 7850, rvs304: 7900, rvs316: 7980, rvs430: 7700, alu: 2700, messing: 8500, koper: 8960 };

// Sorteert de drie bbox-dimensies (mm) klein->groot; simpele, robuuste basis voor beide regels.
function sortedDims(bbox) { return [...bbox].sort((a, b) => a - b); }

function matchPlateThickness(dMm) {
  let best = null, bestDiff = Infinity;
  for (const t of STANDARD_PLATE_THICKNESSES_MM) { const diff = Math.abs(t - dMm); if (diff < bestDiff) { best = t; bestDiff = diff; } }
  return bestDiff <= PLATE_THICKNESS_TOLERANCE_MM ? best : null;
}
// candidates: [{label, profile, dims, crossSectionMm2}], door de aanroeper samengesteld uit de
// bestaande catalogus/PROFILES — deze functie kent de catalogus zelf niet, blijft dus puur.
function matchProfileCrossSection(areaMm2, candidates) {
  return (candidates || [])
    .map(c => ({ ...c, diffPct: Math.round((Math.abs(c.crossSectionMm2 - areaMm2) / areaMm2) * 1000) / 10 }))
    .filter(c => c.diffPct <= PROFILE_CROSS_SECTION_TOLERANCE * 100)
    .sort((a, b) => a.diffPct - b.diffPct);
}
// body: {name, bboxMm:[x,y,z], volumeMm3, instances}. candidates: zie matchProfileCrossSection.
// Classificeert nooit stilzwijgend "overig" als plaat/profiel twijfelachtig is — bij twijfel
// (bv. twee even aannemelijke kandidaten) blijft het aan de gebruiker (keuzelijst in de UI-laag).
function classifyStepBody(body, candidates) {
  const [d0, d1, d2] = sortedDims(body.bboxMm);
  if (d0 <= 25 && d1 > 0 && d0 <= d1 / 10) {
    const matched = matchPlateThickness(d0);
    return { kind: 'plate', thicknessMm: Math.round(d0 * 100) / 100, matchedThicknessMm: matched, lengthMm: d2, widthMm: d1, confident: matched !== null };
  }
  if (d1 > 0 && d2 >= PROFILE_LENGTH_RATIO * d1 && d2 >= PROFILE_LENGTH_RATIO * d0) {
    const crossSectionMm2 = body.volumeMm3 / d2;
    const matches = matchProfileCrossSection(crossSectionMm2, candidates);
    return { kind: 'profile', lengthMm: Math.round(d2 * 100) / 100, crossSectionMm2: Math.round(crossSectionMm2 * 100) / 100, candidates: matches, confident: matches.length === 1 };
  }
  return { kind: 'overig' };
}
function stepBodyWeightKg(volumeMm3, materialKey) {
  const density = STEP_DENSITIES[materialKey] || STEP_DENSITIES.s235;
  return volumeMm3 * density * 1e-9;
}
// Bouwt een materiaalregel-voorstel (Fase 0.4-contract) uit een classificatie; de UI-laag beslist
// per regel Overnemen/Aanpassen/Overslaan, hier alleen het voorstel zelf. Zaagverlies uit
// instellingen (kerfMm) wordt op profiellengtes toegepast als waste-percentage-equivalent zoals
// de bestaande aankoopplanning dat ook al doet.
function stepProposalLine(body, classification, materialKey, uidFn) {
  const base = { id: uidFn(), material: materialKey, count: body.instances || 1, countMode: 'project', source: 'step', attachmentId: body.attachmentId, note: body.name };
  if (classification.kind === 'plate') {
    return Object.assign(base, { profile: 'plate', priceBasis: 'kg', priceMode: 'catalog', waste: 5, dims: { length: classification.lengthMm, width: classification.widthMm, t: classification.matchedThicknessMm || classification.thicknessMm } });
  }
  if (classification.kind === 'profile' && classification.candidates.length) {
    const best = classification.candidates[0];
    return Object.assign(base, { profile: best.profile, priceBasis: 'kg', priceMode: 'catalog', waste: 5, dims: Object.assign({}, best.dims, { length: classification.lengthMm }) });
  }
  return null; // "overig"/onzekere profielmatch: geen voorstel, UI zet dit in de "Handmatig"-lijst.
}
