'use strict';
// Test de pure frictiemeting-aggregaties (cro/cro.js): mediaan time-to-price, intake->offerte-
// en offerte->opdracht-conversiepercentages. Geen DOM nodig.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync('cro/cro.js', 'utf8');
const pureSource = src.slice(src.indexOf('const METRICS_KEY'), src.indexOf('/* ---------- Onboarding'));
const context = { console, Math, Number, Object, Array, String, Date, Set, JSON };
vm.createContext(context);
vm.runInContext(pureSource + '\nthis.api = { metricMedian, metricTimeToPriceMs, metricSessionJobMap, metricIntakeToQuotePct, metricQuoteToOpdrachtPct, metricsSummary, formatMetricDuration };', context);
const { api } = context;

// Mediaan: even/oneven aantal, leeg -> null.
assert.equal(api.metricMedian([]), null);
assert.equal(api.metricMedian([5]), 5);
assert.equal(api.metricMedian([1, 3, 2]), 2);
assert.equal(api.metricMedian([1, 2, 3, 4]), 2.5);

// Time-to-price: paart intake_start met first_price_shown per sessie, negeert ongepaarde/andere events.
{
  const events = [
    { event: 'intake_start', sessionId: 'a', at: '2026-09-20T10:00:00.000Z' },
    { event: 'first_price_shown', sessionId: 'a', at: '2026-09-20T10:00:30.000Z' }, // 30s
    { event: 'intake_start', sessionId: 'b', at: '2026-09-20T11:00:00.000Z' },
    { event: 'first_price_shown', sessionId: 'b', at: '2026-09-20T11:01:00.000Z' }, // 60s
    { event: 'intake_start', sessionId: 'c', at: '2026-09-20T12:00:00.000Z' } // nooit een prijs getoond, telt niet mee
  ];
  assert.equal(api.metricTimeToPriceMs(events), 45000, 'mediaan van 30s en 60s = 45s');
}
assert.equal(api.metricTimeToPriceMs([]), null);

// sessionId -> jobId-brug via template_chosen.
{
  const events = [{ event: 'template_chosen', sessionId: 's1', jobId: 'j1' }, { event: 'template_chosen', sessionId: 's2', jobId: 'j2' }];
  assert.deepEqual(api.metricSessionJobMap(events), { s1: 'j1', s2: 'j2' });
}

// Intake -> offerte: percentage funnel-sessies waarvan de resulterende klus later een verzonden offerte kreeg.
{
  const events = [
    { event: 'intake_start', sessionId: 's1' }, { event: 'template_chosen', sessionId: 's1', jobId: 'j1' }, { event: 'quote_sent', jobId: 'j1' },
    { event: 'intake_start', sessionId: 's2' }, { event: 'template_chosen', sessionId: 's2', jobId: 'j2' }, // geen offerte verstuurd
    { event: 'intake_start', sessionId: 's3' } // nooit afgerond (geen template_chosen), telt wel mee als startpunt, niet als conversie
  ];
  assert.equal(api.metricIntakeToQuotePct(events), Math.round((1 / 3) * 1000) / 10, '1 van de 3 intake-sessies leidde tot een verzonden offerte');
}
assert.equal(api.metricIntakeToQuotePct([]), null);

// Offerte -> opdracht: percentage verzonden offertes (per klus) die later status "opdracht" kregen.
{
  const events = [
    { event: 'quote_sent', jobId: 'j1' }, { event: 'status_changed', jobId: 'j1', fase: 'opdracht' },
    { event: 'quote_sent', jobId: 'j2' }, { event: 'status_changed', jobId: 'j2', fase: 'afgewezen' },
    { event: 'quote_sent', jobId: 'j3' } // nog geen statuswijziging
  ];
  assert.equal(api.metricQuoteToOpdrachtPct(events), Math.round((1 / 3) * 1000) / 10);
}
assert.equal(api.metricQuoteToOpdrachtPct([]), null);

// Duurweergave: seconden onder de minuut, anders afgeronde minuten.
assert.equal(api.formatMetricDuration(null), '—');
assert.equal(api.formatMetricDuration(45000), '45s');
assert.equal(api.formatMetricDuration(125000), '2 min');

console.log('frictiemeting: mediaan time-to-price en conversiepercentages kloppen');
