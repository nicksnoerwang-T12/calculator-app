'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync('werkbank-preview.html', 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const catalog = script.slice(script.indexOf('const SECTIONS ='), script.indexOf('function sectionOptions'));
const escSource = script.slice(script.indexOf('const esc ='), script.indexOf('const rad ='));
const material = script.slice(script.indexOf('const MATERIAL_SCHEMA='), script.indexOf('function readCostInput'));
let storageData = {};
let serial = 0;
const context = {
  console, Math, Number, Object, Array, String, Date, JSON, Intl, Set, Map,
  isFinite, parseFloat,
  safeGet: (key, fallback) => storageData[key] ?? fallback,
  getPrices: () => ({ s235: 2 }),
  finiteNonNegative: value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0,
  uid: () => `id-${++serial}`,
  SECTIONS: null
};
vm.createContext(context);
vm.runInContext(escSource + '\n' + catalog + '\n' + material + `
this.api={esc,MATERIAL_SCHEMA,MATERIALS,PROFILES,strictNumber,effectiveCount,profileArea,validateLine,
 calculateMaterialLine,calculateMaterialList,calculateSale,duplicateMaterialLine,removeMaterialLine,
 restoreMaterialLine,buildPriceReview,applyPriceReview,createStorageAdapter,calculationPayload,
 validateCalculationPayload,migrateCalculation,SECTIONS,CATALOG_STATUS,CATALOG_ARTICLES,catalogArticle,catalogFor,applyCatalogArticle,catalogPrice,twentseSmallOrderCents,planBars,planPlates,purchaseSummary};`, context);
const { api } = context;
const clone = value => JSON.parse(JSON.stringify(value));
const base = { id:'x', material:'s235', count:2, countMode:'project', priceBasis:'kg', priceMode:'manual', unitPrice:2, waste:0, dims:{} };

// Vaste voorbeelden A–E.
let r = api.calculateMaterialLine({...base,profile:'plate',dims:{length:1000,width:500,t:3}},1,{});
assert.equal(r.weight,23.55); assert.equal(r.lineCents,4710);
r = api.calculateMaterialLine({...base,profile:'squareTube',count:4,dims:{b:40,t:3,length:2000}},1,{});
assert.equal(api.profileArea('squareTube',{b:40,t:3}),444); assert(Math.abs(r.weight-27.8832)<1e-10); assert.equal(r.lineCents,5577);
r = api.calculateMaterialLine({...base,profile:'squareTube',count:4,waste:10,dims:{b:40,t:3,length:2000}},1,{}); assert.equal(r.lineCents,6134);
r = api.calculateMaterialLine({...base,profile:'customKgM',unitPrice:3,dims:{kgm:15.8,length:3000}},1,{});
assert(Math.abs(r.weight-94.8)<1e-10); assert.equal(r.lineCents,28440);
r = api.calculateMaterialLine({...base,profile:'customKgM',priceBasis:'m',unitPrice:20,dims:{kgm:15.8,length:3000}},1,{}); assert.equal(r.lineCents,12000);
assert.equal(api.effectiveCount({...base,count:4,countMode:'perProduct'},3),12);
assert.equal(api.effectiveCount({...base,count:4,countMode:'project'},3),4);
assert.deepEqual(clone(api.calculateSale(10000,10,20)),{afterCents:11000,saleCents:13750});

// Alle vrije profielgeometrieën.
const areas={strip:120,roundBar:Math.PI*100,squareBar:400,hexBar:Math.sqrt(3)*200,roundTube:Math.PI*(1600-1156)/4,squareTube:444,rectTube:444,equalAngle:304,unequalAngle:304};
const dims={strip:{b:30,t:4},roundBar:{D:20},squareBar:{b:20},hexBar:{sw:20},roundTube:{D:40,t:3},squareTube:{b:40,t:3},rectTube:{b:50,h:30,t:3},equalAngle:{a:40,t:4},unequalAngle:{a:50,b:30,t:4}};
for(const [profile,area] of Object.entries(areas)) assert(Math.abs(api.profileArea(profile,dims[profile])-area)<1e-9,profile);

