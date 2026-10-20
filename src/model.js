// Asset values are original. Formula reconstruction is provisional: see docs/PARITY.md.
export const STUFFS=['House','Car','Road','Yard','Statue','Cam','Tripod','Mic','Light','Clothes','Hair','Watch','Skill0','Skill1','Skill2','Skill3','Skill4'];
export const NAMES=['House','Car','Road','Yard','Statue','Camera','Tripod','Microphone','Lighting','Clothes','Haircut','Watch','Acting','Storytelling','Editing','Charisma','Creativity'];
export const fresh = ()=>({version:1,area:0,money:0,totalMoney:0,subs:0,levels:Array(17).fill(0),upgrades:Array(16).fill(0),battery:1,ticks:0,savedAt:Date.now(),sound:true,music:false});
export function validateSave(input,config){
  if(!input||input.version!==1)throw Error('This file is not a supported browser save.');
  for(const key of ['money','totalMoney','subs','ticks'])if(!Number.isFinite(input[key])||input[key]<0||input[key]>1e300)throw Error(`Invalid ${key} in save.`);
  if(!Number.isInteger(input.area)||input.area<0||input.area>7)throw Error('Invalid area in save.');
  for(const [key,length,max] of [['levels',17,600],['upgrades',16,1000]])
    if(!Array.isArray(input[key])||input[key].length!==length||input[key].some(v=>!Number.isInteger(v)||v<0||v>max))throw Error(`Invalid ${key} in save.`);
  if(!Number.isFinite(input.savedAt)||input.savedAt<0||input.savedAt>Date.now()+60000)throw Error('Invalid save timestamp.');
  if(!Number.isFinite(input.battery)||input.battery<0||input.battery>1)throw Error('Invalid battery in save.');
  if(config&&input.upgrades.some((n,i)=>n>config.ab17_main_upgrades._all[i].LvlsCount))throw Error('Upgrade exceeds its maximum level.');
  const result=fresh();for(const key of Object.keys(result))if(Object.hasOwn(input,key))result[key]=structuredClone(input[key]);
  result.sound=!!input.sound;result.music=!!input.music;return result;
}
export class Simulation {
  constructor(config,state=fresh()) {this.c=config;this.s=state;this.holding=false;this.holdClock=0;this.idleClock=0;this.tickClock=0;}
  get areaConfig(){return this.c.ab17_main_area;}
  get stuffConfig(){return this.c.ab17_main_stuffs;}
  tier(id){const local=this.s.levels[id]-this.s.area*this.areaConfig.LvlsInArea;const limits=this.s.area===0?this.areaConfig.VisualTierThresholdsArea0:[25,50];return Math.min(2,limits.filter(v=>local>=v).length);}
  cost(id){
    const level=this.s.levels[id];if(level>=600)return Infinity;
    const a=Math.min(7,Math.floor(level/75)),local=level%75,c=this.stuffConfig;
    return Math.max(1,Math.ceil((c.CostBasePerArea[a]+c.CostSumKPerArea[a]*Math.pow(c.CostPowKPerArea[a],local+1))*Math.pow(c.CostTierMultPerArea[a],Math.floor(local/25))));
  }
  rates(){
    const c=this.stuffConfig;let tap=.01,passive=.01;
    const levelIncome=level=>{
      const area=Math.min(7,Math.floor(level/75)),local=level-area*75;
      const sum=(n,a)=>c.IncomeDelta*(Math.min(n,25)+Math.min(Math.max(n-25,0),25)*c.IncomeTierMultPerArea[a]+Math.max(n-50,0)*2*c.IncomeTierMultPerArea[a]);
      return this.areaConfig._incomeMults[area]*((area?sum(74,0):0)+sum(local,area));
    };
    this.s.levels.forEach((level,id)=>{
      const type=id<5?0:id<9?1:id<12?2:3;
      const total=levelIncome(level)/17;
      const ratio=c.IncomeTapRatios[type];tap+=total*ratio;passive+=total*(1-ratio);
    });
    return {tap:tap*Math.pow(1.1,this.s.upgrades[0]),passive:passive*Math.pow(1.1,this.s.upgrades[1])};
  }
  earn(amount){if(!Number.isFinite(amount)||amount<0)throw Error('Invalid income');this.s.money+=amount;this.s.totalMoney+=amount;}
  tap(){if(this.s.battery<=0)return 0;const amount=this.rates().tap;this.earn(amount);this.s.battery=Math.max(0,this.s.battery-.001);this.idleClock=0;return amount;}
  buy(id){const price=this.cost(id);if(this.s.money+1e-9<price)return false;this.s.money=Math.max(0,this.s.money-price);this.s.levels[id]++;return true;}
  upgradeCost(id){const config=this.c.ab17_main_upgrades._all[id],level=this.s.upgrades[id];return level>=config.LvlsCount?Infinity:Math.max(1,Math.ceil(config.CostExtraMult*Math.pow(config.CostDelta,level)+config.CostExtraOffset));}
  buyUpgrade(id){const price=this.upgradeCost(id);if(this.s.money<price)return false;this.s.money-=price;this.s.upgrades[id]++;return true;}
  get progress(){return Math.min(1,Math.min(...this.s.levels.slice(0,12).map(l=>(l-this.s.area*75)/75)));}
  relocate(){if(this.progress<1||this.s.area>=7)return false;this.s.area++;return true;}
  step(dt){
    this.s.ticks++;this.idleClock+=dt;this.tickClock+=dt;
    if(this.holding&&this.s.battery>0){this.holdClock+=dt;const gap=this.c.ab17_main_money.SecsBetweenTapInHold;while(this.holdClock>=gap){this.holdClock-=gap;this.tap();}this.s.battery=Math.max(0,this.s.battery-dt/this.c.ab17_main_money.HoldDurationMax);}
    else {this.holdClock=0;if(this.idleClock>=this.c.ab17_main_money.HoldDelayBeforeRestore)this.s.battery=Math.min(1,this.s.battery+dt*this.c.ab17_main_money.HoldRestoreFasterThanSpendK/this.c.ab17_main_money.HoldDurationMax);}
    if(this.tickClock>=1){this.tickClock-=1;this.earn(this.rates().passive);const stages=this.c.ab17_main_subs.Stages;const stage=stages.find(x=>this.s.subs<x.EndCount)||stages.at(-1);this.s.subs+=stage.DeltaPerSec;}
  }
  offline(now){const seconds=Math.max(0,Math.min(4*3600,(now-this.s.savedAt)/1000));const amount=seconds*this.rates().passive;this.earn(amount);this.s.savedAt=now;return amount;}
}
export class FixedClock {
  constructor(step,hz=60){this.tick=1/hz;this.accumulator=0;this.step=step;}
  advance(seconds){this.accumulator+=Math.max(0,Math.min(.25,seconds));let n=0;while(this.accumulator+1e-10>=this.tick){this.step(this.tick);this.accumulator-=this.tick;n++;}return n;}
}
