/* UI-laag die attachments.js (bijlagen), step-worker.js (STEP-inlezen, ONGEVERIFIEERD — zie
   step/README.md), classify.js (classificatie, wél getest), mesh-geometry.js (wél getest),
   viewer.js (3D-preview, wél getest met synthetische geometrie) en dxf.js (wél getest) samenbrengt
   tot het "STEP-voorstel"-paneel uit 3.2. Alles hier is een voorstel, nooit een stille wijziging
   van de rekenkern of het zekerheidsniveau van de klus (Bijlage B, en 3.2's laatste zin). */

// Kandidaat-profielen voor de doorsnede-match: bestaande PROFILES-rekenfuncties, geen eigen
// formules (voorkomt dat deze lijst uit de pas gaat lopen met de rekenkern).
function stepCandidateProfiles() {
  const sizes = {
    squareTube: [[20, 2], [25, 2], [30, 2], [30, 3], [40, 2], [40, 3], [40, 4], [50, 3], [50, 4], [60, 3], [60, 4], [60, 5], [80, 4], [80, 5], [100, 4], [100, 5]],
    rectTube: [[50, 30, 2], [60, 40, 3], [60, 40, 4], [80, 40, 3], [100, 50, 4], [100, 60, 4]],
    roundTube: [[21.3, 2], [26.9, 2], [33.7, 2], [33.7, 3], [42.4, 2], [42.4, 3], [48.3, 3], [60.3, 3], [76.1, 3], [88.9, 3]]
  };
  const out = [];
  for (const [profileKey, list] of Object.entries(sizes)) {
    const dimKeys = PROFILES[profileKey].dims.filter(d => d !== 'length');
    for (const vals of list) {
      const dims = {}; dimKeys.forEach((k, i) => dims[k] = vals[i]);
      out.push({ label: Object.values(dims).join('x'), profile: profileKey, dims, crossSectionMm2: PROFILES[profileKey].rekenfunctie(dims) });
    }
  }
  return out;
}

/* ---------- Worker-orchestratie ---------- */

let stepWorkerInstance = null, stepWorkerCallId = 0;
const stepWorkerPending = {};
function stepWorker() {
  if (!stepWorkerInstance) {
    stepWorkerInstance = new Worker('step/step-worker.js');
    stepWorkerInstance.onmessage = e => { const p = stepWorkerPending[e.data.id]; if (p) { delete stepWorkerPending[e.data.id]; p(e.data); } };
  }
  return stepWorkerInstance;
}
function parseStepFile(buffer, fileName) {
  return new Promise(resolve => {
    const id = ++stepWorkerCallId;
    stepWorkerPending[id] = resolve;
    stepWorker().postMessage({ id, buffer, fileName }, [buffer]);
  });
}

/* ---------- STEP-voorstel-paneel ---------- */

