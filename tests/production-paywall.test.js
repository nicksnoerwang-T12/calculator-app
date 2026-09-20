'use strict';
// Test de pure delen van de paywall-laag (prijs-tease) tegen de echte, samengevoegde
// werkbank-v2.html: maskEuroAmounts (bedragen verbergen) en isSubscribed/subscriptionState
// (wie mag de prijs wél zien). Geen DOM nodig voor deze twee — de render-wraps zelf zijn
// handmatig geverifieerd in de browser (zie de sessienotities), zoals ook voor de andere
// render-zware modules in dit project.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync('werkbank-v2.html', 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const src = script.slice(script.indexOf('const PRICE_MONTHLY'), script.indexOf('function priceLockCardHtml'));
assert.ok(src.includes('function maskEuroAmounts'), 'maskEuroAmounts staat in de paywall-laag');
assert.ok(src.includes('function isSubscribed'), 'isSubscribed staat in de paywall-laag');

function run(settings, session) {
  let storageData = Object.assign({}, settings);
  const context = {
    console, Math, Number, Object, Array, String, JSON,
    safeGet: (key, fallback) => (key in storageData ? storageData[key] : fallback),
    cloudSession: session,
    SUBSCRIPTION_CACHE_KEY: 'werkbank.v2.subscriptionCache',
  };
  vm.createContext(context);
  vm.runInContext(src + '\nthis.api = { maskEuroAmounts, subscriptionState, isSubscribed };', context);
  return context.api;
}

/* ---------- maskEuroAmounts ---------- */
{
  const api = run({}, null);
  assert.equal(api.maskEuroAmounts('geen bedrag hier'), 'geen bedrag hier', 'tekst zonder euroteken blijft ongewijzigd');
  const masked = api.maskEuroAmounts('<strong>€ 1.234,56</strong>');
  assert.ok(!masked.includes('1.234,56'), 'het bedrag zelf verdwijnt uit de HTML');
  assert.ok(masked.includes('price-masked'), 'het bedrag wordt vervangen door een price-masked-span');
  assert.ok(masked.includes('<strong>') && masked.includes('</strong>'), 'de omliggende opmaak blijft intact');
  // Meerdere bedragen in dezelfde string worden allemaal gemaskeerd (bv. een hele cost-breakdown).
  const multi = api.maskEuroAmounts('<span>€100,00</span><span>€ 50,25</span>');
  assert.equal((multi.match(/price-masked/g) || []).length, 2, 'elk bedrag afzonderlijk gemaskeerd');
}

/* ---------- isSubscribed ---------- */
{
  // Geen sessie (gast) -> nooit "abonnee", ongeacht wat er lokaal in de cache staat (die cache
  // kan een gebruiker zelf niet vertrouwd vullen zonder ingelogd te zijn).
  assert.equal(run({ 'werkbank.v2.subscriptionCache': { status: 'active' } }, null).isSubscribed(), false);

  // Ingelogd maar geen abonnementsregel opgehaald (fallback-default) -> niet bevoorrecht.
  assert.equal(run({}, { user: { id: 'u1' } }).isSubscribed(), false);

  // Ingelogd + status 'none'/'past_due'/'canceled' -> geen toegang.
  for (const status of ['none', 'past_due', 'canceled', 'pending']) {
    assert.equal(run({ 'werkbank.v2.subscriptionCache': { status } }, { user: { id: 'u1' } }).isSubscribed(), false, status + ' geeft geen toegang');
  }

  // Ingelogd + 'active' of 'trialing' -> wel toegang.
  for (const status of ['active', 'trialing']) {
    assert.equal(run({ 'werkbank.v2.subscriptionCache': { status } }, { user: { id: 'u1' } }).isSubscribed(), true, status + ' geeft toegang');
  }
}

/* ---------- prijzen ---------- */
{
  const api = run({}, null);
  // 1 maand gratis t.o.v. maandelijks betalen: jaarprijs = 11 × maandprijs, niet 12×.
  assert.ok(src.includes('PRICE_MONTHLY = 5'));
  assert.ok(src.includes('PRICE_YEARLY = 55'));
}

console.log('paywall: prijs-tease maskeert bedragen correct, alleen een ingelogde abonnee met status active/trialing ziet de prijs');
