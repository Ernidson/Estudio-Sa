import {Rig} from '../rigging/Rig.js';

// Experimental, deliberately limited to the left shoulder and elbow.
// It supplies a small original-texture underlay; it never warps the torso sprite.
const cache = new WeakMap();
const joints = ['ombro_esquerdo', 'cotovelo_esquerdo'];
const smooth = value => {
  const t = Math.max(0,Math.min(1,value));
  return t*t*(3-2*t);
};

function prepare(obj) {
  const initial = obj.animation?.initial;
  if (!initial || !obj.imageElement) return null;
  const signature = JSON.stringify(initial);
  const textures = obj.partManager.getAllParts().map(part => part.imageElement);
  const previous = cache.get(obj);
  if (previous?.signature === signature && previous.image === obj.imageElement &&
      previous.textures.length === textures.length && previous.textures.every((image,i)=>image===textures[i])) return previous;
  const bind = Rig.fromJSON(obj.rig.toJSON());
  for (const bone of bind.getAllBones()) {
    const matrix = initial.bones[bone.id];
    if (matrix) {
      bone.setLocalPosition(matrix[4],matrix[5]);
      bone.localTransform.setMatrix(...matrix);
    }
  }
  bind.computeWorldTransforms();
  const patches = [];
  for (const id of joints) {
    const bone = bind.getBone(id), tip = bone?.children[0];
    const part = obj.partManager.getAllParts().find(p => p.boneId === id);
    if (!bone?.parent || !tip || !part) continue;
    const center = bone.getWorldPoint(), end = tip.getWorldPoint();
    const length = Math.hypot(end.x-center.x,end.y-center.y);
    if (length < 1) continue;
    const radius = Math.min(64,part.imageWidth*.4,length*.3);
    const extent = Math.ceil(radius), size = extent*2;
    const source = document.createElement('canvas');
    source.width = source.height = size;
    const ctx = source.getContext('2d');
    // Recompose only the existing raster cutouts. Erased mask pixels stay erased;
    // a refreshed texture invalidates the cache instead of resurrecting the PNG.
    for (const sourceId of [bone.parent.id,id]) {
      const sourcePart=obj.partManager.getAllParts().find(p=>p.boneId===sourceId);
      if (!sourcePart?.imageElement) continue;
      ctx.save();ctx.translate(extent-center.x,extent-center.y);
      ctx.transform(...bind.getBone(sourceId).worldTransform.m);
      ctx.transform(...sourcePart.localTransform.m);
      ctx.drawImage(sourcePart.imageElement,-sourcePart.pivot.x*sourcePart.imageWidth,
        -sourcePart.pivot.y*sourcePart.imageHeight);
      ctx.restore();
    }
    const gradient = ctx.createRadialGradient(extent,extent,radius*.8,extent,extent,radius);
    gradient.addColorStop(0,'black');gradient.addColorStop(1,'transparent');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = gradient;ctx.fillRect(0,0,size,size);
    const vertices = [], steps = 10;
    for (let y=0;y<=steps;y++) for (let x=0;x<=steps;x++) {
      const u=x*size/steps,v=y*size/steps;
      const p={x:center.x+u-extent,y:center.y+v-extent};
      const distance=Math.hypot(p.x-center.x,p.y-center.y);
      vertices.push({u,v,weight:.5*(1-smooth(distance/radius)),
        parent:bone.parent.worldTransform.inverseTransformPoint(p.x,p.y),
        child:bone.worldTransform.inverseTransformPoint(p.x,p.y)});
    }
    const triangles=[];
    for(let y=0;y<steps;y++)for(let x=0;x<steps;x++) {
      const a=y*(steps+1)+x,b=a+1,c=a+steps+1,d=c+1;
      triangles.push([a,b,c],[b,d,c]);
    }
    patches.push({id,parentId:bone.parent.id,source,vertices,triangles,
      restAngle:bone.getLocalRotation(),partId:part.id});
  }
  const entry={signature,image:obj.imageElement,textures,patches};
  cache.set(obj,entry);
  return entry;
}

function drawTriangle(ctx, source, vertices, points) {
  const [a,b,c]=vertices, [p,q,r]=points;
  const ux=b.u-a.u,uy=b.v-a.v,vx=c.u-a.u,vy=c.v-a.v;
  const determinant=ux*vy-uy*vx;
  const x1=q.x-p.x,y1=q.y-p.y,x2=r.x-p.x,y2=r.y-p.y;
  const A=(x1*vy-x2*uy)/determinant,B=(y1*vy-y2*uy)/determinant;
  const C=(x2*ux-x1*vx)/determinant,D=(y2*ux-y1*vx)/determinant;
  ctx.save();ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.lineTo(r.x,r.y);
  ctx.closePath();ctx.clip();
  ctx.transform(A,B,C,D,p.x-A*a.u-C*a.v,p.y-B*a.u-D*a.v);
  ctx.drawImage(source,0,0);ctx.restore();
}

export function drawLocalJointMeshes(ctx,obj) {
  const stats={triangles:0,folds:0,skippedEdits:0};
  if (!obj.pullup?.localMesh) return stats;
  const entry=prepare(obj);
  if (!entry) return stats;
  for (const patch of entry.patches) {
    const bone=obj.rig.getBone(patch.id),parent=obj.rig.getBone(patch.parentId);
    const delta=(bone.getLocalRotation()-patch.restAngle)*Math.PI/180;
    if (Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta)))<1e-5) continue;
    // Never hide a user's local adjustments under a texture from an old bind pose.
    const edited=[patch.id,patch.parentId].some(id=>{
      const part=obj.partManager.getAllParts().find(p=>p.boneId===id);
      const initial=obj.animation.initial.pieces[part?.id];
      if (!initial || !part) return true;
      const current=[part.localPosition.x,part.localPosition.y,part.localRotation,
        part.localScale.x,part.localScale.y,part.pivot.x,part.pivot.y];
      return current.some((v,i)=>Math.abs(v-initial[i])>1e-6);
    });
    if(edited){stats.skippedEdits++;continue;}
    const points=patch.vertices.map(v=>{
      const a=parent.worldTransform.transformPoint(v.parent.x,v.parent.y);
      const b=bone.worldTransform.transformPoint(v.child.x,v.child.y);
      const origin=bone.getWorldPoint();
      const angleA=Math.atan2(a.y-origin.y,a.x-origin.x);
      const angleB=Math.atan2(b.y-origin.y,b.x-origin.x);
      const difference=Math.atan2(Math.sin(angleB-angleA),Math.cos(angleB-angleA));
      const radiusA=Math.hypot(a.x-origin.x,a.y-origin.y);
      const radiusB=Math.hypot(b.x-origin.x,b.y-origin.y);
      // A radial rotation field avoids the collapse of linear position blending.
      const radius=radiusA+(radiusB-radiusA)*v.weight;
      const angle=angleA+difference*v.weight;
      return {x:origin.x+Math.cos(angle)*radius,y:origin.y+Math.sin(angle)*radius};
    });
    for(const indices of patch.triangles) {
      const destination=indices.map(i=>points[i]);
      const [a,b,c]=destination;
      if((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)<=1e-6){stats.folds++;continue;}
      drawTriangle(ctx,patch.source,indices.map(i=>patch.vertices[i]),destination);
      stats.triangles++;
    }
  }
  return stats;
}
