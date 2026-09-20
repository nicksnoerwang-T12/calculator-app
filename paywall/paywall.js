/* Freemium-laag ("prijs-tease"): laadt als allerlaatste, ná jobs/cloud/invoicing/ui-polish/
   intake/quotes/step/cro, en wrapt bestaande render-functies — zelfde patroon als de rest van de
   app (const old = fn; fn = function(){ old(); ...aanvulling... }).

   Het idee: iedereen kan zonder account de volledige rekenflow doorlopen — materiaal en maat
   kiezen, de harmonica met prijsopbouw bekijken, uren bijstellen — behalve het uiteindelijke
   bedrag zelf, dat blijft achter een log-in/abonnement-muur. Dat is bewust: de bezoeker heeft dan
   al alle moeite gedaan (vergelijkbaar met het Zeigarnik-effect: een net-niet-afgemaakte taak
   trekt sterk), waardoor de drempel om op het allerlaatste moment in te loggen laag is.

   €5/maand, of €55/jaar (1 maand gratis t.o.v. 12×5). Betalen loopt via Mollie — de daadwerkelijke
   koppeling (Supabase Edge Functions, zie supabase/functions/) moet nog door de eigenaar zelf
   gedeployed worden met een eigen Mollie-account; zie paywall/README.md voor de precieze status
   en stappen. Zolang die koppeling niet live staat, toont de "Start abonnement"-knop een eerlijke
   melding in plaats van een kapotte of nagemaakte betaling. */

const PRICE_MONTHLY = 5, PRICE_YEARLY = 55; // 1 maand gratis t.o.v. 12 × €5

// SUBSCRIPTION_CACHE_KEY komt uit cloud.js (pullSubscription() vult 'm na het inloggen).
function subscriptionState() { return safeGet(SUBSCRIPTION_CACHE_KEY, { status: 'none' }); }
function isSubscribed() { return !!cloudSession && ['active', 'trialing'].includes((subscriptionState() || {}).status); }

