// Node script, same pattern as promote-jobs.js / promote-cloud.js: merges the invoicing layer
// (invoicing/invoicing.css + invoicing/invoicing.js) into werkbank-v2.html. Must run after
// promote-jobs.js/promote-cloud.js since it wraps renderCostPage and reuses cloud storage keys.
const fs = require('fs');

const target = 'werkbank-v2.html';
let page = fs.readFileSync(target, 'utf8');
const css = fs.readFileSync('invoicing/invoicing.css', 'utf8');
const js = fs.readFileSync('invoicing/invoicing.js', 'utf8');

if (page.includes('function assignDocumentNumber(')) {
  throw new Error('werkbank-v2.html bevat al de facturatielaag; niet nogmaals plakken.');
}

// Let op: er kan al een losse <script src="..."></script>-tag (Supabase CDN, van
// promote-cloud.js) vóór de hoofd-<script> staan. Een simpele .replace('</script>',...) zou de
// EERSTE </script> raken (die lege CDN-tag) en de inhoud zou daar stilzwijgend genegeerd worden
// door de browser. Vervang daarom altijd de LAATSTE </script> in het bestand (het echte einde
// van de hoofdscript-tag).
page = page.replace('</style>', css + '\n</style>');
const lastClose = page.lastIndexOf('</script>');
if (lastClose === -1) throw new Error('geen </script> gevonden in ' + target);
page = page.slice(0, lastClose) + js + '\n' + page.slice(lastClose);

fs.writeFileSync(target, page);
console.log('Facturatielaag samengevoegd in ' + target + '.');
