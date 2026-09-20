// Node script, zelfde patroon als de andere promote-*.js scripts. Moet ná jobs/cloud/invoicing/
// ui-polish/intake/quotes/step/cro draaien (leunt op savedProjects(), customers(), JOB_FASES/
// setJobFase, hidePages/routeHash) en vóór paywall (die wrapt renderCostTotals/customerView, dus
// de volgorde daarvan onderling maakt niet uit zolang crm vóór paywall komt, anders wrapt paywall
// een functie die crm nog gaat vervangen). Zie crm/README.md voor het volledige contract.
const fs = require('fs');

const target = 'werkbank-v2.html';
let page = fs.readFileSync(target, 'utf8');
const css = fs.readFileSync('crm/crm.css', 'utf8');
const js = fs.readFileSync('crm/crm.js', 'utf8');

if (page.includes('const CRM_ACTIONS_KEY')) {
  throw new Error('werkbank-v2.html bevat al de CRM-laag; niet nogmaals plakken.');
}

page = page.replace('</style>', css + '\n</style>');
const lastClose = page.lastIndexOf('</script>');
if (lastClose === -1) throw new Error('geen </script> gevonden in ' + target);
page = page.slice(0, lastClose) + js + '\n' + page.slice(lastClose);

fs.writeFileSync(target, page);
console.log('CRM-laag pakket 1 (acties, Vandaag-scherm, opvolging) samengevoegd in ' + target + '.');
