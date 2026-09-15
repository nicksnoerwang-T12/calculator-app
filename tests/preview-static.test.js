'use strict';
const fs=require('fs'),assert=require('assert');
const html=fs.readFileSync('werkbank-preview.html','utf8');
const staticHtml=html.replace(/<script>[\s\S]*?<\/script>/,'');
const ids=[...staticHtml.matchAll(/\sid="([^"]+)"/g)].map(x=>x[1]);
assert.equal(new Set(ids).size,ids.length,'dubbele statische HTML-id');
for(const id of [...staticHtml.matchAll(/<label[^>]+for="([^"]+)"/g)].map(x=>x[1]))assert(ids.includes(id),`label zonder veld: ${id}`);
assert(html.includes('Preview leverancierscatalogus 6.0 — harmonica'));
assert(html.includes('id="runtime-error"')&&html.includes('window.onerror')&&html.includes("unhandledrejection"),'zichtbaar foutpaneel en beide globale foutkanalen aanwezig');
assert(html.indexOf("document.addEventListener('change'")<html.indexOf('const MATERIAL_SCHEMA='),'stabiele profieldelegatie wordt vóór app-initialisatie geïnstalleerd');
assert(html.includes('position:absolute;opacity:0')&&!html.includes('.profile-radio{display:none'),'radio is visueel, maar niet functioneel verborgen');
assert(!/\sautofocus(?:\s|=|>)/i.test(html),'materiaalpreview mag geen autofocus-attribuut bevatten');
const pickerSource=html.slice(html.indexOf('function pickerHtml'),html.indexOf('function dimensionsHtml'));
assert(pickerSource.indexOf('profile-picker')<pickerSource.indexOf('profile-search-wrap'),'profielkaarten moeten vóór zoeken staan');
const editorSource=html.slice(html.indexOf('function openMaterialEditor'),html.indexOf('function editorDirty'));
assert(editorSource.includes("queueMicrotask(()=>$('editor-title').focus({preventScroll:true}))"),'dialoogtitel krijgt initiële focus');
assert(!editorSource.includes("querySelector('input,select"),'editor mag niet automatisch een invoerveld focussen');
assert(html.includes('lastFocus?.focus()'),'sluiten herstelt focus naar de opener');
assert(html.includes('overflow-x:hidden'),'mobiele editor voorkomt horizontale overflow');

assert(html.includes("calculations: 'werkbank.preview.v3.calculations'"));
for(const profile of ['plate','strip','roundBar','squareBar','hexBar','roundTube','squareTube','rectTube','equalAngle','unequalAngle','IPE','HEA','HEB','UNP','UPE','tee','customKgM','purchasedItem'])assert(html.includes(`p==='${profile}'`)||html.includes(`['squareTube','rectTube'].includes(p)`)||html.includes(`['equalAngle','unequalAngle'].includes(p)`)||html.includes(`['UNP','UPE'].includes(p)`)||html.includes("['IPE','HEA','HEB'].includes(p)"),`diagram ontbreekt: ${profile}`);
const toolIds=[...html.matchAll(/reg\(\{\s*id:\s*'([^']+)'/g)].map(x=>x[1]);
assert.deepEqual(toolIds,['gewicht','profielen','tank','zaaglijst','nesting','kanten','conus','cilinder','aftakking','verstek','offset','steekcirkel','trap','lassen','verbruik','draad','balk','kostprijs']);
console.log('statische previewcontroles geslaagd');
const crypto=require('crypto');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(sha('werkbank.html'),'d964307b9a66667df0c15ab4c9d41a625e4c7b0d3170c15cbafea51cb16a7ce2','werkbank.html moet byte-identiek blijven');
assert.equal(sha('werkbank-v2.html'),'5def1b2e5f847d5500a3973e1be28adce09e42ef043590de31603e90e15b3171','werkbank-v2.html moet byte-identiek blijven');

// De basiscatalogus en productiecode zijn inline: offline zijn geen aanvullende runtimebestanden nodig.
const runtimeAssets=[...staticHtml.matchAll(/<(?:script|img|link)\b[^>]*(?:src|href)="([^"]+)"/gi)].map(x=>x[1]).filter(x=>!x.startsWith('#'));
assert.deepEqual(runtimeAssets,[],'preview mag geen niet-geladen of online runtimecatalogus/assets vereisen');
assert(html.includes("const CATALOG_ARTICLES=[]")&&html.includes("const CATALOG_VERSION='nl-suppliers-2026-09-15-v1'"),'gebundelde offlinecatalogus ontbreekt');
