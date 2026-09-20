'use strict';
// Test de pure documentnummer-logica uit invoicing/invoicing.js in isolatie (geen DOM/netwerk
// nodig). De overlay-opmaak en de echte printlay-out zijn, net als customerView(), afhankelijk
// van een browser en worden hier niet nagebootst — handmatig gecontroleerd in de browser-pane,
// zelfde bekende beperking als bij de vorige stappen.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync('invoicing/invoicing.js', 'utf8');
const fnSource = src.slice(src.indexOf('function assignDocumentNumber'), src.indexOf('function companyProfileFields'));

const context = { console };
vm.createContext(context);
vm.runInContext(fnSource + '\nthis.api = { assignDocumentNumber };', context);
const { api } = context;

const now = new Date('2026-09-19T10:00:00.000Z');

// Eerste keer: kent een nummer + datum + geldig-tot/vervaldatum toe, en hoogt de teller in het profiel op.
{
  const job = {};
  const profile = {};
  const { job: job2, profile: profile2 } = api.assignDocumentNumber(job, 'offerte', profile, now);
  assert.equal(job2.offerteNummer, '2026-0001');
  assert.equal(job2.offerteDatum, '2026-09-19');
  assert.equal(job2.offerteGeldigTot, '2026-10-19', 'standaard geldigheidsduur is 30 dagen');
  assert.equal(profile2.nextOfferteNummer, 2, 'teller in het profiel wordt opgehoogd');
  assert.equal(job.offerteNummer, undefined, 'origineel job-object blijft onveranderd (puur)');
  assert.equal(profile.nextOfferteNummer, undefined, 'origineel profile-object blijft onveranderd (puur)');
}

// Idempotent: een tweede keer aanroepen op een job die al een nummer heeft, verandert niets.
{
  const profile = { nextOfferteNummer: 5 };
  const jobWithNumber = { offerteNummer: '2026-0003', offerteDatum: '2026-01-01', offerteGeldigTot: '2026-01-31' };
  const { job: job2, profile: profile2 } = api.assignDocumentNumber(jobWithNumber, 'offerte', profile, now);
  assert.equal(job2, jobWithNumber, 'bestaand offertenummer wordt nooit overschreven');
  assert.equal(profile2, profile, 'teller wordt niet nogmaals opgehoogd als er al een nummer is');
}

// Factuur gebruikt een eigen teller/velden, los van offerte, met de betaaltermijn i.p.v. geldigheidsduur.
{
  const job = { offerteNummer: '2026-0001' }; // heeft al een offerte, nog geen factuur
  const profile = { nextOfferteNummer: 2, nextFactuurNummer: 1, betaaltermijnDagen: 14 };
  const { job: job2, profile: profile2 } = api.assignDocumentNumber(job, 'factuur', profile, now);
  assert.equal(job2.factuurNummer, '2026-0001', 'factuurteller begint apart van de offerteteller');
  assert.equal(job2.offerteNummer, '2026-0001', 'bestaand offertenummer blijft behouden naast het nieuwe factuurnummer');
  assert.equal(job2.factuurVervaldatum, '2026-10-03', '14 dagen betaaltermijn');
  assert.equal(profile2.nextFactuurNummer, 2);
  assert.equal(profile2.nextOfferteNummer, 2, 'offerteteller blijft ongemoeid bij het maken van een factuur');
}

// Ontbrekende eigen instellingen vallen terug op de ingebouwde standaardtermijnen (14 / 30 dagen), niet op een fout.
{
  const { job: job2 } = api.assignDocumentNumber({}, 'factuur', {}, now);
  assert.equal(job2.factuurVervaldatum, '2026-10-03');
  const { job: job3 } = api.assignDocumentNumber({}, 'offerte', {}, now);
  assert.equal(job3.offerteGeldigTot, '2026-10-19');
}

console.log('facturatie: documentnummering (offerte/factuur, idempotentie, termijnen) geslaagd');
