import {test} from 'node:test';import assert from 'node:assert/strict';
import {fresh,Simulation,FixedClock,validateSave} from '../src/model.js';import {config} from './resources.mjs';
test('simulation gives identical results at 30, 60 and 144 display frames per second',()=>{
  function run(fps){const sim=new Simulation(config,fresh());sim.holding=true;const clock=new FixedClock(dt=>sim.step(dt));for(let i=0;i<fps*30;i++)clock.advance(1/fps);const s=sim.s;return [s.ticks,s.money,s.subs,s.battery];}
  assert.deepEqual(run(30),run(60));assert.deepEqual(run(60),run(144));
});
test('all reconstructed income levels remain finite and do not lose income at area boundaries',()=>{
  const sim=new Simulation(config);let previous=0;
  for(let level=0;level<=600;level++){sim.s.levels.fill(level);const r=sim.rates();assert.ok(Number.isFinite(r.tap)&&r.tap>=previous,`level ${level}`);previous=r.tap;}
});
test('purchases require funds and preserve a nonnegative balance',()=>{
  const sim=new Simulation(config);assert.equal(sim.buy(0),false);sim.earn(sim.cost(0));assert.equal(sim.buy(0),true);assert.equal(sim.s.levels[0],1);assert.ok(sim.s.money>=0);sim.s.levels[0]=600;assert.equal(sim.buy(0),false);
});
test('native upgrade IDs apply to the right systems and purchases spend gold',()=>{
  const sim=new Simulation(config),before=sim.rates();sim.s.gold=10000;sim.s.money=10000;
  const gold=sim.s.gold,price=sim.upgradeCost(1);assert.equal(sim.buyUpgrade(1),true);assert.equal(sim.s.gold,gold-price);assert.equal(sim.s.money,10000);assert.ok(sim.rates().tap>before.tap);assert.equal(sim.rates().passive,before.passive);
  sim.buyUpgrade(0);assert.ok(sim.rates().passive>before.passive);const cost=sim.cost(0);sim.buyUpgrade(14);assert.ok(sim.cost(0)<cost);
  const basic=new Simulation(config);basic.holding=sim.holding=true;sim.buyUpgrade(8);for(let i=0;i<600;i++){basic.step(1/60);sim.step(1/60);}assert.ok(sim.s.battery>basic.s.battery);
  sim.s.gold=0;assert.equal(sim.buyUpgrade(1),false);
});
test('offline income is bounded and cannot be claimed twice for the same timestamp',()=>{
  const sim=new Simulation(config);sim.s.savedAt=1000000;const amount=sim.offline(1000000+86400000);assert.equal(amount,sim.rates().passive*14400);assert.equal(sim.offline(1000000+86400000),0);
});
test('save import rejects malformed values and discards unknown keys',()=>{
  for(const patch of [{money:NaN},{area:8},{levels:[1]},{battery:2},{upgrades:Array(16).fill(1000)}])assert.throws(()=>validateSave({...fresh(),...patch},config));
  const input=JSON.parse(JSON.stringify(fresh()));input.__proto__={polluted:true};input.unrelated=123;
  const result=validateSave(input,config);assert.equal(result.polluted,undefined);assert.equal(result.unrelated,undefined);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(fresh())),config).levels,Array(17).fill(0));
});
