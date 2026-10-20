import {test} from 'node:test';import assert from 'node:assert/strict';import {bytes} from './resources.mjs';import {StoryFlow} from '../src/story-flow.js';import {fresh,validateSave} from '../src/model.js';
const {scenes}=JSON.parse(bytes('story/intro.json'));
test('both original linear introductions reach their final frame',()=>{
  for(const id of ['1','1fast']){const flow=new StoryFlow(scenes[id]);let steps=0;while(!flow.done){assert.ok(flow.advance());assert.ok(++steps<=scenes[id].frames.length);}assert.equal(steps,scenes[id].frames.length);}
});
test('all twelve original dialogue-choice paths terminate and retain all three decisions',()=>{
  const completed=[];
  function visit(flow,steps=0){
    while(!flow.done){assert.ok(++steps<100);
      if(flow.frame.choices.length){
        assert.equal(flow.advance(),false);
        flow.frame.choices.forEach((_,index)=>{const next=new StoryFlow(flow.scene,flow.variables);next.index=flow.index;next.choose(index);visit(next,steps);});return;
      }
      flow.advance();
    }completed.push(flow.variables);
  }
  visit(new StoryFlow(scenes['1choices']));assert.equal(completed.length,12);
  for(const vars of completed){assert.ok(vars.intro_van_response);assert.ok(vars.intro_phone_plan);assert.ok(vars.intro_harry_negotiation);assert.deepEqual(validateSave({...fresh(),storyVars:{...vars}}).storyVars,{...vars});}
  assert.equal(new Set(completed.map(v=>JSON.stringify(v))).size,12);
});
test('saved narrative variables reject unsafe keys, nested values and nonfinite numbers',()=>{
  for(const vars of [[],null,{x:{}},{x:Infinity},JSON.parse('{"__proto__":true}'),{constructor:'bad'},{x:'x'.repeat(2049)}])assert.throws(()=>validateSave({...fresh(),storyVars:vars}));
});
