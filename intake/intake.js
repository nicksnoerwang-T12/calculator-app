/* Snelprijs-funnel: nieuw instappunt vóór renderCostPage(). Bouwt geen eigen rekenkern —
   levert alleen materiaal-/werkregels aan calculateMaterialList()/calculateSale() (ongewijzigd)
   en zet na stap 4 een normale costState/costState.job op zodat de bestaande tabs (Opname/
   Materiaal/Werk/Prijs) gewoon doorwerken. Zie intake/README.md voor het volledige contract. */

/* ---------- Pure helpers (los van DOM, apart core-getest) ---------- */

const INTAKE_LEVELS = { indicatie: 0, opname: 1, offerte: 2 };
function intakeBandFor(level, rates) {
  return { indicatie: (rates.bandIndicatie ?? 15) / 100, opname: (rates.bandOpname ?? 7) / 100, offerte: 0 }[level] ?? 0.15;
}
// Automatisch niveau uit de klusdata; kan handmatig omhoog maar nooit stilzwijgend omlaag.
function intakeAutoLevel(job, materialsComplete) {
  const hasOpname = (job.measurements && job.measurements.length > 0) || (job.photos && job.photos.length > 0);
  if (materialsComplete) return 'offerte';
  if (hasOpname) return 'opname';
  return 'indicatie';
}
function intakeResolveLevel(autoLevel, manualLevel) {
  if (manualLevel && INTAKE_LEVELS[manualLevel] > INTAKE_LEVELS[autoLevel]) return manualLevel;
  return autoLevel;
}
function intakePriceBand(saleCents, level, rates) {
  const b = intakeBandFor(level, rates);
  const amount = saleCents / 100;
  return { low: amount * (1 - b), high: amount * (1 + b), single: b === 0, b };
}
function intakeBandCopy(projectName, band, level, euroFn, fmtFn) {
  const prijs = band.single
    ? euroFn(band.low)
    : euroFn(band.low) + ' – ' + euroFn(band.high);
  const voorbehoud = level === 'offerte' ? '' : ' Onder voorbehoud van opname.';
  return 'Indicatie voor ' + (projectName || 'je klus') + ': ' + prijs + ' excl. btw.' + voorbehoud;
}
// Materiaalregels zijn "compleet" (er is een prijs, funnel/klantweergave niet geblokkeerd)
// zodra elke regel een resultaat heeft — inclusief de algemene €/kg-vuistregel die de
// sjablonen gebruiken. Dat is bewust een lage lat: precies genoeg om snel een indicatie te
// tonen, zie intake/README.md.
function intakeMaterialsComplete(materialRows) {
  return materialRows.length > 0 && materialRows.every(r => !r.result.errors && r.result.lineCents !== null);
}
// Materiaalregels zijn "bevestigd" (offerteniveau, bandbreedte = 0) alleen als de prijs
// vastligt: een eigen ingevulde prijs, of een exacte catalogusmatch. Een regel die alleen
// via de algemene €/kg-vuistregel of een familie-schatting prijst telt hier NIET mee — dat
// is precies het verschil tussen "we kunnen een indicatie geven" en "dit bedrag staat vast".
function intakeMaterialsConfirmed(materialRows) {
  return materialRows.length > 0 && materialRows.every(r => !r.result.errors && r.result.lineCents !== null &&
    (r.line.priceOrigin === 'user' || r.result.priceSource === 'Exact catalogusartikel'));
}
function intakeWorkTotalCents(work) {
  return work.reduce((sum, w) => sum + Math.round(w.quantity * w.rate * 100), 0);
}
// Vergelijkt twee materiaaltotalen (in centen) en geeft een percentage-diff voor eigen
// producten ("materiaal +4% t.o.v. vorige keer"). null als er geen vorig totaal is.
function intakePriceDiff(previousCents, currentCents) {
  if (!Number.isFinite(previousCents) || previousCents <= 0) return null;
  return Math.round(((currentCents - previousCents) / previousCents) * 1000) / 10;
}
// Past handmatige ureninschattingen toe op de door het sjabloon berekende werkregels (matcht op
// regelnaam — binnen één sjabloon zijn die namen vast). Een regel zonder override behoudt zijn
// berekende hoeveelheid; zo blijft "harmonica met aanpasbare ureninschatting" een kwestie van
// alleen de afwijkingen bewaren, niet de hele werkregelset overschrijven.
function intakeApplyWorkOverrides(work, overrides) {
  if (!overrides) return work;
  return work.map(w => Number.isFinite(overrides[w.name]) ? Object.assign({}, w, { quantity: overrides[w.name] }) : w);
}

/* ---------- Toast (ontbrak nog als herbruikbare helper — .toast-CSS bestond al, alleen
   inline gebruikt in removeMaterial()) ---------- */
function showToast(message) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast no-print';
  t.setAttribute('role', 'status');
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

/* ---------- Instellingen (tarieven) ---------- */

