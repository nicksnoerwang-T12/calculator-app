/* Bijlagen (Fase 3.1): STEP/DXF/PDF/afbeeldingen bij een klus. Metadata leeft op
   costState.job.attachments (zelfde patroon als photos/measurements, syncbaar via de bestaande
   projectopslag); de bytes zelf leven lokaal in IndexedDB (te groot voor localStorage) en, als
   cloud actief is, in Supabase Storage-bucket "attachments" onder user_id/-prefix. */

/* ---------- Pure helpers (limieten, validatie, bestandsnaam-logica) ---------- */

const ATTACHMENT_MAX_FILE_BYTES = 25 * 1024 * 1024;
const ATTACHMENT_MAX_JOB_BYTES = 100 * 1024 * 1024;
const ATTACHMENT_EXTENSIONS = ['.step', '.stp', '.dxf', '.pdf', '.jpg', '.jpeg', '.png', '.webp'];
function attachmentExt(name) { const m = /\.[a-z0-9]+$/i.exec(String(name || '')); return m ? m[0].toLowerCase() : ''; }
function attachmentTypeAllowed(name) { return ATTACHMENT_EXTENSIONS.includes(attachmentExt(name)); }
function attachmentIsStep(name) { return ['.step', '.stp'].includes(attachmentExt(name)); }
function attachmentSizeOk(bytes) { return Number.isFinite(bytes) && bytes > 0 && bytes <= ATTACHMENT_MAX_FILE_BYTES; }
function attachmentUsageBytes(existing) { return (existing || []).reduce((s, a) => s + (a.size || 0), 0); }
function attachmentBudgetOk(existing, newBytes) { return attachmentUsageBytes(existing) + newBytes <= ATTACHMENT_MAX_JOB_BYTES; }
// Eén validatiefunctie die alle drie de regels combineert en een Nederlandse foutmelding teruggeeft
// (of null als het bestand geaccepteerd mag worden) — dit is wat de upload-handler aanroept.
function attachmentValidate(file, existing) {
  if (!attachmentTypeAllowed(file.name)) return 'Bestandstype niet ondersteund: ' + esc(attachmentExt(file.name) || file.name) + '.';
  if (!attachmentSizeOk(file.size)) return 'Bestand groter dan 25 MB.';
  if (!attachmentBudgetOk(existing, file.size)) return 'Deze klus zit al aan de 100 MB aan bijlagen.';
  return null;
}
function attachmentUsageLabel(existing) {
  const used = attachmentUsageBytes(existing) / (1024 * 1024), max = ATTACHMENT_MAX_JOB_BYTES / (1024 * 1024);
  return fmt(used, 1) + ' / ' + fmt(max, 0) + ' MB gebruikt';
}

/* ---------- SHA-256 (Web Crypto; browser-only, geen DOM nodig) ---------- */

async function attachmentSha256(arrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- IndexedDB (bytes; metadata leeft apart op costState.job.attachments) ---------- */

const ATTACHMENT_DB_NAME = 'werkbank-attachments', ATTACHMENT_STORE_NAME = 'attachments';
function openAttachmentDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ATTACHMENT_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ATTACHMENT_STORE_NAME)) db.createObjectStore(ATTACHMENT_STORE_NAME, { keyPath: 'id' }).createIndex('jobId', 'jobId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function attachmentPutBytes(id, jobId, blob) {
  const db = await openAttachmentDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE_NAME, 'readwrite');
    tx.objectStore(ATTACHMENT_STORE_NAME).put({ id, jobId, blob });
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}
async function attachmentGetBytes(id) {
  const db = await openAttachmentDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE_NAME, 'readonly');
    const req = tx.objectStore(ATTACHMENT_STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error);
  });
}
async function attachmentDeleteBytes(id) {
  const db = await openAttachmentDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE_NAME, 'readwrite');
    tx.objectStore(ATTACHMENT_STORE_NAME).delete(id);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}

/* ---------- UI: bijlagenpaneel in de Opname-tab ---------- */

function ensureJobAttachments(job) { if (!Array.isArray(job.attachments)) job.attachments = []; return job.attachments; }

