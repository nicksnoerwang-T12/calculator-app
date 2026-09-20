// Node script, zelfde patroon als de andere promote-*.js scripts: voegt de intake-laag
// (intake/intake.css + intake/templates.js + intake/schematic.js + intake/intake.js) samen in
// werkbank-v2.html. templates.js en schematic.js moeten vóór intake.js staan (intake.js gebruikt
// TEMPLATES en intakeSchematicFor/intakeSchematicSvg als globale functies).
const fs = require('fs');

const target = 'werkbank-v2.html';
let page = fs.readFileSync(target, 'utf8');
const css = fs.readFileSync('intake/intake.css', 'utf8');
const templates = fs.readFileSync('intake/templates.js', 'utf8');
const schematic = fs.readFileSync('intake/schematic.js', 'utf8');
const js = fs.readFileSync('intake/intake.js', 'utf8');

if (page.includes('const INTAKE_LEVELS')) {
  throw new Error('werkbank-v2.html bevat al de intake-laag; niet nogmaals plakken.');
}

page = page.replace('</style>', css + '\n</style>');
const lastClose = page.lastIndexOf('</script>');
if (lastClose === -1) throw new Error('geen </script> gevonden in ' + target);
page = page.slice(0, lastClose) + templates + '\n' + schematic + '\n' + js + '\n' + page.slice(lastClose);

fs.writeFileSync(target, page);
console.log('Intake-laag (sjablonen + funnel) samengevoegd in ' + target + '.');