// Validatie, prijsbasissen en prijsfallback.
assert(Number.isNaN(api.strictNumber('12abc'))); assert.equal(api.strictNumber('12,5'),12.5); assert.equal(api.strictNumber('12.5'),12.5);
assert(api.validateLine({...base,profile:'roundTube',dims:{D:40,t:21,length:1000}},1).t);
assert(api.validateLine({...base,profile:'rectTube',dims:{b:40,h:30,t:16,length:1000}},1).t);
assert(api.validateLine({...base,profile:'equalAngle',dims:{a:4,t:4,length:1000}},1).t);
storageData={'werkbank.preview.v3.exactPrices':{'s235|IPE|160':{basis:'kg',price:5}},'werkbank.preview.v3.familyPrices':{'s235|staf':{basis:'kg',price:4}}};
const cat={...base,profile:'IPE',catalogSize:'160',count:1,dims:{length:1000}};
assert.equal(api.calculateMaterialLine({...cat,priceMode:'list'},1,{s235:2}).price,5);
assert.equal(api.calculateMaterialLine({...base,profile:'strip',priceMode:'list',dims:{b:20,t:2,length:1000}},1,{s235:2}).price,4);
assert.equal(api.calculateMaterialLine({...base,profile:'plate',priceMode:'list',dims:{length:100,width:100,t:2}},1,{s235:2}).price,2);
assert.equal(api.calculateMaterialLine({...base,profile:'plate',priceMode:'list',priceBasis:'m2',dims:{length:100,width:100,t:2}},1,{}).lineCents,null);
assert.equal(api.calculateMaterialLine({...base,profile:'purchasedItem',description:'Bout',priceBasis:'piece',unitPrice:0,waste:99},1,{}).lineCents,0);
assert.equal(api.calculateMaterialLine({...base,profile:'plate',priceBasis:'m2',unitPrice:10,dims:{length:1000,width:1000,t:1}},1,{}).lineCents,2000);
assert.equal(api.calculateMaterialLine({...base,profile:'strip',priceBasis:'m',unitPrice:10,dims:{b:1,t:1,length:1000}},1,{}).lineCents,2000);

// Reproducties materiaalpreview: geldige profielen mogen niet door een ander/leeg veld blokkeren.
const validExamples=[
 ['squareTube',{b:'50',t:'3',length:'1000'}],
 ['rectTube',{b:'50',h:'30',t:'2',length:'1000'}],
 ['plate',{length:'1000',width:'50',t:'3'}],
 ['equalAngle',{a:'50',t:'5',length:'1000'}]
];
for(const [profile,profileDims] of validExamples){
 const line={...base,profile,count:1,dims:profileDims};
 assert.deepEqual(clone(api.validateLine(line,1)),{},`${profile} heeft onverwachte validatiefouten`);
 assert(!api.calculateMaterialLine(line,1,{}).errors,`${profile} kan niet worden toegevoegd`);
}
const incompleteRhs=api.validateLine({...base,profile:'rectTube',count:1,dims:{b:'50'}},1);
assert(!incompleteRhs.b,'geldige breedte kreeg een fout');
assert(incompleteRhs.h.includes('hoogte')&&incompleteRhs.h.includes('mm'));
assert(incompleteRhs.t.includes('wanddikte')&&incompleteRhs.t.includes('mm'));
assert(incompleteRhs.length.includes('stuklengte')&&incompleteRhs.length.includes('mm'));
const roundAfterSwitch={...base,profile:'roundBar',count:1,dims:{D:'20',length:'1000'}};
assert.deepEqual(clone(api.validateLine(roundAfterSwitch,1)),{},'verborgen oude hoogte blokkeert rondstaf');
assert.equal(api.strictNumber(' 50,5 '),50.5); assert.equal(api.strictNumber('50.5'),50.5);
assert(Number.isNaN(api.strictNumber(''))); assert(Number.isNaN(api.strictNumber('50abc')));
assert(Number.isNaN(api.strictNumber('NaN'))); assert(Number.isNaN(api.strictNumber('Infinity')));
const thickError=api.validateLine({...base,profile:'squareTube',count:1,dims:{b:'50',t:'30',length:'1000'}},1);
assert.equal(thickError.t,'Vul een wanddikte tussen 0 en 25 mm in.');
const broken={...base,profile:'rectTube',count:1,dims:{b:'50',h:'30',t:'20',length:'1000'}};
assert(api.calculateMaterialLine(broken,1,{}).errors.t);
const repaired={...broken,dims:{...broken.dims,t:'2'}};
const repairedResult=api.calculateMaterialLine(repaired,1,{});
assert(!repairedResult.errors); assert(repairedResult.weight>0); assert(repairedResult.lineCents>0);

// Lijstbewerkingen en honderd regels.
const original={id:'a',dims:{b:10}}, copy=api.duplicateMaterialLine(original,'b'); copy.dims.b=20;
assert.equal(original.dims.b,10); assert.equal(copy.id,'b');
const removed=api.removeMaterialLine([original,copy],'a'); assert.equal(removed.lines.length,1);
assert.equal(api.restoreMaterialLine(removed.lines,removed.removed,removed.index)[0].id,'a');
const hundred=Array.from({length:100},(_,i)=>({...base,id:String(i),profile:'plate',count:1,dims:{length:100,width:100,t:1}}));
assert.equal(api.calculateMaterialList(hundred,1,{}).rows.length,100);

