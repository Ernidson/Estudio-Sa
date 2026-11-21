/**
 * RigEstimator - Detecção assistida de articulações baseada na silhueta da imagem
 * Analisa pixels não transparentes para sugerir posições anatômicas iniciais.
 */

import { createRigFromPreset, RIG_PRESETS } from './Rig.js';
import { Transform2D, createTransform } from '../core/Transform2D.js';

/**
 * Analisa a silhueta de uma imagem e retorna métricas úteis
 * @param {HTMLImageElement} imageElement - Imagem carregada
 * @returns {Object} Métricas da silhueta
 */
export function analyzeSilhouette(imageElement) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  canvas.width = imageElement.width;
  canvas.height = imageElement.height;
  
  ctx.drawImage(imageElement, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  const width = canvas.width;
  const height = canvas.height;
  
  // Encontra bounds da silhueta (pixels não transparentes)
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let pixelCount = 0;
  
  // Para análise horizontal (perfil)
  const columnDensity = new Array(width).fill(0);
  const rowDensity = new Array(height).fill(0);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 10) { // Threshold de transparência
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        pixelCount++;
        columnDensity[x]++;
        rowDensity[y]++;
      }
    }
  }
  
  if (pixelCount === 0) {
    return null; // Imagem vazia
  }
  
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const silhouetteWidth = maxX - minX;
  const silhouetteHeight = maxY - minY;
  
  // ===== PASSO 1: Detecta cabeça e pés =====
  let headTopY = minY;
  for (let y = minY; y <= maxY; y++) {
    if (rowDensity[y] > width * 0.03) {
      headTopY = y;
      break;
    }
  }
  
  let feetBottomY = maxY;
  for (let y = maxY; y >= minY; y--) {
    if (rowDensity[y] > width * 0.03) {
      feetBottomY = y;
      break;
    }
  }
  
  // ===== PASSO 2: Detecta ombros (linha mais larga no terço superior) =====
  let shoulderY = minY + 30;
  let maxShoulderWidth = 0;
  const shoulderSearchEnd = minY + (maxY - minY) * 0.35;
  
  for (let y = minY + 15; y < minY + (maxY - minY) * 0.35; y++) {
    let leftmost = -1, rightmost = -1;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4 + 3;
      if (idx < data.length && data[idx] > 10) {
        if (leftmost === -1) leftmost = x;
        rightmost = x;
      }
    }
    if (leftmost !== -1 && rightmost !== -1) {
      const w = rightmost - leftmost;
      if (w > maxShoulderWidth) {
        maxShoulderWidth = w;
        shoulderY = y;
      }
    }
  }
  
  // Fallback se não encontrou ombros
  if (maxShoulderWidth < 20) {
    shoulderY = minY + 40;
    maxShoulderWidth = maxX - minX;
  }
  
  // ===== PASSO 3: Detecta quadril (segunda região mais larga na metade inferior) =====
  let hipY = minY + (maxY - minY) * 0.55;
  let maxHipWidth = 0;
  const hipSearchStart = minY + (maxY - minY) * 0.45;
  const hipSearchEnd = maxY - (maxY - minY) * 0.15;
  
  for (let y = minY + (maxY - minY) * 0.45; y < maxY - (maxY - minY) * 0.15; y++) {
    let leftmost = -1, rightmost = -1;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4 + 3;
      if (idx < data.length && data[idx] > 10) {
        if (leftmost === -1) leftmost = x;
        rightmost = x;
      }
    }
    if (leftmost !== -1 && rightmost !== -1) {
      const w = rightmost - leftmost;
      if (w > maxHipWidth) {
        maxHipWidth = w;
        hipY = y;
      }
    }
  }
  
  // Fallback se não encontrou quadril
  if (maxHipWidth < 20) {
    hipY = minY + (maxY - minY) * 0.6;
    maxHipWidth = maxX - minX;
  }
  
  // ===== PASSO 3: Cintura (linha mais estreita entre ombros e quadril) =====
  let waistY = shoulderY + (hipY - shoulderY) * 0.35;
  let minWaistWidth = Infinity;
  
  for (let y = shoulderY; y < hipY; y++) {
    let leftmost = -1, rightmost = -1;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4 + 3;
      if (idx < data.length && data[idx] > 10) {
        if (leftmost === -1) leftmost = x;
        rightmost = x;
      }
    }
    if (leftmost !== -1 && rightmost !== -1) {
      const w = rightmost - leftmost;
      if (w < minWaistWidth && w > (maxX - minX) * 0.15) {
        minWaistWidth = w;
        waistY = y;
      }
    }
  }
  
  if (minWaistWidth === Infinity) {
    waistY = shoulderY + (hipY - shoulderY) * 0.35;
    minWaistWidth = (maxX - minX) * 0.4;
  }
  
  // ===== Cálculos derivados =====
  const torsoHeight = hipY - shoulderY;
  // feetBottomY já declarado acima (linha 69)
  
  // Joelho: ~52% da distância quadril-pés
  const kneeY = hipY + (maxY - hipY) * 0.52;
  
  // Cotovelo para braços elevados: ~28% da altura do tronco acima dos ombros
  const torsoHeightVal = hipY - shoulderY;
  const elbowY = shoulderY - torsoHeight * 0.28;
  
  // Cabeça - headTopY já declarado acima (linha 61)
  for (let y = minY; y <= maxY; y++) {
    let hasPixel = false;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4 + 3;
      if (idx < data.length && data[idx] > 10) {
        headTopY = y;
        break;
      }
    }
  }
  
  return {
    bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    headTop: minY + 5,
    feetBottom: maxY,
    shoulderY,
    shoulderWidth: maxX - minX, // Largura total da silhueta nos ombros
    waistY: shoulderY + (hipY - shoulderY) * 0.35,
    waistWidth: (maxX - minX) * 0.4,
    hipY,
    hipWidth: maxHipWidth,
    kneeY: hipY + (maxY - hipY) * 0.52,
    elbowY: shoulderY - (hipY - shoulderY) * 0.28,
    pixelCount,
    columnDensity: null,
    rowDensity: null
  };
}

