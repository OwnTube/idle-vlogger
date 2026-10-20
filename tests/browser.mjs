import {chromium} from 'playwright';import {createServer,preview} from 'vite';import fs from 'node:fs';import assert from 'node:assert/strict';
fs.mkdirSync('.local',{recursive:true});
const production=process.argv.includes('--build');
const server=production?await preview({base:'/idle-vlogger/',preview:{host:'127.0.0.1',port:4173,strictPort:true}}):await createServer({server:{host:'127.0.0.1',port:4173,strictPort:true}});if(!production)await server.listen();
let browser;
const errors=[];const report={};
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1200,height:1000},acceptDownloads:true});const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  report.mode=production?'production build under /idle-vlogger/':'development';
  await page.goto('http://127.0.0.1:4173'+(production?'/idle-vlogger/':'/'));await page.waitForFunction(()=>window.gameStatus?.().loaded,null,{timeout:90000});
  report.initial=await page.evaluate(()=>window.gameStatus());assert.ok(report.initial.originalAnimations>100);
  await page.waitForFunction(()=>window.gameStatus().introActive);
  await page.screenshot({path:'.local/intro-desktop.png'});
  let introSteps=0;
  while((await page.evaluate(()=>window.gameStatus())).introActive){
    assert.ok(++introSteps<40);const frame=(await page.evaluate(()=>window.gameStatus())).introFrame;
    if(frame===22)await page.screenshot({path:'.local/full-intro-harry-desktop.png'});
    await page.locator(await page.locator('#intro-curtain').isVisible()?'#intro-curtain':'#intro-next').click();
  }
  report.originalIntroSteps=introSteps;assert.equal(introSteps,27);
  assert.equal((await page.evaluate(()=>window.gameStatus())).introActive,false);
  await page.screenshot({path:'.local/desktop.png'});
  const record=page.locator('#record');const box=await record.boundingBox();await page.mouse.move(box.x+box.width*.4,box.y+box.height*.45);await page.mouse.down();
  await page.waitForFunction(()=>window.gameStatus().money>=1,null,{timeout:30000});await page.mouse.up();
  await page.locator('[data-tab="0"]').click();await page.getByRole('button',{name:'Upgrade House',exact:true}).click();
  report.purchased=await page.evaluate(()=>window.gameStatus());assert.equal(report.purchased.levels[0],1);
  await page.screenshot({path:'.local/properties-desktop.png'});
  await page.locator('[data-tab="4"]').click();assert.equal(await page.locator('#items .item').count(),8);assert.ok((await page.locator('#items').textContent()).includes('Tap harder!'));await page.screenshot({path:'.local/upgrades-desktop.png'});
  await page.locator('#settings').click();const download=page.waitForEvent('download');await page.locator('#export-save').click();const exported=await download;await exported.saveAs('.local/browser-save.json');
  const save=JSON.parse(fs.readFileSync('.local/browser-save.json'));assert.equal(save.levels[0],1);
  assert.equal(save.introDone,true);
  await page.reload();await page.waitForFunction(()=>window.gameStatus?.().loaded,null,{timeout:90000});report.reloaded=await page.evaluate(()=>window.gameStatus());assert.equal(report.reloaded.levels[0],1);
  await page.locator('#settings').click();await page.locator('#save-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":1}')});await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Invalid'));
  await page.locator('#save-file').setInputFiles('.local/browser-save.json');await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Save imported.');
  await page.locator('#close-settings').click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.local/mobile.png'});
  await page.locator('#settings').click();await page.locator('#intro-version').selectOption('1fast');await page.locator('#replay-intro').click();await page.locator('#intro-next').click();await page.screenshot({path:'.local/intro-mobile.png'});await page.locator('#intro-skip').click();
  await page.setViewportSize({width:1200,height:1000});await page.locator('#settings').click();await page.locator('#intro-version').selectOption('1choices');await page.locator('#replay-intro').click();await page.screenshot({path:'.local/choices-desktop.png'});
  let choiceCount=0,steps=0;
  while((await page.evaluate(()=>window.gameStatus())).introActive){
    assert.ok(++steps<100);const options=page.locator('#intro-choices button');
    if(await options.count()){choiceCount++;if(choiceCount===3)await page.screenshot({path:'.local/choices-harry-desktop.png'});await options.last().click();}
    else await page.locator(await page.locator('#intro-curtain').isVisible()?'#intro-curtain':'#intro-next').click();
  }
  assert.equal(choiceCount,3);report.storyChoices=(await page.evaluate(()=>window.gameStatus())).storyVariables;
  assert.deepEqual(report.storyChoices,{intro_van_response:'joke_about_it',intro_phone_plan:'mafia',intro_harry_negotiation:'pressure'});
  await page.locator('#settings').click();const storyDownload=page.waitForEvent('download');await page.locator('#export-save').click();await (await storyDownload).saveAs('.local/browser-story-save.json');
  assert.deepEqual(JSON.parse(fs.readFileSync('.local/browser-story-save.json')).storyVars,report.storyChoices);
  await page.reload();await page.waitForFunction(()=>window.gameStatus?.().loaded,null,{timeout:90000});assert.deepEqual((await page.evaluate(()=>window.gameStatus())).storyVariables,report.storyChoices);
  assert.deepEqual(errors,[]);report.errors=errors;report.passed=true;console.log(JSON.stringify(report,null,2));
}catch(error){report.passed=false;report.error=error.stack;report.errors=errors;console.error(JSON.stringify(report,null,2));process.exitCode=1;}
finally{fs.writeFileSync('.local/browser-report.json',JSON.stringify(report,null,2));await browser?.close();if(production)await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));else await server.close();}
