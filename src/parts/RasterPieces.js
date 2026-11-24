import { rasterPath, rasterBounds } from '../segmentation/RasterRegion.js';

const bases = new WeakMap();
export function remainingImage(obj) {
  const masks = obj.partManager?.getAllParts().map(p => p.mask).filter(m => m?.type === 'raster') || [];
  if (!masks.length) return obj.imageElement;
  const cached = bases.get(obj);
  if (cached?.source === obj.imageElement && masks.length === cached.masks.length && masks.every((m,i)=>m===cached.masks[i])) return cached.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = obj.imageWidth;
  canvas.height = obj.imageHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(obj.imageElement,0,0);
  ctx.globalCompositeOperation = 'destination-out';
  for (const mask of masks) ctx.fill(rasterPath(mask));
  bases.set(obj,{canvas,masks,source:obj.imageElement});
  return canvas;
}

export function refreshTextures(obj) {
  for (const part of obj.partManager?.getAllParts() || []) {
    const raster = obj.pieceMap.getRegion(part.regionId)?.raster;
    if (!raster || !part.mask?.bounds) continue;
    const before = part.mask.bounds;
    const bounds = rasterBounds(raster) || before;
    const canvas = document.createElement('canvas');
    canvas.width = bounds.width + 4;
    canvas.height = bounds.height + 4;
    const ctx = canvas.getContext('2d');
    ctx.translate(2-bounds.x,2-bounds.y);
    ctx.clip(rasterPath(raster));
    ctx.drawImage(obj.imageElement,0,0);
    part.pivot = {x:(part.pivot.x*part.imageWidth+before.x-bounds.x)/canvas.width,
      y:(part.pivot.y*part.imageHeight+before.y-bounds.y)/canvas.height};
    part.mask = {...raster,rows:structuredClone(raster.rows),bounds};
    part.imageWidth = canvas.width;
    part.imageHeight = canvas.height;
    part.imageData = canvas.toDataURL();
    part.imageElement = canvas;
  }
}
