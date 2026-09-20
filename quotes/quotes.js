/* Offerteflow: van een klus in één actie een offerte versturen, status "Offerte verzonden",
   pipeline-overzicht op het dashboard. Hergebruikt assignDocumentNumber/companyProfileFields/
   renderDocumentOverlay uit invoicing/invoicing.js (niet dupliceren) en de bestaande
   setJobFase/JOB_FASES-pipeline. Zie quotes/README.md voor het volledige contract. */

/* ---------- Pure helpers ---------- */

// OFF-JJJJ-NNNN[-vN]: hergebruikt het bestaande offertenummer uit assignDocumentNumber (geen
// eigen tellersysteem), voegt alleen de weergavevorm en versienotatie uit 2.1 toe.
function formatQuoteNumber(offerteNummer, version) {
  return 'OFF-' + offerteNummer + (version > 1 ? '-v' + version : '');
}
function nextQuoteVersion(existingQuotesForJob) {
  return (existingQuotesForJob || []).reduce((max, q) => Math.max(max, q.version || 1), 0) + 1;
}
// Verdeelt de directe kosten (materiaal + werk per categorie) in de vier zichtbare groepen.
function groupQuoteDirectCents(materialCents, workRows) {
  const buckets = { Materiaal: materialCents, Werkzaamheden: 0, Montage: 0, Overig: 0 };
  const catMap = { Fabricage: 'Werkzaamheden', Montage: 'Montage', 'Reis & vervoer': 'Overig', Uitbesteding: 'Overig', Overig: 'Overig' };
  for (const w of workRows || []) {
    const cents = Math.round(w.quantity * w.rate * 100);
    buckets[catMap[w.category] || 'Overig'] += cents;
  }
  return buckets;
}
// Schaalt de directe-kosten-groepen naar verkoopbedrag-groepen met dezelfde marge/opslagratio
// als het totaal — nooit de kostprijs zelf tonen. De laatste groep krijgt het restant, zodat de
// groepen altijd exact optellen tot het echte verkooptotaal (geen afrondingsverschil).
function allocateQuoteGroups(directBuckets, saleCents) {
  const directTotal = Object.values(directBuckets).reduce((a, b) => a + b, 0);
  const ratio = directTotal > 0 ? saleCents / directTotal : 0;
  const keys = Object.keys(directBuckets);
  const out = {};
  let allocated = 0;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) { out[k] = saleCents - allocated; }
    else { const v = Math.round(directBuckets[k] * ratio); out[k] = v; allocated += v; }
  });
  return out;
}
// NL-telefoonnummer naar E.164 voor wa.me-links. Onherkenbare vorm blijft ongewijzigd terug
// (nooit gokken naar een ander land).
function normalizeDutchPhone(raw) {
  const s = String(raw || '').replace(/[\s()-]/g, '');
  if (!s) return '';
  if (s.startsWith('+')) return s;
  if (s.startsWith('00')) return '+' + s.slice(2);
  if (s.startsWith('0')) return '+31' + s.slice(1);
  return s;
}
function isQuoteStale(sentAt, now, days) {
  days = days || 5;
  if (!sentAt) return false;
  return (now.getTime() - new Date(sentAt).getTime()) / 86400000 >= days;
}
function quoteWhatsappLink(phone, text) {
  const number = normalizeDutchPhone(phone).replace('+', '');
  return 'https://wa.me/' + number + '?text=' + encodeURIComponent(text);
}
function quoteMailLink(email, subject, body) {
  return 'mailto:' + encodeURIComponent(email || '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
}
function quoteWhatsappText(projectName, band, level, euroFn) {
  const bedrag = band.single ? euroFn(band.low / 100) : euroFn(band.low / 100) + ' - ' + euroFn(band.high / 100);
  return 'Offerte ' + (projectName || 'je klus') + ': ' + bedrag + ' excl. btw' + (band.geldigTot ? ', geldig tot ' + band.geldigTot : '') + '. Zie bijlage.';
}
// Dashboard-KPI's uit 2.3: openstaande offertes (€), conversie laatste 30 dagen (%), gemiddelde
// tijd offerte -> opdracht. Werkt op de opgeslagen projecten (rows), leest de gedenormaliseerde
// job-velden lastQuoteCents/quoteSentAt/opdrachtAt (gezet door markQuoteSent/markOpdracht).
function quotePipelineKpi(rows, now) {
  now = now || new Date();
  const fase = r => JOB_FASE_LABELS[r.data && r.data.job && r.data.job.fase] ? r.data.job.fase : 'indicatie';
  const job = r => (r.data && r.data.job) || {};
  const openRows = rows.filter(r => fase(r) === 'offerte_verzonden');
  const openCents = openRows.reduce((s, r) => s + (job(r).lastQuoteCents || 0), 0);
  const cutoff30 = new Date(now); cutoff30.setDate(cutoff30.getDate() - 30);
  const sentLast30 = rows.filter(r => job(r).quoteSentAt && new Date(job(r).quoteSentAt) >= cutoff30);
  const converted30 = sentLast30.filter(r => !['offerte_verzonden', 'afgewezen', 'vervallen'].includes(fase(r)));
  const conversionPct = sentLast30.length ? Math.round((converted30.length / sentLast30.length) * 1000) / 10 : null;
  const durations = rows.filter(r => job(r).quoteSentAt && job(r).opdrachtAt).map(r => (new Date(job(r).opdrachtAt) - new Date(job(r).quoteSentAt)) / 86400000);
  const avgDays = durations.length ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : null;
  return { openCents, openCount: openRows.length, conversionPct, avgDays, sentCount30: sentLast30.length };
}
// Next-best-action per status (2.3): welke ene knop hoort bij deze fase.
const QUOTE_NEXT_ACTION = {
  indicatie: ['Verfijn opname', 'refine'], opname: ['Maak offerte', 'quote'],
  offerte_verzonden: ['Opvolgen', 'follow-up'], opdracht: ['Werkplaatskaart', 'workfloor'],
  in_werkplaats: ['Werkplaatskaart', 'workfloor'], montage: ['Werkplaatskaart', 'workfloor'],
  geleverd: ['Factureer', 'invoice']
};
function quoteNextAction(fase) { return QUOTE_NEXT_ACTION[fase] || null; }

/* ---------- Opslag + cloud-sync (zelfde adapter/wachtrij-patroon als projects/customers) ---------- */

const QUOTE_STORE_KEY = 'werkbank.v2.quotes';
function quotesForJob(jobId) { return safeGet(QUOTE_STORE_KEY, []).filter(q => q.jobId === jobId); }
function saveQuote(quote) {
  const list = safeGet(QUOTE_STORE_KEY, []);
  safeSet(QUOTE_STORE_KEY, [quote, ...list.filter(q => q.id !== quote.id)]);
}
async function syncQuotes() {
  if (!cloudAdapter || !cloudSession) return;
  const list = safeGet(QUOTE_STORE_KEY, []);
  const rows = list.map(q => ({ id: q.id, user_id: cloudSession.user.id, project_id: q.jobId || null, number: q.number, version: q.version, updated_at: q.sentAt || q.createdAt, data: q }));
  setSyncStatus('syncing');
  const r = await cloudAdapter.push('quotes', rows);
  if (r.ok) setSyncStatus('synced'); else { setSyncStatus('offline'); queueRetry('quotes'); }
}
function mergeQuoteRows(localList, cloudRows) {
  const byId = {};
  for (const q of localList) byId[q.id] = { q, ts: q.sentAt || q.createdAt };
  for (const row of cloudRows) {
    const q = row.data; if (!q || !q.id) continue;
    const existing = byId[q.id];
    if (!existing || new Date(row.updated_at) > new Date(existing.ts)) byId[q.id] = { q, ts: row.updated_at };
  }
  return Object.values(byId).map(x => x.q);
}
function mergeQuotes(rows) { const merged = mergeQuoteRows(safeGet(QUOTE_STORE_KEY, []), rows); rawSafeSet(QUOTE_STORE_KEY, merged); return merged; }
// safeSet/flushRetryQueue/pullAndMerge zijn generiek per-sleutel gebouwd maar herkennen 'quotes'
// nog niet (bestonden vóór deze fase) — hier uitgebreid i.p.v. cloud.js's al geteste code te
// wijzigen. flushRetryQueue moet volledig herschreven worden (niet alleen aanvullen): de
// basisversie leegt de wachtrij onvoorwaardelijk vóórdat hij per entry beslist, dus een
// 'quotes'-item zou anders stilzwijgend verdwijnen zonder ooit gesynchroniseerd te worden.
const quoteBaseSafeSet = safeSet;
safeSet = function (key, value) {
  const ok = quoteBaseSafeSet(key, value);
  if (ok && key === QUOTE_STORE_KEY && cloudAdapter && cloudSession) syncQuotes();
  return ok;
};
// Zelfde gedeelde register als intake.js (var, bewust geen const: beide lagen delen dit object
// in dezelfde scriptscope — zie de toelichting daar).
if (typeof retryHandlers === 'undefined') var retryHandlers = { projects: syncProjects, customers: syncCustomers, settings: syncSettings };
retryHandlers.quotes = syncQuotes;
flushRetryQueue = async function () {
  if (!cloudAdapter || !cloudSession) return;
  const list = safeGet(SYNC_QUEUE_KEY, []);
  if (!list.length) return;
  rawSafeSet(SYNC_QUEUE_KEY, []);
  for (const entry of list) { const fn = retryHandlers[entry]; if (fn) await fn(); }
};
const quoteBasePullAndMerge = pullAndMerge;
pullAndMerge = async function () {
  await quoteBasePullAndMerge();
  if (!cloudAdapter || !cloudSession) return;
  setSyncStatus('syncing');
  try {
    const q = await cloudAdapter.pullAll('quotes');
    if (!q.ok) throw q.error;
    mergeQuotes(q.value);
    await syncQuotes();
    setSyncStatus('synced');
  } catch (e) { setSyncStatus('offline'); }
};

/* ---------- Offerte bouwen (snapshot) ---------- */

function buildQuoteSnapshot(now) {
  readCostInput(); renderCostTotals();
  const v = saleView();
  if (!v.complete) return null;
  const job = ensureJob();
  const profile = safeGet(COMPANY_PROFILE_KEY, {});
  const { job: job2, profile: profile2 } = assignDocumentNumber(job, 'offerte', profile, now);
  if (profile2 !== profile) safeSet(COMPANY_PROFILE_KEY, profile2);
  costState.job = job2;
  const prices = getPrices();
  const list = calculateMaterialList(costState.materials, positiveInt(costState.qty) || 1, prices);
  const direct = groupQuoteDirectCents(list.cents, job2.work || []);
  const saleCents = Math.round(strictNumber(v.ex.replace(/[^\d,.-]/g, '').replace(',', '.')) * 100) || 0;
  const groups = allocateQuoteGroups(direct, saleCents);
  const version = nextQuoteVersion(quotesForJob(job2.id || savedProjectId || 'draft'));
  const days = strictNumber(profile2.geldigheidsduurDagen) || 30;
  const validUntil = new Date(now); validUntil.setDate(validUntil.getDate() + days);
  const level = costState.job.intake ? costState.job.intake.confidence : (v.complete ? 'offerte' : 'indicatie');
  const quote = {
    id: uid(), jobId: job2.id || savedProjectId || 'draft', version,
    number: formatQuoteNumber(job2.offerteNummer, version), createdAt: now.toISOString(),
    level, company: profile2, customer: { name: costState.klant || '', phone: job2.phone || '', email: job2.email || '' },
    project: costState.project || 'Je klus', description: costState.omschrijving || '', location: job2.location || '',
    photos: (job2.photos || []).slice(0, 2), groups, totals: { saleExCents: saleCents },
    validUntil: validUntil.toISOString().slice(0, 10), terms: profile2.voorwaarden || '', sentAt: null, sentChannel: null
  };
  saveQuote(quote);
  return quote;
}

/* ---------- Verzenden: Web Share -> WhatsApp -> mailto, met status/timestamp ---------- */

function markQuoteSent(quote, channel, now) {
  quote.sentAt = (now || new Date()).toISOString(); quote.sentChannel = channel;
  saveQuote(quote);
  const job = ensureJob();
  job.lastQuoteCents = quote.totals.saleExCents; job.quoteSentAt = quote.sentAt;
  costState.job = setJobFase(job, 'offerte_verzonden', now || new Date());
  saveCalculation();
}
async function sendQuote(quote, pdfBlob) {
  const file = pdfBlob ? new File([pdfBlob], quote.number + '.pdf', { type: 'application/pdf' }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: quote.number, text: quote.project }); markQuoteSent(quote, 'share'); return 'share'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  return 'manual';
}
function quoteFollowUpText(quote) {
  return 'Even opvolgen: heb je nog vragen over offerte ' + quote.number + ' voor ' + quote.project + '?';
}

