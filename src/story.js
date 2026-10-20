import {StoryFlow} from './story-flow.js';
// Scripts, branch targets, dialogue, positions and all three rigs are original.
// Camera composition, grounding and HTML presentation are still reconstructed.
const $=s=>document.querySelector(s);
export class Intro {
  constructor(world,files,onFinish,variables=()=>({})){this.world=world;this.files=files;this.onFinish=onFinish;this.variables=variables;this.active=false;}
  get frame(){return this.flow?.index??-1;}
  get sceneId(){return this.flow?.scene.id??null;}
  async load(){
    this.data=await this.files.json('story/intro.json');this.actors={lamar:this.world.hero};
    for(const name of ['Van','Harry']){const actor=await this.world.createSpine('story',name);actor.visible=false;this.world.root.addChild(actor);this.actors[name.toLowerCase()]=actor;}
    this.pairs=(await this.files.json('story/van-map.json')).C_0.pairs;
  }
  start(id='1'){
    const scene=this.data.scenes[id];if(!scene)throw Error('Unknown original introduction');
    this.flow=new StoryFlow(scene,this.variables());this.active=true;this.curtains=false;this.timer=null;
    const hero=this.world.hero;this.previous={x:hero.x,y:hero.y,scale:hero.scale.x,z:hero.zIndex};this.floorOffsets={};
    this.world.storyEquipmentSlots=new Set(Object.entries(this.world.c.spine_map_lamar).filter(([key])=>/^(CAM|TRIPOD|MIC|LIGHT)_/.test(key)).flatMap(([,v])=>v.pairs.map(p=>p[1])));
    for(const [person,actor] of Object.entries(this.actors)){
      this.position(person,person==='lamar'?'l_0':'r_out');actor.state.setAnimation(0,person==='lamar'?'NAR/CALM':'CALM',true);actor.update(0);
    }
    this.world.applyAttachments();this.attachVan();
    // Native narrative camera/parent transforms are not fully reproduced yet.
    const floor=hero.getLocalBounds().bottom*hero.scale.y;
    for(const [person,actor] of Object.entries(this.actors))if(person!=='lamar')this.floorOffsets[person]=floor-actor.getLocalBounds().bottom*actor.scale.y;
    $('#hud').hidden=true;$('#intro').hidden=false;this.show();
  }
  position(person,id){
    const actor=this.actors[person],p=this.data.positions.find(p=>p.Id===id);if(!actor||!p)throw Error(`Unknown story position ${person}:${id}`);
    const unit=1920/26;actor.scale.set(unit*.01);actor.position.set(540+p.PersonPos.x*unit,960+(1-p.PersonPos.y)*unit+(this.floorOffsets[person]||0));actor.zIndex=200+p.SortingOrderOffset;actor.visible=!id.endsWith('_out');
  }
  text(value){
    const config=this.world.c.ab17_main_narrative;
    return value.replace(/<sprite\s+name=money>/g,'$').replaceAll('{VAR_C}',config.InTextVarC.toLocaleString('en-US')).replaceAll('{VAR_X}',config.InTextVarX.toLocaleString('en-US'));
  }
  show(){
    if(this.flow.done){this.finish();return;}
    let speaker='lamar';this.timer=null;
    for(const action of this.flow.frame.actions){
      const [type,person,...name]=action.split('_'),actor=this.actors[person];
      if(type==='pos')this.position(person,name.join('_'));
      else if(type==='speak')speaker=person;
      else if(type==='em'){
        const animation=(person==='lamar'?'NAR/':'')+name.join('_').toUpperCase();
        if(!actor?.spineData.findAnimation(animation))throw Error(`Missing original story animation ${person}:${animation}`);
        actor.state.setAnimation(0,animation,true);
      }
      else if(type==='curtains')this.curtains=person==='on';
      else if(type==='auto'&&person==='play')this.timer=Number(name[0]);
      else if(type!=='cl-atts'||person!=='van'||name[0]!=='0')throw Error(`Unsupported intro action ${action}`);
    }
    const text=this.text(this.flow.scene.texts[this.frame]);
    $('#intro-speaker').textContent=speaker==='no'?'':speaker[0].toUpperCase()+speaker.slice(1);$('#intro-line').textContent=text;
    $('#intro-count').textContent=`${this.frame+1} / ${this.flow.scene.frames.length}`;$('#intro-next-label').textContent=this.frame===this.flow.scene.frames.length-1?'Start vlogging':'Continue';
    $('#intro-dialogue').hidden=this.curtains;$('#intro-curtain').hidden=!this.curtains;$('#intro-curtain').textContent=text;
    const choices=this.flow.frame.choices;$('#intro-next').hidden=choices.length>0;$('#intro-choices').hidden=!choices.length;$('#intro-choices').replaceChildren();
    choices.forEach((option,index)=>{const b=document.createElement('button');b.textContent=this.flow.scene.labels[option.key];b.dataset.choice=option.key;b.onclick=()=>{this.flow.choose(index);this.show();};$('#intro-choices').append(b);});
    for(const actor of Object.values(this.actors))actor.update(0);this.attachVan();this.world.applyAttachments();
    if(this.curtains)$('#intro-curtain').focus({preventScroll:true});else (choices.length?$('#intro-choices button'):$('#intro-next')).focus({preventScroll:true});
  }
  advance(){if(this.active&&this.flow.advance())this.show();}
  attachVan(){
    const van=this.actors.van;
    for(const [attachment,name] of this.pairs){const slot=van.skeleton.findSlot(name);if(slot)slot.setAttachment(attachment?van.skeleton.getAttachmentByName(name,attachment):null);}
  }
  step(dt){
    if(!this.active)return;
    for(const [person,actor] of Object.entries(this.actors))if(person!=='lamar')actor.update(dt);this.attachVan();
    if(this.timer!==null){this.timer-=dt;if(this.timer<=0)this.advance();}
  }
  finish(){
    if(!this.active)return;this.active=false;this.timer=null;
    for(const [person,actor] of Object.entries(this.actors))if(person!=='lamar')actor.visible=false;
    const hero=this.world.hero;this.world.storyEquipmentSlots=null;hero.position.set(this.previous.x,this.previous.y);hero.scale.set(this.previous.scale);hero.zIndex=this.previous.z;
    hero.skeleton.setToSetupPose();hero.state.setAnimation(0,this.world.pose+'/IDLE',true);hero.update(0);this.world.refreshOutfit();
    $('#intro').hidden=true;$('#hud').hidden=false;this.onFinish(Object.fromEntries(Object.entries(this.flow.variables)));
  }
}