/**
 * Ajusta preset baseado na análise da silhueta
 * Calcula posições PAI-RELATIVAS (localPosition) corretamente
 * @param {Object} silhouette - resultado de analyzeSilhouette
 * @param {Object} imageSize - {width, height} da imagem
 * @returns {Object} preset ajustado com posições locais relativas ao pai
 */
export function adjustPresetToSilhouette(silhouette, imageSize) {
  if (!silhouette) return null;
  
  const { shoulderY, hipY, hipWidth, kneeY, elbowY, headTop, feetBottom, center } = silhouette;
  
  // No espaço do personagem: origem na bacia (centro dos quadris), Y positivo para baixo
  const pelvisX = 0;
  const pelvisY = 0;
  
  // Métricas da silhueta
  const torsoHeight = silhouette.hipY - silhouette.shoulderY;
  const legHeight = silhouette.feetBottom - silhouette.hipY;
  
  // PROPORÇÕES CALIBRADAS
  const chestHeightFromPelvis = (silhouette.hipY - silhouette.shoulderY) * 0.65;
  const neckHeightFromPelvis = (silhouette.hipY - silhouette.shoulderY) * 0.85;
  const headHeightFromPelvis = (silhouette.hipY - silhouette.shoulderY) * 1.15;
  
  // Braços elevados
  const shoulderOffsetX = (silhouette.hipY - silhouette.shoulderY) * 0.3;
  const elbowRaise = (silhouette.hipY - silhouette.shoulderY) * 0.35;
  const wristRaise = (silhouette.hipY - silhouette.shoulderY) * 0.6;
  
  // Pernas
  const thighRatio = 0.5;
  const shinRatio = 0.5;
  const hipOffsetX = (silhouette.feetBottom - silhouette.hipY) * 0.15;
  
  // Posições ABSOLUTAS no espaço do personagem (origem na bacia)
  const absolutePositions = {
    // Raiz
    pelvis: { x: 0, y: 0 },
    
    // Coluna vertebral
    spine: { x: 0, y: -(silhouette.hipY - silhouette.shoulderY) * 0.35 },
    chest: { x: 0, y: -(silhouette.hipY - silhouette.shoulderY) * 0.65 },
    neck: { x: 0, y: -(silhouette.hipY - silhouette.shoulderY) * 0.85 },
    head: { x: 0, y: -(silhouette.hipY - silhouette.shoulderY) * 1.15 },
    
    // Braço esquerdo (elevado)
    l_shoulder: { x: -(silhouette.hipY - silhouette.shoulderY) * 0.3, y: 0 },
    l_elbow: { x: -(silhouette.hipY - silhouette.shoulderY) * 0.24, y: -(silhouette.hipY - silhouette.shoulderY) * 0.35 },
    l_wrist: { x: -(silhouette.hipY - silhouette.shoulderY) * 0.09, y: -(silhouette.hipY - silhouette.shoulderY) * 0.6 },
    
    // Braço direito
    r_shoulder: { x: (silhouette.hipY - silhouette.shoulderY) * 0.3, y: 0 },
    r_elbow: { x: (silhouette.hipY - silhouette.shoulderY) * 0.24, y: -(silhouette.hipY - silhouette.shoulderY) * 0.35 },
    r_wrist: { x: (silhouette.hipY - silhouette.shoulderY) * 0.09, y: -(silhouette.hipY - silhouette.shoulderY) * 0.6 },
    
    // Perna esquerda
    l_hip: { x: -(silhouette.feetBottom - silhouette.hipY) * 0.15, y: (silhouette.feetBottom - silhouette.hipY) * 0.1 },
    l_knee: { x: -(silhouette.feetBottom - silhouette.hipY) * 0.015, y: (silhouette.feetBottom - silhouette.hipY) * 0.5 },
    l_ankle: { x: -(silhouette.feetBottom - silhouette.hipY) * 0.015, y: (silhouette.feetBottom - silhouette.hipY) * 1.0 },
    
    // Perna direita
    r_hip: { x: (silhouette.feetBottom - silhouette.hipY) * 0.15, y: (silhouette.feetBottom - silhouette.hipY) * 0.1 },
    r_knee: { x: (silhouette.feetBottom - silhouette.hipY) * 0.015, y: (silhouette.feetBottom - silhouette.hipY) * 0.5 },
    r_ankle: { x: (silhouette.feetBottom - silhouette.hipY) * 0.015, y: (silhouette.feetBottom - silhouette.hipY) * 1.0 },
  };
  
  // Converte para posições PAI-RELATIVAS
  const hierarchy = {
    pelvis: null,
    spine: 'pelvis',
    chest: 'spine',
    neck: 'chest',
    head: 'neck',
    l_shoulder: 'chest',
    l_elbow: 'l_shoulder',
    l_wrist: 'l_elbow',
    r_shoulder: 'chest',
    r_elbow: 'r_shoulder',
    r_wrist: 'r_elbow',
    l_hip: 'pelvis',
    l_knee: 'l_hip',
    l_ankle: 'l_knee',
    r_hip: 'pelvis',
    r_knee: 'r_hip',
    r_ankle: 'r_knee',
  };
  
  const adjusted = {};
  
  for (const [boneId, parentId] of Object.entries(hierarchy)) {
    const absPos = absolutePositions[boneId];
    if (!absPos) continue;
    
    if (parentId === null) {
      adjusted[boneId] = { ...absPos };
    } else {
      const parentAbs = absolutePositions[parentId];
      if (parentAbs) {
        adjusted[boneId] = {
          x: absPos.x - parentAbs.x,
          y: absPos.y - parentAbs.y
        };
      } else {
        adjusted[boneId] = { ...absPos };
      }
    }
  }
  
  return adjusted;
}