// Volledige prijsvergelijking is zonder mutatie; toepassen maakt nieuwe snapshots.
const saved={...base,id:'saved',profile:'plate',unitPrice:2,priceSnapshot:{price:2,basis:'kg',source:'oud'},dims:{length:1000,width:1000,t:1}};
const before=clone(saved), review=api.buildPriceReview([saved],1,{s235:3});
assert.deepEqual(clone(saved),before); assert.equal(review.oldTotalCents,3140); assert.equal(review.newTotalCents,4710); assert.equal(review.differenceCents,1570);
const updated=api.applyPriceReview([saved],review,'2026-09-14T00:00:00.000Z');
assert.equal(updated[0].unitPrice,3); assert.equal(updated[0].priceSnapshot.price,3); assert.equal(updated[0].priceSnapshot.date,'2026-09-14T00:00:00.000Z');

// Legacy-migratie: bedrag, waarschuwing, idempotentie en toekomstige versies.
const legacy={project:'Oud',qty:2,material:'s235',weight:10,materialPrice:2,waste:10};
const migrated=api.migrateCalculation(legacy); assert.equal(migrated.materials.length,1); assert.equal(migrated.materials[0].legacyAmountCents,2200);
assert(migrated.materials[0].note.includes('Controle nodig'));
const twice=api.migrateCalculation(migrated); assert.equal(twice.materials.length,1); assert.equal(twice.materials[0].id,migrated.materials[0].id);
assert.throws(()=>api.migrateCalculation({schemaVersion:99,materials:[]}));

// Export/import-validatie behoudt regels en snapshots en weigert foutieve invoer.
const project={...migrated,schemaVersion:api.MATERIAL_SCHEMA,qty:2,materials:updated};
const payload=api.calculationPayload(project), checked=api.validateCalculationPayload(payload);
assert(checked.ok); assert.deepEqual(clone(checked.data.materials),clone(updated));
assert.throws(()=>JSON.parse('{fout'));
assert.equal(api.validateCalculationPayload({...payload,version:99}).ok,false);
assert.equal(api.validateCalculationPayload({...payload,calculatie:{...project,materials:hundred.concat(saved)}}).ok,false);
assert.equal(api.validateCalculationPayload({...payload,calculatie:{...project,materials:[{...saved,unitPrice:-1}]}}).ok,false);
assert.equal(api.validateCalculationPayload({...payload,calculatie:{...project,materials:[saved,{...saved}]}}).error,'dubbele-id');
assert.equal(api.validateCalculationPayload({...payload,calculatie:{...project,materials:[{...saved,dims:{...saved.dims,t:NaN}}]}}).ok,false);
const hostile={...project,project:'<script>alert(1)</script>'}; assert.equal(api.validateCalculationPayload(api.calculationPayload(hostile)).data.project,hostile.project); assert.equal(api.esc(hostile.project),'&lt;script&gt;alert(1)&lt;/script&gt;');

// Injecteerbare storage-adapter: ontbrekend, SecurityError, quota en beschadigd JSON.
const unavailable=api.createStorageAdapter({getItem(){throw new Error('SecurityError')},setItem(){throw new Error('SecurityError')}});
assert.equal(unavailable.read('x',[]).ok,false); assert.equal(unavailable.write('x',{}).ok,false);
const quota=api.createStorageAdapter({getItem(){return null},setItem(){const e=new Error('QuotaExceededError');throw e}}); assert.equal(quota.write('x',{}).ok,false);
const damaged=api.createStorageAdapter({getItem(){return '{kapot'},setItem(){}}); assert.equal(damaged.read('x',[]).ok,false);
const memory={value:null,getItem(){return this.value},setItem(k,v){this.value=v}}; const adapter=api.createStorageAdapter(memory);
assert(adapter.write('prices',{s235:9}).ok); assert.deepEqual(clone(adapter.read('prices',{}).value),{s235:9});

