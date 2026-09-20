// Node script, same pattern as scripts/promote-jobs.js: merges the cloud-sync layer
// (cloud/cloud.css + the Supabase CDN script + cloud/cloud.js) into werkbank-v2.html.
const fs = require('fs');

const target = 'werkbank-v2.html';
let page = fs.readFileSync(target, 'utf8');
const css = fs.readFileSync('cloud/cloud.css', 'utf8');
const js = fs.readFileSync('cloud/cloud.js', 'utf8');
const supabaseCdnTag = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';

if (page.includes('function cloudReady(')) {
  throw new Error('werkbank-v2.html bevat al de cloud-sync-laag; niet nogmaals plakken.');
}

// Volgorde is belangrijk: eerst cloud.js vóór de (nog enige) hoofd-</script> plakken, dán pas de
// CDN-scripttag toevoegen. Andersom voegt de CDN-tag een eigen </script> toe vóór de hoofdtag, en
// plakt de volgende stap cloud.js per ongeluk in die src-tag — waar de browser inline-inhoud van
// een <script src=...> element negeert, dus cloud.js zou dan stilzwijgend nooit uitgevoerd worden.
page = page.replace('</style>', css + '\n</style>');
page = page.replace('</script>', js + '\n</script>');
page = page.replace('<script>', supabaseCdnTag + '\n<script>');

fs.writeFileSync(target, page);
console.log('Cloud-sync-laag samengevoegd in ' + target + '.');
