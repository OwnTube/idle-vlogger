// Frame actions, dialogue, positions and both character rigs come from the APK.
// This player supports the eight-frame 1fast intro; branching scenes are separate.
export class Intro {
  constructor(world,files,onFinish){this.world=world;this.files=files;this.onFinish=onFinish;this.active=false;this.frame=-1;}
  async load(){
    this.data=await this.files.json('story/intro.json');
    this.van=await this.world.createSpine('story','Van');this.van.zIndex=201;this.van.visible=false;this.world.root.addChild(this.van);
    this.map=await this.files.json('story/van-map.json');
    this.pairs=this.map.C_0.pairs;
  }
  start(){
    this.active=true;this.frame=-1;
    const hero=this.world.hero;this.previous={x:hero.x,y:hero.y,scale:hero.scale.x};
    this.world.storyEquipmentSlots=new Set(Object.entries(this.world.c.spine_map_lamar).filter(([key])=>/^(CAM|TRIPOD|MIC|LIGHT)_/.test(key)).flatMap(([,v])=>v.pairs.map(p=>p[1])));
    this.floorOffset=0;
    this.position(hero,'l_0');this.position(this.van,'r_0');this.van.visible=true;
    hero.state.setAnimation(0,'NAR/CALM',true);this.van.state.setAnimation(0,'CALM',true);
    hero.update(0);this.world.applyAttachments();this.step(0);
    // These rigs use different origins. Ground alignment is reconstructed until
    // the native narrative camera and parent-transform behavior are reproduced.
    this.floorOffset=hero.getLocalBounds().bottom*hero.scale.y-this.van.getLocalBounds().bottom*this.van.scale.y;
    document.querySelector('#hud').hidden=true;document.querySelector('#intro').hidden=false;this.advance();
  }
  position(actor,id){
    const p=this.data.positions.find(p=>p.Id===id);if(!p)throw Error(`Unknown original story position ${id}`);
    const unit=1920/26;actor.scale.set(unit*.01);actor.position.set(540+p.PersonPos.x*unit,960+(1-p.PersonPos.y)*unit+(actor===this.van?(this.floorOffset||0):0));
  }
  advance(){
    if(!this.active)return;
    const previous=this.data.scene.frames[this.frame];this.frame=previous?.next>=0?previous.next:this.frame+1;
    if(this.frame>=this.data.scene.frames.length){this.finish();return;}
    let speaker='lamar';
    for(const action of this.data.scene.frames[this.frame].actions){
      const parts=action.split('_'),type=parts.shift(),person=parts.shift();
      const actor=person==='lamar'?this.world.hero:person==='van'?this.van:null;
      if(type==='pos'&&actor)this.position(actor,parts.join('_'));
      if(type==='speak')speaker=person;
      if(type==='em'&&actor){
        const animation=(person==='lamar'?'NAR/':'')+parts.join('_').toUpperCase();
        if(!actor.spineData.findAnimation(animation))throw Error(`Missing original story animation ${animation}`);
        actor.state.setAnimation(0,animation,true);
      }
    }
    document.querySelector('#intro-speaker').textContent=speaker==='van'?'Van':'Lamar';
    document.querySelector('#intro-line').textContent=this.data.scene.texts[this.frame];
    document.querySelector('#intro-count').textContent=`${this.frame+1} / ${this.data.scene.frames.length}`;
    document.querySelector('#intro-next-label').textContent=this.frame===this.data.scene.frames.length-1?'Start vlogging':'Continue';
    document.querySelector('#intro').dataset.speaker=speaker;
    this.step(0);this.world.hero.update(0);this.world.applyAttachments();
  }
  step(dt){
    if(!this.active)return;this.van.update(dt);
    for(const [attachment,slotName] of this.pairs){const slot=this.van.skeleton.findSlot(slotName);if(slot)slot.setAttachment(attachment?this.van.skeleton.getAttachmentByName(slotName,attachment):null);}
  }
  finish(){
    if(!this.active)return;this.active=false;this.van.visible=false;
    this.world.storyEquipmentSlots=null;this.world.hero.position.set(this.previous.x,this.previous.y);this.world.hero.scale.set(this.previous.scale);
    this.world.hero.skeleton.setToSetupPose();this.world.hero.state.setAnimation(0,this.world.pose+'/IDLE',true);this.world.hero.update(0);this.world.refreshOutfit();
    document.querySelector('#intro').hidden=true;document.querySelector('#hud').hidden=false;this.onFinish();
  }
}
