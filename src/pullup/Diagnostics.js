// Measurements use the same full affine chain as PartRenderer, including local edits.
export function contactUV(contact) {
  return contact?.uv ?? {x: 0.5, y: 0.45};
}

export function measureArm(obj, bar, side, index) {
  const rig = obj.rig;
  const bones = ['ombro', 'cotovelo', 'pulso'].map(name => rig.getBone(`${name}_${side}`));
  const hand = obj.partManager?.getAllParts().find(part => part.boneId === bones[2]?.id);
  const grip = obj.pullup?.grips[index];
  if (!hand || !grip || bones.some(bone => !bone)) return null;
  const uv = contactUV(obj.pullup.contacts[index]);
  const texture = obj.transform.clone().multiply(bones[2].worldTransform).multiply(hand.localTransform);
  const drawn = texture.transformPoint((uv.x - hand.pivot.x) * hand.imageWidth,
    (uv.y - hand.pivot.y) * hand.imageHeight);
  const target = bar.transform.transformPoint(grip.x, grip.y);
  const [shoulder, elbow, wrist] = bones.map(bone => {
    const p = bone.getWorldPoint();
    return obj.transform.transformPoint(p.x, p.y);
  });
  const a = {x: elbow.x - shoulder.x, y: elbow.y - shoulder.y};
  const b = {x: wrist.x - elbow.x, y: wrist.y - elbow.y};
  const flexion = Math.acos(Math.max(-1, Math.min(1,
    (a.x*b.x + a.y*b.y) / (Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y))))) * 180 / Math.PI;
  return {shoulder, elbow, wrist, drawn, target, flexion,
    error: Math.hypot(drawn.x-target.x, drawn.y-target.y)};
}

export function drawArmDiagnostic(ctx, viewport, sample, label) {
  if (!sample) return;
  ctx.save();
  ctx.font = '12px monospace';
  ctx.lineWidth = 2;
  for (const [name, color] of [['shoulder','#85aaff'], ['elbow','#85aaff'],
    ['wrist','#ff80df'], ['drawn','#40ffb0'], ['target','#ffd347']]) {
    const p = viewport.transformPoint(sample[name].x, sample[name].y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    const radius = name === 'target' ? 10 : 4;
    ctx.arc(p.x,p.y,radius,0,Math.PI*2);
    ctx.stroke();
    ctx.fillText(`${label} ${name} ${sample[name].x.toFixed(1)},${sample[name].y.toFixed(1)}`,
      p.x+13, p.y+(name === 'drawn' ? 16 : -8));
  }
  ctx.restore();
}
