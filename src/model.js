// Asset values are original. Formula reconstruction is provisional: see docs/PARITY.md.
import {NativeRules} from './rules.js';
export const STUFFS=['House','Car','Road','Yard','Statue','Cam','Tripod','Mic','Light','Clothes','Hair','Watch','Skill0','Skill1','Skill2','Skill3','Skill4'];
export const NAMES=['House','Car','Road','Yard','Statue','Camera','Tripod','Microphone','Lighting','Clothes','Haircut','Watch','Acting','Storytelling','Editing','Charisma','Creativity'];
export const fresh = ()=>({version:1,area:0,money:0,totalMoney:0,gold:0,subs:0,levels:Array(17).fill(0),upgrades:Array(16).fill(0),battery:1,ticks:0,savedAt:Date.now(),sound:true,music:false,introDone:false});
export function validateSave(input,config){
  if(!input||input.version!==1)throw Error('This file is not a supported browser save.');
  for(const key of ['money','totalMoney','subs','ticks'])if(!Number.isFinite(input[key])||input[key]<0||input[key]>1e300)throw Error(`Invalid ${key} in save.`);
  if(input.gold!==undefined&&(!Number.isSafeInteger(input.gold)||input.gold<0))throw Error('Invalid gold in save.');
  if(!Number.isInteger(input.area)||input.area<0||input.area>7)throw Error('Invalid area in save.');
  for(const [key,length,max] of [['levels',17,600],['upgrades',16,1000]])
    if(!Array.isArray(input[key])||input[key].length!==length||input[key].some(v=>!Number.isInteger(v)||v<0||v>max))throw Error(`Invalid ${key} in save.`);
  if(!Number.isFinite(input.savedAt)||input.savedAt<0||input.savedAt>Date.now()+60000)throw Error('Invalid save timestamp.');
  if(!Number.isFinite(input.battery)||input.battery<0||input.battery>1)throw Error('Invalid battery in save.');
  if(config&&input.upgrades.some((n,i)=>n>config.ab17_main_upgrades._all[i].LvlsCount))throw Error('Upgrade exceeds its maximum level.');
  const result=fresh();for(const key of Object.keys(result))if(Object.hasOwn(input,key))result[key]=structuredClone(input[key]);
  result.sound=!!input.sound;result.music=!!input.music;result.introDone=input.introDone===true;return result;
}
export class Simulation {
  constructor(config,state=fresh()) {this.c=config;this.s=state;this.rules=new NativeRules(config);this.holding=false;this.holdClock=0;this.idleClock=0;this.tickClock=0;}
  get areaConfig(){return this.c.ab17_main_area;}
  get stuffConfig(){return this.c.ab17_main_stuffs;}
  tier(id){const local=this.s.levels[id]-this.s.area*this.areaConfig.LvlsInArea;const limits=this.s.area===0?this.areaConfig.VisualTierThresholdsArea0:[25,50];return Math.min(2,limits.filter(v=>local>=v).length);}
  cost(id){
    const level=this.s.levels[id];if(level>=this.rules.maxLevel)return Infinity;
    return this.rules.cost(level+1,this.upgradeValue(14));
  }
  rates(){
    const c=this.stuffConfig;let tap=.01,passive=.01;
    this.s.levels.forEach((level,id)=>{
      const type=id<5?0:id<9?1:id<12?2:3;
      const total=this.rules.income(level)/17;
      const ratio=c.IncomeTapRatios[type];tap+=total*ratio;passive+=total*(1-ratio);
    });
    return {tap:tap*this.upgradeValue(1)*this.upgradeValue(13),passive:passive*this.upgradeValue(0)*this.upgradeValue(12)};
  }
  earn(amount){if(!Number.isFinite(amount)||amount<0)throw Error('Invalid income');this.s.money+=amount;this.s.totalMoney+=amount;}
  tap(){if(this.s.battery<=0)return 0;const amount=this.rates().tap;this.earn(amount);this.s.battery=Math.max(0,this.s.battery-.001);this.idleClock=0;return amount;}
  buy(id){const price=this.cost(id);if(this.s.money+1e-9<price)return false;this.s.money=Math.max(0,this.s.money-price);this.s.levels[id]++;return true;}
  upgradeValue(id){return this.rules.upgradeValue(id,this.s.upgrades[id]);}
  upgradeCost(id){const config=this.c.ab17_main_upgrades._all[id],level=this.s.upgrades[id];return level>=config.LvlsCount?Infinity:this.rules.upgradeCost(id,level);}
  buyUpgrade(id){const price=this.upgradeCost(id);if(this.s.gold<price)return false;this.s.gold-=price;this.s.upgrades[id]++;return true;}
  get progress(){return Math.min(1,Math.min(...this.s.levels.slice(0,12).map(l=>(l-this.s.area*75)/75)));}
  relocate(){if(this.progress<1||this.s.area>=7)return false;this.s.area++;return true;}
  step(dt){
    this.s.ticks++;this.idleClock+=dt;this.tickClock+=dt;
    const duration=this.c.ab17_main_money.HoldDurationMax*this.upgradeValue(8);
    if(this.holding&&this.s.battery>0){this.holdClock+=dt;const gap=this.c.ab17_main_money.SecsBetweenTapInHold;while(this.holdClock>=gap){this.holdClock-=gap;this.tap();}this.s.battery=Math.max(0,this.s.battery-dt/duration);}
    else {this.holdClock=0;if(this.idleClock>=this.c.ab17_main_money.HoldDelayBeforeRestore)this.s.battery=Math.min(1,this.s.battery+dt*this.c.ab17_main_money.HoldRestoreFasterThanSpendK*this.upgradeValue(7)/duration);}
    if(this.tickClock>=1){this.tickClock-=1;this.earn(this.rates().passive);const stages=this.c.ab17_main_subs.Stages;const stage=stages.find(x=>this.s.subs<x.EndCount)||stages.at(-1);this.s.subs+=stage.DeltaPerSec*this.upgradeValue(9);}
  }
  offline(now){const seconds=Math.max(0,Math.min(4*3600,(now-this.s.savedAt)/1000));const amount=seconds*this.rates().passive;this.earn(amount);this.s.savedAt=now;return amount;}
}
export class FixedClock {
  constructor(step,hz=60){this.tick=1/hz;this.accumulator=0;this.step=step;}
  advance(seconds){this.accumulator+=Math.max(0,Math.min(.25,seconds));let n=0;while(this.accumulator+1e-10>=this.tick){this.step(this.tick);this.accumulator-=this.tick;n++;}return n;}
}
