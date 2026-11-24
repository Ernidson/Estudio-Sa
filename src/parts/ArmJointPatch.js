// Small underlays sampled only from the two textures meeting at the joint.
const joins = new Map([
  ['ombro_esquerdo', 'peito'],
  ['cotovelo_esquerdo', 'ombro_esquerdo'],
  ['pulso_esquerdo', 'cotovelo_esquerdo']
]);

export function drawArmJoints(ctx, parts, rig) {
  for (const [childId, parentId] of joins) {
    const child = parts.find(part => part.boneId === childId);
    const parent = parts.find(part => part.boneId === parentId);
    const bone = rig.getBone(childId);
    if (!child?.imageElement || !parent?.imageElement || bone?.parentId !== parentId) continue;
    const delta = bone.getLocalRotation() - (bone.poseReferenceAngle ?? bone.getLocalRotation());
    const angle = Math.atan2(Math.sin(delta*Math.PI/180), Math.cos(delta*Math.PI/180))*180/Math.PI;
    if (Math.abs(angle)<0.01) continue;
    const radius = Math.min(child.imageWidth, child.imageHeight) * 0.38;
    // Limit the overlap to the opening side of the bend. The opposite
    // silhouette would otherwise acquire a second outline of the limb.
    const next = bone.children[0];
    const axis = next ? bone.worldTransform.transformVector(next.localPosition.x, next.localPosition.y)
      : bone.parent.worldTransform.transformVector(bone.localPosition.x, bone.localPosition.y);
    const bisector = Math.atan2(axis.y, axis.x) + (next ? -1 : 1) * angle * Math.PI / 360;
    const origin = bone.getWorldPoint();
    ctx.save();
    ctx.beginPath();
    const side = -Math.sign(angle);
    for (const [u,v] of [[-2,0],[2,0],[2,2*side],[-2,2*side]]) {
      ctx.lineTo(origin.x + radius*(u*Math.cos(bisector)-v*Math.sin(bisector)),
        origin.y + radius*(u*Math.sin(bisector)+v*Math.cos(bisector)));
    }
    ctx.closePath();
    ctx.clip();
    // Parent texture is expressed in the parent frame; child texture in the child frame.
    for (const [part, joint, frame, rotation] of [
      [parent,bone.localPosition,bone.parent.worldTransform,angle/2],
      [child,{x:0,y:0},bone.worldTransform,-angle/2]
    ]) {
      ctx.save();
      ctx.transform(...frame.m);
      ctx.translate(joint.x,joint.y);
      ctx.beginPath();
      ctx.arc(0,0,radius,0,2*Math.PI);
      ctx.clip();
      ctx.rotate(rotation*Math.PI/180);
      ctx.translate(-joint.x,-joint.y);
      ctx.transform(...part.localTransform.m);
      ctx.drawImage(part.imageElement,-part.pivot.x*part.imageWidth,-part.pivot.y*part.imageHeight);
      ctx.restore();
    }
    ctx.restore();
  }
}