/**
 * Cria rig auto-estimado para uma imagem
 * @param {HTMLImageElement} imageElement - Imagem carregada
 * @param {string} presetKey - Chave do preset base
 * @returns {Promise<Rig>} Rig com posições ajustadas
 */
export async function estimateRigForImage(imageElement, presetKey = 'humanoid-back-arms-raised') {
  // Analisa silhueta
  const silhouette = analyzeSilhouette(imageElement);
  if (!silhouette) {
    console.warn('Não foi possível analisar silhueta, usando preset padrão');
    return createRigFromPreset(presetKey);
  }
  
  // DEBUG: Log silhouette analysis
  console.log('[RigEstimator] Silhouette analysis:', JSON.stringify({
    imageSize: { width: imageElement.width, height: imageElement.height },
    bounds: silhouette.bounds,
    center: silhouette.center,
    headTop: silhouette.headTop,
    feetBottom: silhouette.feetBottom,
    shoulderY: silhouette.shoulderY,
    shoulderWidth: silhouette.shoulderWidth,
    hipY: silhouette.hipY,
    hipWidth: silhouette.hipWidth,
    kneeY: silhouette.kneeY,
    elbowY: silhouette.elbowY,
    torsoHeight: silhouette.hipY - silhouette.shoulderY,
    legHeight: silhouette.feetBottom - silhouette.hipY
  }, null, 2));
  
  // Cria rig base do preset
  const rig = createRigFromPreset(presetKey);
  
  // Ajusta posições baseadas na silhueta
  const adjusted = adjustPresetToSilhouette(silhouette, {
    width: imageElement.width,
    height: imageElement.height
  });
  
  if (adjusted) {
    for (const [boneId, localPos] of Object.entries(adjusted)) {
      const bone = rig.getBone(boneId);
      if (bone) {
        bone.setLocalPosition(localPos.x, localPos.y);
      }
    }
    rig.computeWorldTransforms();
  }
  
  // Define baseTransform para alinhar com a imagem
  const baseTransform = createTransform(
    -silhouette.center.x + imageElement.width / 2,
    -silhouette.center.y + imageElement.height / 2
  );
  rig.setBaseTransform(baseTransform);
  
  return rig;
}