// Vervangt elk zichtbaar euroteken-met-bedrag door een neutraal "•••" — bewust een simpele
// tekstvervanging i.p.v. elk renderpunt apart te herschrijven, zodat een nieuw prijsveld dat later
// ergens wordt toegevoegd automatisch meegemaskeerd wordt. euro() zet een non-breaking space
// tussen € en het bedrag; via .innerHTML komt die terug als de tekstuele entiteit "&nbsp;" (geen
// los teken meer), dus die moet expliciet in de scheiding tussen € en de cijfers zitten.
function maskEuroAmounts(html) { return html.replace(/€(?:\s|&nbsp;|&#160;)*[\d.,]+/g, '<span class="price-masked" aria-label="verborgen bedrag">•••</span>'); }

function priceLockCardHtml(copy) {
  const cta = cloudSession
    ? '<button class="act" type="button" data-price-lock-cta>Abonneren voor €' + PRICE_MONTHLY + '/maand</button>'
    : '<button class="act" type="button" data-price-lock-cta>Inloggen of account aanmaken</button>';
  return '<div class="price-lock"><div class="price-lock-icon" aria-hidden="true">🔒</div>' +
    '<p><b>' + (copy || 'Log in om de prijs te zien') + '</b></p>' +
    '<p class="muted">Je hebt de hele berekening al gemaakt — alleen het bedrag is voor abonnees. €' + PRICE_MONTHLY + '/maand, of €' + PRICE_YEARLY + '/jaar (1 maand gratis).</p>' +
    cta + '</div>';
}
function bindPriceLockButtons(root) {
  root.querySelectorAll('[data-price-lock-cta]').forEach(btn => btn.onclick = () => {
    if (cloudSession) openPricingPage(); else { showWrap(false); renderAuthGate('signin'); }
  });
}

/* ---------- Hoofdkostprijscalculator ---------- */
const paywallBaseCostTotals = renderCostTotals;
renderCostTotals = function () {
  paywallBaseCostTotals();
  if (isSubscribed()) return;
  const result = document.getElementById('cost-result');
  if (!result || result.querySelector('.err')) return;
  result.innerHTML = maskEuroAmounts(result.innerHTML) + priceLockCardHtml();
  bindPriceLockButtons(result);
};

/* ---------- "Toon prijs aan klant" mag geen bedrag lekken zonder abonnement ---------- */
const paywallBaseCustomerView = typeof customerView === 'function' ? customerView : null;
if (paywallBaseCustomerView) {
  customerView = function () {
    if (!isSubscribed()) { openPaywallPrompt('Log in en abonneer om de prijs met je klant te delen.'); return; }
    paywallBaseCustomerView();
  };
}

/* ---------- Snelprijs-funnel: prijspaneel + mobiele prijsbalk ---------- */
if (typeof intakeRenderPricePanel === 'function') {
  const paywallBaseIntakePanel = intakeRenderPricePanel;
  intakeRenderPricePanel = function () {
    paywallBaseIntakePanel();
    if (isSubscribed()) return;
    const panel = document.getElementById('intake-price-panel');
    if (!panel || panel.querySelector('.err')) return;
    const valueEl = document.getElementById('intake-price-value');
    if (valueEl) valueEl.innerHTML = maskEuroAmounts(valueEl.innerHTML);
    const breakdown = panel.querySelector('.intake-breakdown');
    if (breakdown) breakdown.innerHTML = maskEuroAmounts(breakdown.innerHTML);
    const copyZin = document.getElementById('intake-copy-zin');
    if (copyZin) copyZin.textContent = 'Log in en abonneer om de prijszin te zien en te kopiëren.';
    const copyBtn = document.getElementById('intake-copy-btn');
    if (copyBtn) {
      copyBtn.textContent = cloudSession ? 'Abonneren voor €' + PRICE_MONTHLY + '/maand' : 'Inloggen of account aanmaken';
      copyBtn.classList.add('act'); copyBtn.classList.remove('ghost');
      copyBtn.onclick = () => { if (cloudSession) openPricingPage(); else { showWrap(false); renderAuthGate('signin'); } };
    }
    const up = document.getElementById('intake-level-up');
    if (up) up.remove(); // "zekerheid verhogen" heeft geen zin zolang het bedrag toch verborgen is
  };
}
if (typeof intakeBarHtml === 'function') {
  const paywallBaseBarHtml = intakeBarHtml;
  intakeBarHtml = function (desktop) {
    const html = paywallBaseBarHtml(desktop);
    return (!html || isSubscribed()) ? html : maskEuroAmounts(html);
  };
}

/* ---------- Abonnementsstatus in Instellingen ---------- */
function paywallStatusLabel() {
  const s = subscriptionState() || {};
  if (!cloudSession) return 'Niet ingelogd';
  return { active: 'Actief abonnement', trialing: 'Proefperiode', past_due: 'Betaling mislukt — controleer je betaalmethode', canceled: 'Opgezegd', none: 'Geen abonnement' }[s.status] || 'Geen abonnement';
}
// Kan meerdere keren aangeroepen worden (bij elke addCloudSettingsCard()-aanroep, o.a. na een
// geslaagde login) — ververst dan alleen de statustekst i.p.v. een dubbele kaart toe te voegen.
// Nodig omdat bootCloud() al vóór een sessie bekend is een eerste (gast-)kaart kan neerzetten en
// pas daarna, ná de async login-afhandeling, de echte status weet.
function addPaywallSettingsCard() {
  const settings = document.getElementById('design-settings');
  if (!settings) return;
  let card = document.getElementById('paywall-status');
  if (!card) {
    const wrapper = document.createElement('div');
    wrapper.className = 'card';
    wrapper.innerHTML = '<h2>Abonnement</h2><p id="paywall-status" class="muted"></p><button class="act" id="paywall-open">Bekijk abonnement</button>';
    settings.appendChild(wrapper);
    wrapper.querySelector('#paywall-open').onclick = () => { if (cloudSession) openPricingPage(); else { showWrap(false); renderAuthGate('signin'); } };
    card = wrapper.querySelector('#paywall-status');
  }
  card.textContent = paywallStatusLabel();
}
const paywallBaseCloudCard = addCloudSettingsCard;
addCloudSettingsCard = function () { paywallBaseCloudCard(); addPaywallSettingsCard(); };
// bootCloud() roept addCloudSettingsCard() al synchroon aan vóórdat deze laag (die als laatste
// laadt) de kans heeft gehad om 'm te wrappen — dus die allereerste aanroep mist de paywall-kaart.
// addPaywallSettingsCard() is idempotent (stopt vroeg als de kaart al bestaat), dus hier
// gewoon nog één keer expliciet aanroepen om dat startmoment alsnog te dekken.
addPaywallSettingsCard();

/* ---------- Paywall-prompt (voor acties die een echt bedrag nodig hebben, bv. klantweergave) ---------- */
function openPaywallPrompt(message) {
  const overlay = document.createElement('div');
  overlay.className = 'editor-backdrop no-print';
  overlay.innerHTML = '<section class="material-editor" role="dialog" aria-modal="true" aria-labelledby="paywall-prompt-title" style="max-width:420px">' +
    '<div class="editor-head"><h2 id="paywall-prompt-title">Bijna zover</h2><button class="ghost" id="paywall-prompt-close" aria-label="Sluiten">×</button></div>' +
    priceLockCardHtml(message) + '</section>';
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#paywall-prompt-close').onclick = close;
  overlay.onkeydown = e => { if (e.key === 'Escape') close(); };
  bindPriceLockButtons(overlay);
  queueMicrotask(() => overlay.querySelector('[data-price-lock-cta]')?.focus());
}

/* ---------- Prijspagina ---------- */
function pricingPlanHtml(selected) {
  return '<div class="pricing-toggle" role="radiogroup" aria-label="Abonnementsvorm">' +
    '<button type="button" role="radio" aria-checked="' + (selected === 'monthly') + '" data-plan="monthly" class="' + (selected === 'monthly' ? 'active' : '') + '">€' + PRICE_MONTHLY + ' / maand</button>' +
    '<button type="button" role="radio" aria-checked="' + (selected === 'yearly') + '" data-plan="yearly" class="' + (selected === 'yearly' ? 'active' : '') + '">€' + PRICE_YEARLY + ' / jaar <small>1 maand gratis</small></button>' +
    '</div>';
}
async function startCheckout(plan) {
  const btn = document.getElementById('pricing-start');
  const status = document.getElementById('pricing-status');
  if (btn) btn.disabled = true;
  if (status) status.textContent = 'Bezig met openen van de betaalpagina…';
  try {
    if (!cloudAdapter) throw new Error('geen-cloud');
    const { data, error } = await supabaseClient.functions.invoke('mollie-checkout', { body: { plan } });
    if (error || !data || !data.checkoutUrl) throw new Error('geen-checkout-url');
    location.href = data.checkoutUrl;
  } catch (e) {
    if (status) status.textContent = 'Online betalen via iDEAL/creditcard is nog niet gekoppeld — we werken hier hard aan. Mail ons even, dan zetten we je handmatig aan als abonnee.';
  } finally {
    if (btn) btn.disabled = false;
  }
}
// Terugkeer vanaf Mollie: het echte statusbericht komt via de webhook (meestal binnen enkele
// seconden). Hier alleen de URL opschonen — geen polling-mechanisme, dat is voor dit stadium
// (nog geen live Mollie-koppeling) meer machinerie dan nodig. De abonnementskaart in
// Instellingen toont de bijgewerkte status zodra pullAndMerge() opnieuw draait (bv. na een
// paginaherlaad).
if (new URLSearchParams(location.search).get('checkout') === 'done') {
  history.replaceState(null, '', location.pathname + location.hash);
}

function openPricingPage() {
  let plan = 'yearly';
  const overlay = document.createElement('div');
  overlay.className = 'editor-backdrop no-print';
  overlay.id = 'pricing-overlay';
  const render = () => {
    overlay.innerHTML = '<section class="material-editor pricing-page" role="dialog" aria-modal="true" aria-labelledby="pricing-title" style="max-width:480px">' +
      '<div class="editor-head"><h2 id="pricing-title">Werkbank-abonnement</h2><button class="ghost" id="pricing-close" aria-label="Sluiten">×</button></div>' +
      '<p class="muted">' + paywallStatusLabel() + '</p>' +
      pricingPlanHtml(plan) +
      '<p class="pricing-price">' + (plan === 'yearly' ? '€' + PRICE_YEARLY + ' per jaar — dat is 1 maand gratis t.o.v. maandelijks' : '€' + PRICE_MONTHLY + ' per maand, elke maand opzegbaar') + '</p>' +
      '<ul class="pricing-features"><li>Volledige prijzen in kostprijscalculator en snelprijs-funnel</li><li>Offertes versturen en klantweergave</li><li>Synchronisatie tussen al je apparaten</li></ul>' +
      '<button class="act" id="pricing-start" type="button">Start abonnement</button>' +
      '<p id="pricing-status" class="muted" role="status"></p>' +
      '</section>';
    overlay.querySelector('#pricing-close').onclick = () => overlay.remove();
    overlay.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => { plan = b.dataset.plan; render(); });
    overlay.querySelector('#pricing-start').onclick = () => startCheckout(plan);
  };
  render();
  overlay.onkeydown = e => { if (e.key === 'Escape') overlay.remove(); };
  document.body.appendChild(overlay);
  queueMicrotask(() => overlay.querySelector('#pricing-close')?.focus());
}