function ensureStepPanel() {
  let el = document.getElementById('step-proposal');
  if (!el) {
    el = document.createElement('div'); el.id = 'step-proposal'; el.className = 'job-panel'; el.hidden = true;
    const site = document.getElementById('panel-site');
    if (site) site.appendChild(el);
  }
  return el;
}
async function onStepAttachmentAdded(attachment) {
  const panel = ensureStepPanel();
  panel.hidden = false;
  panel.innerHTML = '<h2>STEP-voorstel <span class="badge-experimental">Controleer</span></h2><p role="status" id="step-status">Bestand inlezen… dit kan bij het eerste gebruik een moment duren (WASM wordt gedownload).</p>';
  let blob;
  try { blob = await attachmentGetBytes(attachment.id); } catch (e) { $('step-status').textContent = 'Kon de bijlage niet uit de lokale opslag lezen.'; return; }
  const buffer = await blob.arrayBuffer();
  let result;
  try { result = await parseStepFile(buffer, attachment.name); }
  catch (e) { $('step-status').textContent = 'Onverwachte fout bij het inlezen van dit STEP-bestand.'; return; }
  if (!result.ok) { panel.innerHTML = '<h2>STEP-voorstel</h2><p class="err">' + esc(result.error) + '</p>'; return; }
  if (!result.meshes.length) { panel.innerHTML = '<h2>STEP-voorstel</h2><p class="muted">Geen lichamen gevonden in dit bestand.</p>'; return; }
  const unitScale = result.unit === 'm' ? 1000 : 1;
  const bodies = result.meshes.map(m => Object.assign(
    meshToStepBody(m.name, m.positions, m.indices, m.instances, unitScale),
    { attachmentId: attachment.id, positions: m.positions, indices: m.indices }
  ));
  panel.dataset.stepBodies = 'pending';
  panel.__stepBodies = bodies;
  renderStepProposal(panel, bodies, 's235');
  if (typeof createStepViewer === 'function') attachStepViewer(bodies);
}
function renderStepProposal(panel, bodies, materialKey) {
  const candidates = stepCandidateProfiles();
  const classified = bodies.map(b => ({ body: b, classification: classifyStepBody(b, candidates) }));
  const rows = classified.map(({ body, classification }, i) => stepProposalRowHtml(body, classification, materialKey, i)).join('');
  panel.innerHTML = '<h2>STEP-voorstel <span class="badge-experimental">Controleer</span></h2>' +
    '<div class="job-grid"><div><label for="step-material">Materiaalsoort (voor dit bestand)</label><select id="step-material">' +
    Object.entries(MATERIALS).map(([k, v]) => '<option value="' + k + '"' + (k === materialKey ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('') + '</select></div></div>' +
    '<div id="step-viewer" class="step-viewer" role="img" aria-label="3D-voorbeeld van het STEP-bestand"></div>' +
    '<div class="step-rows">' + rows + '</div>' +
    '<div class="actions no-print"><button class="act" id="step-accept-all">Alles overnemen</button>' +
    '<button class="ghost" id="step-export-zaaglijst">Zaaglijst (CSV)</button><button class="ghost" id="step-export-dxf">Plaatcontour (DXF)</button></div>';
  $('step-material').onchange = e => renderStepProposal(panel, bodies, e.target.value);
  panel.querySelectorAll('[data-step-row]').forEach(row => {
    const i = +row.dataset.stepRow;
    row.querySelector('[data-step-add]').onclick = () => { addStepProposalLine(classified[i], materialKey); row.querySelector('[data-step-add]').textContent = 'Toegevoegd'; row.querySelector('[data-step-add]').disabled = true; };
    row.querySelector('[data-step-skip]').onclick = () => { row.hidden = true; };
  });
  $('step-accept-all').onclick = () => { classified.forEach(c => { if (c.classification.kind !== 'overig') addStepProposalLine(c, materialKey); }); showToast('STEP-regels toegevoegd. Controleer maten vóór het bewaren.'); };
  $('step-export-zaaglijst').onclick = () => downloadStepZaaglijst(classified);
  $('step-export-dxf').onclick = () => downloadStepDxf(classified);
}
function stepProposalRowHtml(body, classification, materialKey, i) {
  const weightKg = fmt(stepBodyWeightKg(body.volumeMm3, materialKey) * (body.instances || 1), 2);
  let desc;
  if (classification.kind === 'plate') desc = 'Plaat, dikte ' + (classification.matchedThicknessMm || fmt(classification.thicknessMm, 1)) + ' mm, ' + fmt(classification.lengthMm, 0) + '×' + fmt(classification.widthMm, 0) + ' mm' + (classification.confident ? '' : ' <span class="badge-experimental">geen standaarddikte</span>');
  else if (classification.kind === 'profile' && classification.candidates.length) desc = classification.candidates[0].profile + ' ' + classification.candidates[0].label + ', lengte ' + fmt(classification.lengthMm, 0) + ' mm' + (classification.candidates.length > 1 ? ' (' + classification.candidates.length + ' kandidaten)' : '');
  else if (classification.kind === 'profile') desc = 'Profiel, geen catalogusmatch binnen 5% — handmatig invullen';
  else desc = 'Overig — alleen gewicht, geen voorgestelde regel';
  return '<div class="job-row step-row" data-step-row="' + i + '"><span><b>' + esc(body.name) + '</b>' + (body.instances > 1 ? ' ×' + body.instances : '') + '<small>' + desc + ' · ' + weightKg + ' kg</small></span>' +
    '<span>' + (classification.kind !== 'overig' ? '<button class="ghost" data-step-add="1">Overnemen</button>' : '') + '<button class="ghost" data-step-skip="1">Overslaan</button></span></div>';
}
function addStepProposalLine(classifiedEntry, materialKey) {
  const j = ensureJob();
  const line = stepProposalLine(Object.assign({}, classifiedEntry.body, { attachmentId: classifiedEntry.body.attachmentId }), classifiedEntry.classification, materialKey, uid);
  if (!line) return;
  const kerf = strictNumber(COST_DEFAULTS.kerfMm) || 0;
  if (line.dims && line.dims.length && kerf) line.dims.length = line.dims.length + kerf;
  costState.materials.push(line);
  renderMaterials(); renderCostTotals(); queueDraft();
}

/* ---------- 3D-viewer koppelen ---------- */

let stepViewerInstance = null;
async function attachStepViewer(bodies) {
  const container = document.getElementById('step-viewer');
  if (!container) return;
  if (stepViewerInstance) { stepViewerInstance.dispose(); stepViewerInstance = null; }
  try { stepViewerInstance = await createStepViewer(container); }
  catch (e) { container.innerHTML = '<p class="muted">3D-weergave vereist een internetverbinding om three.js te laden (eenmalig).</p>'; return; }
  bodies.forEach((b, i) => stepViewerInstance.addMesh('body-' + i, b.positions, b.indices, 0x8a97a5));
  stepViewerInstance.fitToView();
  const controls = document.createElement('div');
  controls.className = 'step-viewer-controls no-print';
  controls.innerHTML = '<button class="ghost" type="button" id="step-fit">Passend</button><button class="ghost" type="button" id="step-section">Doorsnede aan/uit</button>';
  container.after(controls);
  $('step-fit').onclick = () => stepViewerInstance.fitToView();
  $('step-section').onclick = () => stepViewerInstance.toggleSection();
  document.querySelectorAll('.step-row').forEach((row, i) => { row.onmouseenter = () => stepViewerInstance.highlight('body-' + i); });
}

/* ---------- Snijlijst/DXF-export (3.4, experimenteel) ---------- */

function downloadTextFile(name, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function downloadStepZaaglijst(classified) {
  const profileBodies = classified.filter(c => c.classification.kind === 'profile' && c.classification.candidates.length)
    .map(c => ({ profile: c.classification.candidates[0].profile + ' ' + c.classification.candidates[0].label, lengthMm: c.classification.lengthMm, count: c.body.instances || 1 }));
  if (!profileBodies.length) { showToast('Geen profielen om te exporteren.'); return; }
  downloadTextFile('zaaglijst.csv', zaaglijstCsv(zaaglijstRows(profileBodies)), 'text/csv');
}
function downloadStepDxf(classified) {
  const plate = classified.find(c => c.classification.kind === 'plate');
  if (!plate) { showToast('Geen plaat gevonden om een contour van te maken.'); return; }
  // Vereenvoudigde rechthoekige contour uit de bounding box (geen echte vlakprojectie/gaten —
  // dat vereist face-topologie uit de STEP-geometrie zelf, onderdeel van het ongeverifieerde
  // STEP-parsing-deel, zie step/README.md). Nul-punt = linksonder.
  const l = plate.classification.lengthMm, w = plate.classification.widthMm;
  const dxf = buildDxf([{ type: 'polyline', points: [[0, 0], [l, 0], [l, w], [0, w]], closed: true }], plate.body.name);
  downloadTextFile((plate.body.name || 'plaat') + '.dxf', dxf, 'application/dxf');
}
