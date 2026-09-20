/* Cloud-sync laag (Supabase): accounts + synchronisatie tussen apparaten. Bouwt bovenop de
   bestaande localStorage-laag (safeGet/safeSet/storageAdapter) zonder die te vervangen: elke
   lokale schrijfactie blijft de bron van waarheid voor de huidige sessie/rendering, en wordt
   op de achtergrond ook naar Supabase gestuurd. Werkt zonder account/verbinding gewoon lokaal door. */
const SUPABASE_URL = 'https://ncpblnepouhyxdbufesk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Msaq4_2iE-flesOQq_9Nrg_jYekSM_S';
function cloudConfigured(){return typeof SUPABASE_URL==='string'&&SUPABASE_URL.startsWith('http')&&typeof SUPABASE_ANON_KEY==='string'&&SUPABASE_ANON_KEY.length>20;}
function cloudReady(){return cloudConfigured()&&typeof window.supabase!=='undefined';}
const supabaseClient=cloudReady()?window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY):null;
if(supabaseClient)supabaseClient.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY')renderPasswordResetForm();});

function createCloudAdapter(client){return{
 async push(table,rows){if(!rows.length)return{ok:true};const{error}=await client.from(table).upsert(rows);return error?{ok:false,error}:{ok:true};},
 async pullAll(table){const{data,error}=await client.from(table).select('*');return error?{ok:false,error,value:[]}:{ok:true,value:data||[]};},
 async remove(table,id){const{error}=await client.from(table).delete().eq('id',id);return error?{ok:false,error}:{ok:true};}
};}
const cloudAdapter=supabaseClient?createCloudAdapter(supabaseClient):null;

const SETTINGS_KEYS=[STORE.prices,STORE.priceDate,STORE.theme,STORE.favorites,STORE.articlePrices,'werkbank.v2.companyProfile'];
const SYNC_QUEUE_KEY='werkbank.v2.syncQueue';
let cloudSession=null,syncBusy=false;
const rawSafeSet=safeSet;

function setSyncStatus(state,detail){const el=$('cloud-sync-status');if(!el)return;el.dataset.state=state;el.textContent=detail||{local:'Alleen lokaal opgeslagen',syncing:'Synchroniseren…',synced:'Gesynchroniseerd',offline:'Offline — wordt bijgewerkt zodra je weer online bent',error:'Synchroniseren mislukt, probeer het later opnieuw'}[state]||state;}

function queueRetry(entry){const list=safeGet(SYNC_QUEUE_KEY,[]);list.push(entry);rawSafeSet(SYNC_QUEUE_KEY,list.slice(-20));}
async function flushRetryQueue(){if(!cloudAdapter||!cloudSession)return;const list=safeGet(SYNC_QUEUE_KEY,[]);if(!list.length)return;rawSafeSet(SYNC_QUEUE_KEY,[]);for(const entry of list){if(entry==='projects')await syncProjects();else if(entry==='customers')await syncCustomers();else if(entry==='settings')await syncSettings();}}

async function syncProjects(){if(!cloudAdapter||!cloudSession)return;const list=safeGet(STORE.calculations,[]);const rows=list.map(entry=>({id:entry.id,user_id:cloudSession.user.id,customer_id:(entry.data&&entry.data.job&&entry.data.job.customerId)||null,title:(entry.data&&entry.data.project)||null,updated_at:entry.datum||new Date().toISOString(),data:entry}));setSyncStatus('syncing');const r=await cloudAdapter.push('projects',rows);if(r.ok)setSyncStatus('synced');else{setSyncStatus('offline');queueRetry('projects');}}
async function syncCustomers(){if(!cloudAdapter||!cloudSession)return;const list=safeGet(CUSTOMER_KEY,[]);const rows=list.map(c=>({id:c.id,user_id:cloudSession.user.id,name:c.name,contact:c.contact||'',email:c.email||'',phone:c.phone||'',updated_at:new Date().toISOString()}));setSyncStatus('syncing');const r=await cloudAdapter.push('customers',rows);if(r.ok)setSyncStatus('synced');else{setSyncStatus('offline');queueRetry('customers');}}
async function syncSettings(){if(!cloudAdapter||!cloudSession)return;const data={};for(const key of SETTINGS_KEYS)data[key]=safeGet(key,null);setSyncStatus('syncing');const r=await cloudAdapter.push('user_settings',[{user_id:cloudSession.user.id,data,updated_at:new Date().toISOString()}]);if(r.ok)setSyncStatus('synced');else{setSyncStatus('offline');queueRetry('settings');}}

safeSet=function(key,value){const ok=rawSafeSet(key,value);if(ok&&cloudAdapter&&cloudSession){if(key===STORE.calculations)syncProjects();else if(key===CUSTOMER_KEY)syncCustomers();else if(SETTINGS_KEYS.includes(key))syncSettings();}return ok;};