// Leverancierscatalogus en verplichte aankoopfixtures.
assert.equal(api.CATALOG_ARTICLES.length,115);assert.equal(api.CATALOG_ARTICLES.filter(a=>a.price.status==='P').length,74);assert.equal(api.CATALOG_ARTICLES.filter(a=>a.price.status==='O').length,41);assert.deepEqual(Object.keys(api.CATALOG_STATUS),['P','O','B','M']);
const rectArticle=api.CATALOG_ARTICLES.find(a=>a.profileType==='rectTube'&&a.label==='50 × 30 × 2 mm');
assert(rectArticle);assert.equal(rectArticle.price.amount,4.29);assert.deepEqual(clone(rectArticle.knownStockLengthsMm),[]);
let catalogLine=api.applyCatalogArticle({...base,count:4,countMode:'project',profile:'rectTube',dims:{length:1000},waste:0},rectArticle);
r=api.calculateMaterialLine(catalogLine,1,{});assert.equal(r.meters,4);assert.equal(r.lineCents,1716);
assert.equal(api.twentseSmallOrderCents(24999),2500);assert.equal(api.twentseSmallOrderCents(25000),0);
const ipe=api.CATALOG_ARTICLES.find(a=>a.profileType==='IPE'&&a.label==='IPE 160');
let ipeLine=api.applyCatalogArticle({...base,count:1,countMode:'project',profile:'IPE',dims:{length:3000},waste:0},ipe);
r=api.calculateMaterialLine(ipeLine,1,{});assert(Math.abs(r.weight-48.6)<1e-9);assert.equal(r.lineCents,6561);assert.equal(api.SECTIONS.IPE.d[160][7],15.8);
const upe=api.CATALOG_ARTICLES.find(a=>a.profileType==='UPE'&&a.label==='UPE 160');assert.equal(upe.maxLengthMm,12000);assert.deepEqual(clone(upe.knownStockLengthsMm),[]);assert.equal(upe.price.amount,null);assert.equal(api.catalogPrice({catalogArticleId:upe.id}),null);
assert.deepEqual(clone(api.planBars([3500,3500,3500],6000,0)),{stockCount:3,purchasedMm:18000,netMm:10500,restMm:7500,bins:[{parts:[3500],used:3500},{parts:[3500],used:3500},{parts:[3500],used:3500}],method:'first-fit-decreasing voorstel'});
assert.equal(api.planPlates([{w:600,h:600},{w:600,h:600},{w:600,h:600}],1000,1000,0).stockCount,3);
const aluPlate=api.CATALOG_ARTICLES.find(a=>a.profileType==='plate'&&a.label==='2000 × 1000 × 2 mm');assert(aluPlate);assert.equal(5.508*2,11.016);

// Prijssnapshots blijven stabiel bij catalogus-/artikelstandaardwijziging, herladen en import.
const snapLine={...catalogLine,id:'snapshot',priceMode:'manual',priceOrigin:'catalog',unitPrice:4.29,priceSnapshot:{price:4.29,basis:'m',source:'Catalogusrichtprijs · twentse'}};
const originalCatalogAmount=rectArticle.price.amount;rectArticle.price.amount=9.99;
assert.equal(api.calculateMaterialLine(snapLine,1,{}).lineCents,1716,'catalogusupdate herprijst bestaande snapshot niet');
storageData['werkbank.preview.v4.articlePrices']={[rectArticle.id]:{amount:8,basis:'m'}};
assert.equal(api.calculateMaterialLine(snapLine,1,{}).lineCents,1716,'artikelstandaard herprijst bestaande regel niet');
const importedSnapshot=api.validateCalculationPayload(api.calculationPayload({...project,materials:[snapLine]}));
assert(importedSnapshot.ok);assert.equal(importedSnapshot.data.materials[0].unitPrice,4.29);assert.equal(api.calculateMaterialLine(importedSnapshot.data.materials[0],1,{}).lineCents,1716);
rectArticle.price.amount=originalCatalogAmount;

// Prijsreview muteert niet; alleen expliciet geselecteerde regels wijzigen en eigen prijzen zijn uitgesloten.
const reviewLines=[{...snapLine,id:'choose-a',unitPrice:4},{...snapLine,id:'choose-b',unitPrice:4},{...snapLine,id:'own',unitPrice:4.5,priceOrigin:'user'}];
rectArticle.price.amount=5;const reviewBefore=clone(reviewLines),selective=api.buildPriceReview(reviewLines,1,{});
assert.deepEqual(clone(reviewLines),reviewBefore,'openen/annuleren muteert geen regels');
assert.equal(selective.rows.find(x=>x.line.id==='own').reason,'Eigen inkoopprijs standaard uitgesloten');
const selectivelyApplied=api.applyPriceReview(reviewLines,selective,['choose-b'],'2026-09-15T00:00:00.000Z');
assert.equal(selectivelyApplied[0].unitPrice,4);assert.equal(selectivelyApplied[1].unitPrice,5);assert.equal(selectivelyApplied[2].unitPrice,4.5);assert.equal(selectivelyApplied[1].previousPriceSnapshot.price,4.29);
rectArticle.price.amount=originalCatalogAmount;

// Bewerkingskosten die de €250-grens kunnen raken maken de toeslaggrondslag expliciet onbevestigd.
const ambiguousOrder=api.purchaseSummary([catalogLine],1,{processingCents:24000});
assert.equal(ambiguousOrder.thresholdAffected,true);assert.equal(ambiguousOrder.smallOrderCents,null);assert(ambiguousOrder.openCosts.includes('grondslag kleine-ordergrens bevestigen'));

console.log('materiaal-, catalogus-, aankoop-, migratie-, import- en opslagtests geslaagd');