const INTAKE_RATES_KEY = 'werkbank.v2.intakeRates';
const INTAKE_DRAFT_KEY = 'werkbank.v2.intake.draft';
const TEMPLATE_STORE_KEY = 'werkbank.v2.templates';
function intakeRateDefaults() { return { montageUurtarief: 55, voorrijkosten: 45, toeslagPoedercoatM2: 18, bandIndicatie: 15, bandOpname: 7 }; }
function intakeRates() { return Object.assign(intakeRateDefaults(), safeGet(INTAKE_RATES_KEY, {})); }
function addIntakeRatesSettingsCard() {
  const settings = document.getElementById('design-settings');
  if (!settings || document.getElementById('intake-rates-save')) return;
  const rates = intakeRates();
  const card = document.createElement('div');
  card.className = 'card';
  const fields = [
    ['montageUurtarief', 'Montage-uurtarief', '€/uur'],
    ['voorrijkosten', 'Voorrijkosten', '€ per rit'],
    ['toeslagPoedercoatM2', 'Poedercoat-toeslag', '€/m²'],
    ['bandIndicatie', 'Bandbreedte bij indicatie', '%'],
    ['bandOpname', 'Bandbreedte na opname', '%']
  ];
  card.innerHTML = '<h2>Snelprijs-tarieven</h2><p class="muted">Gebruikt door de sjablonen in de snelprijs-funnel. Standaardwaarde — pas aan naar je eigen tarief.</p><div class="job-grid">' +
    fields.map(([key, label, unit]) => '<div><label for="ir-' + key + '">' + esc(label) + '</label><input id="ir-' + key + '" type="text" inputmode="decimal" value="' + esc(rates[key]) + '"><span class="hint">' + esc(unit) + '</span></div>').join('') +
    '</div><button class="act" id="intake-rates-save">Tarieven bewaren</button><p id="intake-rates-status" role="status" class="job-status"></p>';
  settings.appendChild(card);
  $('intake-rates-save').onclick = () => {
    const next = {};
    for (const [key] of fields) next[key] = strictNumber($('ir-' + key).value) || 0;
    safeSet(INTAKE_RATES_KEY, next);
    $('intake-rates-status').textContent = 'Bewaard.';
  };
}

/* ---------- Runtime ctx voor sjablonen ---------- */

function intakeCtx() {
  const rates = intakeRates();
  return {
    uid, hourlyRate: COST_DEFAULTS.hourlyRate, montageRate: rates.montageUurtarief,
    voorrijkosten: rates.voorrijkosten, poedercoatM2: rates.toeslagPoedercoatM2,
    sections: SECTIONS, densities: Object.fromEntries(Object.entries(MATERIALS).map(([k, v]) => [k, v.density])),
    materialNames: Object.fromEntries(Object.entries(MATERIALS).map(([k, v]) => [k, v.name]))
  };
}
function intakeOverheadMargin() { return { overhead: COST_DEFAULTS.overhead, margin: intakeState ? intakeState.margin : COST_DEFAULTS.margin }; }

/* ---------- State ---------- */

let intakeState = null, intakeDraftTimer = null, intakeRecalcTimer = null;
function intakeDefaultState() {
  return {
    step: 1, templateId: null, ownProductId: null, params: {}, margin: COST_DEFAULTS.overhead ? COST_DEFAULTS.margin : 20,
    manualLevel: null, photos: [], measurements: [], customerName: '', customerPhone: '', customerEmail: '', workOverrides: {}
  };
}
function activeTemplate() { return TEMPLATES.find(t => t.id === intakeState.templateId) || null; }
function intakeParamsWithDefaults(tpl, saved) {
  const p = {};
  for (const spec of tpl.params) p[spec.id] = (saved && saved[spec.id] !== undefined) ? saved[spec.id] : spec.default;
  return p;
}
function intakeBuild() {
  const tpl = activeTemplate();
  if (!tpl) return { materials: [], work: [] };
  return tpl.build(intakeState.params, intakeCtx());
}
function intakePersistDraft() {
  clearTimeout(intakeDraftTimer);
  if (!intakeState) return;
  safeSet(INTAKE_DRAFT_KEY, intakeState);
}
function intakeQueueDraft() { clearTimeout(intakeDraftTimer); intakeDraftTimer = setTimeout(intakePersistDraft, 450); }

/* ---------- Overlay & rendering ---------- */

