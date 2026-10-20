import {Application,Container,Sprite,Texture,BaseTexture} from 'pixi.js';
import {TextureAtlas} from '@pixi-spine/base';
import {SkeletonJson,AtlasAttachmentLoader,Spine} from '@pixi-spine/runtime-3.8';

export class World {
  constructor(host,files,config,simulation){
    this.files=files;this.c=config;this.sim=simulation;this.textures=new Map();this.parts=[];
    this.app=new Application({width:1080,height:1920,backgroundColor:0x45bad2,antialias:true,autoStart:false,resolution:1});
    host.append(this.app.view);this.app.stage.sortableChildren=true;
    this.root=new Container();this.root.sortableChildren=true;this.app.stage.addChild(this.root);
  }
  async texture(name){
    if(!this.textures.has(name)){
      const image=new Image();image.src=await this.files.url(name);await image.decode();this.textures.set(name,Texture.from(image));
    }return this.textures.get(name);
  }
  async init(){
    this.hero=await this.createSpine('spine','Lamar');
    this.hero.autoUpdate=false;this.hero.scale.set(0.83);this.hero.position.set(540-4.3*73.846,960+(1+.6)*73.846);this.hero.zIndex=200;
    this.root.addChild(this.hero);this.hero.state.setAnimation(0,'V_1/IDLE',true);this.hero.update(0);
    await this.area(this.sim.s.area);this.refreshOutfit();
  }
  async createSpine(folder,name){
    const json=await this.files.json(`${folder}/${name}.json`),text=await this.files.text(`${folder}/${name}.atlas`);
    const pages=[...text.matchAll(/^([^\s]+\.png)$/gm)].map(m=>m[1]);
    const sizes=new Map([...text.matchAll(/^([^\s]+\.png)\r?\nsize:\s*(\d+),\s*(\d+)/gm)].map(m=>[m[1],[Number(m[2]),Number(m[3])]]));
    const textures=new Map(await Promise.all(pages.map(async page=>{
      let base=(await this.texture(folder+'/'+page)).baseTexture;const size=sizes.get(page);
      // Unity's Android importer resized some atlas pages to powers of two.
      // Restore the atlas coordinate space before the Spine region parser runs.
      if(size&&(base.width!==size[0]||base.height!==size[1])){
        const canvas=document.createElement('canvas');[canvas.width,canvas.height]=size;
        canvas.getContext('2d').drawImage(base.resource.source,0,0,...size);base=BaseTexture.from(canvas);
      }
      return [page,base];
    })));
    const atlas=await new Promise(resolve=>new TextureAtlas(text,(name,ready)=>ready(textures.get(name)),resolve));
    const parser=new SkeletonJson(new AtlasAttachmentLoader(atlas));const actor=new Spine(parser.readSkeletonData(json));actor.autoUpdate=false;return actor;
  }
  async area(area,onProgress){
    await this.files.loadGroup(`area-${area}`,onProgress);
    const data=await this.files.json(`areas/${area}/scene.json`);
    await Promise.all([...new Set(data.map(layer=>layer.sprite.file))].map(name=>this.texture(name)));
    for(const p of this.parts){this.root.removeChild(p.sprite);p.sprite.destroy();}this.parts=[];
    // Unity's original camera: orthographic size 13, y=1, portrait 1080x1920.
    const unit=1920/26;
    for(const layer of data){
      const texture=await this.texture(layer.sprite.file);const sprite=new Sprite(texture),t=layer.transform;
      sprite.anchor.set(layer.sprite.pivot[0],1-layer.sprite.pivot[1]);
      sprite.position.set(540+t.x*unit,960+(1-t.y)*unit);
      sprite.scale.set(unit/layer.sprite.ppu*t.sx*(layer.flipX?-1:1),unit/layer.sprite.ppu*t.sy*(layer.flipY?-1:1));sprite.rotation=-t.angle;
      sprite.alpha=layer.color[3];
      const root=layer.root;
      sprite.zIndex=root.startsWith('area_back')?-100:root.startsWith('road')?-50:root.startsWith('house')||root.startsWith('yard')?10+layer.order:root.startsWith('car')?100+layer.order:250+layer.order;
      this.root.addChild(sprite);this.parts.push({sprite,layer});
    }this.refreshOutfit();
  }
  refreshOutfit(){
    if(!this.hero)return;
    const s=this.sim.s,area=s.area,free=!!this.c.world_assets._personPoseMap.find(x=>x.Area===area&&x.TripodTier===this.sim.tier(6))?.IsFreePos;
    const pose=free?'V_2':'V_1';
    if(this.pose!==pose){this.pose=pose;this.hero.state.setAnimation(0,pose+'/IDLE',true);this.hero.update(0);}
    const region=this.c[`world_area_${area}_asset`];this.override=[];
    const map=this.c.spine_map_lamar;
    // Slot sets from the recovered mapping prevent remnants of the previous outfit.
    const types=['CLOTHES','HAIR','WATCH','CAM','TRIPOD','MIC','LIGHT'];
    for(const type of types){
      const slots=new Set(Object.entries(map).filter(([k])=>k.startsWith(type+'_')).flatMap(([,v])=>v.pairs.map(p=>p[1])));
      for(const slot of slots)this.override.push([slot,null]);
    }
    for(const item of region._personStuffs){
      if(item.Tier!==this.sim.tier(item.Id)||item.Variant!==0)continue;
      if(free&&['Cam','Light','Mic'].includes(['House','Car','Road','Yard','Statue','Cam','Tripod','Mic','Light'][item.Id])){
        if(region._sceneStuffs.some(x=>x.Id===item.Id&&x.Tier===item.Tier&&x.Variant===1))continue;
      }
      const entry=map[item.SpineItem];if(entry)for(const [attachment,slot] of entry.pairs)this.override.push([slot,attachment]);
    }
    for(const part of this.parts){
      const root=part.layer.root;
      if(root.startsWith('area_back')){part.sprite.visible=true;continue;}
      const prefixes=['house','car','road','yard','statue','cam','tripod','mic','light'];
      const id=prefixes.findIndex(p=>root.startsWith(p+'_'));
      const match=root.match(/_(\d+)_([0-2])(?:_v(\d+))?$/);
      if(id>=0&&match){const tier=this.sim.tier(id);part.sprite.visible=Number(match[2])===tier&&(!match[3]||Number(match[3])===(free?1:0));}
      else part.sprite.visible=false;
      if(root.startsWith('boxes_'))part.sprite.visible=this.sim.tier(0)===0;
    }
    this.applyAttachments();
  }
  applyAttachments(){
    for(const [name,attachment] of this.override||[]){const slot=this.hero.skeleton.findSlot(name);if(!slot)continue;const a=attachment&&!(this.storyEquipmentSlots?.has(name))?this.hero.skeleton.getAttachmentByName(name,attachment):null;slot.setAttachment(a);}
  }
  react(){
    const choice=['SPEAK_HEAD','SPEAK_ARM','EMOTION_LIKE','EMOTION_HAHA'][Math.floor(Math.random()*4)];
    this.hero.state.setAnimation(0,this.pose+'/'+choice,false);this.hero.state.addAnimation(0,this.pose+'/IDLE',true,0);
  }
  step(dt){this.hero?.update(dt);this.applyAttachments();}
  render(){this.app.renderer.render(this.app.stage);}
}
