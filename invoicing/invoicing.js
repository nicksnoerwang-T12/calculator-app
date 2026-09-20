/* Offerte/factuur: bouwt op de bestaande klantweergave (customerView) en printlay-out.
   "PDF" blijft de browsers eigen print-naar-PDF, geen bibliotheek nodig. Documentnummers/datums
   worden op de klus zelf bewaard (costState.job) en liften zo automatisch mee op de bestaande
   cloud-sync; het bedrijfsprofiel is een nieuwe, eigen opslagsleutel die is toegevoegd aan
   cloud.js' SETTINGS_KEYS zodat die ook meesynchroniseert. */
const COMPANY_PROFILE_KEY='werkbank.v2.companyProfile';

function assignDocumentNumber(job,type,profile,now){
 now=now||new Date();
 const numberField=type==='factuur'?'factuurNummer':'offerteNummer';
 if(job[numberField])return{job,profile};
 const dateField=type==='factuur'?'factuurDatum':'offerteDatum';
 const dueField=type==='factuur'?'factuurVervaldatum':'offerteGeldigTot';
 const counterField=type==='factuur'?'nextFactuurNummer':'nextOfferteNummer';
 const seq=Number(profile[counterField])||1;
 const year=now.getFullYear();
 const days=Number(type==='factuur'?profile.betaaltermijnDagen:profile.geldigheidsduurDagen)||(type==='factuur'?14:30);
 const due=new Date(now);due.setDate(due.getDate()+days);
 const job2={...job,[numberField]:year+'-'+String(seq).padStart(4,'0'),[dateField]:now.toISOString().slice(0,10),[dueField]:due.toISOString().slice(0,10)};
 const profile2={...profile,[counterField]:seq+1};
 return{job:job2,profile:profile2};
}

function companyProfileGroups(){return[
 ['Bedrijf',[['bedrijfsnaam','Bedrijfsnaam',''],['straat','Straat en huisnummer',''],['postcode','Postcode',''],['plaats','Plaats','']]],
 ['Financieel',[['kvkNummer','KvK-nummer',''],['btwNummer','Btw-nummer',''],['iban','IBAN','']]],
 ['Contact',[['contactEmail','E-mail',''],['contactTelefoon','Telefoon','']]],
 ['Offerte- en factuurinstellingen',[['betaaltermijnDagen','Standaard betaaltermijn (dagen)',14],['geldigheidsduurDagen','Standaard geldigheidsduur offerte (dagen)',30]]]
];}
function companyProfileFields(){return companyProfileGroups().flatMap(([,fields])=>fields);}
function addCompanySettingsCard(){const settings=document.getElementById('design-settings');if(!settings)return;const profile=safeGet(COMPANY_PROFILE_KEY,{});const card=document.createElement('div');card.className='card';card.innerHTML='<h2>Bedrijfsgegevens</h2><p class="muted">Voor op offertes en facturen.</p>'+companyProfileGroups().map(([title,fields])=>'<div class="company-group"><h3>'+esc(title)+'</h3><div class="job-grid">'+fields.map(([key,label,fallback])=>'<div><label for="cp-'+key+'">'+esc(label)+'</label><input id="cp-'+key+'" value="'+esc(profile[key]!=null?profile[key]:fallback)+'"></div>').join('')+'</div></div>').join('')+'<button class="act" id="company-save">Bedrijfsgegevens bewaren</button><p id="company-status" role="status" class="job-status"></p>';settings.appendChild(card);$('company-save').onclick=()=>{const next={};for(const[key]of companyProfileFields())next[key]=$('cp-'+key).value.trim();next.betaaltermijnDagen=Number(next.betaaltermijnDagen)||14;next.geldigheidsduurDagen=Number(next.geldigheidsduurDagen)||30;const existing=safeGet(COMPANY_PROFILE_KEY,{});safeSet(COMPANY_PROFILE_KEY,{...existing,...next});$('company-status').textContent='Bewaard.';};}

