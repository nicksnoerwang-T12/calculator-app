'use strict';
// Test de pure helpers van de offerteflow (quotes/quotes.js): nummerformaat, groepstoewijzing,
// telefoonnormalisatie, "nog geen reactie"-detectie en de pipeline-KPI's. Geen DOM nodig.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync('quotes/quotes.js', 'utf8');
const pureSource = src.slice(src.indexOf('function formatQuoteNumber'), src.indexOf('/* ---------- Opslag'));
// De esc-t/m-rad-slice bevat sinds Fase 2 ook JOB_FASES/JOB_FASE_LABELS (net na "const esc="
// toegevoegd), dus die hoeft niet apart geladen te worden — zelfde bron als
// tests/intake-funnel.test.js / tests/job-fase.test.js.
const escSource = (() => {
  const html = fs.readFileSync('werkbank-v2.html', 'utf8');
  const script = html.split('<script>')[1].split('</script>')[0];
  return script.slice(script.indexOf('const esc ='), script.indexOf('const rad ='));
})();

const context = { console, Math, Number, Object, Array, String, Date, JSON };
vm.createContext(context);
vm.runInContext(escSource + '\n' + pureSource +
  '\nthis.api = { formatQuoteNumber, nextQuoteVersion, groupQuoteDirectCents, allocateQuoteGroups, normalizeDutchPhone, isQuoteStale, quoteWhatsappLink, quoteMailLink, quotePipelineKpi, quoteNextAction };', context);
const { api } = context;

// Offertenummer: hergebruikt het bestaande offertenummer, voegt alleen "OFF-" en "-vN" toe.
assert.equal(api.formatQuoteNumber('2026-0012', 1), 'OFF-2026-0012');
assert.equal(api.formatQuoteNumber('2026-0012', 2), 'OFF-2026-0012-v2');
assert.equal(api.nextQuoteVersion([]), 1);
assert.equal(api.nextQuoteVersion([{ version: 1 }, { version: 2 }]), 3);

// Groepering van werkregels naar de vier zichtbare categorieën.
{
  const buckets = api.groupQuoteDirectCents(10000, [
    { category: 'Fabricage', quantity: 2, rate: 65 },
    { category: 'Montage', quantity: 1, rate: 55 },
    { category: 'Reis & vervoer', quantity: 1, rate: 45 },
    { category: 'Uitbesteding', quantity: 3, rate: 18 }
  ]);
  assert.equal(buckets.Materiaal, 10000);
  assert.equal(buckets.Werkzaamheden, 13000);
  assert.equal(buckets.Montage, 5500);
  assert.equal(buckets.Overig, 4500 + 5400);
}

// Verkoopbedrag-toewijzing: schaalt naar de marge-ratio, telt exact op tot het verkooptotaal
// (geen leverancierskostprijs zichtbaar, en geen afrondingsverschil dankzij het restant op de
// laatste groep).
{
  const direct = { Materiaal: 6143, Werkzaamheden: 45835, Montage: 0, Overig: 0 };
  const sale = 71470; // € 714,70, komt overeen met de Spijlenhekwerk-referentiewaarde uit Fase 1
  const groups = api.allocateQuoteGroups(direct, sale);
  const total = Object.values(groups).reduce((a, b) => a + b, 0);
  assert.equal(total, sale, 'groepen tellen exact op tot het verkooptotaal');
  assert.ok(groups.Materiaal > 0 && groups.Materiaal < sale);
}
{
  // Geen directe kosten (theoretisch): geen deling door nul, alles naar de laatste groep.
  const groups = api.allocateQuoteGroups({ Materiaal: 0, Werkzaamheden: 0, Montage: 0, Overig: 0 }, 5000);
  assert.equal(Object.values(groups).reduce((a, b) => a + b, 0), 5000);
}

// NL-telefoonnummer naar E.164.
assert.equal(api.normalizeDutchPhone('06 12345678'), '+31612345678');
assert.equal(api.normalizeDutchPhone('0031612345678'), '+31612345678');
assert.equal(api.normalizeDutchPhone('+31612345678'), '+31612345678');
assert.equal(api.normalizeDutchPhone(''), '');
assert.equal(api.normalizeDutchPhone('12345'), '12345', 'onherkenbaar formaat blijft ongewijzigd, geen gok');

