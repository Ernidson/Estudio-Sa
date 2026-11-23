import {sides} from './Station.js';

const deg=r=>r*180/Math.PI;
const direction=(x,y)=>Math.atan2(y,x);
export function twoLink(shoulder,target,upper,fore,side) {
  const dx=target.x-shoulder.x, dy=target.y-shoulder.y;
  const distance=Math.hypot(dx,dy);
  // Flexion is measured from full extension. Clamp unreachable targets.
  const min=Math.sqrt(upper**2+fore**2+2*upper*fore*Math.cos(155*Math.PI/180));
  const reach=Math.max(min,Math.min(upper+fore,distance));
  const bend=side*Math.acos(Math.max(-1,Math.min(1,(reach**2-upper**2-fore**2)/(2*upper*fore))));
  const angle=direction(dx,dy)-Math.atan2(fore*Math.sin(bend),upper+fore*Math.cos(bend));
  return {upper:angle,fore:angle+bend,error:Math.abs(distance-reach)};
}
function pointInParent(parent,bone) {
  const p=bone.getWorldPoint();return parent.inverseTransformPoint(p.x,p.y);
}
function aim(bone,child,angle) {
  const tip=bone.localTransform.transformVector(child.localPosition.x,child.localPosition.y);
  bone.poseAt(bone.getLocalRotation()+deg(angle-direction(tip.x,tip.y)));
}
export function constrainArms(obj,bar) {
  const config=obj?.pullup;
  if(!config?.fixed || !bar)return 0;
  const rig=obj.rig;
  let error=0;
  rig.computeWorldTransforms();
  for(const [i,side] of sides.entries()){
    const shoulder=rig.getBone('ombro_'+side), elbow=rig.getBone('cotovelo_'+side), wrist=rig.getBone('pulso_'+side);
    if(!shoulder || !elbow || !wrist)continue;
    const frame=shoulder.parent.worldTransform;
    const grip=config.grips[i], contact=config.contacts[i];
    const world=bar.transform.transformPoint(grip.x,grip.y);
    const local=obj.transform.inverseTransformPoint(world.x,world.y);
    // The raster contact follows local hand edits. Rotate that offset into
    // the held orientation, leaving the user's piece transform intact.
    const hand=obj.partManager.getAllParts().find(p=>p.boneId===wrist.id);
    let ox=contact.point.x-contact.wrist.x, oy=contact.point.y-contact.wrist.y;
    if(hand){
      const texel=hand.localTransform.transformPoint((.5-hand.pivot.x)*hand.imageWidth,(.45-hand.pivot.y)*hand.imageHeight);
      const current=wrist.worldTransform.transformVector(texel.x,texel.y);
      const angle=(contact.angle-wrist.worldTransform.decompose().rotation)*Math.PI/180;
      ox=current.x*Math.cos(angle)-current.y*Math.sin(angle);
      oy=current.x*Math.sin(angle)+current.y*Math.cos(angle);
    }
    const target=frame.inverseTransformPoint(local.x-ox,local.y-oy);
    const a=pointInParent(frame,shoulder), b=pointInParent(frame,elbow), c=pointInParent(frame,wrist);
    const angleDifference=wrist.worldTransform.decompose().rotation-contact.angle;
    if(Math.hypot(c.x-target.x,c.y-target.y)<1e-7 && Math.abs(Math.sin(angleDifference*Math.PI/360))<1e-9)continue;
    const solution=twoLink(a,target,Math.hypot(b.x-a.x,b.y-a.y),Math.hypot(c.x-b.x,c.y-b.y),i===0?1:-1);
    aim(shoulder,elbow,solution.upper);
    shoulder.computeWorldTransform(frame);
    const vector=frame.transformVector(Math.cos(solution.fore),Math.sin(solution.fore));
    const inShoulder=shoulder.worldTransform.inverseTransformVector(vector.x,vector.y);
    aim(elbow,wrist,direction(inShoulder.x,inShoulder.y));
    elbow.computeWorldTransform(shoulder.worldTransform);
    wrist.poseAt(wrist.getLocalRotation()+contact.angle-wrist.worldTransform.decompose().rotation);
    wrist.computeWorldTransform(elbow.worldTransform);
    error=Math.max(error,solution.error);
  }
  return error;
}
