'use strict';
// Test de twee nieuwe rekentools (verstek koker/hoeklijn, omtrek/oppervlakte) tegen de echte,
// samengevoegde werkbank-v2.html — zelfde extractiepatroon als de andere production-*.test.js
// bestanden: pak de pure functies eruit met vm, geen DOM nodig voor de rekenlogica zelf.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync('werkbank-v2.html', 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const fmtLine = script.slice(script.indexOf('const fmt ='), script.indexOf('const fmt =') + 400).split('\n')[0];
const radBlock = 'const rad = d => d * Math.PI / 180;\nconst deg = r => r * 180 / Math.PI;';
const registryBlock = 'const TOOLS = [];\nfunction reg(t) { TOOLS.push(t); }';
const verstekBlock = script.slice(script.indexOf('/* ================= 10b. verstek koker/hoeklijn'), script.indexOf('/* ================= 11. pijpoffset'));
const vormenBlock = script.slice(script.indexOf('/* ================= 19. omtrek/oppervlakte'), script.indexOf('/* ================= start'));
assert.ok(verstekBlock.includes("id: 'verstek-hoek'"), 'verstek-hoek-blok gevonden in werkbank-v2.html');
assert.ok(vormenBlock.includes("id: 'vormen'"), 'vormen-blok gevonden in werkbank-v2.html');

const context = { console, Math, Number, Object, Array, String, JSON, isFinite, parseFloat };
vm.createContext(context);
vm.runInContext(fmtLine + '\n' + radBlock + '\n' + registryBlock + '\n' + verstekBlock + '\n' + vormenBlock + '\nthis.api = { TOOLS };', context);
const { api } = context;

function rowsToObj(rows) {
  const o = {};
  for (const r of rows) o[r[0]] = r[1];
  return o;
}

/* ---------- verstek koker/hoeklijn ---------- */
{
  const tool = api.TOOLS.find(t => t.id === 'verstek-hoek');
  assert.ok(tool, 'verstek-hoek staat in de tool-registry');
  assert.equal(tool.group, 'Plaatwerk');

  // 90°-hoek (het bekende 45°-verstek van een vierkant kader) met 40 mm profielbreedte:
  // buiten-/binnenverschil = breedte × tan(45°) = breedte zelf.
  let r = tool.calc({ hoek: 90, w: 40 });
  assert.equal(r.big, '45,00 °');
  let rows = rowsToObj(r.rows);
  assert.equal(rows['Zaaghoek per stuk, vanaf haaks'], '45,00 °');
  assert.equal(rows['Zaaghoek per stuk, vanaf de lengterichting'], '45,00 °');
  assert.equal(rows['Verschil buiten-/binnenkant'], '40,0 mm');

  // 120°-hoek, 40 mm: zaaghoek = 60°, verschil = 40×tan(60°) ≈ 69,3 mm.
  r = tool.calc({ hoek: 120, w: 40 });
  rows = rowsToObj(r.rows);
  assert.equal(rows['Zaaghoek per stuk, vanaf haaks'], '60,00 °');
  assert.ok(Math.abs(parseFloat(rows['Verschil buiten-/binnenkant'].replace(',', '.')) - 40 * Math.tan(Math.PI / 3)) < 0.05);

  // Zonder profielbreedte: alleen de hoek, geen lengteverschil-regel (geen crash).
  r = tool.calc({ hoek: 90, w: NaN });
  assert.ok(!Object.keys(rowsToObj(r.rows)).includes('Verschil buiten-/binnenkant'));

  // Buiten bereik (0 of 180+) geeft een foutmelding, geen NaN-uitkomst.
  assert.ok(tool.calc({ hoek: 0, w: 40 }).error);
  assert.ok(tool.calc({ hoek: 180, w: 40 }).error);
  assert.ok(tool.calc({ hoek: 200, w: 40 }).error);

  // Zeer stompe hoek waarschuwt (lange, spitse zaagsnede) in plaats van stil door te rekenen.
  r = tool.calc({ hoek: 170, w: 40 });
  assert.ok(r.warnings && r.warnings.length > 0, 'zeer stompe hoek geeft een waarschuwing');
}

/* ---------- omtrek en oppervlakte ---------- */
{
  const tool = api.TOOLS.find(t => t.id === 'vormen');
  assert.ok(tool, 'vormen staat in de tool-registry');
  assert.equal(tool.group, 'Vormen en maten');

  // Cirkel, diameter 100 mm: omtrek = π×d, oppervlakte = π×r².
  let r = tool.calc({ kind: 'cirkel', d: 100 });
  assert.ok(Math.abs(parseFloat(r.big.replace(',', '.')) - Math.PI * 100) < 0.05);
  const oppMm2 = r.rows.find(row => row[1].includes('mm²'))[1];
  assert.ok(Math.abs(parseFloat(oppMm2.replace('.', '').replace(',', '.')) - Math.PI * 2500) < 1);

  // Rechthoek 100×60: omtrek 320, oppervlakte 6000, diagonaal 116,6.
  r = tool.calc({ kind: 'rechthoek', l: 100, b: 60 });
  let rows = rowsToObj(r.rows);
  assert.equal(rows['Omtrek'], '320,0 mm');
  assert.ok(r.rows.some(row => row[0] === 'Oppervlakte' && row[1] === '6.000 mm²'));
  assert.ok(Math.abs(parseFloat(rows['Diagonaal'].replace(',', '.')) - Math.hypot(100, 60)) < 0.5);

  // Vierkant 100: omtrek 400, oppervlakte 10000.
  r = tool.calc({ kind: 'vierkant', z: 100 });
  rows = rowsToObj(r.rows);
  assert.equal(rows['Omtrek'], '400,0 mm');
  assert.ok(r.rows.some(row => row[0] === 'Oppervlakte' && row[1] === '10.000 mm²'));

  // Driehoek 30-40-50 (klassieke rechthoekige driehoek ×10): omtrek 120, oppervlakte 600
  // (Heron: s=60, √(60×30×20×10)=600).
  r = tool.calc({ kind: 'driehoek', a: 30, b: 40, c: 50 });
  rows = rowsToObj(r.rows);
  assert.equal(rows['Omtrek'], '120,0 mm');
  assert.ok(r.rows.some(row => row[0] === 'Oppervlakte' && row[1] === '600 mm²'));

  // Ongeldige driehoek (driehoeksongelijkheid geschonden) geeft een foutmelding, geen NaN.
  assert.ok(tool.calc({ kind: 'driehoek', a: 1, b: 1, c: 10 }).error);

  // Ontbrekende/negatieve maten geven een foutmelding voor elke vorm.
  assert.ok(tool.calc({ kind: 'cirkel', d: 0 }).error);
  assert.ok(tool.calc({ kind: 'rechthoek', l: 100, b: NaN }).error);
  assert.ok(tool.calc({ kind: 'vierkant', z: -5 }).error);
}

console.log('rekentools: verstek koker/hoeklijn en omtrek/oppervlakte rekenen correct en foutbestendig');