function ensureIntakeOverlay() {
  let el = document.getElementById('intake-overlay');
  if (el) return el;
  el = document.createElement('div');
  el.className = 'intake-backdrop editor-backdrop';
  el.id = 'intake-overlay';
  el.hidden = true;
  el.innerHTML = '<div class="intake-funnel" role="dialog" aria-modal="true" aria-label="Snelprijs">' +
    '<div class="intake-head"><button class="ghost" id="intake-back" aria-label="Vorige stap" hidden>← Terug</button><h2 id="intake-title">Snelprijs</h2><button class="ghost" id="intake-close">Sluiten</button></div>' +
    '<div class="intake-progress">Stap <span id="intake-step-num">1</span> van 4</div>' +
    '<div class="intake-progress-bar"><span id="intake-progress-fill" style="width:25%"></span></div>' +
    '<div class="intake-body" id="intake-body"></div>' +
    '<div class="intake-bar" id="intake-bar" aria-live="polite"></div></div>';
  document.body.appendChild(el);
  $('intake-close').onclick = closeIntakeFunnel;
  $('intake-back').onclick = intakeGoBack;
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeIntakeFunnel(); return; }
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); intakeGoStep(4); return; }
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
      e.preventDefault(); intakeAdvance();
    }
  });
  return el;
}
function openIntakeFunnel() {
  intakeState = intakeDefaultState();
  const raw = storageAdapter.read(INTAKE_DRAFT_KEY, null);
  if (raw.ok && raw.value && raw.value.templateId) intakeState = Object.assign(intakeDefaultState(), raw.value);
  ensureIntakeOverlay().hidden = false;
  document.body.classList.add('dialog-open');
  renderIntakeStep();
}
function closeIntakeFunnel() {
  const el = document.getElementById('intake-overlay');
  if (el) el.hidden = true;
  document.body.classList.remove('dialog-open');
}
function intakeGoStep(n) { intakeState.step = n; renderIntakeStep(); intakeQueueDraft(); }
function intakeAdvance() {
  const desktop = window.matchMedia('(min-width:1024px)').matches;
  if (intakeState.step === 1) return; // stap 1 gaat verder via kaartkeuze, niet Enter
  if (intakeState.step === 2) return intakeGoStep(desktop ? 4 : 3);
  if (intakeState.step === 3) return intakeGoStep(4);
}
// Terug-navigatie (bugfix: vóór deze functie zat je vast zodra je een sjabloon had gekozen).
// Stap 4 -> 3 en (op mobiel) stap 3 -> 2 zijn veilig: alle ingevoerde maten blijven gewoon staan.
// Terug tot vóór stap 2 (sjabloonkeuze opnieuw) wist wél de ingevulde maten van dit sjabloon,
// dus daar eerst een bevestiging voor - vandaar niet zomaar altijd terug zonder waarschuwing.
function intakeGoBack() {
  if (intakeState.step <= 1) return;
  const desktop = window.matchMedia('(min-width:1024px)').matches;
  if (intakeState.step === 4) { intakeGoStep(3); return; }
  if (!desktop && intakeState.step === 3) { intakeGoStep(2); return; }
  if (!confirm('Terug naar het overzicht? Je huidige maten en keuzes voor dit sjabloon gaan dan verloren.')) return;
  intakeState.templateId = null; intakeState.params = {}; intakeState.workOverrides = {};
  intakeGoStep(1);
}

function renderIntakeStep() {
  $('intake-step-num').textContent = String(Math.min(intakeState.step, 4));
  $('intake-progress-fill').style.width = (intakeState.step / 4 * 100) + '%';
  $('intake-back').hidden = intakeState.step <= 1;
  const body = $('intake-body');
  if (intakeState.step === 1) { body.innerHTML = intakeStep1Html(); bindIntakeStep1(); $('intake-bar').innerHTML = ''; }
  else if (intakeState.step === 2 || intakeState.step === 3) { renderIntakeStep23(body); }
  else { body.innerHTML = intakeStep4Html(); bindIntakeStep4(); $('intake-bar').innerHTML = ''; }
  const first = body.querySelector('input,button,select,textarea');
  if (first) first.focus({ preventScroll: true });
}

function intakeStep1Html() {
  const own = safeGet(TEMPLATE_STORE_KEY, []).filter(x => x && x.baseTemplateId);
  const groups = {};
  for (const t of TEMPLATES) (groups[t.group] = groups[t.group] || []).push(t);
  let html = '';
  if (own.length) {
    html += '<div class="intake-group-label">Jouw producten</div><div class="intake-cards">' +
      own.map(o => '<button class="intake-card" data-own="' + esc(o.id) + '">' + uiIcon('document') +
        '<span><b>' + esc(o.name) + '</b><small>' + esc(o.customerTag || TEMPLATES.find(t => t.id === o.baseTemplateId)?.name || '') + '</small></span></button>').join('') + '</div>';
  }
  for (const [group, list] of Object.entries(groups)) {
    if (list.every(t => t.always)) continue;
    html += '<div class="intake-group-label">' + esc(group) + '</div><div class="intake-cards">' +
      list.filter(t => !t.always).map(t => '<button class="intake-card" data-template="' + t.id + '">' + uiIcon(t.icon) +
        '<span><b>' + esc(t.name) + '</b><small>Sjabloon, ' + t.params.length + ' parameters</small></span></button>').join('') + '</div>';
  }
  const maatwerk = TEMPLATES.find(t => t.id === 'maatwerk');
  html += '<div class="intake-group-label">' + esc(maatwerk.group) + '</div><div class="intake-cards"><button class="intake-card" data-template="maatwerk">' +
    uiIcon('tools') + '<span><b>Maatwerk / reparatie</b><small>Vrije omschrijving, geschat gewicht en uren</small></span></button></div>';
  return html;
}
function bindIntakeStep1() {
  document.querySelectorAll('[data-template]').forEach(b => b.onclick = () => {
    const tpl = TEMPLATES.find(t => t.id === b.dataset.template);
    intakeState.templateId = tpl.id; intakeState.ownProductId = null;
    intakeState.params = intakeParamsWithDefaults(tpl, null); intakeState.workOverrides = {};
    intakeGoStep(2);
  });
  document.querySelectorAll('[data-own]').forEach(b => b.onclick = () => {
    const own = safeGet(TEMPLATE_STORE_KEY, []).find(x => x.id === b.dataset.own);
    const tpl = TEMPLATES.find(t => t.id === own.baseTemplateId);
    intakeState.templateId = tpl.id; intakeState.ownProductId = own.id;
    intakeState.params = intakeParamsWithDefaults(tpl, own.params); intakeState.workOverrides = Object.assign({}, own.workOverrides);
    intakeGoStep(2);
  });
}

