/* Fase 4 — CRO-afwerking: onboarding-checklist, frictiemeting (lokaal, geen externe analytics),
   opvolg-herinneringen, en een paar ontbrekende lege staten. Geen wijziging aan de rekenkern. */

/* ---------- Frictiemeting: lokaal event-log + pure aggregaties ---------- */

const METRICS_KEY = 'werkbank.v2.metrics';
function logMetric(event, extra) {
  const list = safeGet(METRICS_KEY, []);
  list.push(Object.assign({ event, at: new Date().toISOString() }, extra || {}));
  rawSafeSet(METRICS_KEY, list.slice(-500));
}
function metricMedian(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
// time-to-price is zelfstandig per funnel-sessie (intake_start -> first_price_shown), heeft geen
// koppeling met een uiteindelijke klus-id nodig.
function metricTimeToPriceMs(events) {
  const starts = {}, durations = [];
  for (const e of events) {
    if (e.event === 'intake_start') starts[e.sessionId] = e.at;
    else if (e.event === 'first_price_shown' && starts[e.sessionId]) { durations.push(new Date(e.at) - new Date(starts[e.sessionId])); delete starts[e.sessionId]; }
  }
  return metricMedian(durations);
}
// sessionId -> jobId-brug: alleen "template_chosen" (gelogd bij intakeFinish) kent beide.
function metricSessionJobMap(events) {
  const map = {};
  for (const e of events) if (e.event === 'template_chosen' && e.sessionId && e.jobId) map[e.sessionId] = e.jobId;
  return map;
}
function metricIntakeToQuotePct(events) {
  const sessionJobs = metricSessionJobMap(events);
  const fromSessions = events.filter(e => e.event === 'intake_start').map(e => e.sessionId);
  if (!fromSessions.length) return null;
  const quotedJobIds = new Set(events.filter(e => e.event === 'quote_sent').map(e => e.jobId));
  const converted = fromSessions.filter(sid => quotedJobIds.has(sessionJobs[sid])).length;
  return Math.round((converted / fromSessions.length) * 1000) / 10;
}
function metricQuoteToOpdrachtPct(events) {
  const quoteJobIds = [...new Set(events.filter(e => e.event === 'quote_sent').map(e => e.jobId))];
  if (!quoteJobIds.length) return null;
  const opdrachtJobIds = new Set(events.filter(e => e.event === 'status_changed' && e.fase === 'opdracht').map(e => e.jobId));
  const converted = quoteJobIds.filter(id => opdrachtJobIds.has(id)).length;
  return Math.round((converted / quoteJobIds.length) * 1000) / 10;
}
function metricsSummary(events) {
  return { medianTimeToPriceMs: metricTimeToPriceMs(events), intakeToQuotePct: metricIntakeToQuotePct(events), quoteToOpdrachtPct: metricQuoteToOpdrachtPct(events) };
}
function formatMetricDuration(ms) {
  if (ms == null) return '—';
  const s = Math.round(ms / 1000);
  return s < 60 ? s + 's' : Math.round(s / 60) + ' min';
}

/* ---------- Onboarding-checklist ---------- */

function onboardingSteps() {
  const rates = typeof intakeRates === 'function' ? intakeRates() : {};
  const ratesConfigured = safeGet(INTAKE_RATES_KEY, null) !== null;
  const profile = safeGet(COMPANY_PROFILE_KEY, {});
  const companyDone = !!(profile && profile.bedrijfsnaam);
  const hasProjects = savedProjects().length > 0;
  return [
    { id: 'rates', label: 'Tarieven instellen (2 min)', done: ratesConfigured, href: '#instellingen' },
    { id: 'company', label: 'Bedrijfsgegevens invullen', done: companyDone, href: '#instellingen' },
    { id: 'first-price', label: 'Eerste snelprijs maken', done: hasProjects, href: '#kostprijs' }
  ];
}
function renderOnboarding() {
  const el = document.getElementById('onboarding-checklist');
  if (!el) return;
  const steps = onboardingSteps();
  if (steps.every(s => s.done)) { el.hidden = true; return; }
  el.hidden = false;
  const doneCount = steps.filter(s => s.done).length;
  el.innerHTML = '<div class="card"><div class="kpi-head"><span class="kpi-label">Aan de slag</span><span class="intake-price-sub">' + doneCount + ' / ' + steps.length + '</span></div>' +
    '<div class="intake-progress-bar"><span style="width:' + Math.round(doneCount / steps.length * 100) + '%"></span></div>' +
    '<div class="onboarding-steps">' + steps.map(s => '<a class="onboarding-step" href="' + s.href + '" data-onboarding-done="' + s.done + '">' + (s.done ? '✓ ' : '') + esc(s.label) + '</a>').join('') + '</div></div>';
}

/* ---------- Opvolg-herinnering (WhatsApp, vooringevulde tekst) ---------- */

function quoteFollowUpWhatsappLink(job, quote) {
  const text = typeof quoteFollowUpText === 'function' ? quoteFollowUpText(quote) : 'Even opvolgen over je offerte.';
  return typeof quoteWhatsappLink === 'function' ? quoteWhatsappLink(job.phone, text) : null;
}

/* ---------- Wiring ---------- */

let croSessionId = null;
const croBaseOpenIntake = openIntakeFunnel;
openIntakeFunnel = function () { croSessionId = uid(); logMetric('intake_start', { sessionId: croSessionId }); croBaseOpenIntake(); };
const croBaseRenderPricePanel = intakeRenderPricePanel;
let croFirstPriceLogged = false;
intakeRenderPricePanel = function () { croBaseRenderPricePanel(); if (!croFirstPriceLogged && croSessionId) { logMetric('first_price_shown', { sessionId: croSessionId }); croFirstPriceLogged = true; } };
// jobId bestaat hier nog niet: savedProjectId wordt pas gezet bij een echte "Klus bewaren"-klik
// (saveCalculation), niet bij intakeFinish (dat opent alleen de normale klus-tabs). De sessie
// wacht daarom op de eerste bewaaractie i.p.v. meteen te loggen met jobId:null — anders zou de
// intake->offerte-conversie nooit een echte klus-id kunnen koppelen voor wie eerst nog wijzigt
// vóór bewaren (de normale route).
let croPendingSession = null, croPendingTemplateId = null;
const croBaseIntakeFinish = intakeFinish;
intakeFinish = function (action) {
  croBaseIntakeFinish(action);
  croPendingSession = croSessionId; croPendingTemplateId = intakeState && intakeState.templateId;
  croSessionId = null; croFirstPriceLogged = false;
};
const croBaseSaveCalculation = saveCalculation;
saveCalculation = function () {
  croBaseSaveCalculation();
  if (croPendingSession && savedProjectId) {
    logMetric('template_chosen', { sessionId: croPendingSession, jobId: savedProjectId, templateId: croPendingTemplateId });
    croPendingSession = null; croPendingTemplateId = null;
  }
};
if (typeof markQuoteSent === 'function') {
  const croBaseMarkSent = markQuoteSent;
  markQuoteSent = function (quote, channel, now) { croBaseMarkSent(quote, channel, now); logMetric('quote_sent', { jobId: quote.jobId }); };
}
const croBaseSetJobFase = setJobFase;
setJobFase = function (job, fase, now, reason) {
  const next = croBaseSetJobFase(job, fase, now, reason);
  if (next !== job) logMetric('status_changed', { jobId: job.id || savedProjectId || null, fase });
  return next;
};
const croBaseDashboard = renderDashboard;
renderDashboard = function () { croBaseDashboard(); renderOnboarding(); };

// Instellingenoverzicht: mediaan time-to-price, conversiepercentages.
function addMetricsSettingsCard() {
  const settings = document.getElementById('design-settings');
  if (!settings || document.getElementById('metrics-summary')) return;
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<h2>Funnel-inzicht</h2><p class="muted">Lokaal bijgehouden, geen externe analytics.</p><div id="metrics-summary" class="material-totals"></div>';
  settings.appendChild(card);
  const summary = metricsSummary(safeGet(METRICS_KEY, []));
  document.getElementById('metrics-summary').innerHTML =
    '<div class="metric"><b>' + formatMetricDuration(summary.medianTimeToPriceMs) + '</b>Mediaan time-to-price</div>' +
    '<div class="metric"><b>' + (summary.intakeToQuotePct == null ? '—' : summary.intakeToQuotePct + '%') + '</b>Intake → offerte</div>' +
    '<div class="metric"><b>' + (summary.quoteToOpdrachtPct == null ? '—' : summary.quoteToOpdrachtPct + '%') + '</b>Offerte → opdracht</div>';
}
addMetricsSettingsCard();

/* ---------- PWA: file_handlers (STEP openen vanaf OS) + share_target (gedeeld bestand ophalen) ----------
   ONGEVERIFIEERD (zie step/README.md-stijl toelichting): beide vereisen een geïnstalleerde PWA en
   een echte OS-actie ("openen met"/"delen naar") die in deze sessie niet te simuleren was. */

if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async launchParams => {
    if (!launchParams.files || !launchParams.files.length) return;
    for (const handle of launchParams.files) {
      const file = await handle.getFile();
      showToast('Geopend vanuit het besturingssysteem: ' + file.name + '. Open of maak een klus en voeg het toe bij Bijlagen.');
    }
  });
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
async function consumePendingShare() {
  if (location.hash !== '#gedeeld' || !('caches' in window)) return;
  try {
    const cache = await caches.open('werkbank-share-target-v1');
    const fileResponse = await cache.match('/pending-share-file');
    if (!fileResponse) return;
    const blob = await fileResponse.blob();
    const name = fileResponse.headers.get('x-share-name') || 'gedeeld-bestand';
    await cache.delete('/pending-share-file');
    await cache.delete('/pending-share-meta');
    showToast('Bestand "' + name + '" ontvangen via delen. Open of maak een klus en voeg het toe bij Bijlagen.');
    window.__pendingShareBlob = { blob, name };
  } catch (e) { /* geen wachtende share, niets te doen */ }
}
consumePendingShare();

