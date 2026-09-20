// Node script, zelfde patroon als de andere promote-*.js scripts: voegt de offerteflow-laag
// (quotes/quotes.css + quotes/quotes.js) samen in werkbank-v2.html. Moet ná promote-invoicing.js
// en promote-intake.js draaien: gebruikt assignDocumentNumber/companyProfileFields (invoicing) en
// JOB_FASES/setJobFase (basis-app) en wrapt renderCostPage/renderDashboard nogmaals.
const fs = require('fs');

const target = 'werkbank-v2.html';
let page = fs.readFileSync(target, 'utf8');
const css = fs.readFileSync('quotes/quotes.css', 'utf8');
const js = fs.readFileSync('quotes/quotes.js', 'utf8');

if (page.includes('const QUOTE_STORE_KEY')) {
  throw new Error('werkbank-v2.html bevat al de offerteflow-laag; niet nogmaals plakken.');
}

page = page.replace('</style>', css + '\n</style>');
const lastClose = page.lastIndexOf('</script>');
if (lastClose === -1) throw new Error('geen </script> gevonden in ' + target);
page = page.slice(0, lastClose) + js + '\n' + page.slice(lastClose);

fs.writeFileSync(target, page);
console.log('Offerteflow-laag samengevoegd in ' + target + '.');