function intakeFieldHtml(spec, value) {
  if (spec.type === 'boolean') {
    return '<div class="intake-field intake-toggle"><label for="ip-' + spec.id + '">' + esc(spec.label) + '</label><input id="ip-' + spec.id + '" type="checkbox" ' + (value ? 'checked' : '') + '></div>';
  }
  if (spec.type === 'choice') {
    return '<div class="intake-field"><label>' + esc(spec.label) + '</label><div class="intake-choice-row" data-choice="' + spec.id + '">' +
      spec.options.map(o => '<button type="button" aria-pressed="' + (o === value) + '" data-value="' + esc(o) + '">' + esc(o) + '</button>').join('') + '</div></div>';
  }
  if (spec.type === 'text') {
    return '<div class="intake-field"><label for="ip-' + spec.id + '">' + esc(spec.label) + '</label><textarea id="ip-' + spec.id + '">' + esc(value || '') + '</textarea></div>';
  }
  return '<div class="intake-field"><label for="ip-' + spec.id + '">' + esc(spec.label) + '</label><div class="intake-stepper">' +
    '<button type="button" data-step="-1" aria-label="Minder">−</button>' +
    '<input id="ip-' + spec.id + '" type="text" inputmode="decimal" class="num" value="' + esc(value) + '">' +
    (spec.unit ? '<span>' + esc(spec.unit) + '</span>' : '') +
    '<button type="button" data-step="1" aria-label="Meer">+</button></div></div>';
}
function bindIntakeField(root, spec) {
  if (spec.type === 'boolean') {
    root.querySelector('#ip-' + spec.id).onchange = e => { intakeState.params[spec.id] = e.target.checked; intakeRecalcSoon(); };
  } else if (spec.type === 'choice') {
    root.querySelectorAll('[data-choice="' + spec.id + '"] button').forEach(b => b.onclick = () => {
      intakeState.params[spec.id] = b.dataset.value;
      root.querySelectorAll('[data-choice="' + spec.id + '"] button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      intakeRecalcSoon();
    });
  } else if (spec.type === 'text') {
    root.querySelector('#ip-' + spec.id).oninput = e => { intakeState.params[spec.id] = e.target.value; intakeQueueDraft(); };
  } else {
    const input = root.querySelector('#ip-' + spec.id);
    const clampStep = delta => {
      const v = strictNumber(input.value) || 0;
      const next = Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, Math.round((v + delta * spec.step) / spec.step) * spec.step));
      input.value = String(Math.round(next * 1000) / 1000);
      intakeState.params[spec.id] = strictNumber(input.value);
      intakeRecalcSoon();
    };
    root.querySelectorAll('.intake-stepper button[data-step]').forEach(b => {
      if (b.closest('.intake-field').querySelector('input') !== input) return;
      b.onclick = () => clampStep(Number(b.dataset.step));
    });
    input.oninput = () => { intakeState.params[spec.id] = strictNumber(input.value); intakeRecalcSoon(); };
  }
}

