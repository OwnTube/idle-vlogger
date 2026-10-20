import fs from 'node:fs';import path from 'node:path';import {gunzipSync} from 'node:zlib';
export const root=path.resolve('public/game');
export const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
export function bytes(name){const f=manifest.files[name];const data=Buffer.concat(f.spans.map(s=>fs.readFileSync(path.join(root,s.pack)).subarray(s.offset,s.offset+s.bytes)));return f.gzip?gunzipSync(data):data;}
export const config=JSON.parse(bytes('config.json'));
