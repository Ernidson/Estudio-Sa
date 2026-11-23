import {readPNG} from './Station.js';

const surfaces=new WeakMap();
export function elevation(obj) {
  return Math.max(0, Math.min(1,(obj.pullup.restY-obj.rig.getRoot().localPosition.y)/Math.max(1,obj.pullup.height)));
}
function surface(patch) {
  let entry=surfaces.get(patch);
  if(!entry) {
    const image=new Image();image.src=patch.image;
    entry={image};surfaces.set(patch,entry);
  }
  if(!entry.image.complete || !entry.image.naturalWidth)return null;
  const key=[patch.radius,patch.softness].join(',');
  if(key===entry.key)return entry.canvas;
  const c=document.createElement('canvas');c.width=c.height=patch.extent*2;
  const ctx=c.getContext('2d');ctx.drawImage(entry.image,0,0);
  const r=patch.radius, mid=patch.extent;
  const g=ctx.createRadialGradient(mid,mid,0,mid,mid,r);
  g.addColorStop(0,'black');g.addColorStop(1-patch.softness,'black');g.addColorStop(1,'transparent');
  ctx.globalCompositeOperation='destination-in';ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height);
  const matte=document.createElement('canvas');matte.width=c.width;matte.height=c.height;
  const mc=matte.getContext('2d');mc.fillStyle=g;mc.fillRect(0,0,c.width,c.height);
  entry.matte=matte;
  entry.canvas=c;entry.key=key;return c;
}
export function drawCorrectives(ctx,obj) {
  const config=obj.pullup;
  if(!config || config.correct===false || !config.patches?.length)return;
  const t=elevation(obj);
  if(t<=0)return;
  for(const p of config.patches){
    if(t<=p.start || t>p.end)continue;
    const bone=obj.rig.getBone(p.bone);
    const weight=t<p.peak?(t-p.start)/(p.peak-p.start):p.end===p.peak?1:(p.end-t)/(p.end-p.peak);
    const canvas=surface(p);
    if(!bone || !canvas)continue;
    ctx.save();ctx.transform(...bone.worldTransform.m);ctx.translate(p.x,p.y);
    ctx.rotate(p.angle);ctx.scale(p.scale,p.scale);
    ctx.globalAlpha*=weight*weight*(3-2*weight);
    ctx.globalCompositeOperation='destination-out';
    ctx.drawImage(surfaces.get(p).matte,-p.extent,-p.extent);
    ctx.globalCompositeOperation='lighter';
    ctx.drawImage(canvas,-p.extent,-p.extent);ctx.restore();
  }
}
export function addCorrective(obj,image,boneId,center,axis,settings) {
  const bone=obj.rig.getBone(boneId), child=bone.children[0];
  if(!child)throw Error('Seleciona uma articulação com um segmento descendente.');
  const dx=axis.x-center.x,dy=axis.y-center.y,distance=Math.hypot(dx,dy);
  if(distance<4)throw Error('Marca dois pontos distintos na referência.');
  const extent=Math.ceil(settings.radius*1.7);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=extent*2;
  canvas.getContext('2d').drawImage(image,extent-center.x,extent-center.y);
  const v=child.localPosition;
  const patch={...settings,bone:boneId,extent,image:canvas.toDataURL(),x:0,y:0,softness:.47,
    angle:Math.atan2(v.y,v.x)-Math.atan2(dy,dx),scale:Math.hypot(v.x,v.y)/distance};
  (obj.pullup.patches??=[]).push(patch);return patch;
}
export function correctiveEditor(panel,getCharacter) {
  const f=n=>panel.querySelector('[name="'+n+'"]'),preview=f('preview');
  let source=null,points=[],index=-1;
  function sync() {
    const obj=getCharacter(), list=obj?.pullup?.patches??[];
    f('patch').replaceChildren(...list.map((p,i)=>new Option(p.bone+' · '+p.peak,i)));
    index=Math.min(index,list.length-1);
    if(index<0 && list.length)index=0;
    f('patch').selectedIndex=index;
    const p=list[index];
    f('correct').checked=obj?.pullup?.correct!==false;
    if(p)for(const n of ['x','y','scale','radius','start','peak','end','softness'])f(n).value=p[n];
    return p;
  }
  f('source').onchange=async e=>{
    if(!e.target.files[0])return;
    source=(await readPNG(e.target.files[0])).image;points=[];
    preview.width=source.width;preview.height=source.height;
    preview.getContext('2d').drawImage(source,0,0);preview.hidden=false;
    f('tip').textContent='Marca a articulação e depois a articulação seguinte.';
  };
  preview.onclick=e=>{
    if(!source)return;
    if(points.length===2){points=[];preview.getContext('2d').drawImage(source,0,0);}
    const r=preview.getBoundingClientRect(),p={x:(e.clientX-r.x)*preview.width/r.width,y:(e.clientY-r.y)*preview.height/r.height};
    points.push(p);const ctx=preview.getContext('2d');ctx.fillStyle='#ffce45';ctx.fillRect(p.x-5,p.y-5,10,10);
  };
  f('add').onclick=()=>{
    try {
      if(!getCharacter()?.pullup || points.length!==2)throw Error('Associa a barra e marca duas articulações na referência.');
      addCorrective(getCharacter(),source,f('bone').value,...points,{radius:64,start:.1,peak:.65,end:1});
      index=getCharacter().pullup.patches.length-1;sync();f('tip').textContent='Correção adicionada.';
    } catch(error){f('tip').textContent=error.message;}
  };
  f('correct').onchange=e=>{if(getCharacter()?.pullup)getCharacter().pullup.correct=e.target.checked;};
  f('patch').onchange=e=>{index=e.target.selectedIndex;sync();};
  f('remove').onclick=()=>{if(index>=0 && confirm('Eliminar esta correção?')){getCharacter().pullup.patches.splice(index,1);sync();}};
  for(const n of ['x','y','scale','radius','start','peak','end','softness'])f(n).onchange=e=>{
    const p=getCharacter()?.pullup?.patches?.[index],v=e.target.valueAsNumber;
    if(!p || !Number.isFinite(v))return;
    const next={...p,[n]:v};
    if(next.start>=0 && next.start<next.peak && next.peak<=next.end && next.end<=1 && next.radius>0 &&
       next.radius<=next.extent && next.scale>0 && next.softness>0 && next.softness<=1)p[n]=v;
    sync();
  };
  return {sync};
}
