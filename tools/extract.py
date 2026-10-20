#!/usr/bin/env python3
"""Convert a local APK's original resources into bounded browser asset packs.

No game executable is run. --layout-dlls is Cpp2IL's attributeanalyzer/dll_empty
output; method recovery is deliberately separate from serialized-field recovery.
"""
import argparse, collections, gzip, hashlib, io, json, math, re, struct, tempfile, zipfile
from pathlib import Path
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

def encoded(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()

def spine_map(raw):
    # WorldSpineMapAsset has a private field type unsupported by the generator.
    # Decode its checked length-prefixed strings and attachment/slot pairs.
    cursor=28
    def integer():
        nonlocal cursor
        if cursor+4>len(raw):raise ValueError('Truncated spine map')
        n=struct.unpack_from('<i',raw,cursor)[0];cursor+=4
        if not 0<=n<=100000:raise ValueError('Invalid spine map count')
        return n
    def string():
        nonlocal cursor
        n=integer()
        if cursor+n>len(raw):raise ValueError('Truncated spine map string')
        s=raw[cursor:cursor+n].decode();cursor=(cursor+n+3)//4*4;return s
    string();cursor+=12;string()
    result={}
    for _ in range(integer()):
        key=string();patterns=[string() for _ in range(integer())]
        result[key]=dict(patterns=patterns,pairs=[[string(),string()] for _ in range(integer())])
    if cursor!=len(raw):raise ValueError('Unconsumed spine map bytes')
    return result

class Packs:
    def __init__(self, out):
        self.out = out; out.mkdir(parents=True, exist_ok=True)
        self.groups = {}; self.files = {}; self.data = bytearray(); self.group = None; self.number = 0
    def flush(self):
        if not self.data: return
        data = bytes(self.data); path = f'{self.group}-{self.number:03}.pack'
        (self.out/path).write_bytes(data)
        self.groups[self.group].append(dict(path=path, bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
        self.number += 1; self.data.clear()
    def add(self, name, data, mime, group='core', compress=False):
        if name in self.files: return name
        if compress: data = gzip.compress(data, mtime=0)
        if self.group != group:
            self.flush(); self.group = group; self.number = len(self.groups.setdefault(group, []))
        # A single file is divided into independent pack spans, never loaded whole over HTTP.
        spans=[]; cursor=0
        while cursor < len(data):
            room = 4*1024*1024-len(self.data); count = min(room, len(data)-cursor)
            spans.append(dict(pack=f'{group}-{self.number:03}.pack', offset=len(self.data), bytes=count))
            self.data.extend(data[cursor:cursor+count]); cursor += count
            if len(self.data) == 4*1024*1024: self.flush()
        self.files[name]=dict(mime=mime, gzip=compress, group=group, spans=spans)
        return name
    def image(self, name, image, group='core'):
        b=io.BytesIO();image.save(b,format='WEBP',lossless=True,method=4)
        return self.add(name,b.getvalue(),'image/webp',group)
    def finish(self, source):
        self.flush(); (self.out/'manifest.json').write_bytes(encoded(dict(version=1,source=source,groups=self.groups,files=self.files)))

def main():
    p=argparse.ArgumentParser();p.add_argument('apk',type=Path);p.add_argument('--layout-dlls',type=Path,required=True)
    p.add_argument('--out',type=Path,default=Path('public/game'));a=p.parse_args()
    packs=Packs(a.out);source=dict(filename=a.apk.name,bytes=a.apk.stat().st_size,sha256=hashlib.sha256(a.apk.read_bytes()).hexdigest())
    with tempfile.TemporaryDirectory() as temporary:
        root=Path(temporary)
        with zipfile.ZipFile(a.apk) as z:
            for n in z.namelist():
                if n.startswith(('assets/bin/Data/','assets/aa/')) and not n.endswith('/'):
                    # ZIP paths are data; refuse traversal instead of using extractall.
                    target=root/n
                    if not target.resolve().is_relative_to(root.resolve()):raise ValueError('Unsafe ZIP member')
                    target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(n))
        data=root/'assets/bin/Data';env=UnityPy.load(str(data/'data.unity3d'))
        env.load_file(str(data/'sharedassets0.resource'))
        gen=TypeTreeGenerator('2022.3.62f2');gen.load_local_dll_folder(str(a.layout_dlls))
        config={}; sprites={};sprite_by_ref={};errors=[];spine={};fonts={}
        for obj in env.objects:
            kind=obj.type.name
            if kind=='MonoBehaviour':
                d=obj.read(check_read=False);name=d.m_Name
                if name=='spine_map_lamar':
                    config[name]=spine_map(obj.get_raw_data())
                elif name.startswith('ab17_main_') or name in ['stuffs_asset','upgrades_asset','world_assets'] or re.fullmatch(r'world_area_\d_asset',name):
                    try:
                        s=d.m_Script.read();full='.'.join(filter(None,[s.m_Namespace,s.m_ClassName]))
                        t=obj.read_typetree(nodes=gen.get_nodes_up(s.m_AssemblyName,full))
                        config[name]={k:v for k,v in t.items() if not k.startswith('m_')}
                    except Exception as ex:errors.append([name,str(ex)])
            elif kind=='TextAsset':
                d=obj.read()
                if d.m_Name in ['Lamar','Lamar.atlas']:
                    content=d.m_Script.encode('utf8',errors='surrogateescape') if isinstance(d.m_Script,str) else d.m_Script
                    key='spine/Lamar.json' if d.m_Name=='Lamar' else 'spine/Lamar.atlas'
                    packs.add(key,content,'application/json' if d.m_Name=='Lamar' else 'text/plain',compress=True)
                    spine[key]=True
            elif kind=='Texture2D':
                d=obj.read()
                if re.fullmatch(r'Lamar\d*',d.m_Name):packs.image('spine/'+d.m_Name+'.png',d.image)
            elif kind=='Sprite':
                d=obj.read()
                if d.m_Name in sprites:continue
                try:
                    key='ui/'+str(len(sprites))+'.webp';image=d.image;packs.image(key,image)
                    record=dict(name=d.m_Name,file=key,w=image.width,h=image.height)
                    sprites.setdefault(d.m_Name,record);sprite_by_ref[(obj.assets_file.name,obj.path_id)]=record
                except Exception as ex:errors.append([d.m_Name,str(ex)])
            elif kind=='Font':
                d=obj.read()
                if d.m_FontData:fonts[d.m_Name]=packs.add('fonts/'+d.m_Name+'.ttf',bytes(d.m_FontData),'font/ttf')
            elif kind=='AudioClip':
                d=obj.read()
                if d.m_Name in ['(back)Rich_music_2','(Button_tap)tap or open_bar2','(StuffsScreen_purchase)8_buy','(Money_reward)money']:
                    for _,b in d.samples.items():
                        packs.add('audio/'+d.m_Name+'.wav',b,'audio/wav',compress=True)
        packs.add('config.json',encoded(config),'application/json',compress=True)
        packs.add('ui.json',encoded(sprites),'application/json',compress=True)
        packs.add('fonts.json',encoded(fonts),'application/json')
        # Preserve each original prefab's hierarchy, transforms, sprite pivot,
        # pixels-to-units, color and sorting order. Variants remain separate.
        for area in range(8):
            group=f'area-{area}';bundle=next((root/'assets/aa/Android').glob(f'area_{area}_assets_all*'))
            region=UnityPy.load(str(root/'assets/aa/Android'))
            target=UnityPy.load(str(bundle));files={o.assets_file.name for o in target.objects}
            nodes=[];textures={}
            def world(tr):
                d=tr.read();pos=d.m_LocalPosition;scale=d.m_LocalScale
                local=dict(x=pos.x,y=pos.y,sx=scale.x,sy=scale.y,angle=2*math.atan2(d.m_LocalRotation.z,d.m_LocalRotation.w))
                if not d.m_Father.path_id:return local,d.m_GameObject.read().m_Name,True
                parent,name,active=world(d.m_Father)
                c=math.cos(parent['angle']);s=math.sin(parent['angle'])
                return dict(x=parent['x']+c*local['x']*parent['sx']-s*local['y']*parent['sy'],y=parent['y']+s*local['x']*parent['sx']+c*local['y']*parent['sy'],sx=parent['sx']*local['sx'],sy=parent['sy']*local['sy'],angle=parent['angle']+local['angle']),name,active and bool(d.m_GameObject.read().m_IsActive)
            for obj in region.objects:
                if obj.assets_file.name not in files or obj.type.name!='SpriteRenderer':continue
                d=obj.read()
                if not d.m_Sprite.path_id:continue
                go=d.m_GameObject.read();tr=next(c.component for c in go.m_Component if c.component.type.name=='Transform')
                transform,rootname,active=world(tr)
                if not active or rootname.startswith('switch_'):continue
                spr=d.m_Sprite.read();ref=(spr.object_reader.assets_file.name,spr.object_reader.path_id)
                if ref not in textures:
                    im=spr.image;key=f'areas/{area}/{len(textures)}.webp';packs.image(key,im,group)
                    textures[ref]=dict(file=key,w=im.width,h=im.height,ppu=spr.m_PixelsToUnits,pivot=[spr.m_Pivot.x,spr.m_Pivot.y])
                nodes.append(dict(root=rootname,name=go.m_Name,transform=transform,sprite=textures[ref],order=d.m_SortingOrder,layer=d.m_SortingLayerID,flipX=d.m_FlipX,flipY=d.m_FlipY,color=[d.m_Color.r,d.m_Color.g,d.m_Color.b,d.m_Color.a]))
            packs.add(f'areas/{area}/scene.json',encoded(nodes),'application/json',group,compress=True)
            print(f'Area {area}: {len(nodes)} sprite layers',flush=True)
        packs.finish(source)
        (a.out/'extraction-report.json').write_bytes(encoded(dict(source=source,errors=errors,coreSpriteCount=len(sprites),configs=list(config))))
        print(f'Exported {len(packs.files)} files. {len(errors)} extraction errors.',flush=True)
        from extract_story import append_story
        append_story(root/'assets',a.layout_dlls,a.out)
if __name__=='__main__':main()
