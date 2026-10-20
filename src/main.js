import './style.css';
import {GameFiles} from './assets.js';
import {Simulation,FixedClock,STUFFS,NAMES,validateSave,fresh} from './model.js';
import {openSaves} from './saves.js';
import {World} from './scene.js';
import {Intro} from './story.js';
import {UPGRADE_KEYS} from './rules.js';

const $=s=>document.querySelector(s),format=value=>{
  if(value===Infinity)return 'MAX';
  const units=['','K','M','B','T','Qa','Qi','Sx','Sp','Oc'];let n=0;while(value>=1000&&n<units.length-1){value/=1000;n++;}
  return value.toLocaleString('en-US',{minimumFractionDigits:n||value<10?2:0,maximumFractionDigits:2})+units[n];
};
let toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3600);}

class Audio {
  constructor(files,state){this.files=files;this.state=state;this.buffers=new Map();}
  async unlock(){this.context||=new AudioContext();await this.context.resume();}
  async buffer(name){if(!this.buffers.has(name))this.buffers.set(name,await this.context.decodeAudioData((await this.files.bytes('audio/'+name+'.wav')).buffer));return this.buffers.get(name);}
  async play(name,loop=false){
    if(!(loop?this.state.music:this.state.sound))return;
    await this.unlock();const buffer=await this.buffer(name);const source=this.context.createBufferSource();source.buffer=buffer;source.loop=loop;
    const gain=this.context.createGain();gain.gain.value=loop?.25:.5;source.connect(gain).connect(this.context.destination);source.start();return source;
  }
  async music(){this.musicSource?.stop();this.musicSource=null;if(this.state.music)this.musicSource=await this.play('(back)Rich_music_2',true);}
}

