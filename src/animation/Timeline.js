import {capturePose,applyPose,samplePose} from './PoseClip.js';

export function timelineEditor(panel, refresh) {
  const field = name => panel.querySelector('[name="'+name+'"]');
  let obj=null, time=0, started=null, clipboard=null;
  const clip = () => obj.animation ??= {duration:3,fps:30,keys:[],initial:capturePose(obj)};
  const pause = () => { started=null; };
  const channels=['x','y','rotation','scaleX','scaleY'];
  const bone = () => obj?.rig.getBone(field('bone').value);
  function localChannels(joint) {
    const m=joint.localTransform.m;
    return {x:m[4], y:m[5], rotation:joint.getLocalRotation(),
      scaleX:Math.hypot(m[0],m[1]), scaleY:Math.hypot(m[2],m[3])};
  }
  function showBone() {
    const joint=bone();
    if (!joint) return;
    const values=localChannels(joint);
    for (const name of channels) field(name).value=Number(values[name].toFixed(4));
  }
  field('bone').onchange=showBone;
  for (const name of channels) {
    field(name).onchange=event=>{
      const joint=bone(), value=event.target.valueAsNumber;
      if (!joint || !Number.isFinite(value)) return showBone();
      pause();clip();
      const values=localChannels(joint);
      if (name==='rotation') joint.poseAt(value);
      else if (name==='x' || name==='y') {
        values[name]=value;
        joint.setLocalPosition(values.x,values.y);
      } else if (value>0 && values[name]>0) {
        const factor=value/values[name];
        joint.localTransform.scale(name==='scaleX'?factor:1,name==='scaleY'?factor:1);
      }
      obj.rig.computeWorldTransforms();
      showBone();refresh();
    };
  }
  function display() {
    field('cursor').value=time;
    field('seconds').textContent=time.toFixed(2)+' s';
  }
  function seek(value) {
    const data=clip();
    time=Math.max(0,Math.min(data.duration,value));
    const pose=samplePose(data.keys,time);
    if (pose) applyPose(obj,pose);
    display();
    if(started===null) showBone();
  }
  function sync() {
    const data=obj.animation ?? {duration:3,fps:30,keys:[]};
    field('duration').value=data.duration;
    field('fps').value=data.fps;
    field('cursor').max=data.duration;
    field('cursor').step=1/data.fps;
    field('keys').replaceChildren(new Option('Ir para keyframe',''),...data.keys.map(k=>new Option(k.time.toFixed(2)+' s · '+k.curve,k.time)));
    panel.querySelector('datalist').replaceChildren(...data.keys.map(k=>new Option('',k.time)));
    display();showBone();
  }
  function record() {
    const data=clip();
    data.keys=data.keys.filter(k=>Math.abs(k.time-time)>1e-7);
    data.keys.push({time,curve:field('curve').value,pose:capturePose(obj)});
    data.keys.sort((a,b)=>a.time-b.time);
  }
  function demo() {
    const elbow=obj.rig.getBone('cotovelo_esquerdo');
    if (!elbow || (clip().keys.length && !confirm('Substituir os keyframes pela demonstração?'))) return;
    const data=clip();
    data.duration=3;
    data.keys=[];
    const angle=elbow.getLocalRotation();
    field('curve').value='ease-in-out';
    data.initial=capturePose(obj);
    for (const [second,offset] of [[0,0],[1,30],[2,65],[3,0]]) {
      time=second;
      if (offset) elbow.poseAt(angle+offset);
      else applyPose(obj,data.initial);
      record();
    }
    seek(0);
  }
  panel.onclick=event=>{
    const action=event.target.closest('button')?.value;
    if (!action || !obj) return;
    if (action==='play') {
      if (!clip().keys.length || started!==null) return;
      if (time>=clip().duration) seek(0);
      started=performance.now()-time*1000;
      return;
    }
    pause();
    switch(action) {
      case 'pause': break;
      case 'stop': case 'start': seek(0); break;
      case 'add': record(); break;
      case 'remove': clip().keys=clip().keys.filter(k=>Math.abs(k.time-time)>1e-7); break;
      case 'copy': clipboard=capturePose(obj); break;
      case 'paste': if (clipboard) applyPose(obj,clipboard); break;
      case 'reset': applyPose(obj,clip().initial); break;
      case 'demo': demo(); break;
    }
    sync();
    refresh();
  };
  field('duration').onchange=e=>{
    pause();
    const value=e.target.valueAsNumber;
    if (Number.isFinite(value) && value>=Math.max(0.1,clip().keys.at(-1)?.time ?? 0)) clip().duration=value;
    seek(time);sync();refresh();
  };
  field('fps').onchange=e=>{pause();clip().fps=Number(e.target.value);sync();};
  field('keys').onchange=e=>{if(e.target.value!==''){pause();seek(Number(e.target.value));refresh();}};
  field('cursor').oninput=e=>{pause();seek(Number(e.target.value));refresh();};
  return {
    select(character) {
      pause();obj=character;time=0;clipboard=null;
      if(obj) {
        field('bone').replaceChildren(...obj.rig.getAllBones().map(b=>new Option(b.name,b.id)));
        sync();
      }
    },
    tick(now) {
      if(started===null || !obj) return;
      const data=clip(), elapsed=(now-started)/1000;
      if(elapsed>=data.duration && !field('loop').checked) {
        seek(data.duration);pause();refresh();return;
      }
      const sample=Math.floor((elapsed%data.duration)*data.fps)/data.fps;
      if(sample!==time) seek(sample);
    }
  };
}
