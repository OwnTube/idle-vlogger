"""Bounded decoder for NarrativeSceneAsset's recovered serialized fields."""
import math, struct

class Reader:
    def __init__(self,raw):self.raw=raw;self.cursor=28
    def unpack(self,fmt):
        n=struct.calcsize(fmt)
        if self.cursor+n>len(self.raw):raise ValueError('Truncated narrative field')
        value=struct.unpack_from(fmt,self.raw,self.cursor)[0];self.cursor+=n;return value
    def integer(self):return self.unpack('<i')
    def count(self):
        n=self.integer()
        if not 0<=n<=10000:raise ValueError('Invalid narrative count')
        return n
    def string(self):
        n=self.count()
        if self.cursor+n>len(self.raw):raise ValueError('Truncated narrative string')
        value=self.raw[self.cursor:self.cursor+n].decode();self.cursor=(self.cursor+n+3)//4*4;return value
    def boolean(self):
        value=self.unpack('<B');self.cursor=(self.cursor+3)//4*4
        if value not in [0,1]:raise ValueError('Invalid narrative boolean')
        return bool(value)
    def number(self,fmt='<d'):
        value=self.unpack(fmt)
        if not math.isfinite(value):raise ValueError('Non-finite narrative value')
        return value
    def array(self,fn):return [fn() for _ in range(self.count())]
    def condition(self):return dict(type=self.integer(),key=self.string(),comparison=self.integer(),bool=self.boolean(),string=self.string(),number=self.number())
    def assignment(self):return dict(type=self.integer(),key=self.string(),bool=self.boolean(),string=self.string(),number=self.number())
    def reward(self):return dict(type=self.integer(),stuff=self.integer(),amount=self.number('<f'),frame=self.integer())
    def requirement(self):return dict(type=self.integer(),skill=self.integer(),level=self.integer(),ad=self.integer(),canSkipWithAd=self.boolean())
    def conditional(self):return dict(conditions=self.array(self.condition),target=self.integer())
    def choice(self):return dict(key=self.string(),target=self.integer(),assignments=self.array(self.assignment),rewards=self.array(self.reward),requirements=self.array(self.requirement))
    def frame(self):return dict(next=self.integer(),actions=self.array(self.string),conditional=self.array(self.conditional),choices=self.array(self.choice))
    def scene(self):
        value=dict(name=self.string(),id=self.string(),frames=self.array(self.frame))
        if self.cursor!=len(self.raw):raise ValueError('Unconsumed narrative bytes')
        return value

def read_scene(raw):return Reader(raw).scene()
