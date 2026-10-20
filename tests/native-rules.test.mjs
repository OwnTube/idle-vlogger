import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {NativeRules} from '../src/rules.js';import {config} from './resources.mjs';
const native=JSON.parse(fs.readFileSync(new URL('./fixtures/native-rules.json',import.meta.url)));const rules=new NativeRules(config);
test('all 601 income values match actual ARM64 function execution',()=>{
  native.incomes.forEach((expected,level)=>assert.equal(rules.income(level),expected,`level ${level}`));
});
test('all 600 item cost values match actual ARM64 function execution',()=>{
  native.costs.forEach((expected,level)=>assert.equal(rules.cost(level),expected,`level ${level}`));
});
test('all upgrade prices and effects match actual ARM64 function execution',()=>{
  native.upgrades.forEach((rows,id)=>rows.forEach(row=>{assert.equal(rules.upgradeCost(id,row.level),row.cost,`price ${id}:${row.level}`);assert.equal(rules.upgradeValue(id,row.level),row.value,`effect ${id}:${row.level}`);}));
});
test('all 3600 discounted item prices match actual ARM64 function execution',()=>{
  native.discounts.forEach(row=>row.costs.forEach((expected,level)=>assert.equal(rules.cost(level,row.value),expected,`discount ${row.level}, item level ${level}`)));
});
