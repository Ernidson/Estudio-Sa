import {SceneObject} from '../core/Scene.js';

export const sides=['esquerdo','direito'];
export async function readPNG(file) {
  const data=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
  const image=new Image();image.src=data;await image.decode();
  return {image,data};
}
function handContact(obj,side) {
  const wrist=obj.rig.getBone('pulso_'+side);
  const hand=obj.partManager.getAllParts().find(p=>p.boneId===wrist.id);
  if (!hand?.mask?.bounds) throw Error('Gera as duas peças das mãos antes de associar a barra.');
  const point=wrist.worldTransform.clone().multiply(hand.localTransform).transformPoint(
    (0.5-hand.pivot.x)*hand.imageWidth,(0.45-hand.pivot.y)*hand.imageHeight);
  return {point, wrist:wrist.getWorldPoint(), angle:wrist.getWorldRotation?.() ?? wrist.worldTransform.decompose().rotation};
}
export async function attachBar(scene,obj,file) {
  const {image,data}=await readPNG(file);
  obj.rig.computeWorldTransforms();
  const contacts=sides.map(side=>handContact(obj,side));
  const canvas=document.createElement('canvas');canvas.width=1;canvas.height=image.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,-Math.floor(image.width/2),0);
  const pixels=ctx.getImageData(0,0,1,canvas.height).data;
  let top=0;while(top<image.height && pixels[top*4+3]<128)top++;
  if(top===image.height)throw Error('O centro da estrutura não contém um travessão visível.');
  let bottom=top;while(bottom<image.height && pixels[bottom*4+3]>=128)bottom++;
  const rail=(top+bottom)/2-image.height/2;
  const points=contacts.map(c=>obj.transform.transformPoint(c.point.x,c.point.y));
  const scale=Math.hypot(...obj.transform.m.slice(0,2))*1.22;
  const bar=new SceneObject({name:'Barra fixa',imageData:data,imageWidth:image.width,imageHeight:image.height,locked:true});
  bar.imageElement=image;
  bar.transform.compose((points[0].x+points[1].x)/2,(points[0].y+points[1].y)/2-rail*scale,0,scale,scale);
  scene.addObject(bar);bar.layerOrder=Math.min(...scene.objects.map(o=>o.layerOrder))-1;scene.sortObjects();
  obj.pullup={barId:bar.id,fixed:true,height:280,restY:obj.rig.getRoot().localPosition.y,contacts,
    grips:points.map(p=>({x:bar.transform.inverseTransformPoint(p.x,p.y).x,y:bar.transform.inverseTransformPoint(p.x,p.y).y}))};
  return bar;
}

export function setupStation(panel,getCharacter,getScene,updated) {
  const field=n=>panel.querySelector('[name="'+n+'"]');
  const bar=()=>getScene().objects.find(o=>o.id===getCharacter()?.pullup?.barId);
  function refresh() {
    const obj=getCharacter(), structure=bar();
    field('settings').hidden=!structure;
    if(!structure)return;
    const config=obj.pullup, m=structure.transform.m;
    field('locked').checked=structure.locked;field('fixed').checked=config.fixed;
    for(const [n,v] of Object.entries({barX:m[4],barY:m[5],size:Math.hypot(m[0],m[1])})) {
      field(n).value=v;field(n).disabled=structure.locked;
    }
    config.grips.forEach((p,i)=>{for(const axis of ['x','y'])field(axis+i).value=p[axis];});
  }
  field('structure').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try {
      if(bar())throw Error('Esta personagem já tem uma barra associada.');
      await attachBar(getScene(),getCharacter(),file);updated();
    } catch(error){field('status').textContent=error.message;}
    e.target.value='';refresh();
  };
  field('settings').onchange=e=>{
    const structure=bar(), config=getCharacter().pullup;
    if(e.target===field('locked'))structure.locked=e.target.checked;
    else if(e.target===field('fixed'))config.fixed=e.target.checked;
    else if(['barX','barY','size'].includes(e.target.name) && !structure.locked){
      const [x,y,s]=['barX','barY','size'].map(n=>field(n).valueAsNumber);
      if([x,y,s].every(Number.isFinite) && s>0)structure.transform.compose(x,y,0,s,s);
    } else if(/^[xy][01]$/.test(e.target.name) && Number.isFinite(e.target.valueAsNumber)){
      config.grips[Number(e.target.name[1])][e.target.name[0]]=e.target.valueAsNumber;
    }
    refresh();
  };
  function drawGrips(ctx,viewport) {
    if(!panel.open || panel.closest('.hidden'))return;
    const structure=bar();if(!structure)return;
    const transform=viewport.clone().multiply(structure.transform);
    ctx.save();ctx.lineWidth=2;ctx.strokeStyle='#ffcd48';ctx.fillStyle='#ffcd48';
    getCharacter().pullup.grips.forEach((g,i)=>{
      const p=transform.transformPoint(g.x,g.y);
      ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.stroke();
      ctx.fillText(i?'D':'E',p.x+9,p.y);
    });
    ctx.restore();
  }
  return {refresh,bar,drawGrips};
}
