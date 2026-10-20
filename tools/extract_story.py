#!/usr/bin/env python3
"""Append original English text, scene scripts, and intro rigs to an extraction.

Uses the APK data directory produced by the extractor's temporary unpack step,
or an independently unpacked local APK. Narrative field layout comes from the
recovered managed metadata; the decoder requires full byte consumption.
"""
import argparse, json
from pathlib import Path
import UnityPy
from UnityPy.classes.PPtr import PPtr
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
from extract import Packs, encoded, spine_map
from read_narrative import read_scene

def append_story(root, dlls, out):
    old=json.loads((out/'manifest.json').read_text());p=Packs(out)
    p.groups={k:v for k,v in old['groups'].items() if k!='story'}
    p.files={k:v for k,v in old['files'].items() if v['group']!='story'}
    gen=TypeTreeGenerator('2022.3.62f2');gen.load_local_dll_folder(str(dlls))
    def typed(o):
        d=o.read(check_read=False);s=d.m_Script.read()
        return o.read_typetree(nodes=gen.get_nodes_up(s.m_AssemblyName,'.'.join(filter(None,[s.m_Namespace,s.m_ClassName]))))
    data=UnityPy.load(str(root/'bin/Data/data.unity3d'));scenes={};positions=None;upgrade_icons=None
    for o in data.objects:
        if o.type.name!='MonoBehaviour':continue
        name=o.read(check_read=False).m_Name
        if name=='narrative_assets':positions=typed(o)['_positions']
        elif name.startswith('narrative_') and o.read(check_read=False).m_Script.read().m_ClassName=='NarrativeSceneAsset':
            scene=read_scene(o.get_raw_data());scenes[scene['id']]=scene
        elif name=='upgrades_asset':upgrade_icons=[PPtr(**ref,assetsfile=o.assets_file).read().m_Name for ref in typed(o)['_icons']]
    if not upgrade_icons or len(upgrade_icons)!=16:raise ValueError('Original upgrade icon references are incomplete')
    p.add('story/upgrade-icons.json',encoded(upgrade_icons),'application/json','story')
    bundle=next((root/'aa/Android').glob('localization_narrative_assets_en_*'))
    english={}
    for o in UnityPy.load(str(bundle)).objects:
        if o.type.name=='TextAsset':
            d=o.read();english[d.m_Name]=json.loads(d.m_Script.lstrip('\ufeff'))
    intros={}
    for id in ['1','1choices','1fast']:
        scene=scenes[id];localization=english[f'Story_{id}_en'];scene['texts']=localization['texts'];scene['labels']=localization.get('choices',{})
        if len(scene['texts'])!=len(scene['frames']):raise ValueError('Dialogue/action mismatch: '+id)
        intros[id]=scene
    p.add('story/intro.json',encoded(dict(scenes=intros,positions=positions)),'application/json','story',compress=True)
    p.add('story/scene-archive.json',encoded(scenes),'application/json','story',compress=True)
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
    for person in ['Van','Harry']:
        env=UnityPy.load(str(next((root/'aa/Android').glob('narrative_assets_narr_person_'+person.lower()+'*'))))
        for o in env.objects:
            d=o.read(check_read=False)
            if o.type.name=='MonoBehaviour' and d.m_Name=='spine_map_van':
                p.add('story/van-map.json',encoded(spine_map(o.get_raw_data())),'application/json','story',compress=True)
            elif o.type.name=='TextAsset' and d.m_Name in [person,person+'.atlas']:
                b=d.m_Script.encode('utf8',errors='surrogateescape') if isinstance(d.m_Script,str) else d.m_Script
                p.add('story/'+person+('.json' if d.m_Name==person else '.atlas'),b,'application/json' if d.m_Name==person else 'text/plain','story',compress=True)
            elif o.type.name=='Texture2D' and d.m_Name.startswith(person):
                p.image('story/'+d.m_Name+'.png',d.image,'story')
    p.finish(old['source']);print(f'Story: {len(scenes)} scenes, {len(english)} English scripts; full, choice and short introductions')

if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('assets',type=Path);a.add_argument('--layout-dlls',required=True,type=Path);a.add_argument('--out',type=Path,default=Path('public/game'));args=a.parse_args()
    append_story(args.assets,args.layout_dlls,args.out)
