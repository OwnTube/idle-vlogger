// Arithmetic recovered from this APK's ARM64 functions. See docs/NATIVE-RULES.md.
// fround preserves the single-precision operations used by IL2CPP.
const f=Math.fround;
export const UPGRADE_KEYS=['passiveincome0','tapincome0','moneygift','moneybubble','fireboostduration','subsreward','admoneyreward','holdrestore','holdmax','subsspeed','taskreward','fireboostmult','passiveincome1','tapincome1','stuffscost','piggymax'];
export function roundEven(value){const floor=Math.floor(value),fraction=value-floor;return fraction===.5?floor+(floor%2):Math.round(value);}
export class NativeRules {
  constructor(config){
    this.c=config;this.maxLevel=config.ab17_main_area.Count*config.ab17_main_area.LvlsInArea-1;
    this.incomes=new Float32Array(this.maxLevel+1);this.costsByDiscount=new Map();
    const area=config.ab17_main_area,stuffs=config.ab17_main_stuffs;
    for(let level=1;level<=this.maxLevel;level++){
      const region=Math.floor(level/area.LvlsInArea),local=level%area.LvlsInArea,mult=area._incomeMults[region];
      // The original instruction divides REGION by LvlsInTier here. Preserve
      // that behavior, including its lack of a visual-tier income multiplier.
      const tier=Math.floor(region/area.LvlsInTier),tierMult=tier?f(stuffs.IncomeTierMultPerArea[region]*tier):1;
      this.incomes[level]=local===0?f(mult*this.incomes[area.LvlsInArea-1]):f(this.incomes[level-1]+f(f(mult*stuffs.IncomeDelta)*tierMult));
    }
  }
  income(level){return this.incomes[Math.max(0,Math.min(this.maxLevel,level))];}
  cost(level,discount=1){
    if(level<0||level>this.maxLevel)return 0;
    if(!this.costsByDiscount.has(discount)){
      const costs=new Float32Array(this.maxLevel+1),area=this.c.ab17_main_area,c=this.c.ab17_main_stuffs;
      for(let n=1;n<=this.maxLevel;n++){
        const region=Math.floor(n/area.LvlsInArea),local=n%area.LvlsInArea,tier=Math.floor(local/area.LvlsInTier),tierMult=tier?f(c.CostTierMultPerArea[region]*tier):1;
        const exponential=f(area._incomeMults[region]*f(tierMult*f(Math.pow(c.CostPowKPerArea[region],local))));
        const linear=f(tierMult*f(c.CostSumKPerArea[region]*local));
        costs[n]=f(f(linear+f(exponential+c.CostBasePerArea[region]))*discount);
      }
      for(let n=1;n<=area.LvlsInTier;n++)costs[0]=f(costs[0]+costs[n]);
      this.costsByDiscount.set(discount,costs);
    }return this.costsByDiscount.get(discount)[level];
  }
  upgradeValue(id,level){const c=this.c.ab17_main_upgrades._all[id];return c.IsValueDeltaMultiplying?f(c.ValueBase*f(Math.pow(c.ValueDelta,level))):f(c.ValueBase+f(c.ValueDelta*level));}
  upgradeCost(id,level){const c=this.c.ab17_main_upgrades._all[id];const raw=c.CostBase?f(c.CostBase+f(c.CostDelta*level)):f(c.CostExtraOffset+f(c.CostExtraMult*f(f(Math.pow(c.CostDelta,level+1))-1)));return roundEven(raw);}
}
