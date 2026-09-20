// Node script, zelfde patroon als de andere promote-*.js scripts. Moet als laatste draaien: wrapt
// openIntakeFunnel/intakeRenderPricePanel/intakeFinish (intake), markQuoteSent/setJobFase/
// renderDashboard/quotePipelineRowHtml (quotes+basis-app), renderCustomers (jobs).
const fs = require('fs');

const target = 'werkbank-v2.html';
let page = fs.readFileSync(target, 'utf8');
const css = fs.readFileSync('cro/cro.css', 'utf8');
const js = fs.readFileSync('cro/cro.js', 'utf8');

if (page.includes('const METRICS_KEY')) {
  throw new Error('werkbank-v2.html bevat al de CRO-laag; niet nogmaals plakken.');
}

page = page.replace('</style>', css + '\n</style>');
const lastClose = page.lastIndexOf('</script>');
if (lastClose === -1) throw new Error('geen </script> gevonden in ' + target);
page = page.slice(0, lastClose) + js + '\n' + page.slice(lastClose);

fs.writeFileSync(target, page);
console.log('CRO-laag (onboarding, frictiemeting, opvolg-herinnering) samengevoegd in ' + target + '.');
