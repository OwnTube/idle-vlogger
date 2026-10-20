import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {root,manifest,bytes,config} from './resources.mjs';
test('all streamed packs are bounded and match recorded SHA-256 digests',()=>{
  for(const group of Object.values(manifest.groups))for(const p of group){const b=fs.readFileSync(path.join(root,p.path));assert.equal(b.length,p.bytes);assert.ok(b.length<=4*1024*1024);assert.equal(createHash('sha256').update(b).digest('hex'),p.sha256);}
});
test('each virtual file has valid pack spans and decompresses',()=>{
  for(const [name,f] of Object.entries(manifest.files)){for(const s of f.spans){const size=fs.statSync(path.join(root,s.pack)).size;assert.ok(s.offset>=0&&s.bytes>0&&s.offset+s.bytes<=size,name);}assert.ok(bytes(name).length>0,name);}
});
test('original Spine atlas has every page and original outfit mappings use real attachments',()=>{
  const rig=JSON.parse(bytes('spine/Lamar.json'));assert.equal(rig.skeleton.spine,'3.8.99');
  for(const m of bytes('spine/Lamar.atlas').toString().matchAll(/^([^\s]+\.png)$/gm))assert.ok(manifest.files['spine/'+m[1]],m[1]);
  const slots=new Set(rig.slots.map(x=>x.name));assert.equal(Object.keys(config.spine_map_lamar).length,112);
  for(const map of Object.values(config.spine_map_lamar))for(const [attachment,slot] of map.pairs){assert.ok(slots.has(slot),slot);const data=rig.skins[0].attachments[slot];assert.ok(data?.[attachment],attachment);}
});
test('every original area scene references exported textures',()=>{
  for(let i=0;i<8;i++){const scene=JSON.parse(bytes(`areas/${i}/scene.json`));assert.ok(scene.length>=20);for(const part of scene)assert.ok(manifest.files[part.sprite.file],part.sprite.file);}
});
test('all three original intro scripts match dialogue, positions and original animations',()=>{
  const {scenes,positions}=JSON.parse(bytes('story/intro.json'));assert.deepEqual(Object.values(scenes).map(s=>s.frames.length).sort((a,b)=>a-b),[8,27,52]);
  const rigs={lamar:JSON.parse(bytes('spine/Lamar.json')),van:JSON.parse(bytes('story/Van.json')),harry:JSON.parse(bytes('story/Harry.json'))};
  for(const scene of Object.values(scenes)){
    assert.equal(scene.frames.length,scene.texts.length);
    for(const f of scene.frames){
      for(const action of f.actions){const [type,person,...name]=action.split('_');if(!rigs[person])continue;if(type==='em')assert.ok(rigs[person].animations[(person==='lamar'?'NAR/':'')+name.join('_').toUpperCase()],action);if(type==='pos')assert.ok(positions.some(p=>p.Id===name.join('_')),action);}
      for(const c of f.choices){assert.ok(scene.labels[c.key],c.key);assert.ok(c.target>=0&&c.target<=scene.frames.length);}
    }
  }
  for(const person of ['Van','Harry'])for(const m of bytes(`story/${person}.atlas`).toString().matchAll(/^([^\s]+\.png)$/gm))assert.ok(manifest.files['story/'+m[1]],m[1]);
  const map=JSON.parse(bytes('story/van-map.json'));for(const [attachment,slot] of map.C_0.pairs)if(attachment)assert.ok(rigs.van.skins[0].attachments[slot]?.[attachment],attachment);
});
test('original upgrade icon references resolve to exported UI images',()=>{
  const icons=JSON.parse(bytes('story/upgrade-icons.json')),ui=JSON.parse(bytes('ui.json'));assert.equal(icons.length,16);
  for(const name of icons)assert.ok(ui[name]&&manifest.files[ui[name].file],name);
});
