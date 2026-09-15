'use strict';
const {chromium}=require('playwright'),assert=require('assert'),fs=require('fs');
(async()=>{
 const server=require('http').createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(req.url==='/old'?'design/base-catalogus.html':'werkbank-v2.html'));});
 await new Promise(r=>server.listen(8880,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.WERKBANK_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-gpu']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8880/old');
 const old=await page.evaluate(()=>{
 location.hash='kostprijs';
 const line={...newLine(),profile:'rectTube',material:'s235',dims:{b:50,h:30,t:2,length:1000},count:4,countMode:'project',waste:0,priceBasis:'m',priceMode:'manual',priceOrigin:'own',unitPrice:5.25};
 renderCostPage({...COST_DEFAULTS,project:'Bestaande productiecalculatie',materials:[line]});saveCalculation();
 safeSet(STORE.articlePrices,{fixture:{price:5.25,basis:'m'}});
 return {projects:localStorage.getItem(STORE.calculations),prices:localStorage.getItem(STORE.articlePrices)};
 });
 assert(old.projects);
 await page.goto('http://127.0.0.1:8880/werkbank-v2.html');
 assert.equal(await page.evaluate(()=>localStorage.getItem(STORE.calculations)),old.projects);
 assert.equal(await page.evaluate(()=>localStorage.getItem(STORE.articlePrices)),old.prices);
 await page.click('[data-recent]');assert.match(await page.locator('.line-price strong').innerText(),/21,00/);
 await page.click('#cost-save');await page.reload();await page.click('#project-back');await page.click('[data-recent]');
 assert.match(await page.locator('.line-price strong').innerText(),/21,00/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(STORE.calculations)).length),1);
 assert.deepEqual(errors,[]);console.log('Production upgrade: existing project, own price, snapshot, save and reload passed');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