function renderIntakeStep23(body) {
  const tpl = activeTemplate();
  const desktop = window.matchMedia('(min-width:1024px)').matches;
  const showParams = desktop || intakeState.step === 2;
  const showPrice = desktop || intakeState.step === 3;
  let html = '<div class="intake-step23">';
  if (showParams) {
    html += '<div><h3>' + esc(tpl.name) + '</h3><div id="intake-schematic"></div><div class="intake-params">' + tpl.params.map(s => intakeFieldHtml(s, intakeState.params[s.id])).join('') + '</div>' +
      '<label for="intake-photo-input" class="hint" style="display:block;margin-top:14px">Foto of schets toevoegen (optioneel)</label>' +
      '<input id="intake-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple>' +
      '<p id="intake-photo-feedback" class="photo-loading" role="status"></p><div id="intake-photos" class="job-photo-grid"></div></div>';
  }
  if (showPrice) html += '<div class="intake-step23-price" id="intake-price-panel"></div>';
  html += '</div>';
  body.innerHTML = html;
  if (showParams) {
    for (const spec of tpl.params) bindIntakeField(body, spec);
    $('intake-photo-input').onchange = intakeAddPhotos;
    intakeRenderPhotos();
    intakeRenderSchematic();
  }
  if (showPrice) intakeRenderPricePanel();
  intakeRefreshBar();
}
// Live 2D-schets (bewust géén exacte maatlijnen, zie intake/schematic.js) — herbouwt bij elke
// parameterwijziging zodat de vorm meteen meebeweegt, precies wat er gevraagd is: "gelijk
// beeldend maken met live wisselingen".
function intakeRenderSchematic() {
  const el = document.getElementById('intake-schematic');
  if (!el) return;
  const schematic = intakeSchematicFor(intakeState.templateId, intakeState.params);
  el.innerHTML = schematic ? intakeSchematicSvg(schematic, 320, 180) : '';
  el.hidden = !schematic;
}
// Herbouwt de onderste prijsbalk (bedrag + niveau + volgende-knop) vanaf de huidige state.
// Wordt na elke wijziging opnieuw aangeroepen (recalc, marge, handmatig niveau) zodat de balk
// nooit een verouderd bedrag toont terwijl het prijspaneel erboven al is bijgewerkt.
function intakeRefreshBar() {
  const desktop = window.matchMedia('(min-width:1024px)').matches;
  $('intake-bar').innerHTML = intakeBarHtml(desktop);
  bindIntakeBar(desktop);
}
function intakeRecalcSoon() {
  clearTimeout(intakeRecalcTimer);
  intakeRecalcTimer = setTimeout(() => { intakeRenderPricePanel(); intakeRefreshBar(); intakeRenderSchematic(); intakeQueueDraft(); }, 150);
}
function intakePreview() {
  const raw = intakeBuild();
  const built = Object.assign({}, raw, { work: intakeApplyWorkOverrides(raw.work, intakeState.workOverrides) });
  const list = calculateMaterialList(built.materials, 1, getPrices());
  const workCents = intakeWorkTotalCents(built.work);
  const om = intakeOverheadMargin();
  const sale = calculateSale(list.cents + workCents, om.overhead, om.margin);
  const complete = intakeMaterialsComplete(list.rows);
  const confirmed = intakeMaterialsConfirmed(list.rows);
  const auto = intakeAutoLevel({ measurements: intakeState.measurements, photos: intakeState.photos }, confirmed);
  const level = intakeResolveLevel(auto, intakeState.manualLevel);
  const rates = intakeRates();
  return { built, list, sale, complete, level, rates };
}
function intakeRenderPricePanel() {
  const panel = document.getElementById('intake-price-panel');
  if (!panel) return;
  const wasOpen = document.getElementById('intake-breakdown') ? document.getElementById('intake-breakdown').open : false;
  const { built, list, sale, level, rates } = intakePreview();
  if (sale.error) { panel.innerHTML = '<div class="intake-price-panel"><p class="err">' + esc(sale.error) + '</p></div>'; return; }
  const band = intakePriceBand(sale.saleCents, level, rates);
  const tone = { indicatie: 'neutral', opname: 'info', offerte: 'success' }[level];
  const label = { indicatie: 'Indicatie', opname: 'Na opname', offerte: 'Offerte' }[level];
  panel.innerHTML = '<div class="intake-price-panel">' +
    '<div class="intake-level-row"><span class="fase-badge" data-tone="' + tone + '"><span class="fase-dot"></span>' + label + '</span></div>' +
    '<div class="intake-price-value" id="intake-price-value">' + (band.single ? euro(band.low) : euro(band.low) + ' – ' + euro(band.high)) + '</div>' +
    '<div class="intake-price-sub">Verkoopprijs excl. btw' + (band.single ? '' : ' · bandbreedte ±' + Math.round(band.b * 100) + '%') + '</div>' +
    intakeBreakdownHtml(list, built.work, wasOpen) +
    '<div class="intake-quick-toggles">' + intakeQuickToggleHtml() + '</div>' +
    (band.single ? '' : '<button class="ghost" id="intake-level-up" type="button">Zekerheid handmatig verhogen</button>') +
    '<div class="intake-copy-zin" id="intake-copy-zin"></div>' +
    '<button class="ghost" id="intake-copy-btn" type="button">Kopieer prijszin</button>' +
    '</div>';
  const valueEl = $('intake-price-value');
  valueEl.classList.add('intake-flash');
  requestAnimationFrame(() => valueEl.classList.remove('intake-flash'));
  $('intake-copy-zin').textContent = intakeBandCopy(costState && costState.project, band, level, euro, fmt);
  $('intake-copy-btn').onclick = () => {
    const text = intakeBandCopy(intakeState.customerName ? intakeState.customerName + ' — snelprijs' : 'je klus', band, level, euro, fmt);
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
      () => showToast('Prijszin gekopieerd.'), () => showToast('Kopiëren niet gelukt; selecteer de tekst handmatig.')
    );
  };
  const up = document.getElementById('intake-level-up');
  if (up) up.onclick = () => {
    const order = ['indicatie', 'opname', 'offerte'];
    const next = order[Math.min(order.length - 1, order.indexOf(level) + 1)];
    intakeState.manualLevel = next; intakeRenderPricePanel(); intakeRefreshBar(); intakeQueueDraft();
  };
  bindIntakeQuickToggles();
  bindIntakeBreakdown();
}
// Harmonica "Prijsopbouw ter controle": materiaalregels (met maat/materiaal, precies wat er
// gekozen is) en werkregels — de ureninschatting is hier per regel aanpasbaar (invoerveld i.p.v.
// alleen-lezen tekst), de rest blijft ter controle alleen-lezen. Blijft open staan over een
// recalc heen (wasOpen) zodat bijstellen tijdens het typen niet steeds dichtklapt.
function intakeBreakdownHtml(list, work, wasOpen) {
  const materialRows = list.rows.map(row => {
    const l = row.line, r = row.result;
    const amount = r.errors || r.lineCents === null ? '—' : euro(r.lineCents / 100);
    const matName = MATERIALS[l.material] ? MATERIALS[l.material].name : '';
    const desc = (l.note ? esc(l.note) : esc(matName)) + (l.note && matName ? ' · ' + esc(matName) : '') + ' ' + esc(lineDescription(l));
    const source = l.catalogArticleId ? ' <small>(catalogusprijs)</small>' : '';
    return '<div class="line-price"><span>' + desc + source + '</span><strong>' + amount + '</strong></div>';
  });
  const workRows = work.map(w => {
    const amount = euro(w.quantity * w.rate);
    return '<div class="intake-work-row"><span>' + esc(w.name) + ' <small>(€' + fmt(w.rate) + '/' + esc(w.unit) + ')</small></span>' +
      '<input type="text" inputmode="decimal" class="num" data-work-name="' + esc(w.name) + '" value="' + esc(w.quantity) + '">' +
      '<strong>' + amount + '</strong></div>';
  });
  return '<div class="material-accordion intake-breakdown"><details id="intake-breakdown"' + (wasOpen ? ' open' : '') + '>' +
    '<summary>Prijsopbouw <span class="summary-amount">' + euro(list.cents / 100 + intakeWorkTotalCents(work) / 100) + '</span></summary>' +
    '<div class="accordion-body">' +
    '<div class="intake-breakdown-group"><h4>Materiaal</h4>' + (materialRows.join('') || '<p class="muted">Geen materiaalregels.</p>') +
    '<div class="line-price"><span><strong>Materiaal totaal</strong></span><strong>' + euro(list.cents / 100) + '</strong></div></div>' +
    '<div class="intake-breakdown-group"><h4>Werk en uren <button class="ghost" id="intake-hours-reset" type="button">Herstel schatting</button></h4>' + workRows.join('') +
    '<div class="line-price"><span><strong>Werk totaal</strong></span><strong>' + euro(intakeWorkTotalCents(work) / 100) + '</strong></div></div>' +
    '<p class="muted">Kostprijs vóór opslag en marge, ter controle — geen offerte.</p>' +
    '</div></details></div>';
}
function bindIntakeBreakdown() {
  const root = document.getElementById('intake-price-panel');
  if (!root) return;
  root.querySelectorAll('[data-work-name]').forEach(input => {
    input.onchange = () => {
      const v = strictNumber(input.value);
      intakeState.workOverrides = intakeState.workOverrides || {};
      if (Number.isFinite(v) && v >= 0) intakeState.workOverrides[input.dataset.workName] = v;
      else delete intakeState.workOverrides[input.dataset.workName];
      intakeRecalcSoon();
    };
  });
  const reset = document.getElementById('intake-hours-reset');
  if (reset) reset.onclick = () => {
    intakeState.workOverrides = {};
    intakeRenderPricePanel(); intakeRefreshBar(); intakeQueueDraft();
  };
}
function intakeQuickToggleHtml() {
  const tpl = activeTemplate();
  const quick = tpl.params.filter(s => s.id === 'finish' || s.id === 'mount');
  return quick.map(s => intakeFieldHtml(s, intakeState.params[s.id])).join('') +
    '<div class="intake-field"><label for="intake-margin">Winstmarge</label><div class="intake-stepper">' +
    '<button type="button" id="intake-margin-down">−</button><input id="intake-margin" type="text" inputmode="decimal" class="num" value="' + esc(intakeState.margin) + '"><span>%</span>' +
    '<button type="button" id="intake-margin-up">+</button></div></div>';
}
function bindIntakeQuickToggles() {
  const root = document.getElementById('intake-price-panel');
  if (!root) return;
  const tpl = activeTemplate();
  for (const s of tpl.params) if (s.id === 'finish' || s.id === 'mount') bindIntakeField(root, s);
  const marginInput = document.getElementById('intake-margin');
  if (!marginInput) return;
  const setMargin = v => { intakeState.margin = Math.max(0, Math.min(95, v)); marginInput.value = String(intakeState.margin); intakeRecalcSoon(); };
  marginInput.oninput = () => setMargin(strictNumber(marginInput.value) || 0);
  $('intake-margin-down').onclick = () => setMargin(intakeState.margin - 1);
  $('intake-margin-up').onclick = () => setMargin(intakeState.margin + 1);
}
async function intakeAddPhotos(e) {
  const files = Array.from(e.target.files);
  e.target.disabled = true;
  $('intake-photo-feedback').textContent = 'Foto’s verwerken…';
  const errors = [];
  for (const file of files) {
    if (intakeState.photos.length >= 6) { errors.push('Maximaal 6 foto’s per klus.'); break; }
    try { intakeState.photos.push(await compressJobPhoto(file)); } catch (err) { errors.push(err.message); }
  }
  intakeRenderPhotos();
  intakeQueueDraft();
  intakeRecalcSoon();
  $('intake-photo-feedback').textContent = errors.join(' ') || 'Foto’s toegevoegd.';
  e.target.value = ''; e.target.disabled = false;
}
function intakeRenderPhotos() {
  const el = document.getElementById('intake-photos');
  if (!el) return;
  el.innerHTML = intakeState.photos.map((p, i) => '<figure><img src="' + p.data + '" alt="' + esc(p.name) + '"><figcaption><button class="ghost" type="button" data-photo-remove="' + i + '">Verwijder foto ' + (i + 1) + '</button></figcaption></figure>').join('');
  el.querySelectorAll('[data-photo-remove]').forEach(b => b.onclick = () => { intakeState.photos.splice(+b.dataset.photoRemove, 1); intakeRenderPhotos(); intakeQueueDraft(); intakeRecalcSoon(); });
}
function intakeBarHtml(desktop) {
  if (desktop) return '';
  const { sale, level, rates } = intakePreview();
  if (sale.error) return '';
  const band = intakePriceBand(sale.saleCents, level, rates);
  return '<div class="intake-bar-price"><small>' + { indicatie: 'Indicatie', opname: 'Na opname', offerte: 'Offerte' }[level] + '</small>' +
    '<strong>' + (band.single ? euro(band.low) : euro(band.low) + '–' + euro(band.high)) + '</strong></div>' +
    '<button class="act" id="intake-bar-next" type="button">' + (intakeState.step === 2 ? 'Naar prijs' : 'Volgende') + '</button>';
}
function bindIntakeBar(desktop) {
  if (desktop) return;
  const btn = document.getElementById('intake-bar-next');
  if (btn) btn.onclick = intakeAdvance;
}