/* ---------- Documentweergave (uitgebreide klantweergave, print-only PDF) ---------- */

function renderQuoteDocument(quote) {
  const overlay = document.createElement('section');
  overlay.className = 'job-customer-view quote-view';
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Offerte ' + quote.number);
  const companyLines = [quote.company.bedrijfsnaam, [quote.company.straat, [quote.company.postcode, quote.company.plaats].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    quote.company.kvkNummer ? 'KvK ' + quote.company.kvkNummer : '', quote.company.btwNummer ? 'Btw ' + quote.company.btwNummer : ''].filter(Boolean);
  const groupRows = Object.entries(quote.groups).filter(([, c]) => c !== 0).map(([label, cents]) => '<div><span>' + esc(label) + '</span><strong>' + euro(cents / 100) + '</strong></div>').join('');
  const photos = quote.photos.map(p => '<img src="' + p.data + '" alt="' + esc(p.name) + '">').join('');
  overlay.innerHTML = '<div class="doc-letterhead">' + (companyLines.length ? companyLines.map(l => '<p>' + esc(l) + '</p>').join('') : '<p class="job-error">Vul je bedrijfsgegevens in bij Instellingen.</p>') + '</div>' +
    '<p class="doc-type">OFFERTE &middot; ' + esc(quote.number) + ' &middot; ' + esc(quote.createdAt.slice(0, 10)) + '</p>' +
    '<h1>' + esc(quote.project) + '</h1><p>' + esc(quote.customer.name) + '</p><p>' + esc(quote.location) + '</p>' +
    '<p class="customer-copy">' + esc(quote.description) + '</p>' +
    (photos ? '<div class="quote-photos">' + photos + '</div>' : '') +
    '<div class="quote-groups">' + groupRows + '</div>' +
    '<div class="customer-price">' + euro(quote.totals.saleExCents / 100) + '</div><p>Exclusief btw</p>' +
    '<p>Geldig tot ' + esc(quote.validUntil) + '.' + (quote.terms ? ' ' + esc(quote.terms) : '') + '</p>' +
    '<div class="customer-actions"><button class="ghost" id="quote-close">Terug naar klus</button><button class="act" id="quote-print">Print / bewaar PDF</button></div>';
  document.body.append(overlay);
  const wrap = document.querySelector('.wrap'); wrap.inert = true; document.body.classList.add('customer-print');
  const close = () => { wrap.inert = false; document.body.classList.remove('customer-print'); overlay.remove(); };
  $('quote-close').onclick = close; $('quote-print').onclick = () => window.print();
  overlay.onkeydown = e => { if (e.key === 'Escape') close(); };
  $('quote-close').focus();
  return overlay;
}

async function openQuoteFlow() {
  const quote = buildQuoteSnapshot(new Date());
  if (!quote) return;
  renderQuoteDocument(quote);
  const result = await sendQuote(quote, null);
  if (result === 'manual') renderQuoteSendChoices(quote);
}
function renderQuoteSendChoices(quote) {
  const panel = document.createElement('div');
  panel.className = 'job-panel quote-send-choices';
  const phone = normalizeDutchPhone(quote.customer.phone);
  const waText = quoteWhatsappText(quote.project, { single: true, low: quote.totals.saleExCents, geldigTot: quote.validUntil }, quote.level, euro);
  panel.innerHTML = '<h2>Offerte versturen</h2><p class="muted">Bewaar eerst de PDF (Print / bewaar PDF hierboven), voeg hem daarna bij in WhatsApp of e-mail.</p>' +
    '<div class="actions">' +
    (phone ? '<a class="ghost" target="_blank" rel="noopener" href="' + quoteWhatsappLink(phone, waText) + '">WhatsApp openen</a>' : '<span class="hint">Geen telefoonnummer bekend voor WhatsApp.</span>') +
    (quote.customer.email ? '<a class="ghost" href="' + quoteMailLink(quote.customer.email, 'Offerte ' + quote.number, waText) + '">E-mail openen</a>' : '<span class="hint">Geen e-mailadres bekend.</span>') +
    '<button class="act" id="quote-mark-sent">Ik heb hem verstuurd</button></div>';
  document.body.append(panel);
  $('quote-mark-sent').onclick = () => { markQuoteSent(quote, phone ? 'whatsapp' : 'email'); panel.remove(); showToast('Offerte gemarkeerd als verzonden.'); renderDashboard(); };
}

/* ---------- Dashboard: pipeline-overzicht + KPI's + next-best-action ---------- */

function renderQuotePipeline() {
  const el = document.getElementById('quote-pipeline');
  if (!el) return;
  const rows = savedProjects();
  if (!rows.length) { el.hidden = true; return; }
  el.hidden = false;
  const kpi = quotePipelineKpi(rows);
  const fase = r => JOB_FASE_LABELS[r.data && r.data.job && r.data.job.fase] ? r.data.job.fase : 'indicatie';
  const byStatus = {};
  for (const [key] of JOB_FASES) byStatus[key] = rows.filter(r => fase(r) === key);
  el.innerHTML = '<div class="quote-kpi-row">' +
    '<div class="card quote-kpi"><span class="kpi-label">Openstaande offertes</span><span class="kpi-number">' + euro(kpi.openCents / 100) + '</span><span class="intake-price-sub">' + kpi.openCount + ' stuks</span></div>' +
    '<div class="card quote-kpi"><span class="kpi-label">Conversie laatste 30 dagen</span><span class="kpi-number">' + (kpi.conversionPct === null ? '—' : kpi.conversionPct + '%') + '</span><span class="intake-price-sub">' + kpi.sentCount30 + ' verzonden</span></div>' +
    '<div class="card quote-kpi"><span class="kpi-label">Gem. tijd offerte → opdracht</span><span class="kpi-number">' + (kpi.avgDays === null ? '—' : kpi.avgDays + 'd') + '</span></div></div>' +
    '<div class="quote-pipeline-cols">' + JOB_FASES.map(([key, label]) => {
      const list = byStatus[key];
      if (!list.length) return '';
      const total = list.reduce((s, r) => s + (r.data && r.data.job && r.data.job.lastQuoteCents || 0), 0);
      return '<div class="quote-pipeline-col" data-status="' + key + '"><h3>' + faseBadgeHtml(key) + '<span>' + list.length + (total ? ' · ' + euro(total / 100) : '') + '</span></h3>' +
        list.slice(0, 5).map(r => quotePipelineRowHtml(r, key)).join('') + '</div>';
    }).join('') + '</div>';
  el.querySelectorAll('[data-open-project]').forEach(b => b.onclick = () => openSavedProject(rows.find(x => x.id === b.dataset.openProject)));
  el.querySelectorAll('[data-next-action]').forEach(b => b.onclick = () => {
    openSavedProject(rows.find(x => x.id === b.dataset.nextAction));
    const action = b.dataset.actionType;
    if (action === 'quote') openQuoteFlow();
    else if (action === 'refine') { $('tab-site').click(); }
    else if (action === 'invoice') { $('tab-overview').click(); if (typeof openDocument === 'function') openDocument('factuur'); }
    else { $('tab-overview').click(); }
  });
}
function quotePipelineRowHtml(row, status) {
  const job = row.data.job || {};
  const stale = status === 'offerte_verzonden' && isQuoteStale(job.quoteSentAt, new Date());
  const action = quoteNextAction(status);
  return '<button class="recent-row" data-open-project="' + esc(row.id) + '">' + uiIcon('document') +
    '<span><b>' + esc(row.data.project || 'Naamloze klus') + '</b>' + (stale ? '<small class="quote-stale">Nog geen reactie</small>' : '') + '</span></button>' +
    (action ? '<button class="ghost" data-next-action="' + esc(row.id) + '" data-action-type="' + action[1] + '">' + esc(action[0]) + '</button>' : '');
}

/* ---------- Wiring: bestaande "Offerte maken"-knop, dashboard, opdracht-tijdstip, reden ---------- */

// "Offerte maken" (invoicing.js) opent nu de rijkere offerteflow i.p.v. de simpele printoverlay.
const quoteBaseCost = renderCostPage;
renderCostPage = function (values, message) {
  quoteBaseCost(values, message);
  const btn = document.getElementById('make-offerte');
  if (btn) btn.onclick = openQuoteFlow;
};
// Dashboard toont het pipeline-overzicht naast de bestaande "Lopende staalprojecten"-kaart.
const quoteBaseDashboard = renderDashboard;
renderDashboard = function () { quoteBaseDashboard(); renderQuotePipeline(); };
// opdrachtAt vastleggen (voor de "gemiddelde tijd offerte -> opdracht"-KPI) en een reden vragen
// bij Afgewezen/Vervallen — gecentraliseerd hier i.p.v. in de fase-dropdown zelf, zodat het ook
// werkt wanneer de status via de pipeline-kolommen wordt gewijzigd.
const quoteBaseSetJobFase = setJobFase;
setJobFase = function (job, fase, now, reason) {
  if ((fase === 'afgewezen' || fase === 'vervallen') && reason === undefined && job.fase !== fase) {
    reason = prompt('Reden voor ' + (JOB_FASE_LABELS[fase] || fase) + '?') || '';
  }
  const next = quoteBaseSetJobFase(job, fase, now, reason);
  if (next !== job && fase === 'opdracht' && !job.opdrachtAt) return Object.assign({}, next, { opdrachtAt: (now || new Date()).toISOString() });
  return next;
};
