// Node script, zelfde patroon als de andere promote-*.js scripts. Moet als ALLERLAATSTE draaien
// (na cro): wrapt renderCostTotals (basis-app), customerView/addCloudSettingsCard (jobs+cloud),
// intakeRenderPricePanel/intakeBarHtml (intake) om de prijs-tease toe te passen.
const fs = require('fs');

const target = 'werkbank-v2.html';
let page = fs.readFileSync(target, 'utf8');
const css = fs.readFileSync('paywall/paywall.css', 'utf8');
const js = fs.readFileSync('paywall/paywall.js', 'utf8');

if (page.includes('const PRICE_MONTHLY')) {
  throw new Error('werkbank-v2.html bevat al de paywall-laag; niet nogmaals plakken.');
}

page = page.replace('</style>', css + '\n</style>');
const lastClose = page.lastIndexOf('</script>');
if (lastClose === -1) throw new Error('geen </script> gevonden in ' + target);
page = page.slice(0, lastClose) + js + '\n' + page.slice(lastClose);

fs.writeFileSync(target, page);
console.log('Paywall-laag (gratis kijkversie, prijs-tease, abonnementspagina) samengevoegd in ' + target + '.');
