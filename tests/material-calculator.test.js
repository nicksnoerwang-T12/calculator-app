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
 validateCalculationPayload,migrateCalculation,SECTIONS};`, context);
const { api } = context;
const clone = value => JSON.parse(JSON.stringify(value));
const base = { id:'x', material:'s235', count:2, countMode:'project', priceBasis:'kg', priceMode:'manual', unitPrice:2, waste:0, dims:{} };

// Vaste voorbeelden A–E.
let r = api.calculateMaterialLine({...base,profile:'plate',dims:{length:1000,width:500,t:3}},1,{});
assert.equal(r.weight,23.55); assert.equal(r.lineCents,4710);
r = api.calculateMaterialLine({...base,profile:'shs',count:4,dims:{b:40,t:3,length:2000}},1,{});
assert.equal(api.profileArea('shs',{b:40,t:3}),444); assert(Math.abs(r.weight-27.8832)<1e-10); assert.equal(r.lineCents,5577);
r = api.calculateMaterialLine({...base,profile:'shs',count:4,waste:10,dims:{b:40,t:3,length:2000}},1,{}); assert.equal(r.lineCents,6134);
r = api.calculateMaterialLine({...base,profile:'custom',unitPrice:3,dims:{kgm:15.8,length:3000}},1,{});
assert(Math.abs(r.weight-94.8)<1e-10); assert.equal(r.lineCents,28440);
r = api.calculateMaterialLine({...base,profile:'custom',priceBasis:'m',unitPrice:20,dims:{kgm:15.8,length:3000}},1,{}); assert.equal(r.lineCents,12000);
assert.equal(api.effectiveCount({...base,count:4,countMode:'perProduct'},3),12);
assert.equal(api.effectiveCount({...base,count:4,countMode:'project'},3),4);
assert.deepEqual(clone(api.calculateSale(10000,10,20)),{afterCents:11000,saleCents:13750});

// Alle vrije profielgeometrieën.
const areas={flat:120,round:Math.PI*100,square:400,hex:Math.sqrt(3)*200,tube:Math.PI*(1600-1156)/4,shs:444,rectTube:444,angle:304,unequalAngle:304};
const dims={flat:{b:30,t:4},round:{D:20},square:{b:20},hex:{sw:20},tube:{D:40,t:3},shs:{b:40,t:3},rectTube:{b:50,h:30,t:3},angle:{a:40,t:4},unequalAngle:{a:50,b:30,t:4}};
for(const [profile,area] of Object.entries(areas)) assert(Math.abs(api.profileArea(profile,dims[profile])-area)<1e-9,profile);

// Validatie, prijsbasissen en prijsfallback.
assert(Number.isNaN(api.strictNumber('12abc'))); assert.equal(api.strictNumber('12,5'),12.5); assert.equal(api.strictNumber('12.5'),12.5);
assert(api.validateLine({...base,profile:'tube',dims:{D:40,t:21,length:1000}},1).t);
assert(api.validateLine({...base,profile:'rectTube',dims:{b:40,h:30,t:16,length:1000}},1).t);
assert(api.validateLine({...base,profile:'angle',dims:{a:4,t:4,length:1000}},1).t);
storageData={'werkbank.preview.v3.exactPrices':{'s235|ipe|160':{basis:'kg',price:5}},'werkbank.preview.v3.familyPrices':{'s235|staf':{basis:'kg',price:4}}};
const cat={...base,profile:'ipe',catalogSize:'160',count:1,dims:{length:1000}};
assert.equal(api.calculateMaterialLine({...cat,priceMode:'list'},1,{s235:2}).price,5);
assert.equal(api.calculateMaterialLine({...base,profile:'flat',priceMode:'list',dims:{b:20,t:2,length:1000}},1,{s235:2}).price,4);
assert.equal(api.calculateMaterialLine({...base,profile:'plate',priceMode:'list',dims:{length:100,width:100,t:2}},1,{s235:2}).price,2);
assert.equal(api.calculateMaterialLine({...base,profile:'plate',priceMode:'list',priceBasis:'m2',dims:{length:100,width:100,t:2}},1,{}).lineCents,null);
assert.equal(api.calculateMaterialLine({...base,profile:'item',description:'Bout',priceBasis:'piece',unitPrice:0,waste:99},1,{}).lineCents,0);
assert.equal(api.calculateMaterialLine({...base,profile:'plate',priceBasis:'m2',unitPrice:10,dims:{length:1000,width:1000,t:1}},1,{}).lineCents,2000);
assert.equal(api.calculateMaterialLine({...base,profile:'flat',priceBasis:'m',unitPrice:10,dims:{b:1,t:1,length:1000}},1,{}).lineCents,2000);

// Reproducties materiaalpreview: geldige profielen mogen niet door een ander/leeg veld blokkeren.
const validExamples=[
 ['shs',{b:'50',t:'3',length:'1000'}],
 ['rectTube',{b:'50',h:'30',t:'2',length:'1000'}],
 ['plate',{length:'1000',width:'50',t:'3'}],
 ['angle',{a:'50',t:'5',length:'1000'}]
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
const roundAfterSwitch={...base,profile:'round',count:1,dims:{D:'20',length:'1000'}};
assert.deepEqual(clone(api.validateLine(roundAfterSwitch,1)),{},'verborgen oude hoogte blokkeert rondstaf');
assert.equal(api.strictNumber(' 50,5 '),50.5); assert.equal(api.strictNumber('50.5'),50.5);
assert(Number.isNaN(api.strictNumber(''))); assert(Number.isNaN(api.strictNumber('50abc')));
assert(Number.isNaN(api.strictNumber('NaN'))); assert(Number.isNaN(api.strictNumber('Infinity')));
const thickError=api.validateLine({...base,profile:'shs',count:1,dims:{b:'50',t:'30',length:'1000'}},1);
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
console.log('materiaal-, migratie-, import- en opslagtests geslaagd');
