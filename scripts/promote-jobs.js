// Node-equivalent of scripts/promote-workshop.py, for environments without Python 3.
// Merges the klussen workspace (jobs/jobs.css + jobs/jobs.js) into werkbank-v2.html
// as a permanent part of production, sharing the werkbank.v2.* storage namespace
// instead of the isolated werkbank.jobs.v1.* preview namespace. jobs/jobs.js itself
// is left untouched so scripts/build-jobs.py can still regenerate the isolated
// werkbank-klussen-preview.html from a future werkbank-v2.html.
const fs = require('fs');

const target = 'werkbank-v2.html';
let page = fs.readFileSync(target, 'utf8');
const css = fs.readFileSync('jobs/jobs.css', 'utf8');
const js = fs.readFileSync('jobs/jobs.js', 'utf8')
  .replace(/werkbank\.jobs\.v1\.customers/g, 'werkbank.v2.customers')
  .replace(/werkbank\.jobs\.v1\.draft/g, 'werkbank.v2.draft');

if (page.includes('CUSTOMER_KEY=')) {
  throw new Error('werkbank-v2.html bevat al de klussenlaag; niet nogmaals plakken.');
}
if (js.includes('werkbank.jobs.v1.')) {
  throw new Error('jobs.js bevat nog een niet-herschreven werkbank.jobs.v1.-sleutel.');
}

// Vervang de LAATSTE </script> (niet de eerste): als dit script na promote-cloud.js draait,
// staat er al een losse <script src="..."></script>-tag (Supabase CDN) vóór de hoofdscript-tag,
// en zou de eerste </script> die lege tag raken — inhoud die de browser dan stilzwijgend negeert.
page = page.replace('</style>', css + '\n</style>');
const lastClose = page.lastIndexOf('</script>');
if (lastClose === -1) throw new Error('geen </script> gevonden in ' + target);
page = page.slice(0, lastClose) + js + '\n' + page.slice(lastClose);

fs.writeFileSync(target, page);
console.log('Klussenlaag samengevoegd in ' + target + ' onder de werkbank.v2.*-opslag.');