async function start(){
  const files=await new GameFiles().open();
  await files.loadGroup('core',n=>{$('#progress').value=n;$('#loading-text').textContent=`Loading original resources · ${Math.round(n*100)}%`;});
  const config=await files.json('config.json'),icons=await files.json('ui.json');
  const fonts=await files.json('fonts.json');
  if(fonts['NotoSans-Black']){const font=new FontFace('GameText',`url("${await files.url(fonts['NotoSans-Black'])}")`);await font.load();document.fonts.add(font);}
  let saves,state;
  try{saves=await openSaves();const existing=await saves.read();state=existing?validateSave(existing,config):fresh();}
  catch(error){state=fresh();toast('Save storage is unavailable. Use Export save to keep your progress.');console.warn(error);}
  const sim=new Simulation(config,state);const earned=sim.offline(Date.now());const audio=new Audio(files,state);
  const world=new World($('#world'),files,config,sim);
  $('#loading-text').textContent='Preparing original character animations…';await world.init();
  $('#loading-text').textContent='Loading original introduction…';await files.loadGroup('story',n=>$('#progress').value=n);
  const strings=await files.json('story/ui-en.json'),upgradeIcons=await files.json('story/upgrade-icons.json');
  const intro=new Intro(world,files,()=>{state.introDone=true;save();$('#record').focus({preventScroll:true});});await intro.load();
  $('#intro-next').onclick=()=>intro.advance();$('#intro-skip').onclick=()=>intro.finish();
  const aliases={Money_icon:['Money_icon','cash_icon','money_icon'],Subs_icon:['Subscribers_icon','Subs_icon','Subs_bar_icon'],Styles_icon:['Styles_icon','Style_icon'],Boosters_icon:['Boosters_icon','Upgrade-new_tapInc0_icon','Upgrade-old_tapInc0_icon']};
  async function icon(name){const entry=(aliases[name]||[name]).map(n=>icons[n]).find(Boolean);return entry?files.url(entry.file):null;}
  async function setIcon(img,name){const url=await icon(name);if(url){img.src=url;img.hidden=false;}else img.hidden=true;}
  await Promise.all([...document.querySelectorAll('[data-icon]')].map(img=>setIcon(img,img.dataset.icon)));
  let currentTab=-1;let pendingArea=false;const rows=[];
  function rowsFor(tab){return tab===0?[0,1,2,3,4]:tab===1?[5,6,7,8]:tab===2?[9,10,11]:tab===3?[12,13,14,15,16]:[0,1,7,8,9,12,13,14];}
  async function showPanel(tab){
    currentTab=tab;$('#panel').hidden=false;$('#panel-title').textContent=['Properties','Equipment','Style','Skills','Upgrades'][tab];
    for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('active',Number(b.dataset.tab)===tab);
    rows.length=0;$('#items').replaceChildren();
    for(const id of rowsFor(tab)){
      const item=document.createElement('div');item.className='item';const image=document.createElement('img');image.alt='';
      const details=document.createElement('div');details.className='details';const title=document.createElement('strong');title.textContent=tab===4?strings['upgrade_new_'+UPGRADE_KEYS[id]+'_name']:strings['stuff_'+STUFFS[id].toLowerCase()]||NAMES[id];const small=document.createElement('small');details.append(title,small);
      const button=document.createElement('button');button.setAttribute('aria-label','Upgrade '+title.textContent);
      item.append(image,details,button);$('#items').append(item);rows.push({id,small,button});
      const key=tab===4?upgradeIcons[id]:'Stuff_'+STUFFS[id].toLowerCase().replace('skill','skill_')+'_icon';
      setIcon(image,key).catch(console.warn);
      button.onclick=()=>{if(tab===4?sim.buyUpgrade(id):sim.buy(id)){audio.play('(StuffsScreen_purchase)8_buy').catch(console.warn);world.refreshOutfit();draw();}else toast(tab===4?'Not enough gold.':'Earn more money by tapping or holding.');};
    }draw();
  }
  for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>{const tab=Number(button.dataset.tab);if(currentTab===tab&&!$('#panel').hidden){$('#panel').hidden=true;button.classList.remove('active');}else showPanel(tab);};
  $('#close-panel').onclick=()=>{$('#panel').hidden=true;for(const b of document.querySelectorAll('[data-tab]'))b.classList.remove('active');};
  function draw(){
    $('#money').textContent='$'+format(state.money);$('#gold').textContent=state.gold.toLocaleString('en-US');$('#subs').textContent=state.subs<1000?Math.floor(state.subs).toLocaleString('en-US'):format(state.subs);
    const stage=config.ab17_main_subs.Stages.find(x=>state.subs<x.EndCount)||config.ab17_main_subs.Stages.at(-1);
    $('#subfill').style.width=`${Math.min(100,100*(state.subs-stage.StartCount)/(stage.EndCount-stage.StartCount))}%`;
    $('#battery-fill').style.width=state.battery*100+'%';$('#battery-fill').style.background=state.battery<.2?'#ff7940':'#73da31';
    const rates=sim.rates();$('#passive').textContent='$'+format(rates.passive)+' / sec';$('#tap-rate').textContent='$'+format(rates.tap)+' / tap';
    $('#area-name').textContent=strings['area_name_'+state.area];
    $('#area-progress').textContent=sim.progress>=1?'MOVE!':Math.floor(sim.progress*100)+'%';
    for(const row of rows){const upgraded=currentTab===4,price=upgraded?sim.upgradeCost(row.id):sim.cost(row.id);row.button.textContent=upgraded?(Number.isFinite(price)?price.toLocaleString('en-US')+' gold':'MAX'):'$'+format(price);row.button.disabled=(upgraded?state.gold:state.money)+1e-9<price;row.small.textContent=`Level ${upgraded?state.upgrades[row.id]:state.levels[row.id]}${upgraded?'':' · Tier '+(sim.tier(row.id)+1)}`;}
  }
  let lastEffect=0;
  function pop(amount,x,y){const now=performance.now();if(now-lastEffect<200)return;lastEffect=now;const e=document.createElement('span');e.className='money-pop';e.textContent='+$'+format(amount);e.style.left=x+'px';e.style.top=y+'px';$('#game').append(e);e.addEventListener('animationend',()=>e.remove());}
  function tap(x,y){if(intro.active)return;const amount=sim.tap();if(amount){world.react();audio.play('(Button_tap)tap or open_bar2').catch(console.warn);pop(amount,x,y);}draw();}
  const record=$('#record');
  record.onpointerdown=event=>{event.preventDefault();record.setPointerCapture(event.pointerId);sim.holding=true;const rect=$('#game').getBoundingClientRect();tap(event.clientX-rect.left,event.clientY-rect.top);audio.music().catch(console.warn);};
  const release=()=>{sim.holding=false;};record.onpointerup=release;record.onpointercancel=release;record.onlostpointercapture=release;window.addEventListener('blur',release);
  document.addEventListener('keydown',event=>{if(intro.active){if(['Space','Enter'].includes(event.code)&&!event.repeat){event.preventDefault();intro.advance();}return;}if(event.code==='Space'&&!event.repeat&&!$('#settings-dialog').open){event.preventDefault();sim.holding=true;tap($('#game').clientWidth*.45,$('#game').clientHeight*.55);}});
  document.addEventListener('keyup',event=>{if(event.code==='Space')release();});
  $('#subscribers').onclick=()=>toast(`Next subscriber milestone: ${format(stageEnd())}`);
  function stageEnd(){return config.ab17_main_subs.Stages.find(x=>state.subs<x.EndCount)?.EndCount||config.ab17_main_subs.Stages.at(-1).EndCount;}
  $('#relocate').onclick=async()=>{
    if(pendingArea)return;const previousArea=state.area;if(!sim.relocate()){toast('Upgrade each property, equipment and style item to unlock the next area.');return;}
    pendingArea=true;$('#loading').hidden=false;$('#loading-text').textContent='Loading next area…';
    try{await world.area(state.area,n=>$('#progress').value=n);world.refreshOutfit();await save();}catch(error){state.area=previousArea;toast(error.message);}finally{pendingArea=false;$('#loading').hidden=true;draw();}
  };
  async function save(){
    state.savedAt=Date.now();if(!saves)return false;
    try{await saves.write(state);$('#save-status').textContent='Saved in this browser.';return true;}catch(error){$('#save-status').textContent='Save failed. Export your save to keep progress.';console.warn(error);return false;}
  }
  $('#settings').onclick=()=>{release();$('#sound').checked=state.sound;$('#music').checked=state.music;$('#settings-dialog').showModal();};
  $('#close-settings').onclick=()=>$('#settings-dialog').close();
  $('#replay-intro').onclick=()=>{$('#settings-dialog').close();release();intro.start();$('#intro-next').focus({preventScroll:true});};
  $('#sound').onchange=()=>{state.sound=$('#sound').checked;save();};
  $('#music').onchange=()=>{state.music=$('#music').checked;audio.music().catch(error=>toast(error.message));save();};
  $('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#game').requestFullscreen();}catch{toast('Fullscreen is unavailable in this browser.');}};
  $('#export-save').onclick=async()=>{await save();const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='lamar-browser-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('#import-save').onclick=()=>$('#save-file').click();
  $('#save-file').onchange=async()=>{
    const f=$('#save-file').files[0];if(!f)return;
    try{if(f.size>256000)throw Error('Save file is too large.');const candidate=validateSave(JSON.parse(await f.text()),config);
      // Complete resource loading before replacing the active save.
      await files.loadGroup('area-'+candidate.area);Object.assign(state,candidate);sim.holding=false;sim.idleClock=sim.tickClock=sim.holdClock=0;await world.area(state.area);await save();draw();toast('Save imported.');
    }catch(error){toast(error.message);}finally{$('#save-file').value='';}
  };
  let previous=performance.now(),drawTime=0,gamepadHeld=false;
  const clock=new FixedClock(dt=>{if(!pendingArea){if(!intro.active)sim.step(dt);world.step(dt);intro.step(dt);}});
  function frame(now){
    const delta=(now-previous)/1000;previous=now;
    if(!document.hidden){
      const pad=[...navigator.getGamepads()].find(Boolean);const held=!!pad?.buttons[0]?.pressed;
      if(held&&!gamepadHeld){if(intro.active)intro.advance();else tap($('#game').clientWidth*.45,$('#game').clientHeight*.55);}
      if(held&&!intro.active)sim.holding=true;else if(gamepadHeld)sim.holding=false;gamepadHeld=held;
      clock.advance(delta);world.render();drawTime+=delta;if(drawTime>.1){draw();drawTime=0;}
    }requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange',async()=>{release();if(document.hidden)await save();else{const amount=sim.offline(Date.now());previous=performance.now();clock.accumulator=0;if(amount>.01)toast('Offline income: $'+format(amount));draw();}});
  setInterval(save,5000);window.addEventListener('pagehide',()=>{release();save();});
  // Test access is read-only and intentionally does not expose currency mutation.
  window.gameStatus=()=>({loaded:true,area:state.area,money:state.money,subs:state.subs,battery:state.battery,ticks:state.ticks,levels:[...state.levels],renderer:world.app.renderer.type,originalAnimations:world.hero.spineData.animations.length,introActive:intro.active,introFrame:intro.frame});
  $('#loading').hidden=true;$('#hud').hidden=false;draw();requestAnimationFrame(frame);await save();
  if(!state.introDone){release();intro.start();$('#intro-next').focus({preventScroll:true});}
  if(earned>.01)toast('Welcome back! Offline income: $'+format(earned));
}
start().catch(error=>{console.error(error);$('#loading-text').textContent=error.message;$('#loading-text').classList.add('error');$('#progress').hidden=true;});
