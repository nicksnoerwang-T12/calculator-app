'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('werkbank-preview.html','utf8');
const script=html.split('<script>')[1].split('</script>')[0];
const catalog=script.slice(script.indexOf('const SECTIONS ='),script.indexOf('function sectionOptions'));
const escSource=script.slice(script.indexOf('const esc ='),script.indexOf('const rad ='));
const model=script.slice(script.indexOf('const MATERIAL_SCHEMA='),script.indexOf('function readCostInput'));
const editor=script.slice(script.indexOf('function newLine'),script.indexOf('function removeMaterial(id)'));
const listenerStart=script.indexOf("document.addEventListener('change'");
const documentListener=script.slice(listenerStart,script.indexOf('\n});',listenerStart)+4);

class GeneratedInput {
 constructor(root,value){this.root=root;this.value=value;this.checked=false;this.name='material-profile';this.type='radio';}
 closest(selector){if(selector==='input[name="material-profile"]'||selector==='input[name=\"material-profile\"]')return this;if(selector==='.profile-card')return this.label;return null;}
 dispatchEvent(event){if(event.bubbles)this.root.document.dispatch('change',this,event);return true;}
}
class GeneratedDomRoot {
 constructor(document){this.document=document;this.nodes=[];this.html='';}
 set innerHTML(value){this.html=value;this.nodes=[];for(const match of value.matchAll(/<input\b([^>]*)>/g)){const attrs=match[1],profile=/\bvalue="([^"]+)"/.exec(attrs)?.[1],name=/\bname="([^"]+)"/.exec(attrs)?.[1];if(name==='material-profile'){const input=new GeneratedInput(this,profile);input.label={hidden:false};this.nodes.push(input);}}for(const match of value.matchAll(/\sid="([^"]+)"/g))this.nodes.push({id:match[1]});}
 get innerHTML(){return this.html;}
 querySelector(selector){if(selector.startsWith('#'))return this.nodes.find(n=>n.id===selector.slice(1))||null;const value=/input\[name="material-profile"\]\[value="([^"]+)"\]/.exec(selector)?.[1];return this.nodes.find(n=>n.value===value)||null;}
}
class GeneratedDocument {
 constructor(){this.listeners={};}
 addEventListener(type,handler){(this.listeners[type]??=[]).push(handler);}
 dispatch(type,target,event){for(const handler of this.listeners[type]||[])handler({...event,type,target});}
 getElementById(){return {focus(){}};}
}
const document=new GeneratedDocument(),window={addEventListener(){}};
const context={console,Math,Number,Object,Array,String,Date,JSON,Intl,Set,Map,isFinite,parseFloat,SECTIONS:null,window,document,
 queueMicrotask:fn=>fn(),$:()=>({focus(){}}),safeGet:(_k,f)=>f,safeSet:()=>true,getPrices:()=>({s235:2}),finiteNonNegative:v=>Number(v)||0,uid:()=> 'new',
 diagram:p=>`<svg data-diagram="${p}"></svg>`,profileIcon:p=>`<svg data-icon="${p}"></svg>`,lineDescription:()=>'',costState:{qty:1,materials:[]}};
vm.createContext(context);
vm.runInContext(escSource+'\n'+catalog+'\n'+model+'\n'+editor+'\n'+documentListener+`\nthis.api={MATERIAL_PROFILE_TYPES,PROFILES,newLine,createMaterialEditorState,handleProfileSelection,pickerHtml,editorFormHtml};this.activate=x=>activeMaterialEditor=x;`,context);
const api=context.api;
assert.deepEqual(Array.from(api.MATERIAL_PROFILE_TYPES),['plate','strip','roundBar','squareBar','hexBar','roundTube','squareTube','rectTube','equalAngle','unequalAngle','IPE','HEA','HEB','UNP','UPE','tee','customKgM','purchasedItem']);
assert.strictEqual(window.selectMaterialProfile,context.selectMaterialProfile,'selectMaterialProfile is expliciet op window beschikbaar');
assert.equal(document.listeners.change.length,1,'precies één stabiele document-change-listener');
assert.equal(api.handleProfileSelection('ipe',api.createMaterialEditorState()),false,'niet-canonieke profielwaarde wordt geweigerd');

for(const profile of ['rectTube','plate','IPE']){
 const root=new GeneratedDomRoot(document),state=api.createMaterialEditorState(),touched=new Set(['old']);let editorOpens=0;
 const draw=()=>{root.innerHTML=state.materialEditorView==='picker'?api.pickerHtml(state.draft):api.editorFormHtml(state.draft);if(state.materialEditorView==='editor')editorOpens++;};
 context.activate({state,touched,draw});draw();
 const input=root.querySelector(`input[name="material-profile"][value="${profile}"]`);
 assert(input,`${profile}: echt radio-input staat in gegenereerde picker-DOM`);assert.equal(input.type,'radio');
 input.checked=true;input.dispatchEvent({bubbles:true});
 assert.equal(state.draft.profile,profile,`${profile}: document-listener slaat keuze op`);
 assert(!root.querySelector('#profile-picker'),`${profile}: picker verdwijnt`);
 assert(root.querySelector('#change-profile'),`${profile}: volledige editor verschijnt`);
 const required=profile==='rectTube'?['e-material','e-b','e-h','e-t','e-count','e-waste','e-unitPrice']:profile==='plate'?['e-material','e-length','e-width','e-t','e-count','e-waste','e-unitPrice']:['e-material','e-catalogSize','e-length','e-count','e-waste','e-unitPrice'];
 for(const id of required)assert(root.querySelector(`#${id}`),`${profile}: editor mist ${id}`);
 assert.equal(editorOpens,1,`${profile}: één change-event opent precies één editor`);
 assert.equal(touched.size,0,`${profile}: oude interactiestaat gewist`);
}
assert(!editor.includes("addEventListener('click',event=>{const button=event.target.closest('button[data-profile-type]')"),'oude profielkaart-clicklistener is verwijderd');
assert(!html.includes('data-profile-type'),'oude gedelegeerde buttonlogica is verwijderd');
assert(!html.includes('installMaterialProfileDelegation'),'oude profieldelegatie bestaat niet meer');
assert(!html.includes('goMaterialStep')&&!html.includes('MATERIAL_STEPS'),'oude wizardcode verwijderd');
console.log('materiaal-editor-5 native radio DOM-integratietests geslaagd');