// Lege staat voor de klantenlijst ontbrak nog (4.2: één zin + één actie, geen illustratie).
const croBaseRenderCustomers = renderCustomers;
renderCustomers = function () {
  croBaseRenderCustomers();
  if (!customers().length) {
    const intro = customerPage.querySelector('.job-intro');
    if (intro && !customerPage.querySelector('.recent-empty')) intro.insertAdjacentHTML('afterend', '<p class="recent-empty">Nog geen klanten. Voeg je eerste klant hieronder toe.</p>');
  }
};

// Opvolg-herinnering: WhatsApp-link met vooringevulde tekst naast "Opvolgen" bij een offerte
// zonder reactie na 5 dagen (4.4).
const croBaseQuoteRowHtml = typeof quotePipelineRowHtml === 'function' ? quotePipelineRowHtml : null;
if (croBaseQuoteRowHtml) {
  quotePipelineRowHtml = function (row, status) {
    let html = croBaseQuoteRowHtml(row, status);
    const job = row.data.job || {};
    if (status === 'offerte_verzonden' && isQuoteStale(job.quoteSentAt, new Date())) {
      const quotes = quotesForJob(row.id);
      const quote = quotes[0];
      const link = quote ? quoteFollowUpWhatsappLink(job, quote) : null;
      if (link) html = html.replace('</button>', '</button><a class="ghost" target="_blank" rel="noopener" href="' + link + '">WhatsApp-herinnering</a>');
    }
    return html;
  };
}