// wa.me-link en mailto-link bouwen correct met gecodeerde tekst.
{
  const link = api.quoteWhatsappLink('06 12345678', 'Test & bericht');
  assert.ok(link.startsWith('https://wa.me/31612345678?text='));
  assert.ok(link.includes(encodeURIComponent('Test & bericht')));
  const mail = api.quoteMailLink('klant@voorbeeld.nl', 'Offerte OFF-2026-0001', 'Body tekst');
  assert.ok(mail.startsWith('mailto:klant%40voorbeeld.nl?subject='));
}

// "Nog geen reactie": pas ná 5 dagen (instelbaar), nooit zonder verzenddatum.
{
  const now = new Date('2026-09-20T10:00:00.000Z');
  assert.equal(api.isQuoteStale(null, now), false);
  assert.equal(api.isQuoteStale('2026-09-16T10:00:00.000Z', now), false, '4 dagen: nog niet');
  assert.equal(api.isQuoteStale('2026-09-15T10:00:00.000Z', now), true, '5 dagen: wel');
  assert.equal(api.isQuoteStale('2026-09-18T10:00:00.000Z', now, 2), true, 'aangepaste termijn');
}

// Next-best-action per status.
assert.deepEqual(api.quoteNextAction('indicatie'), ['Verfijn opname', 'refine']);
assert.deepEqual(api.quoteNextAction('opname'), ['Maak offerte', 'quote']);
assert.deepEqual(api.quoteNextAction('offerte_verzonden'), ['Opvolgen', 'follow-up']);
assert.deepEqual(api.quoteNextAction('geleverd'), ['Factureer', 'invoice']);
assert.equal(api.quoteNextAction('gefactureerd'), null, 'terminale status heeft geen next-best-action');

// Pipeline-KPI's: openstaande offertes (som van lastQuoteCents bij offerte_verzonden), conversie
// laatste 30 dagen (%), gemiddelde tijd offerte -> opdracht.
{
  const now = new Date('2026-09-20T10:00:00.000Z');
  const daysAgo = n => { const d = new Date(now); d.setDate(d.getDate() - n); return d.toISOString(); };
  const rows = [
    { data: { job: { fase: 'offerte_verzonden', lastQuoteCents: 50000, quoteSentAt: daysAgo(2) } } },
    { data: { job: { fase: 'offerte_verzonden', lastQuoteCents: 30000, quoteSentAt: daysAgo(10) } } },
    { data: { job: { fase: 'opdracht', lastQuoteCents: 40000, quoteSentAt: daysAgo(5), opdrachtAt: daysAgo(1) } } },
    { data: { job: { fase: 'afgewezen', lastQuoteCents: 20000, quoteSentAt: daysAgo(6) } } },
    { data: { job: { fase: 'indicatie' } } } // nog geen offerte verzonden, telt nergens in mee
  ];
  const kpi = api.quotePipelineKpi(rows, now);
  assert.equal(kpi.openCents, 80000, 'som van de twee openstaande offertes');
  assert.equal(kpi.openCount, 2);
  assert.equal(kpi.sentCount30, 4, 'alle vier met een quoteSentAt binnen 30 dagen');
  assert.equal(kpi.conversionPct, 25, '1 van de 4 verzonden offertes is geconverteerd (opdracht)');
  assert.equal(kpi.avgDays, 4, 'enige met opdrachtAt: 5 dagen geleden verzonden, 1 dag geleden opdracht = 4 dagen');
}
{
  const kpi = api.quotePipelineKpi([], new Date());
  assert.equal(kpi.openCents, 0); assert.equal(kpi.conversionPct, null); assert.equal(kpi.avgDays, null);
}

console.log('offerteflow: nummerformaat, groepstoewijzing, telefoonnormalisatie, staleness en pipeline-kpi’s geslaagd');
