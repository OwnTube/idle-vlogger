#!/usr/bin/env python3
"""Reproducible, read-only ZIP / ELF / DEX / Unity fingerprint report."""
import argparse, collections, hashlib, io, json, re, struct, zipfile
from pathlib import Path
from elftools.elf.elffile import ELFFile

def main():
    parser=argparse.ArgumentParser();parser.add_argument('apk',type=Path);parser.add_argument('--out',type=Path,default=Path('docs/inspection.json'));a=parser.parse_args()
    raw=a.apk.read_bytes();report=dict(path=str(a.apk.resolve()),filename=a.apk.name,size_bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),magic_hex=raw[:16].hex(),format='ZIP/APK' if raw[:4]==b'PK\x03\x04' else 'unknown',native_files=[])
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        names=z.namelist();report['archive_entries']=len(names);report['abi_directories']=sorted({n.split('/')[1] for n in names if n.startswith('lib/')})
        report['dex_files']=[]
        for name in names:
            if name.endswith('.dex'):
                b=z.read(name);report['dex_files'].append(dict(path=name,size_bytes=len(b),magic_hex=b[:8].hex()))
            if not name.startswith('lib/') or not name.endswith('.so'):continue
            b=z.read(name);elf=ELFFile(io.BytesIO(b));dynamic=elf.get_section_by_name('.dynamic');symbols=elf.get_section_by_name('.dynsym')
            imports=[s.name for s in symbols.iter_symbols() if s.entry.st_shndx=='SHN_UNDEF'] if symbols else []
            exports=[s.name for s in symbols.iter_symbols() if s.entry.st_shndx!='SHN_UNDEF' and s.name] if symbols else []
            report['native_files'].append(dict(path=name,size_bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),magic_hex=b[:16].hex(),architecture=elf.header.e_machine,bitness=elf.elfclass,endian='little' if elf.little_endian else 'big',elf_type=elf.header.e_type,sections=[s.name for s in elf.iter_sections()],segments=[dict(type=s.header.p_type,file_size=s.header.p_filesz,memory_size=s.header.p_memsz,flags=s.header.p_flags) for s in elf.iter_segments()],needed=[t.needed for t in dynamic.iter_tags() if t.entry.d_tag=='DT_NEEDED'],has_full_symbol_table=elf.get_section_by_name('.symtab') is not None,dynamic_symbol_count=symbols.num_symbols() if symbols else 0,imports=imports,exports=exports))
        bundle=z.read('assets/bin/Data/data.unity3d');metadata=z.read('assets/bin/Data/Managed/Metadata/global-metadata.dat')
        report['engine']=dict(name='Unity',version=re.search(rb'2022\.[0-9.]+f\d+',bundle[:100]).group().decode(),backend='IL2CPP',bundle_path='assets/bin/Data/data.unity3d',bundle_size_bytes=len(bundle),bundle_magic_hex=bundle[:8].hex(),metadata_path='assets/bin/Data/Managed/Metadata/global-metadata.dat',metadata_size_bytes=len(metadata),metadata_magic_hex=metadata[:4].hex(),metadata_version=struct.unpack_from('<I',metadata,4)[0],evidence=['libunity.so','libil2cpp.so','UnityFS bundle header','IL2CPP metadata header','il2cpp executable section and exported il2cpp_init/runtime_invoke'])
        report['source_availability_in_apk']=dict(managed_method_dlls=[n for n in names if n.lower().endswith('.dll')],csharp_source=[n for n in names if n.lower().endswith('.cs')],unity_editor_project_files=[n for n in names if n.endswith(('ProjectVersion.txt','ProjectSettings.asset'))])
    a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(report,indent=2)+'\n');print(a.out)
if __name__=='__main__':main()
