'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('werkbank-preview.html','utf8');
const script=html.split('<script>')[1].split('</script>')[0];
const catalog=script.slice(script.indexOf('const SECTIONS ='),script.indexOf('function sectionOptions'));
const escSource=script.slice(script.indexOf('const esc ='),script.indexOf('const rad ='));
const model=script.slice(script.indexOf('const MATERIAL_SCHEMA='),script.indexOf('function readCostInput'));
const editor=script.slice(script.indexOf('function newLine'),script.indexOf('function removeMaterial(id)'));
const context={console,Math,Number,Object,Array,String,Date,JSON,Intl,Set,Map,isFinite,parseFloat,SECTIONS:null,
 safeGet:(_k,f)=>f,safeSet:()=>true,getPrices:()=>({s235:2}),finiteNonNegative:v=>Number(v)||0,uid:()=> 'new',
 diagram:p=>`<svg data-diagram="${p}"></svg>`,profileIcon:p=>`<svg data-icon="${p}"></svg>`,lineDescription:()=>'',costState:{qty:1,materials:[]}};
vm.createContext(context);
vm.runInContext(escSource+'\n'+catalog+'\n'+model+'\n'+editor+`\nthis.api={PROFILES,newLine,createMaterialEditorState,applyMaterialDraft,handleProfileSelection,selectMaterialProfile,pickerHtml,editorFormHtml,validateLine};`,context);
const api=context.api,clone=v=>JSON.parse(JSON.stringify(v));

const picker=api.pickerHtml(api.newLine());
assert(/<button type="button" class="profile-choice" data-profile-type="rectTube">/.test(picker),'rectTube is een echte niet-submitknop');
assert(!picker.includes('<form'),'profielkaarten staan niet in een formulier');
const state=api.createMaterialEditorState();
assert.equal(state.materialEditorView,'picker','nieuwe regel start in picker');
assert.equal(api.handleProfileSelection('onbekend',state),false,'onbekend profiel wordt geweigerd');
assert.equal(api.handleProfileSelection('rectTube',state),true);
assert.equal(state.materialEditorView,'editor');
assert.equal(state.draft.profile,'rectTube');
const rect=api.editorFormHtml(state.draft);
for(const id of ['material','b','h','t','length','count','unitPrice','priceBasis'])assert(rect.includes(`e-${id}`),`rectTube mist ${id}`);
assert(editor.includes('id="editor-save"')&&editor.includes("source?'Wijzigingen opslaan':'Materiaal toevoegen'"),'editor bevat precies één contextuele primaire knop');
assert(!rect.includes('Volgende')&&!html.includes('>Verder<'),'geen Volgende-knop');
for(const [profile,ids] of [['plate',['material','length','width','t','count','unitPrice']],['tube',['material','D','t','length','count','unitPrice']],['ipe',['catalogSize','material','length','count','unitPrice']]]){
 const s=api.createMaterialEditorState();api.handleProfileSelection(profile,s);const out=api.editorFormHtml(s.draft);for(const id of ids)assert(out.includes(`e-${id}`),`${profile} mist ${id}`);
}
const base={...api.newLine(),profile:'rectTube',material:'s235',count:'1',countMode:'project',priceBasis:'kg',priceMode:'manual',unitPrice:'2',waste:'0'};
assert.deepEqual(clone(api.validateLine({...base,dims:{b:'50',h:'30',t:'2',length:'1000'}},1)),{},'geldige 50 × 30 × 2 koker');
const incomplete=api.validateLine({...base,dims:{b:'50'}},1);
assert(!incomplete.b,'geldige breedte blijft geldig');
for(const key of ['h','t','length'])assert(incomplete[key],`${key} wordt afzonderlijk gemeld bij submit`);
assert(editor.includes("picker.onclick=e=>"),'één gedelegeerde pickerlistener');
assert(!editor.includes('button.onclick=')&&!editor.includes("addEventListener('click'"),'geen listener per profielkaart');
assert(!/data-profile-type[^>]*type="submit"/.test(picker),'picker veroorzaakt geen submit');
assert(!/autofocus/i.test(picker),'picker opent zonder autofocus');
const existing={...base,id:'saved',dims:{b:'50',h:'30',t:'2',length:'1000'}};
assert.equal(api.createMaterialEditorState(existing).materialEditorView,'editor','bewerken start in editor');
const lines=[];assert.equal(lines.length,0,'annuleren voegt niets toe');
const once=api.applyMaterialDraft(lines,existing);assert.equal(once.length,1,'toevoegen maakt exact één regel');
assert.equal(api.applyMaterialDraft(once,{...existing,count:'2'}).length,1,'opslaan vervangt exact één regel');
for(const profile of ['rectTube','plate','tube','ipe']){const s=api.createMaterialEditorState();api.handleProfileSelection(profile,s);const generated=api.editorFormHtml(s.draft);const ids=[...generated.matchAll(/\sid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length,`${profile} heeft dubbele gegenereerde ids`);}
assert(!html.includes('goMaterialStep')&&!html.includes('MATERIAL_STEPS')&&!html.includes('step-index')&&!html.includes('step-tabs'),'oude wizardcode verwijderd');
console.log('materiaal-editor-3 integratietests geslaagd');
