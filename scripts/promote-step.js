// Node script, zelfde patroon als de andere promote-*.js scripts, met één verschil: step-worker.js
// wordt NIET meegeplakt (een Web Worker heeft een eigen bestand nodig, kan niet in het
// hoofdscript geconcateneerd worden) en blijft als los bestand naast werkbank-v2.html staan.
// Voegt ook een <script type="importmap"> toe aan <head> — nodig omdat viewer.js's OrbitControls-
// afhankelijkheid intern de kale specifier "three" importeert (zie step/viewer.js voor de
// uitleg en de in de Browser-pane gereproduceerde fout zonder deze importmap).
const fs = require('fs');

const target = 'werkbank-v2.html';
let page = fs.readFileSync(target, 'utf8');
const css = fs.readFileSync('step/step.css', 'utf8');
const parts = ['step/mesh-geometry.js', 'step/classify.js', 'step/dxf.js', 'step/viewer.js', 'step/attachments.js', 'step/step.js']
  .map(f => fs.readFileSync(f, 'utf8')).join('\n');

if (page.includes('const ATTACHMENT_MAX_FILE_BYTES')) {
  throw new Error('werkbank-v2.html bevat al de STEP/bijlagen-laag; niet nogmaals plakken.');
}

const importmap = '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"}}</script>\n';
if (!page.includes('type="importmap"')) page = page.replace('<style>', importmap + '<style>');

page = page.replace('</style>', css + '\n</style>');
const lastClose = page.lastIndexOf('</script>');
if (lastClose === -1) throw new Error('geen </script> gevonden in ' + target);
page = page.slice(0, lastClose) + parts + '\n' + page.slice(lastClose);

fs.writeFileSync(target, page);
console.log('STEP/bijlagen-laag samengevoegd in ' + target + '. step/step-worker.js blijft een los bestand (Web Worker).');