async function addAttachments(fileList) {
  const j = ensureJob(), list = ensureJobAttachments(j);
  const files = Array.from(fileList);
  const feedback = document.getElementById('attachment-feedback');
  const errors = [];
  for (const file of files) {
    const err = attachmentValidate(file, list);
    if (err) { errors.push(file.name + ': ' + err); continue; }
    try {
      const buffer = await file.arrayBuffer();
      const sha256 = await attachmentSha256(buffer);
      const id = uid();
      await attachmentPutBytes(id, j.id || savedProjectId || 'draft', new Blob([buffer], { type: file.type }));
      list.push({ id, name: file.name, type: attachmentExt(file.name), size: file.size, sha256, createdAt: new Date().toISOString() });
    } catch (e) { errors.push(file.name + ': kon niet worden gelezen.'); }
  }
  if (feedback) feedback.textContent = errors.join(' ') || 'Bijlage(n) toegevoegd.';
  renderAttachmentList();
  queueDraft();
  const stepFile = files.find(f => attachmentIsStep(f.name) && !errors.some(e => e.startsWith(f.name)));
  if (stepFile && typeof onStepAttachmentAdded === 'function') { const added = list[list.length - 1]; onStepAttachmentAdded(added); }
}
function renderAttachmentList() {
  const el = document.getElementById('attachment-list');
  if (!el) return;
  const j = ensureJob(), list = ensureJobAttachments(j);
  el.innerHTML = list.length ? list.map(a => '<div class="job-row"><span>' + esc(a.name) + '<small>' + esc(a.type) + ' · ' + fmt(a.size / 1024 / 1024, 2) + ' MB</small></span><span><button class="ghost" data-attach-download="' + esc(a.id) + '">Download</button><button class="ghost" data-attach-remove="' + esc(a.id) + '">Verwijder</button></span></div>').join('')
    : '<p class="muted">Nog geen bijlagen.</p>';
  const usage = document.getElementById('attachment-usage');
  if (usage) usage.textContent = attachmentUsageLabel(list);
  el.querySelectorAll('[data-attach-remove]').forEach(b => b.onclick = async () => {
    const id = b.dataset.attachRemove;
    j.attachments = list.filter(a => a.id !== id);
    await attachmentDeleteBytes(id);
    renderAttachmentList(); queueDraft();
  });
  el.querySelectorAll('[data-attach-download]').forEach(b => b.onclick = async () => {
    const blob = await attachmentGetBytes(b.dataset.attachDownload);
    if (!blob) return;
    const meta = list.find(a => a.id === b.dataset.attachDownload);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = meta.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
}
function attachmentPanelHtml() {
  return '<div class="job-panel"><h2>Bijlagen</h2><p class="muted">STEP, DXF, PDF of foto’s. Max 25 MB per bestand, 100 MB per klus.</p>' +
    '<label for="attachment-input" class="file-label">Bestand kiezen<input id="attachment-input" type="file" accept="' + ATTACHMENT_EXTENSIONS.join(',') + '" multiple></label>' +
    '<p id="attachment-feedback" class="photo-loading" role="status"></p><p id="attachment-usage" class="hint"></p><div id="attachment-list"></div></div>';
}
const attachmentBaseRenderSite = renderSite;
renderSite = function () {
  attachmentBaseRenderSite();
  const site = document.getElementById('panel-site');
  if (site && !document.getElementById('attachment-input')) {
    site.insertAdjacentHTML('beforeend', attachmentPanelHtml());
    document.getElementById('attachment-input').onchange = e => { addAttachments(e.target.files); e.target.value = ''; };
    renderAttachmentList();
  }
};

/* ---------- Export/import: metadata gaat mee, bytes bewust niet ---------- */

const attachmentBaseValidatePayload = validateCalculationPayload;
validateCalculationPayload = function (obj) {
  const r = attachmentBaseValidatePayload(obj);
  if (!r.ok) return r;
  const j = r.data.job;
  if (j && j.attachments !== undefined && (!Array.isArray(j.attachments) || j.attachments.some(a => typeof a.id !== 'string' || typeof a.name !== 'string' || !Number.isFinite(a.size)))) {
    return { ok: false, error: 'Ongeldige bijlage-metadata' };
  }
  return r;
};
const attachmentBaseImport = importCalculation;
importCalculation = async function (e) {
  await attachmentBaseImport(e);
  const j = costState && costState.job;
  if (j && Array.isArray(j.attachments) && j.attachments.length) {
    const status = document.querySelector('#cost-content .readout');
    if (status) status.insertAdjacentHTML('afterend', '<p class="warnbox">Deze klus had ' + j.attachments.length + ' bijlage(n). Alleen de bestandsnamen zijn geïmporteerd — de bestanden zelf moet je los overzetten (ze stonden lokaal op het andere apparaat).</p>');
  }
};