function intakeStep4Html() {
  return '<div class="job-panel"><h2>Klantgegevens</h2><p class="muted">Optioneel — mag leeg blijven tot de offerte.</p><div class="job-grid">' +
    '<div><label for="intake-c-name">Klant / bedrijf</label><input id="intake-c-name" value="' + esc(intakeState.customerName) + '"></div>' +
    '<div><label for="intake-c-phone">Telefoon</label><input id="intake-c-phone" type="tel" value="' + esc(intakeState.customerPhone) + '"></div>' +
    '<div class="wide"><label for="intake-c-email">E-mail</label><input id="intake-c-email" type="email" value="' + esc(intakeState.customerEmail) + '"></div></div></div>' +
    '<div class="intake-nextstep-grid">' +
    '<button class="ghost" id="intake-next-refine" type="button">Verfijn opname</button>' +
    '<button class="ghost" id="intake-next-customer" type="button">Klantweergave</button>' +
    '<button class="ghost" id="intake-next-quote" type="button">Offerte versturen</button>' +
    '<button class="ghost" id="intake-next-save-own" type="button">Bewaar als eigen product</button></div>';
}
function bindIntakeStep4() {
  $('intake-c-name').oninput = e => { intakeState.customerName = e.target.value; intakeQueueDraft(); };
  $('intake-c-phone').oninput = e => { intakeState.customerPhone = e.target.value; intakeQueueDraft(); };
  $('intake-c-email').oninput = e => { intakeState.customerEmail = e.target.value; intakeQueueDraft(); };
  $('intake-next-refine').onclick = () => intakeFinish('refine');
  $('intake-next-customer').onclick = () => intakeFinish('customer');
  $('intake-next-quote').onclick = () => intakeFinish('quote');
  $('intake-next-save-own').onclick = intakeSaveOwnProduct;
}

