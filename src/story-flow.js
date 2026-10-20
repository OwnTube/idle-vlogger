export class StoryFlow {
  constructor(scene,variables={}){this.scene=scene;this.variables=Object.assign(Object.create(null),variables);this.index=0;}
  get done(){return this.index>=this.scene.frames.length;}
  get frame(){return this.scene.frames[this.index];}
  goto(index){if(!Number.isInteger(index)||index<0||index>this.scene.frames.length)throw Error('Invalid original story branch');this.index=index;return true;}
  value(entry){return entry.type===0?entry.bool:entry.type===1?entry.string:entry.number;}
  matches(c){
    const value=this.variables[c.key]??(c.type===0?false:c.type===1?'':0),target=this.value(c);
    return [()=>value===target,()=>value!==target,()=>value>target,()=>value>=target,()=>value<target,()=>value<=target,()=>value===true,()=>value===false][c.comparison]?.()??false;
  }
  advance(){
    if(this.done||this.frame.choices.length)return false;
    const branch=this.frame.conditional.find(b=>b.conditions.every(c=>this.matches(c)));
    return this.goto(branch?branch.target:this.frame.next>=0?this.frame.next:this.index+1);
  }
  choose(index){
    const option=this.frame?.choices[index];if(!option)throw Error('Invalid story choice');
    if(option.requirements.length||option.rewards.length)throw Error('This story reward/requirement is not supported yet');
    for(const assignment of option.assignments){if(['__proto__','constructor','prototype'].includes(assignment.key))throw Error('Invalid story variable');this.variables[assignment.key]=this.value(assignment);}
    return this.goto(option.target);
  }
}
