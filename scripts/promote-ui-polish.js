// Node script, same pattern as the other promote-*.js scripts: merges the UI-polish layer
// (ui-polish/ui-polish.css + ui-polish/ui-polish.js) into werkbank-v2.html. Must run after the
// other layers since it wraps bindMaterialEditor, which the base app and earlier layers already
// wrap several times over.
const fs = require('fs');

const target = 'werkbank-v2.html';
let page = fs.readFileSync(target, 'utf8');
const css = fs.readFileSync('ui-polish/ui-polish.css', 'utf8');
const js = fs.readFileSync('ui-polish/ui-polish.js', 'utf8');

if (page.includes('const uiPolishBind')) {
  throw new Error('werkbank-v2.html bevat al de UI-polish-laag; niet nogmaals plakken.');
}

page = page.replace('</style>', css + '\n</style>');
const lastClose = page.lastIndexOf('</script>');
if (lastClose === -1) throw new Error('geen </script> gevonden in ' + target);
page = page.slice(0, lastClose) + js + '\n' + page.slice(lastClose);

fs.writeFileSync(target, page);
console.log('UI-polish-laag samengevoegd in ' + target + '.');