function mergeProjectRows(localList,cloudRows){const byId={};for(const entry of localList)byId[entry.id]={entry,ts:entry.datum||'1970-01-01'};for(const row of cloudRows){const entry=row.data;if(!entry||!entry.id)continue;const existing=byId[entry.id];if(!existing||new Date(row.updated_at)>new Date(existing.ts))byId[entry.id]={entry,ts:row.updated_at};}return Object.values(byId).sort((a,b)=>new Date(b.ts)-new Date(a.ts)).map(x=>x.entry);}
function mergeCustomerRows(localList,cloudRows){const byId={};for(const c of localList)byId[c.id]=c;for(const row of cloudRows)byId[row.id]={id:row.id,name:row.name,contact:row.contact||'',email:row.email||'',phone:row.phone||''};return Object.values(byId);}
function mergeSettingsValues(localValues,cloudData){const merged={...localValues};if(!cloudData)return merged;for(const key of Object.keys(localValues))if(localValues[key]===null&&cloudData[key]!==undefined&&cloudData[key]!==null)merged[key]=cloudData[key];return merged;}

function mergeProjects(rows){const merged=mergeProjectRows(safeGet(STORE.calculations,[]),rows);rawSafeSet(STORE.calculations,merged);return merged;}
function mergeCustomers(rows){const merged=mergeCustomerRows(safeGet(CUSTOMER_KEY,[]),rows);rawSafeSet(CUSTOMER_KEY,merged);return merged;}
function mergeSettings(row){const localValues={};for(const key of SETTINGS_KEYS)localValues[key]=safeGet(key,null);const merged=mergeSettingsValues(localValues,row&&row.data);for(const key of SETTINGS_KEYS)if(merged[key]!==localValues[key])rawSafeSet(key,merged[key]);}

// Abonnementsstatus staat bewust NIET in user_settings: die tabel mag de gebruiker zelf volledig
// overschrijven (RLS: eigen rijen), en dat zou een manier zijn om zelf "actief abonnement" te
// verzinnen zonder te betalen. subscriptions heeft alleen een select-policy voor de eigen rij —
// schrijven kan alleen via de Mollie-webhook Edge Function met de service-role-sleutel (die RLS
// omzeilt). Zie paywall/README.md en supabase/functions/mollie-webhook.
const SUBSCRIPTION_CACHE_KEY='werkbank.v2.subscriptionCache';
async function pullSubscription(){if(!cloudAdapter||!cloudSession)return;const r=await cloudAdapter.pullAll('subscriptions');if(r.ok)rawSafeSet(SUBSCRIPTION_CACHE_KEY,r.value[0]||{status:'none'});}

async function pullAndMerge(){if(!cloudAdapter||!cloudSession)return;setSyncStatus('syncing');try{const[p,c,s]=await Promise.all([cloudAdapter.pullAll('projects'),cloudAdapter.pullAll('customers'),cloudAdapter.pullAll('user_settings')]);if(!p.ok||!c.ok||!s.ok)throw(p.error||c.error||s.error);mergeProjects(p.value);mergeCustomers(c.value);mergeSettings(s.value[0]);await pullSubscription();await Promise.all([syncProjects(),syncCustomers(),syncSettings()]);await flushRetryQueue();setSyncStatus('synced');}catch(e){setSyncStatus('offline');}}

