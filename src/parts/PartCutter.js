/**
 * PartCutter - Utilitário para recortar peças da imagem original
 * Suporta recorte retangular e poligonal
 */

import { PartManager } from './PartManager.js';

/**
 * Cria uma peça a partir de uma região da imagem original
 */
export async function cutPartFromRegion(characterObject, bone, mask, name, rig) {
  const manager = new PartManager(characterObject, rig, null, null);
  const part = await manager.createPartFromRegion(characterObject, bone.id, mask, name);
  return part.toJSON();
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