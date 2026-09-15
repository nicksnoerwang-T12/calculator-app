'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('werkbank-preview.html','utf8');
const script=html.split('<script>')[1].split('</script>')[0];
const catalog=script.slice(script.indexOf('const SECTIONS ='),script.indexOf('function sectionOptions'));
const escSource=script.slice(script.indexOf('const esc ='),script.indexOf('const rad ='));
const model=script.slice(script.indexOf('const MATERIAL_SCHEMA='),script.indexOf('function readCostInput'));
const wizard=script.slice(script.indexOf('function newLine'),script.indexOf('function openMaterialEditor'));
const views=script.slice(script.indexOf('function pickerHtml'),script.indexOf('function collectDraft'));
const context={console,Math,Number,Object,Array,String,Date,JSON,Intl,Set,Map,isFinite,parseFloat,SECTIONS:null,
 safeGet:(_k,f)=>f,getPrices:()=>({s235:2}),finiteNonNegative:v=>Number(v)||0,uid:()=> 'new',
 diagram:p=>`<svg data-diagram="${p}"></svg>`,profileIcon:p=>`<svg data-icon="${p}"></svg>`,lineDescription:()=>''};
vm.createContext(context);
vm.runInContext(escSource+'\n'+catalog+'\n'+model+'\n'+wizard+'\n'+views+`\nthis.api={PROFILES,newLine,MATERIAL_STEPS,MATERIAL_TRANSITIONS,goMaterialStep,selectMaterialProfile,dimensionsHtml,validateLine};`,context);
const api=context.api, clone=v=>JSON.parse(JSON.stringify(v));
function choose(profile){let draws=0;const editor={stepId:'shape',transitionCount:0,draft:api.newLine(),draw(){draws++;}};let prevented=0,stopped=0;api.selectMaterialProfile(editor,profile,{preventDefault(){prevented++},stopPropagation(){stopped++}},{clear(){}});return{editor,draws,prevented,stopped,html:api.dimensionsHtml(editor.draft)};}
for(const profile of ['rhs','plate','tube','angle','round','ipe']){const x=choose(profile);assert.equal(x.editor.stepId,'details',profile);assert.equal(x.editor.transitionCount,1,profile);assert.equal(x.draws,1,profile);assert.equal(x.prevented,1,profile);assert.equal(x.stopped,1,profile);assert(x.html.includes('e-material'),profile);}
for(const [profile,fields] of [['rhs',['b','h','t','length']],['plate',['length','width','t']],['tube',['D','t','length']],['ipe',['catalogSize','length']]]){const out=choose(profile).html;for(const field of fields)assert(out.includes(`e-${field}`),`${profile}: ${field}`);}
const retained=choose('rhs').editor;Object.assign(retained.draft.dims,{b:'50',h:'30',t:'2',length:'1000'});api.goMaterialStep(retained,'shape');assert.equal(retained.stepId,'shape');api.selectMaterialProfile(retained,'rhs',null,{clear(){}});assert.equal(retained.stepId,'details');
Object.assign(retained.draft.dims,{b:'50',h:'30',t:'2',length:'1000'});
const invalid={...retained.draft,dims:{b:'50',h:'30',t:'20',length:'1000'}};assert(api.validateLine(invalid,1).t,'ongeldige maat moet details blokkeren');
const valid={...retained.draft,dims:{b:'50',h:'30',t:'2',length:'1000'}};assert.deepEqual(clone(api.validateLine(valid,1)),{},'geldige 50 × 30 × 2 koker van 1000 mm');
api.goMaterialStep(retained,'quantity');api.goMaterialStep(retained,'details');assert.deepEqual(clone(retained.draft.dims),valid.dims,'terug bewaart waarden');
const unknown={stepId:'legacy-9',draw(){}};api.goMaterialStep(unknown,'also-unknown');assert.equal(unknown.stepId,'shape');
const picker=html.slice(html.indexOf('function pickerHtml'),html.indexOf('function dimensionsHtml'));
assert(!/<button(?![^>]*type="button")/g.test(picker),'iedere profielknop heeft type=button');
assert(wizard.includes('preventDefault')&&wizard.includes('stopPropagation'),'profielhandler stopt submit en bubbling');
assert(!wizard.includes('localStorage'),'nieuwe wizard herstelt geen opgeslagen wizardstate');
const editorSource=script.slice(script.indexOf('function openMaterialEditor'),script.indexOf('function editorDirty'));
assert(editorSource.includes("stepId:source?'details':'shape'"),'nieuw start op shape; bewerken op details');
assert(!editorSource.includes('setTimeout'),'geen kunstmatige vervolgnavigatie');
assert(editorSource.indexOf('costState.materials.push')>editorSource.indexOf("editor.stepId==='review'"),'annuleren voegt geen regel toe');
console.log('materiaalwizard-state-machine en handlers geslaagd');