function renderDocumentOverlay(type,job,profile){
 const v=saleView(),isFactuur=type==='factuur';
 const overlay=document.createElement('section');overlay.className='job-customer-view';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',isFactuur?'Factuur':'Offerte');
 const companyLines=[profile.bedrijfsnaam,[profile.straat,[profile.postcode,profile.plaats].filter(Boolean).join(' ')].filter(Boolean).join(', '),profile.kvkNummer?'KvK '+profile.kvkNummer:'',profile.btwNummer?'Btw '+profile.btwNummer:'',profile.contactEmail,profile.contactTelefoon].filter(Boolean);
 const number=isFactuur?job.factuurNummer:job.offerteNummer,date=isFactuur?job.factuurDatum:job.offerteDatum,due=isFactuur?job.factuurVervaldatum:job.offerteGeldigTot;
 overlay.innerHTML='<div class="doc-letterhead">'+(companyLines.length?companyLines.map(l=>'<p>'+esc(l)+'</p>').join(''):'<p class="job-error">Vul je bedrijfsgegevens in bij Instellingen voor een volledige '+(isFactuur?'factuur':'offerte')+'.</p>')+'</div><p class="doc-type">'+(isFactuur?'FACTUUR':'OFFERTE')+' · '+esc(number||'')+' · '+esc(date||'')+'</p><h1>'+esc(costState.project||'Je klus')+'</h1><p>'+esc(costState.klant||'')+'</p><p>'+esc(job.location||'')+'</p><p class="customer-copy">'+esc(costState.omschrijving||'')+'</p><div class="customer-price">'+esc(v.ex)+'</div><p>Exclusief btw · '+esc(v.inc)+' inclusief btw</p><p>'+(isFactuur?'Gelieve te betalen vóór '+esc(due||'')+' onder vermelding van factuurnummer '+esc(number||'')+(profile.iban?' op '+esc(profile.iban):'')+'.':'Deze offerte is geldig tot '+esc(due||'')+'.')+'</p><div class="customer-actions"><button class="ghost" id="customer-close">Terug naar klus</button><button class="act" id="customer-print">Print / bewaar PDF</button></div>';
 document.body.append(overlay);
 const wrap=document.querySelector('.wrap');wrap.inert=true;document.body.classList.add('customer-print');
 const close=()=>{wrap.inert=false;document.body.classList.remove('customer-print');overlay.remove();};
 $('customer-close').onclick=close;$('customer-print').onclick=()=>window.print();
 overlay.onkeydown=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){e.preventDefault();(document.activeElement===$('customer-close')?$('customer-print'):$('customer-close')).focus();}};
 $('customer-close').focus();
}

function openDocument(type){readCostInput();renderCostTotals();const v=saleView();if(!v.complete)return;const profile=safeGet(COMPANY_PROFILE_KEY,{});const j=ensureJob();const{job:job2,profile:profile2}=assignDocumentNumber(j,type,profile,new Date());const isNew=job2!==j;costState.job=job2;if(isNew){if(profile2!==profile)safeSet(COMPANY_PROFILE_KEY,profile2);saveCalculation();}renderDocumentOverlay(type,costState.job,profile2);}

const invoicingBaseCost=renderCostPage;
renderCostPage=function(values,message){invoicingBaseCost(values,message);const panel=document.getElementById('panel-overview');if(!panel)return;const customerBtn=$('customer-view');const offerteBtn=document.createElement('button');offerteBtn.className='act';offerteBtn.id='make-offerte';offerteBtn.textContent='Offerte maken';offerteBtn.onclick=()=>openDocument('offerte');const factuurBtn=document.createElement('button');factuurBtn.className='ghost';factuurBtn.id='make-factuur';factuurBtn.textContent='Factuur maken';factuurBtn.onclick=()=>openDocument('factuur');const group=document.createElement('div');group.className='actions no-print';group.append(offerteBtn,factuurBtn);if(customerBtn){customerBtn.className='ghost';group.append(customerBtn);panel.prepend(group);}else{panel.prepend(group);}};

addCompanySettingsCard();
