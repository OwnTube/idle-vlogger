#!/usr/bin/env python3
"""Execute selected original ARM64 math functions in Unicorn, offline.

This is a calculation oracle, not an Android runner. It supplies synthetic
IL2CPP objects with recovered field layouts and hooks only runtime plumbing,
array interface access, powf and modf. The arithmetic/branches are APK code.
"""
import argparse, gzip, hashlib, io, json, math, struct, zipfile
from pathlib import Path
from elftools.elf.elffile import ELFFile
from unicorn import Uc, UC_ARCH_ARM64, UC_MODE_ARM, UC_HOOK_CODE
from unicorn.arm64_const import *

APK_HASH='844f057d71b892b90b489f5078c47ca2b06dcf75ee35a9b944b289031cf273f4'
FUNCTIONS={
 'stuffCost':(0x1e74130,0x2ac), 'stuffIncome':(0x1e7463c,0x210),
 'upgradeCost':(0x1e51170,0x194), 'upgradeValue':(0x1e515f0,0xb0),
}
def f32(n):return struct.unpack('<f',struct.pack('<f',n))[0]

class Oracle:
 def __init__(self,binary,config):
  self.u=Uc(UC_ARCH_ARM64,UC_MODE_ARM);self.c=config;self.cursor=0x50001000
  elf=ELFFile(io.BytesIO(binary))
  end=max(s['p_vaddr']+s['p_memsz'] for s in elf.iter_segments() if s['p_type']=='PT_LOAD')
  self.u.mem_map(0, (end+0xffff)//0x10000*0x10000)
  for s in elf.iter_segments():
   if s['p_type']=='PT_LOAD':self.u.mem_write(s['p_vaddr'],binary[s['p_offset']:s['p_offset']+s['p_filesz']])
  self.u.mem_map(0x50000000,0x1000000);self.u.mem_map(0x60000000,0x10000)
  self.u.mem_map(0x70000000,0x100000);self.u.reg_write(UC_ARM64_REG_CPACR_EL1,3<<20)
  self.done=0x60000000;self.get_item=0x60000010;self.interface=self.alloc(16)
  self.ptr(self.interface,self.get_item);self.array_class=self.alloc(0x200)
  self.u.mem_write(self.done,bytes.fromhex('c0035fd6'));self.u.mem_write(self.get_item,bytes.fromhex('c0035fd6'))
  area=config['ab17_main_area'];stuffs=config['ab17_main_stuffs'];self.area=self.alloc(0x80);self.stuffs=self.alloc(0x100)
  self.integer(self.area+0x1c,area['LvlsInArea']);self.integer(self.area+0x20,area['LvlsInTier'])
  self.ptr(self.area+0x40,self.array(area['_incomeMults']))
  self.single(self.stuffs+0x18,stuffs['IncomeDelta'])
  for offset,key in [(0x38,'CostBasePerArea'),(0x40,'CostPowKPerArea'),(0x48,'CostSumKPerArea'),(0x50,'CostTierMultPerArea'),(0x58,'IncomeTierMultPerArea')]:self.ptr(self.stuffs+offset,self.array(stuffs[key]))
  self.income=self.alloc(0x50);self.cost=self.alloc(0x50);self.upgrade=self.alloc(0x50)
  self.max_level=area['Count']*area['LvlsInArea']-1
  self.ptr(self.income+0x18,self.area);self.ptr(self.income+0x28,self.stuffs);self.ptr(self.income+0x38,self.array([0.]*(self.max_level+1)))
  self.cost_cache=self.array([0.]*(self.max_level+1))
  self.ptr(self.cost+0x18,self.area);self.ptr(self.cost+0x20,self.stuffs);self.ptr(self.cost+0x38,self.cost_cache);self.ptr(self.cost+0x30,self.upgrade)
  self.model=self.alloc(0x80);self.models=[];self.configs=[]
  for c in config['ab17_main_upgrades']['_all']:
   model=self.alloc(0x20);self.models.append(model)
   cfg=self.alloc(0x40);self.configs.append(cfg)
   self.integer(cfg+0x14,c['CostBase']);self.single(cfg+0x18,c['CostDelta']);self.single(cfg+0x1c,c['CostExtraMult']);self.single(cfg+0x20,c['CostExtraOffset'])
   self.u.mem_write(cfg+0x24,bytes([bool(c['IsValueDeltaMultiplying'])]));self.single(cfg+0x28,c['ValueBase']);self.single(cfg+0x2c,c['ValueDelta'])
  models=self.alloc(32+8*16);self.integer(models+0x18,16)
  for i,p in enumerate(self.models):self.ptr(models+0x20+i*8,p)
  self.ptr(self.model+0x58,models);self.ptr(self.upgrade+0x18,self.alloc(0x20));self.ptr(self.upgrade+0x20,self.model)
  self.cost_array=self.array([0.]*16);self.value_array=self.array([1.]*16)
  self.ptr(self.upgrade+0x28,self.cost_array);self.ptr(self.upgrade+0x30,self.value_array)
  for flag in [0x426b56b,0x426b56d,0x426a161]:self.u.mem_write(flag,b'\x01')
  math_class=self.alloc(0x200);self.integer(math_class+0xe0,1);self.ptr(0x3fe39f0,math_class)
  self.u.hook_add(UC_HOOK_CODE,self.hook)
 def alloc(self,n):
  p=self.cursor;self.cursor=(p+n+15)//16*16;return p
 def integer(self,p,n):self.u.mem_write(p,struct.pack('<i',n))
 def ptr(self,p,n):self.u.mem_write(p,struct.pack('<Q',n))
 def single(self,p,n):self.u.mem_write(p,struct.pack('<f',n))
 def array(self,values):
  p=self.alloc(32+4*len(values));self.ptr(p,self.array_class);self.integer(p+24,len(values));self.u.mem_write(p+32,struct.pack('<'+'f'*len(values),*values));return p
 def float_reg(self,reg):return struct.unpack('<f',struct.pack('<I',self.u.reg_read(reg)))[0]
 def return_float(self,n):self.u.reg_write(UC_ARM64_REG_S0,struct.unpack('<I',struct.pack('<f',n))[0])
 def hook(self,u,addr,size,data):
  if addr==self.done:u.emu_stop();return
  if addr==0x3dac6c0:self.return_float(math.pow(self.float_reg(UC_ARM64_REG_S0),self.float_reg(UC_ARM64_REG_S1)))
  elif addr==0x3dac640:
   value=struct.unpack('<d',struct.pack('<Q',u.reg_read(UC_ARM64_REG_D0)))[0];fraction,whole=math.modf(value)
   u.mem_write(u.reg_read(UC_ARM64_REG_X0),struct.pack('<d',whole));u.reg_write(UC_ARM64_REG_D0,struct.unpack('<Q',struct.pack('<d',fraction))[0])
  elif addr==0x1b5243c:u.reg_write(UC_ARM64_REG_X0,self.interface)
  elif addr==self.get_item:
   p=u.reg_read(UC_ARM64_REG_X0);index=u.reg_read(UC_ARM64_REG_W1);count=int.from_bytes(u.mem_read(p+24,4),'little')
   if index>=count:raise RuntimeError('Array interface index out of range')
   u.reg_write(UC_ARM64_REG_S0,int.from_bytes(u.mem_read(p+32+4*index,4),'little'))
  elif addr==0x2f74ad8:u.reg_write(UC_ARM64_REG_X0,self.upgrade)
  elif addr==0x1dbb264:u.reg_write(UC_ARM64_REG_X0,self.configs[u.reg_read(UC_ARM64_REG_W1)])
  elif addr in [0x1b9a4ec,0x1b9a4f4]:raise RuntimeError(f'Native exception at {addr:x}')
  else:return
  u.reg_write(UC_ARM64_REG_PC,u.reg_read(UC_ARM64_REG_LR))
 def call(self,name,obj,index):
  self.u.reg_write(UC_ARM64_REG_X0,obj);self.u.reg_write(UC_ARM64_REG_W1,index);self.u.reg_write(UC_ARM64_REG_SP,0x700f0000);self.u.reg_write(UC_ARM64_REG_LR,self.done)
  self.u.emu_start(FUNCTIONS[name][0]+0x4000,self.done+4,count=1000000)
  if self.u.reg_read(UC_ARM64_REG_PC)!=self.done:raise RuntimeError('Native instruction limit reached')
  return self.float_reg(UC_ARM64_REG_S0)
 def generate(self):
  incomes=[self.call('stuffIncome',self.income,i) for i in range(self.max_level+2)]
  costs=[self.call('stuffCost',self.cost,i) for i in range(self.max_level+1)]
  upgrades=[]
  for id,c in enumerate(self.c['ab17_main_upgrades']['_all']):
   rows=[]
   for level in range(c['LvlsCount']+1):
    self.integer(self.models[id]+0x14,level);self.call('upgradeCost',self.upgrade,id);self.call('upgradeValue',self.upgrade,id)
    cost=struct.unpack('<i',self.u.mem_read(self.cost_array+32+4*id,4))[0];value=struct.unpack('<f',self.u.mem_read(self.value_array+32+4*id,4))[0]
    rows.append(dict(level=level,cost=cost,value=value))
   upgrades.append(rows)
  discounts=[]
  for level in range(self.c['ab17_main_upgrades']['_all'][14]['LvlsCount']+1):
   self.integer(self.models[14]+0x14,level);self.call('upgradeValue',self.upgrade,14)
   self.u.mem_write(self.cost_cache+32,bytes(4*(self.max_level+1)))
   value=struct.unpack('<f',self.u.mem_read(self.value_array+32+4*14,4))[0]
   discounts.append(dict(level=level,value=value,costs=[self.call('stuffCost',self.cost,i) for i in range(self.max_level+1)]))
  return dict(incomes=incomes,costs=costs,upgrades=upgrades,discounts=discounts)

def main():
 p=argparse.ArgumentParser();p.add_argument('apk',type=Path);p.add_argument('--game',type=Path,default=Path('public/game'));p.add_argument('--out',type=Path,default=Path('tests/fixtures/native-rules.json'));a=p.parse_args()
 raw=a.apk.read_bytes()
 if hashlib.sha256(raw).hexdigest()!=APK_HASH:raise ValueError('Function offsets are specific to the inspected APK hash')
 with zipfile.ZipFile(io.BytesIO(raw)) as z:binary=z.read('lib/arm64-v8a/libil2cpp.so')
 manifest=json.loads((a.game/'manifest.json').read_text());entry=manifest['files']['config.json'];b=b''.join((a.game/s['pack']).read_bytes()[s['offset']:s['offset']+s['bytes']] for s in entry['spans']);config=json.loads(gzip.decompress(b) if entry['gzip'] else b)
 result=Oracle(binary,config).generate();result['source']=dict(apkSha256=APK_HASH,librarySha256=hashlib.sha256(binary).hexdigest(),method='Unicorn 2.1.4 ARM64 function execution',functions={k:dict(fileOffset=hex(v[0]),virtualAddress=hex(v[0]+0x4000),length=v[1]) for k,v in FUNCTIONS.items()},hooks=['IL2CPP array interface access','upgrade config lookup','Lazy<UpgradesService>.Value','powf','modf'],limitations='Synthetic IL2CPP objects and original configuration; no full Android app or runtime SDKs executed.')
 a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(result,separators=(',',':'))+'\n');print(f"Wrote {a.out}: {len(result['incomes'])} income + {len(result['costs'])} cost cases, all 16 upgrade ranges")
if __name__=='__main__':main()