/**
 * Converte coordenadas de imagem (pixels, origem topo-esquerda) 
 * para coordenadas do personagem (origem centro, Y positivo para baixo)
 * @param {Object} imageCoords - {x, y} em pixels da imagem
 * @param {Object} imageSize - {width, height} da imagem
 * @param {Object} silhouette - resultado de analyzeSilhouette
 * @returns {Object} {x, y} no espaço do personagem
 */
export function imageToCharacterSpace(imageCoords, imageSize, silhouette) {
  const { width, height } = imageSize;
  const { center } = silhouette;
  
  const charCenterX = 0;
  const charCenterY = 0;
  const scale = silhouette.height > 0 ? 1 : 1;
  
  const x = (imageCoords.x - center.x) * scale;
  const y = (imageCoords.y - center.y) * scale;
  
  return { x, y };
}

/**
 * Detecta automaticamente o melhor preset baseado na imagem
 * @param {HTMLImageElement} imageElement
 * @returns {string} Chave do preset recomendado
 */
export function detectBestPreset(imageElement) {
  const silhouette = analyzeSilhouette(imageElement);
  if (!silhouette) return 'humanoid-back-arms-raised';
  
  const { bounds } = silhouette;
  
  // Detecta preset Work Reference para imagens 1024x1536 (treinador)
  if (imageElement.width === 1024 && imageElement.height === 1536) {
    return 'humanoid-work-reference';
  }
  
  // Heurísticas simples
  const aspectRatio = bounds.width / bounds.height;
  if (aspectRatio > 1.2) {
    return 'humanoid-back-arms-raised'; // Formato largo = braços abertos/elevados
  }
  
  return 'humanoid-back-arms-raised'; // Default
}