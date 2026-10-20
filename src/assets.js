export class GameFiles {
  constructor(base = './game/') { this.base=base;this.packs=new Map();this.blobs=new Map();this.pending=new Map(); }
  async open() {
    const response=await fetch(this.base+'manifest.json');
    if(!response.ok) throw Error('Game asset manifest is missing. Run the extraction command in README.md.');
    this.manifest=await response.json();return this;
  }
  async loadGroup(group, progress=()=>{}) {
    if(this.pending.has(group)) return this.pending.get(group);
    const task=(async()=>{
      const entries=this.manifest.groups[group];if(!entries)throw Error(`Unknown asset group ${group}`);
      const total=entries.reduce((n,p)=>n+p.bytes,0);let done=0;
      for(const entry of entries) {
        if(this.packs.has(entry.path)){done+=entry.bytes;continue;}
        const response=await fetch(this.base+entry.path);if(!response.ok)throw Error(`Asset download failed: ${entry.path}`);
        const reader=response.body.getReader();const chunks=[];let size=0;
        while(true){const {done:ended,value}=await reader.read();if(ended)break;chunks.push(value);size+=value.length;progress((done+size)/total);}
        if(size!==entry.bytes)throw Error(`Truncated asset pack ${entry.path}`);
        const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
        if(digest!==entry.sha256)throw Error(`Asset integrity check failed: ${entry.path}`);
        this.packs.set(entry.path,data);done+=size;progress(done/total);
      }
    })();this.pending.set(group,task);
    try{await task;}catch(error){this.pending.delete(group);throw error;}
  }
  async bytes(name) {
    const f=this.manifest.files[name];if(!f)throw Error(`Missing original resource ${name}`);
    await this.loadGroup(f.group);
    const blob=new Blob(f.spans.map(s=>this.packs.get(s.pack).subarray(s.offset,s.offset+s.bytes)));
    return f.gzip ? new Uint8Array(await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()) : new Uint8Array(await blob.arrayBuffer());
  }
  async json(name){return JSON.parse(new TextDecoder().decode(await this.bytes(name)));}
  async text(name){return new TextDecoder().decode(await this.bytes(name));}
  async url(name){
    if(!this.blobs.has(name))this.blobs.set(name,URL.createObjectURL(new Blob([await this.bytes(name)],{type:this.manifest.files[name].mime})));
    return this.blobs.get(name);
  }
  dispose(){for(const url of this.blobs.values())URL.revokeObjectURL(url);this.blobs.clear();this.packs.clear();}
}
