'use strict';
// Regressiecontrole na het samenvoegen van de klussenlaag (jobs/jobs.css + jobs/jobs.js) in
// werkbank-v2.html door scripts/promote-jobs.js. Diepere DOM-/gebruikersinteractiegedrag van
// jobs.js (opname, foto's, klantweergave, concept-hervatten) vereist Playwright of jsdom, die in
// deze omgeving niet beschikbaar zijn — dat wordt hier dus niet nagebootst, alleen structureel
// en via de al-bestaande, puur-Node materiaalkern-tests gecontroleerd.
const fs = require('fs');
const assert = require('assert');
const { execFileSync } = require('child_process');
const html = fs.readFileSync('werkbank-v2.html', 'utf8');

assert(html.includes("CUSTOMER_KEY='werkbank.v2.customers'"), 'klantenopslag hoort onder werkbank.v2. te vallen');
assert(html.includes("DRAFT_KEY='werkbank.v2.draft'"), 'conceptopslag hoort onder werkbank.v2. te vallen');
assert(!html.includes('werkbank.jobs.v1.'), 'geen geïsoleerde previewsleutel mag achterblijven in de samengevoegde productiepagina');
assert(html.includes('function customerView('), 'klantweergave-functie ontbreekt na samenvoegen');
assert(html.includes('function ensureJob('), 'klus-datamodelfunctie ontbreekt na samenvoegen');
assert((html.match(/<script>/g) || []).length === 1, 'de klussenlaag hoort in hetzelfde enkele script-blok te zitten, niet een los script-tag');

// De bestaande, puur-Node materiaalkerntests moeten onveranderd slagen tegen dezelfde
// werkbank-v2.html nu de klussenlaag erin geplakt is — bewijst dat de samenvoeging de
// rekenkern/catalogus/aankoopplanning niet heeft aangeraakt.
for (const name of ['production-material-calculator.test.js', 'production-material-wizard.test.js']) {
  execFileSync(process.execPath, ['tests/' + name], { stdio: 'inherit' });
}

console.log('samenvoeging klussenlaag: opslagprefix, structuur en materiaalkern-regressie geslaagd');