/* ---------- Eigen producten ---------- */

function intakeSaveOwnProduct() {
  const tpl = activeTemplate();
  if (!tpl || tpl.id === 'maatwerk') { showToast('Maatwerk kan niet als eigen product worden bewaard.'); return; }
  const list = safeGet(TEMPLATE_STORE_KEY, []);
  const { list: calc } = intakePreview();
  const id = intakeState.ownProductId || uid();
  const name = prompt('Naam voor dit eigen product', (TEMPLATES.find(t => t.id === tpl.id) || {}).name || 'Eigen product');
  if (!name) return;
  const entry = {
    id, baseTemplateId: tpl.id, name, customerTag: intakeState.customerName || '',
    params: Object.assign({}, intakeState.params), workOverrides: Object.assign({}, intakeState.workOverrides),
    lastMaterialCents: calc.cents, updatedAt: new Date().toISOString(), archived: false
  };
  safeSet(TEMPLATE_STORE_KEY, [entry, ...list.filter(x => x.id !== id)]);
  intakeState.ownProductId = id;
  showToast('Bewaard als eigen product.');
}
function intakeOwnProductDiff() {
  if (!intakeState.ownProductId) return null;
  const saved = safeGet(TEMPLATE_STORE_KEY, []).find(x => x.id === intakeState.ownProductId);
  if (!saved) return null;
  const { list } = intakePreview();
  return intakePriceDiff(saved.lastMaterialCents, list.cents);
}

/* ---------- Finalisatie: intake -> normale klus ---------- */

