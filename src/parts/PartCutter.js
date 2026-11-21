/**
 * PartCutter - Utilitário para recortar peças da imagem original
 * Suporta recorte retangular e poligonal
 */

import { Part } from './Part.js';

/**
 * Cria uma peça a partir de uma região da imagem original
 */
export async function cutPartFromRegion(characterObject, bone, mask, name, rig) {
  if (!characterObject.imageElement) {
    await characterObject.loadImage();
  }
  
  const sourceImg = characterObject.imageElement;
  const imgWidth = characterObject.imageWidth;
  const imgHeight = characterObject.imageHeight;
  
  // Calcula bounds da máscara em coordenadas da imagem original
  let bounds;
  if (mask.type === 'rect') {
    bounds = { ...mask.bounds };
  } else if (mask.type === 'polygon') {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of mask.points) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
    bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  } else {
    throw new Error('Tipo de máscara não suportado');
  }
  
  // Adiciona margem
  const margin = 2;
  const sx = Math.max(0, bounds.x - 2);
  const sy = Math.max(0, bounds.y - 2);
  const sw = Math.min(characterObject.imageWidth - bounds.x, bounds.width + 4);
  const sh = Math.min(characterObject.imageHeight - bounds.y, bounds.height + 4);
  
  // Cria canvas para recorte
  const canvas = document.createElement('canvas');
  canvas.width = bounds.width + 4;
  canvas.height = bounds.height + 4;
  const ctx = canvas.getContext('2d');
  
  // Desenha a região da imagem original
  ctx.drawImage(
    characterObject.imageElement,
    bounds.x - 2, bounds.y - 2, bounds.width + 4, bounds.height + 4,
    2, 2, bounds.width + 4, bounds.height + 4
  );
  
  // Se máscara é polígono, aplica recorte
  if (mask.type === 'polygon') {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(mask.points[0].x - bounds.x + 2, mask.points[0].y - bounds.y + 2);
    for (let i = 1; i < mask.points.length; i++) {
      ctx.lineTo(mask.points[i].x - bounds.x + 2, mask.points[i].y - bounds.y + 2);
    }
    ctx.closePath();
    ctx.clip();
    // Redesenha apenas a região do polígono
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      characterObject.imageElement,
      bounds.x - 2, bounds.y - 2, bounds.width + 4, bounds.height + 4,
      0, 0, canvas.width, canvas.height
    );
    ctx.restore();
  }
  
  // Converte para Data URL
  const imageData = canvas.toDataURL('image/png');
  
  // Calcula posição local relativa ao osso pai
  const pieceCenterX = mask.type === 'rect' 
    ? mask.bounds.x + mask.bounds.width / 2
    : mask.points.reduce((sum, p) => sum + p.x, 0) / mask.points.length;
  const pieceCenterY = mask.type === 'rect'
    ? mask.bounds.y + mask.bounds.height / 2
    : mask.points.reduce((sum, p) => sum + p.y, 0) / mask.points.length;
  
  // Converte para coordenadas locais do personagem (origem no centro da imagem)
  const charCenterX = characterObject.imageWidth / 2;
  const charCenterY = characterObject.imageHeight / 2;
  let localX = pieceCenterX - charCenterX;
  let localY = pieceCenterY - charCenterY;
  
  // Usa o bone passado como parâmetro
  const targetBone = bone;
  
  if (targetBone.parent) {
    const parentWorld = targetBone.parent.getWorldPoint();
    localX = localX - parentWorld.x;
    localY = localY - parentWorld.y;
  } else {
    // Raiz do rig - converte para espaço do rig
    const rigInv = rig.baseTransform.getInverse();
    const rigLocal = rig.baseTransform.getInverse().transformPoint(localX, localY);
    localX = rigLocal.x;
    localY = rigLocal.y;
  }
  
  // Cria a peça
  const part = {
    id: `part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: name,
    sourceObjectId: characterObject.id,
    boneId: targetBone.id,
    mask: mask,
    imageData: canvas.toDataURL('image/png'),
    imageWidth: mask.type === 'rect' ? mask.bounds.width + 4 : canvas.width,
    imageHeight: mask.type === 'rect' ? mask.bounds.height + 4 : canvas.height,
    mask: mask,
    pivot: { x: 0.5, y: 0.5 },
    offset: { x: 0, y: 0 },
    localPosition: { x: localX, y: localY },
    localRotation: 0,
    localScaleX: 1,
    localScaleY: 1,
    zIndex: 0,
    visible: true,
    visibleInEditor: true,
    side: bone.side || 'center',
    type: 'part',
    boneId: boneId,
    sourceObjectId: characterObject.id
  };
  
  return part;
}

/**
 * Cria máscara retangular a partir de dois pontos
 */
export function createRectMask(startX, startY, endX, endY) {
  return {
    type: 'rect',
    bounds: {
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY)
    }
  };
}

/**
 * Cria máscara poligonal a partir de pontos
 */
export function createPolygonMask(points) {
  return {
    type: 'polygon',
    points: points.map(p => ({ x: p.x, y: p.y }))
  };
}

/**
 * Converte coordenadas de tela para coordenadas locais do personagem
 */
export function screenToCharacterLocal(screenX, screenY, renderer, characterObject) {
  const worldPos = renderer.screenToWorld(screenX, screenY);
  const charInv = characterObject.transform.getInverse();
  return charInv.transformPoint(worldPos.x, worldPos.y);
}

/**
 * Converte coordenadas locais do personagem para coordenadas de tela
 */
export function characterLocalToScreen(localX, localY, renderer, characterObject) {
  const worldPos = characterObject.transform.transformPoint(localX, localY);
  return renderer.worldToScreen(worldPos.x, worldPos.y);
}