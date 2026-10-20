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