function intakeFinish(action) {
  const raw = intakeBuild();
  const built = Object.assign({}, raw, { work: intakeApplyWorkOverrides(raw.work, intakeState.workOverrides) });
  const tpl = activeTemplate();
  const data = Object.assign({}, COST_DEFAULTS, {
    project: tpl ? tpl.name : 'Nieuwe klus', qty: 1, materials: built.materials,
    klant: intakeState.customerName, margin: intakeState.margin
  });
  savedProjectId = null; jobTab = 'site';
  history.pushState(null, '', '#kostprijs'); hidePages(); $('cost').hidden = false;
  renderCostPage(data);
  const job = ensureJob();
  job.location = ''; job.contact = ''; job.email = intakeState.customerEmail; job.phone = intakeState.customerPhone;
  job.photos = intakeState.photos; job.measurements = intakeState.measurements;
  job.work = built.work;
  job.intake = {
    templateId: intakeState.templateId, params: intakeState.params, manualLevel: intakeState.manualLevel,
    ownProductId: intakeState.ownProductId, confidence: built.confidence
  };
  // Prijszekerheid "offerte" (alle regels bevestigd) betekent hier alleen dat er niets meer
  // ontbreekt om te kunnen versturen — de status zelf springt pas naar "Offerte verzonden"
  // zodra de gebruiker in de offerteflow (Fase 2) daadwerkelijk verstuurt.
  const previewLevel = intakePreview().level;
  costState.job = setJobFase(job, previewLevel === 'offerte' ? 'opname' : previewLevel, new Date());
  syncWork();
  closeIntakeFunnel();
  rawSafeSet(INTAKE_DRAFT_KEY, null);
  if (action === 'refine') { $('tab-site').click(); }
  else if (action === 'customer') { $('tab-overview').click(); customerView(); }
  else if (action === 'quote') {
    $('tab-overview').click();
    if (typeof openDocument === 'function') openDocument('offerte'); else customerView();
  }
}

/* ---------- Cloud-sync voor eigen producten (nieuwe tabel, zelfde patroon als customers) ---------- */

async function syncTemplates() {
  if (!cloudAdapter || !cloudSession) return;
  const list = safeGet(TEMPLATE_STORE_KEY, []);
  const rows = list.map(t => ({ id: t.id, user_id: cloudSession.user.id, base_template_id: t.baseTemplateId, name: t.name, updated_at: t.updatedAt || new Date().toISOString(), data: t }));
  setSyncStatus('syncing');
  const r = await cloudAdapter.push('templates', rows);
  if (r.ok) setSyncStatus('synced'); else { setSyncStatus('offline'); queueRetry('templates'); }
}
function mergeTemplateRows(localList, cloudRows) {
  const byId = {};
  for (const t of localList) byId[t.id] = { t, ts: t.updatedAt || '1970-01-01' };
  for (const row of cloudRows) {
    const t = row.data; if (!t || !t.id) continue;
    const existing = byId[t.id];
    if (!existing || new Date(row.updated_at) > new Date(existing.ts)) byId[t.id] = { t, ts: row.updated_at };
  }
  return Object.values(byId).map(x => x.t);
}
function mergeTemplates(rows) { const merged = mergeTemplateRows(safeGet(TEMPLATE_STORE_KEY, []), rows); rawSafeSet(TEMPLATE_STORE_KEY, merged); return merged; }
const intakeBaseSafeSet = safeSet;
safeSet = function (key, value) {
  const ok = intakeBaseSafeSet(key, value);
  if (ok && key === TEMPLATE_STORE_KEY && cloudAdapter && cloudSession) syncTemplates();
  return ok;
};
// Gedeeld register i.p.v. flushRetryQueue steeds volledig te overschrijven: elke laag die een
// nieuwe opslagsleutel toevoegt (hier: templates, straks ook quotes) registreert alleen zijn
// eigen sync-functie. Zo verliest de laag die als laatste wordt samengevoegd niet de retry-
// afhandeling van een laag die eerder werd samengevoegd (een volledige herschrijving zou dat wel
// doen — met var omdat meerdere lagen dit object in dezelfde scriptscope delen).
if (typeof retryHandlers === 'undefined') var retryHandlers = { projects: syncProjects, customers: syncCustomers, settings: syncSettings };
retryHandlers.templates = syncTemplates;
flushRetryQueue = async function () {
  if (!cloudAdapter || !cloudSession) return;
  const list = safeGet(SYNC_QUEUE_KEY, []);
  if (!list.length) return;
  rawSafeSet(SYNC_QUEUE_KEY, []);
  for (const entry of list) { const fn = retryHandlers[entry]; if (fn) await fn(); }
};
const intakeBasePullAndMerge = pullAndMerge;
pullAndMerge = async function () {
  await intakeBasePullAndMerge();
  if (!cloudAdapter || !cloudSession) return;
  setSyncStatus('syncing');
  try {
    const t = await cloudAdapter.pullAll('templates');
    if (!t.ok) throw t.error;
    mergeTemplates(t.value);
    await syncTemplates();
    setSyncStatus('synced');
  } catch (e) { setSyncStatus('offline'); }
};

/* ---------- Instap: vervangt "Nieuwe klus" -> formulier ---------- */

const intakeBaseStart = startProject;
startProject = function () { if (!allowDiscard()) return; openIntakeFunnel(); };
document.querySelectorAll('#design-new,#library-new').forEach(b => { b.onclick = startProject; });
addIntakeRatesSettingsCard();
if (!SETTINGS_KEYS.includes(INTAKE_RATES_KEY)) SETTINGS_KEYS.push(INTAKE_RATES_KEY);
