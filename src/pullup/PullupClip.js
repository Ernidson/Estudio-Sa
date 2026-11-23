import {capturePose} from '../animation/PoseClip.js';

export function createPullupClip(obj,height,duration,fps=30,curve='ease-in-out') {
  const initial=obj.animation?.exercise==='pullup' ? structuredClone(obj.animation.initial) : capturePose(obj);
  const root=obj.rig.getRoot(), config=obj.pullup;
  initial.bones[root.id][5]=config.restY;
  config.height=height;
  const keys=[0,.16,.52,1,.53,0].map((progress,index)=>{
    const pose=structuredClone(initial);
    pose.bones[root.id][5]-=height*progress;
    return {time:index*duration/5,curve,pose};
  });
  return {initial,keys,duration,fps,exercise:'pullup',rate:obj.animation?.rate ?? 1};
}

export function resizeLift(obj,height) {
  const config=obj.pullup,clip=obj.animation;
  if(clip?.exercise==='pullup'){
    const id=obj.rig.getRoot().id;
    for(const key of clip.keys) {
      const m=key.pose.bones[id];
      if(m)m[5]=config.restY+(m[5]-config.restY)*height/config.height;
    }
  }
  config.height=height;
}
