'use strict';
const {chromium}=require('playwright'),assert=require('assert'),fs=require('fs');
(async()=>{
 const server=require('http').createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(process.env.WERKBANK_PAGE||'werkbank-design-preview.html'));});await new Promise(r=>server.listen(8878,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.WERKBANK_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const failures=[];
 for(const width of [320,390,430,1280])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:width<700,deviceScaleFactor:1,colorScheme:theme});
  const page=await context.newPage();page.setDefaultTimeout(7000);console.log('Viewport',width,theme);page.on('pageerror',e=>failures.push(e.message));
  await page.goto('http://127.0.0.1:8878/werkbank-design-preview.html');
  await page.selectOption('#theme',theme);
  async function check(name){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${name} overflow at ${width} ${theme}`);assert.equal(await page.locator('#runtime-error').isVisible(),false);const duplicates=await page.locator('[id]').evaluateAll(nodes=>{const ids=nodes.map(n=>n.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);});assert.deepEqual(duplicates,[],`${name} duplicate ids`);if(width===390)await page.screenshot({path:`design/screenshots/${theme}-${name}.png`,fullPage:false});}
  await check('home');await page.click('#design-new');await page.fill('#c-project','Frame werktafel');await page.click('#add-material');await check('picker');
  await page.locator('.profile-card').filter({has:page.locator('input[value="rectTube"]')}).click();
  assert.equal(await page.locator('#e-material').count(),1);
  const label=page.locator('#catalog-choices label').filter({hasText:'50 × 30 × 2 mm'}).first();await label.click();
  await page.fill('#e-length','1000');await page.fill('#e-count','4');await check('editor');
  if(await page.locator('#editor-save').isDisabled())console.log(await page.evaluate(()=>({draft:activeMaterialEditor.state.draft,errors:validateLine(activeMaterialEditor.state.draft,1)})));
  await page.click('#editor-save');await page.waitForSelector('.editor-backdrop',{state:'detached'});await check('materials');
  await page.click('#cost-save');await page.click('#cost-save');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(STORE.calculations)).length),1);
  await page.click('[data-edit]');await page.fill('#e-unitPrice','5,25');await page.click('#editor-save');assert.match(await page.locator('.line-price strong').innerText(),/21,00/);
  await page.click('#cost-save');await page.reload();await page.click('#project-back');await page.click('[data-recent]');if(!await page.locator('.line-price strong').count())console.log(await page.evaluate(()=>({dirty:currentDirty(),state:costState,clean:cleanProject,errors:document.querySelector('#runtime-error').textContent})));assert.match(await page.locator('.line-price strong').innerText(),/21,00/);
  await page.click('#tab-labor');await page.fill('#c-productionHours','2');await page.fill('#c-hourlyRate','50');await page.click('#tab-overview');await check('overview');
  await page.click('#tab-materials');await page.click('[data-copy]');assert.equal(await page.locator('.material-card').count(),2);await page.locator('[data-remove]').last().click();await page.locator('.toast button').click();assert.equal(await page.locator('.material-card').count(),2);
  await page.click('#project-back');await page.click('[data-route="tools"]');await page.fill('#q','onvindbaar');assert(await page.locator('#noresult').isVisible());await page.fill('#q','gewicht');await check('tools');
  await context.close();
 }
 assert.deepEqual(failures,[]);await browser.close();server.close();console.log('Browser: 320/390/430/1280 × light/dark, no overflow/duplicate IDs/page errors; edit/save/reload/duplicate/undo/search passed.');
})().catch(e=>{console.error(e);process.exit(1);});
