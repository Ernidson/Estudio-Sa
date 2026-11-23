// Poses are local to each parent. Keeping the original bone matrices at keys also
// preserves calibrated scales and reflections when returning to an exact pose.
export function capturePose(obj) {
  const bones = {}, pieces = {};
  for (const bone of obj.rig.getAllBones()) bones[bone.id] = [...bone.localTransform.m];
  for (const p of obj.partManager.getAllParts()) {
    pieces[p.id] = [p.localPosition.x,p.localPosition.y,p.localRotation,p.localScale.x,p.localScale.y,p.pivot.x,p.pivot.y];
  }
  return {bones,pieces};
}

export function applyPose(obj, pose) {
  for (const bone of obj.rig.getAllBones()) {
    const m = pose.bones[bone.id];
    if (!m) continue;
    bone.poseReferenceAngle ??= bone.getLocalRotation();
    bone.setLocalPosition(m[4],m[5]);
    bone.localTransform.setMatrix(...m);
  }
  for (const p of obj.partManager.getAllParts()) {
    const v = pose.pieces[p.id];
    if (!v) continue;
    p.localPosition = {x:v[0],y:v[1]};
    p.localRotation = v[2];
    p.localScale = {x:v[3],y:v[4]};
    p.pivot = {x:v[5],y:v[6]};
    p.updateLocalTransform();
  }
  obj.rig.computeWorldTransforms();
}

const lerp = (a,b,t) => a + (b-a)*t;
export function turn(a,b,t) {
  const delta = (b-a)%360;
  return a + (delta>180 ? delta-360 : delta < -180 ? delta+360 : delta)*t;
}
const curves = {
  linear:t=>t, 'ease-in':t=>t*t, 'ease-out':t=>1-(1-t)**2,
  'ease-in-out':t=>t*t*(3-2*t)
};

function basis(m, angle) {
  const c=Math.cos(angle), s=Math.sin(angle);
  return [c*m[0]+s*m[1], c*m[2]+s*m[3], -s*m[2]+c*m[3]];
}
function interpolateMatrix(a,b,t) {
  const ra=Math.atan2(a[1],a[0]), rb=Math.atan2(b[1],b[0]);
  const angle=turn(ra*180/Math.PI,rb*180/Math.PI,t)*Math.PI/180;
  const first=basis(a,ra), last=basis(b,rb);
  const [sx,shear,sy]=first.map((v,i)=>lerp(v,last[i],t));
  const c=Math.cos(angle), s=Math.sin(angle);
  return [c*sx,s*sx,c*shear-s*sy,s*shear+c*sy,lerp(a[4],b[4],t),lerp(a[5],b[5],t)];
}

export function samplePose(keys,time) {
  if (!keys.length) return null;
  const right=keys.findIndex(k=>k.time>=time);
  if (right<0) return keys.at(-1).pose;
  const end=keys[right];
  if (!right || end.time===time) return end.pose;
  const start=keys[right-1], t=(curves[start.curve] || curves.linear)((time-start.time)/(end.time-start.time));
  const bones={}, pieces={};
  for (const [id,a] of Object.entries(start.pose.bones)) {
    const b=end.pose.bones[id];
    bones[id]=b ? interpolateMatrix(a,b,t) : a;
  }
  for (const [id,a] of Object.entries(start.pose.pieces)) {
    const b=end.pose.pieces[id];
    pieces[id]=b ? a.map((v,i)=>i===2 ? turn(v,b[i],t) : lerp(v,b[i],t)) : a;
  }
  return {bones,pieces};
}
