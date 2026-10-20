import {chromium} from 'playwright';import {createServer} from 'vite';import fs from 'node:fs';import assert from 'node:assert/strict';
fs.mkdirSync('.local',{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:4173}});await server.listen();
let browser;
const errors=[];const report={};
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1200,height:1000},acceptDownloads:true});const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>window.gameStatus?.().loaded,null,{timeout:90000});
  report.initial=await page.evaluate(()=>window.gameStatus());assert.ok(report.initial.originalAnimations>100);
  await page.screenshot({path:'.local/desktop.png'});
  const record=page.locator('#record');const box=await record.boundingBox();await page.mouse.move(box.x+box.width*.4,box.y+box.height*.45);await page.mouse.down();
  await page.waitForFunction(()=>window.gameStatus().money>=1,null,{timeout:30000});await page.mouse.up();
  await page.locator('[data-tab="0"]').click();await page.getByRole('button',{name:'Upgrade House',exact:true}).click();
  report.purchased=await page.evaluate(()=>window.gameStatus());assert.equal(report.purchased.levels[0],1);
  await page.locator('#settings').click();const download=page.waitForEvent('download');await page.locator('#export-save').click();const exported=await download;await exported.saveAs('.local/browser-save.json');
  const save=JSON.parse(fs.readFileSync('.local/browser-save.json'));assert.equal(save.levels[0],1);
  await page.reload();await page.waitForFunction(()=>window.gameStatus?.().loaded,null,{timeout:90000});report.reloaded=await page.evaluate(()=>window.gameStatus());assert.equal(report.reloaded.levels[0],1);
  await page.locator('#settings').click();await page.locator('#save-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":1}')});await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Invalid'));
  await page.locator('#save-file').setInputFiles('.local/browser-save.json');await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Save imported.');
  await page.locator('#close-settings').click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.local/mobile.png'});
  assert.deepEqual(errors,[]);report.errors=errors;report.passed=true;console.log(JSON.stringify(report,null,2));
}catch(error){report.passed=false;report.error=error.stack;report.errors=errors;console.error(JSON.stringify(report,null,2));process.exitCode=1;}
finally{fs.writeFileSync('.local/browser-report.json',JSON.stringify(report,null,2));await browser?.close();await server.close();}
