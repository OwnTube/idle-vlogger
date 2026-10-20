#!/usr/bin/env python3
"""Append original English text, intro actions, and Van's rig to an extraction.

Uses the APK data directory produced by the extractor's temporary unpack step,
or an independently unpacked local APK. The binary parser rejects unsupported
branching frames instead of guessing their layout.
"""
import argparse, json, struct
from pathlib import Path
import UnityPy
from UnityPy.classes.PPtr import PPtr
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
from extract import Packs, encoded, spine_map

def linear_scene(raw):
    cursor=28
    def integer():
        nonlocal cursor
        if cursor+4>len(raw):raise ValueError('Truncated scene')
        n=struct.unpack_from('<i',raw,cursor)[0];cursor+=4;return n
    def count():
        n=integer()
        if not 0<=n<=10000:raise ValueError('Invalid scene count')
        return n
    def string():
        nonlocal cursor
        n=count()
        if cursor+n>len(raw):raise ValueError('Truncated scene string')
        value=raw[cursor:cursor+n].decode();cursor=(cursor+n+3)//4*4;return value
    name=string();scene=string();frames=[]
    for _ in range(count()):
        nxt=integer();actions=[string() for _ in range(count())]
        if count()!=0:raise ValueError('Conditional frame needs a separate decoder')
        if count()!=0:raise ValueError('Choice frame needs a separate decoder')
        frames.append(dict(next=nxt,actions=actions))
    if cursor!=len(raw):raise ValueError('Unconsumed scene bytes')
    return dict(id=scene,name=name,frames=frames)

def append_story(root, dlls, out):
    old=json.loads((out/'manifest.json').read_text());p=Packs(out)
    p.groups={k:v for k,v in old['groups'].items() if k!='story'}
    p.files={k:v for k,v in old['files'].items() if v['group']!='story'}
    gen=TypeTreeGenerator('2022.3.62f2');gen.load_local_dll_folder(str(dlls))
    def typed(o):
        d=o.read(check_read=False);s=d.m_Script.read()
        return o.read_typetree(nodes=gen.get_nodes_up(s.m_AssemblyName,'.'.join(filter(None,[s.m_Namespace,s.m_ClassName]))))
    data=UnityPy.load(str(root/'bin/Data/data.unity3d'));scene=None;positions=None;upgrade_icons=None
    for o in data.objects:
        if o.type.name!='MonoBehaviour':continue
        name=o.read(check_read=False).m_Name
        if name=='narrative_1fast':scene=linear_scene(o.get_raw_data())
        elif name=='narrative_assets':positions=typed(o)['_positions']
        elif name=='upgrades_asset':upgrade_icons=[PPtr(**ref,assetsfile=o.assets_file).read().m_Name for ref in typed(o)['_icons']]
    if not upgrade_icons or len(upgrade_icons)!=16:raise ValueError('Original upgrade icon references are incomplete')
    p.add('story/upgrade-icons.json',encoded(upgrade_icons),'application/json','story')
    bundle=next((root/'aa/Android').glob('localization_narrative_assets_en_*'))
    english={}
    for o in UnityPy.load(str(bundle)).objects:
        if o.type.name=='TextAsset':
            d=o.read();english[d.m_Name]=json.loads(d.m_Script.lstrip('\ufeff'))
    scene['texts']=english['Story_1fast_en']['texts']
    if len(scene['texts'])!=len(scene['frames']):raise ValueError('Dialogue/action mismatch')
    p.add('story/intro.json',encoded(dict(scene=scene,positions=positions)),'application/json','story',compress=True)
    # Keep the other source dialogue available for subsequent story restoration.
    p.add('story/english-dialogue.json',encoded(english),'application/json','story',compress=True)
    shared=UnityPy.load(str(next((root/'aa/Android').glob('localization-assets-shared_*'))))
    table=UnityPy.load(str(next((root/'aa/Android').glob('localization-string-tables-english*'))))
    keys={};values={}
    for env in [shared,table]:
        for o in env.objects:
            if o.type.name!='MonoBehaviour':continue
            name=o.read(check_read=False).m_Name
            if name=='TextTable Shared Data':keys={v['m_Id']:v['m_Key'] for v in typed(o)['m_Entries']}
            elif name=='TextTable_en':values={v['m_Id']:v['m_Localized'] for v in typed(o)['m_TableData']}
    p.add('story/ui-en.json',encoded({keys[k]:v for k,v in values.items() if k in keys}),'application/json','story',compress=True)
    van=UnityPy.load(str(next((root/'aa/Android').glob('narrative_assets_narr_person_van*'))))
    for o in van.objects:
        d=o.read(check_read=False)
        if o.type.name=='MonoBehaviour' and d.m_Name=='spine_map_van':
            p.add('story/van-map.json',encoded(spine_map(o.get_raw_data())),'application/json','story',compress=True)
        elif o.type.name=='TextAsset' and d.m_Name in ['Van','Van.atlas']:
            b=d.m_Script.encode('utf8',errors='surrogateescape') if isinstance(d.m_Script,str) else d.m_Script
            p.add('story/Van.json' if d.m_Name=='Van' else 'story/Van.atlas',b,'application/json' if d.m_Name=='Van' else 'text/plain','story',compress=True)
        elif o.type.name=='Texture2D' and d.m_Name.startswith('Van'):
            p.image('story/'+d.m_Name+'.png',d.image,'story')
    p.finish(old['source']);print(f"Story: {len(scene['frames'])} intro frames, {len(english)} English scripts")

if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('assets',type=Path);a.add_argument('--layout-dlls',required=True,type=Path);a.add_argument('--out',type=Path,default=Path('public/game'));args=a.parse_args()
    append_story(args.assets,args.layout_dlls,args.out)