function showWrap(show){const wrap=document.querySelector('.wrap');if(wrap)wrap.hidden=!show;const nav=document.querySelector('.bottom-nav');if(nav)nav.hidden=!show;}
function authError(msg){const el=$('auth-error');if(el)el.textContent=msg||'';}
function renderAuthGate(mode,message){mode=mode||'signin';let gate=$('auth-gate');if(!gate){gate=document.createElement('div');gate.id='auth-gate';document.body.appendChild(gate);}
 gate.innerHTML='<div class="job-panel"><h1>Werkbank</h1><p class="muted">'+(mode==='signup'?'Maak een account om je klussen op al je apparaten te gebruiken.':'Log in om verder te gaan met je klussen en klanten.')+'</p><label for="auth-email">E-mailadres</label><input id="auth-email" type="email" autocomplete="email"><label for="auth-password">Wachtwoord</label><input id="auth-password" type="password" autocomplete="'+(mode==='signup'?'new-password':'current-password')+'"><p id="auth-error" class="job-error" role="status">'+esc(message||'')+'</p><div class="auth-actions"><button class="act" id="auth-submit">'+(mode==='signup'?'Account aanmaken':'Inloggen')+'</button></div><div class="auth-toggle"><button id="auth-toggle-mode">'+(mode==='signup'?'Heb je al een account? Inloggen':'Nog geen account? Account aanmaken')+'</button></div>'+(mode==='signin'?'<div class="auth-toggle"><button id="auth-forgot">Wachtwoord vergeten?</button></div>':'')+(cloudConfigured()?'':'<p class="job-error">Cloud-sync is nog niet gekoppeld (ontbrekende projectsleutels). Werk voorlopig lokaal door.</p>')+'</div>';
 $('auth-toggle-mode').onclick=()=>renderAuthGate(mode==='signup'?'signin':'signup');
 if($('auth-forgot'))$('auth-forgot').onclick=async()=>{const email=$('auth-email').value.trim();if(!email){authError('Vul eerst je e-mailadres in, dan sturen we een resetlink.');return;}$('auth-forgot').disabled=true;try{const{error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;authError('Reset-link verstuurd naar '+email+'. Open de link in je mail om een nieuw wachtwoord in te stellen.');}catch(e){authError(e.message||'Aanvragen van reset-link mislukt.');}finally{if($('auth-forgot'))$('auth-forgot').disabled=false;}};
 $('auth-submit').onclick=async()=>{authError('');const email=$('auth-email').value.trim(),password=$('auth-password').value;if(!email||!password){authError('Vul een e-mailadres en wachtwoord in.');return;}$('auth-submit').disabled=true;
  try{
   if(mode==='signup'){const{data,error}=await supabaseClient.auth.signUp({email,password});if(error)throw error;if(!data.session){renderAuthGate('signin','Account aangemaakt. Bevestig je e-mail via de link die we gestuurd hebben en log daarna in.');return;}cloudSession=data.session;}
   else{const{data,error}=await supabaseClient.auth.signInWithPassword({email,password});if(error)throw error;cloudSession=data.session;}
   $('auth-gate').remove();showWrap(true);addCloudSettingsCard();await pullAndMerge();routeHash();
  }catch(e){authError(e.message||'Inloggen mislukt.');}
  finally{const btn=$('auth-submit');if(btn)btn.disabled=false;}
 };
 queueMicrotask(()=>$('auth-email')?.focus());
}

function renderPasswordResetForm(){showWrap(false);let gate=$('auth-gate');if(!gate){gate=document.createElement('div');gate.id='auth-gate';document.body.appendChild(gate);}
 gate.innerHTML='<div class="job-panel"><h1>Nieuw wachtwoord</h1><p class="muted">Kies een nieuw wachtwoord voor je Werkbank-account.</p><label for="reset-password">Nieuw wachtwoord</label><input id="reset-password" type="password" autocomplete="new-password"><p id="auth-error" class="job-error" role="status"></p><div class="auth-actions"><button class="act" id="reset-submit">Wachtwoord instellen</button></div></div>';
 $('reset-submit').onclick=async()=>{authError('');const password=$('reset-password').value;if(!password||password.length<6){authError('Kies een wachtwoord van minimaal 6 tekens.');return;}$('reset-submit').disabled=true;
  try{const{error}=await supabaseClient.auth.updateUser({password});if(error)throw error;
   const{data}=await supabaseClient.auth.getSession();cloudSession=data.session;
   $('auth-gate').remove();showWrap(true);addCloudSettingsCard();await pullAndMerge();routeHash();
  }catch(e){authError(e.message||'Wachtwoord instellen mislukt.');}
  finally{const btn=$('reset-submit');if(btn)btn.disabled=false;}
 };
 queueMicrotask(()=>$('reset-password')?.focus());
}

function addCloudSettingsCard(){const settings=document.getElementById('design-settings');if(!settings)return;const card=document.createElement('div');card.className='card';card.innerHTML='<h2>Account & synchronisatie</h2><p id="cloud-account-email" class="muted"></p><p><span class="sync-status" id="cloud-sync-status" data-state="local">Alleen lokaal opgeslagen</span></p>'+(cloudSession?'<button class="ghost" id="cloud-logout">Uitloggen</button>':'<button class="act" id="cloud-login">Inloggen of account aanmaken</button>');settings.appendChild(card);if(cloudSession){$('cloud-account-email').textContent=cloudSession.user.email;$('cloud-logout').onclick=async()=>{await supabaseClient.auth.signOut();location.reload();};}else{$('cloud-login').onclick=()=>{showWrap(false);renderAuthGate('signin');};}}

// Gratis kijkversie: zonder account werkt de hele app lokaal door (rekentools, klussen, de
// volledige snelprijs-/kostprijsflow) — dat is precies het "local-only"-gedrag van vóór de
// cloud-sync-laag, nu bewust weer het standaardpad voor bezoekers zonder account. Alleen de
// uiteindelijke prijs zelf wordt (door de paywall-laag, ná deze) verborgen tot een actief
// abonnement; het inlogscherm verschijnt dus niet meer automatisch bij het opstarten, alleen nog
// als de bezoeker zelf op "Inloggen" of op de prijs-lock klikt.
function enterGuestMode(){showWrap(true);addCloudSettingsCard();routeHash();}

(async function bootCloud(){
 if(!cloudReady()){addCloudSettingsCard();showWrap(true);routeHash();return;}
 const looksLoggedIn=Object.keys(localStorage).some(k=>/^sb-.*-auth-token$/.test(k));
 if(!looksLoggedIn){enterGuestMode();return;}
 try{
  const{data}=await supabaseClient.auth.getSession();
  cloudSession=data.session;
  if(!cloudSession){enterGuestMode();return;}
  addCloudSettingsCard();
  window.addEventListener('online',flushRetryQueue);
  await pullAndMerge();
  routeHash();
 }catch(e){enterGuestMode();}
})();
