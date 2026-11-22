import { rasterBounds, rasterContains, rasterPath } from '../segmentation/RasterRegion.js';
/**
 * PieceMap - Mapa de Pecas automatico baseado na armadura
 * Gera regioes coloridas para cada parte do corpo a partir dos ossos
 * Inspirado no Skinning Editor do Unity
 */

import { Transform2D } from '../core/Transform2D.js';

// Cores pre-definidas para cada regiao (RGBA semi-transparente)
// IDs correspondem ao preset 'humanoid-work-reference'
const REGION_COLORS = {
  bacia: 'rgba(200, 100, 255, 0.4)',
  coluna: 'rgba(100, 200, 100, 0.4)',
  peito: 'rgba(100, 255, 100, 0.4)',
  pescoco: 'rgba(255, 150, 100, 0.4)',
  cabeca: 'rgba(255, 100, 100, 0.4)',
  ombro_esquerdo: 'rgba(255, 200, 100, 0.4)',
  cotovelo_esquerdo: 'rgba(255, 150, 50, 0.4)',
  pulso_esquerdo: 'rgba(255, 100, 50, 0.4)',
  ombro_direito: 'rgba(100, 200, 255, 0.4)',
  cotovelo_direito: 'rgba(50, 150, 255, 0.4)',
  pulso_direito: 'rgba(50, 100, 255, 0.4)',
  anca_esquerda: 'rgba(100, 255, 200, 0.4)',
  joelho_esquerdo: 'rgba(50, 255, 150, 0.4)',
  tornozelo_esquerdo: 'rgba(50, 255, 100, 0.4)',
  anca_direita: 'rgba(200, 255, 100, 0.4)',
  joelho_direito: 'rgba(150, 255, 50, 0.4)',
  tornozelo_direito: 'rgba(100, 255, 50, 0.4)',
  // Regioes anatomicas especiais
  cabeca_anatomica: 'rgba(255, 100, 100, 0.5)',
  pescoco_anatomico: 'rgba(255, 150, 100, 0.5)',
  mao_esquerda: 'rgba(255, 100, 50, 0.5)',
  mao_direita: 'rgba(50, 100, 255, 0.5)',
  pe_esquerdo: 'rgba(50, 255, 100, 0.5)',
  pe_direito: 'rgba(100, 255, 50, 0.5)',
};

const REGION_NAMES_PT = {
  bacia: 'Bacia',
  coluna: 'Coluna',
  peito: 'Peito',
  pescoco: 'Pescoco',
  cabeca: 'Cabeca',
  ombro_esquerdo: 'Ombro Esquerdo',
  cotovelo_esquerdo: 'Cotovelo Esquerdo',
  pulso_esquerdo: 'Pulso Esquerdo',
  ombro_direito: 'Ombro Direito',
  cotovelo_direito: 'Cotovelo Direito',
  pulso_direito: 'Pulso Direito',
  anca_esquerda: 'Anca Esquerda',
  joelho_esquerdo: 'Joelho Esquerdo',
  tornozelo_esquerdo: 'Tornozelo Esquerdo',
  anca_direita: 'Anca Direita',
  joelho_direito: 'Joelho Direito',
  tornozelo_direito: 'Tornozelo Direito',
  // Regioes anatomicas especiais
  cabeca_anatomica: 'Cabeca e Cabelo',
  pescoco_anatomico: 'Pescoco',
  mao_esquerda: 'Mao Esquerda',
  mao_direita: 'Mao Direita',
  pe_esquerdo: 'Pe Esquerdo',
  pe_direito: 'Pe Direito',
};

/**
 * Gera uma regiao poligonal para um osso baseado no seu segmento ate o filho
 * @param {Bone} bone - Osso pai
 * @param {Bone} child - Osso filho (opcional)
 * @param {number} width - Largura da regiao em torno do osso
 * @returns {Array} Pontos do poligono em coordenadas mundiais
 */
export function generateBoneRegion(bone, child, width = 30) {
  if (!bone.worldTransform) return null;

  const parentPos = bone.getWorldPoint();
  let childPos;

  if (child && child.worldTransform) {
    childPos = child.getWorldPoint();
  } else {
    const dir = bone.getDirectionVector();
    childPos = {
      x: parentPos.x + dir.x * 50,
      y: parentPos.y + dir.y * 50,
    };
  }

  const dx = childPos.x - parentPos.x;
  const dy = childPos.y - parentPos.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return null;

  const nx = -dy / length;
  const ny = dx / length;
  const halfWidth = width / 2;

  return [
    { x: parentPos.x + nx * halfWidth, y: parentPos.y + ny * halfWidth },
    { x: parentPos.x - nx * halfWidth, y: parentPos.y - ny * halfWidth },
    { x: childPos.x - nx * halfWidth, y: childPos.y - ny * halfWidth },
    { x: childPos.x + nx * halfWidth, y: childPos.y + ny * halfWidth },
  ];
}

/**
 * Gera regiao conica (tapered) para membros que afinam
 * @param {Bone} bone - Osso pai
 * @param {Bone} child - Osso filho
 * @param {number} widthStart - Largura no inicio
 * @param {number} widthEnd - Largura no fim
 * @returns {Array} Pontos do poligono conico
 */
export function generateTaperedBoneRegion(bone, child, widthStart = 30, widthEnd = 20) {
  if (!bone.worldTransform || !child.worldTransform) return null;

  const parentPos = bone.getWorldPoint();
  const childPos = child.getWorldPoint();

  const dx = childPos.x - parentPos.x;
  const dy = childPos.y - parentPos.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return null;

  const nx = -dy / length;
  const ny = dx / length;
  const halfStart = widthStart / 2;
  const halfEnd = widthEnd / 2;

  return [
    { x: parentPos.x + nx * halfStart, y: parentPos.y + ny * halfStart },
    { x: parentPos.x - nx * halfStart, y: parentPos.y - ny * halfStart },
    { x: childPos.x - nx * halfEnd, y: childPos.y - ny * halfEnd },
    { x: childPos.x + nx * halfEnd, y: childPos.y + ny * halfEnd },
  ];
}

/**
 * Gera regiao para osso terminal (sem filho) - usa octogono
 * @param {Bone} bone - Osso terminal
 * @param {number} width - Largura da regiao
 * @returns {Array} Pontos do octogono
 */
export function generateEndBoneRegion(bone, width = 30) {
  if (!bone.worldTransform) return null;

  const pos = bone.getWorldPoint();
  const radius = width / 2;

  const points = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI * 2) / 8;
    points.push({
      x: pos.x + Math.cos(angle) * radius,
      y: pos.y + Math.sin(angle) * radius,
    });
  }
  return points;
}

/**
 * Gera regiao anatomica para a cabeca (inclui cabelo)
 * @param {Bone} bone - Osso da cabeca
 * @param {number} imageHeight - Altura da imagem
 * @param {number} imageWidth - Largura da imagem
 * @returns {Array} Pontos do poligono
 */
export function generateHeadRegion(bone, imageHeight, imageWidth) {
  if (!bone.worldTransform) return null;

  const pos = bone.getWorldPoint();
  const headRadius = Math.min(imageWidth, imageHeight) * 0.08;

  const points = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI * 2) / 16;
    const r = headRadius * (1 + 0.15 * Math.sin(angle * 4));
    points.push({
      x: pos.x + Math.cos(angle) * r,
      y: pos.y + Math.sin(angle) * r,
    });
  }
  return points;
}

/**
 * Gera regiao anatomica para o pescoco
 * Conecta a cabeca ao tronco, formato cilindrico
 * @param {Bone} neckBone - Osso do pescoco
 * @param {Bone} headBone - Osso da cabeca
 * @returns {Array} Pontos do poligono
 */
export function generateNeckRegion(neckBone, headBone) {
  if (!neckBone.worldTransform || !headBone.worldTransform) return null;

  const neckPos = neckBone.getWorldPoint();
  const headPos = headBone.getWorldPoint();

  const dx = headPos.x - neckPos.x;
  const dy = headPos.y - neckPos.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return null;

  const nx = -dy / length;
  const ny = dx / length;
  const neckWidth = 25;

  return [
    { x: neckPos.x + nx * neckWidth / 2, y: neckPos.y + ny * neckWidth / 2 },
    { x: neckPos.x - nx * neckWidth / 2, y: neckPos.y - ny * neckWidth / 2 },
    { x: headPos.x - nx * neckWidth / 2, y: headPos.y - ny * neckWidth / 2 },
    { x: headPos.x + nx * neckWidth / 2, y: headPos.y + ny * neckWidth / 2 },
  ];
}

/**
 * Gera regiao anatomica para a mao (pulso)
 * Forma aproximada da silhueta da mao com dedos
 * @param {Bone} wristBone - Osso do pulso
 * @param {boolean} isLeft - Se e mao esquerda
 * @returns {Array} Pontos do poligono
 */
export function generateHandRegion(wristBone, isLeft = true) {
  if (!wristBone.worldTransform) return null;

  const pos = wristBone.getWorldPoint();
  const handSize = 22;
  const fingerLength = 18;
  const thumbOffset = isLeft ? -1 : 1;

  return [
    { x: pos.x - handSize / 2, y: pos.y - handSize / 3 },
    { x: pos.x + handSize / 2, y: pos.y - handSize / 3 },
    { x: pos.x + handSize / 2, y: pos.y + handSize / 2 },
    { x: pos.x + thumbOffset * handSize / 3, y: pos.y + handSize / 2 },
    { x: pos.x + thumbOffset * handSize / 3, y: pos.y + handSize / 2 + fingerLength },
    { x: pos.x - thumbOffset * handSize / 3, y: pos.y + handSize / 2 + fingerLength },
    { x: pos.x - thumbOffset * handSize / 3, y: pos.y + handSize / 2 },
    { x: pos.x - handSize / 2, y: pos.y + handSize / 2 },
  ];
}

/**
 * Gera regiao anatomica para o pe/sapatilha (tornozelo)
 * @param {Bone} ankleBone - Osso do tornozelo
 * @param {boolean} isLeft - Se e pe esquerdo
 * @returns {Array} Pontos do poligono
 */
export function generateFootRegion(ankleBone, isLeft = true) {
  if (!ankleBone.worldTransform) return null;

  const pos = ankleBone.getWorldPoint();
  const footLength = 35;
  const footWidth = 14;
  const heelWidth = 16;
  const ankleHeight = 12;
  const dir = isLeft ? 1 : -1;

  return [
    { x: pos.x - dir * heelWidth / 2, y: pos.y - ankleHeight / 2 },
    { x: pos.x + dir * heelWidth / 2, y: pos.y - ankleHeight / 2 },
    { x: pos.x + dir * footWidth / 2, y: pos.y },
    { x: pos.x + dir * footWidth / 2, y: pos.y + footLength / 3 },
    { x: pos.x + dir * footWidth, y: pos.y + footLength / 2 },
    { x: pos.x + dir * footWidth / 1.5, y: pos.y + footLength },
    { x: pos.x - dir * footWidth / 3, y: pos.y + footLength },
    { x: pos.x - dir * footWidth / 2, y: pos.y + footLength * 0.8 },
    { x: pos.x - dir * footWidth / 2, y: pos.y + footLength / 3 },
    { x: pos.x - dir * footWidth / 2, y: pos.y },
  ];
}

/**
 * Classe para gerenciar o Mapa de Pecas
 */
export class PieceMap {
  constructor(characterObject, rig, renderer) {
    this.characterObject = characterObject;
    this.rig = rig;
    this.renderer = renderer;
    this.regions = new Map();
    this.selectedRegionId = null;
    this.hoveredRegionId = null;
    this.controlPointRadius = 8;
    this.isEditing = false;
    this.draggedPointIndex = -1;
    this.draggedRegionId = null;

    this.onSelectionChange = null;
    this.onRegionChange = null;
  }

  /**
   * Gera regioes automaticas para todos os ossos da armadura
   */
  generateRegions() {
    this.regions.clear();

    if (!this.rig || !this.characterObject) return;

    const bones = this.rig.getAllBones();

    for (const bone of bones) {
      const child = bone.children[0];

      let points;

      const isLeftForearm = bone.id === 'cotovelo_esquerdo' && child && child.id === 'pulso_esquerdo';
      const isRightForearm = bone.id === 'cotovelo_direito' && child && child.id === 'pulso_direito';
      const isLeftThigh = bone.id === 'anca_esquerda' && child && child.id === 'joelho_esquerdo';
      const isRightThigh = bone.id === 'anca_direita' && child && child.id === 'joelho_direito';

      if (isLeftForearm || isRightForearm) {
        points = generateTaperedBoneRegion(bone, child, 35, 20);
      } else if (isLeftThigh || isRightThigh) {
        points = generateTaperedBoneRegion(bone, child, 40, 25);
      } else if (child) {
        const baseWidth = this.getBoneWidth(bone);
        points = generateBoneRegion(bone, child, baseWidth);
      } else {
        points = generateEndBoneRegion(bone, this.getBoneWidth(bone));
      }

      if (!points || points.length < 3) continue;

      const localPoints = points;

      const color = REGION_COLORS[bone.id] || this.getRandomColor();
      const name = REGION_NAMES_PT[bone.id] || bone.name;

      this.regions.set(bone.id, {
        id: bone.id,
        boneId: bone.id,
        points: localPoints.map(p => ({ x: p.x, y: p.y })),
        originalPoints: localPoints.map(p => ({ x: p.x, y: p.y })),
        color,
        name,
        selected: false,
        visible: true,
        generated: true
      });
    }

    const headBone = this.rig.getBone('cabeca');
    if (headBone && headBone.worldTransform) {
      const points = generateHeadRegion(headBone, this.characterObject.imageHeight, this.characterObject.imageWidth);
      if (points && points.length >= 3) {
        const localPoints = points;
        this.regions.set('cabeca_anatomica', {
          id: 'cabeca_anatomica',
          boneId: 'cabeca',
          points: localPoints.map(p => ({ x: p.x, y: p.y })),
          originalPoints: localPoints.map(p => ({ x: p.x, y: p.y })),
          color: REGION_COLORS['cabeca_anatomica'] || 'rgba(255, 100, 100, 0.5)',
          name: 'Cabeca e Cabelo',
          selected: false,
          visible: true,
          generated: true,
          anatomical: true
        });
      }
    }

    const neckBone = this.rig.getBone('pescoco');
    const headBone2 = this.rig.getBone('cabeca');
    if (neckBone && neckBone.worldTransform && headBone2 && headBone2.worldTransform) {
      const points = generateNeckRegion(neckBone, headBone2);
      if (points && points.length >= 3) {
        const localPoints = points;
        this.regions.set('pescoco_anatomico', {
          id: 'pescoco_anatomico',
          boneId: 'pescoco',
          points: localPoints.map(p => ({ x: p.x, y: p.y })),
          originalPoints: localPoints.map(p => ({ x: p.x, y: p.y })),
          color: REGION_COLORS['pescoco_anatomico'] || 'rgba(255, 150, 100, 0.5)',
          name: 'Pescoco',
          selected: false,
          visible: true,
          generated: true,
          anatomical: true
        });
      }
    }

    const leftWristBone = this.rig.getBone('pulso_esquerdo');
    if (leftWristBone && leftWristBone.worldTransform) {
      const points = generateHandRegion(leftWristBone, true);
      if (points && points.length >= 3) {
        const localPoints = points;
        this.regions.set('mao_esquerda', {
          id: 'mao_esquerda',
          boneId: 'pulso_esquerdo',
          points: localPoints.map(p => ({ x: p.x, y: p.y })),
          originalPoints: localPoints.map(p => ({ x: p.x, y: p.y })),
          color: REGION_COLORS['mao_esquerda'] || 'rgba(255, 100, 50, 0.5)',
          name: 'Mao Esquerda',
          selected: false,
          visible: true,
          generated: true,
          anatomical: true
        });
      }
    }

    const rightWristBone = this.rig.getBone('pulso_direito');
    if (rightWristBone && rightWristBone.worldTransform) {
      const points = generateHandRegion(rightWristBone, false);
      if (points && points.length >= 3) {
        const localPoints = points;
        this.regions.set('mao_direita', {
          id: 'mao_direita',
          boneId: 'pulso_direito',
          points: localPoints.map(p => ({ x: p.x, y: p.y })),
          originalPoints: localPoints.map(p => ({ x: p.x, y: p.y })),
          color: REGION_COLORS['mao_direita'] || 'rgba(50, 100, 255, 0.5)',
          name: 'Mao Direita',
          selected: false,
          visible: true,
          generated: true,
          anatomical: true
        });
      }
    }

    const leftAnkleBone = this.rig.getBone('tornozelo_esquerdo');
    if (leftAnkleBone && leftAnkleBone.worldTransform) {
      const points = generateFootRegion(leftAnkleBone, true);
      if (points && points.length >= 3) {
        const localPoints = points;
        this.regions.set('pe_esquerdo', {
          id: 'pe_esquerdo',
          boneId: 'tornozelo_esquerdo',
          points: localPoints.map(p => ({ x: p.x, y: p.y })),
          originalPoints: localPoints.map(p => ({ x: p.x, y: p.y })),
          color: REGION_COLORS['pe_esquerdo'] || 'rgba(50, 255, 100, 0.5)',
          name: 'Pe Esquerdo',
          selected: false,
          visible: true,
          generated: true,
          anatomical: true
        });
      }
    }

    const rightAnkleBone = this.rig.getBone('tornozelo_direito');
    if (rightAnkleBone && rightAnkleBone.worldTransform) {
      const points = generateFootRegion(rightAnkleBone, false);
      if (points && points.length >= 3) {
        const localPoints = points;
        this.regions.set('pe_direito', {
          id: 'pe_direito',
          boneId: 'tornozelo_direito',
          points: localPoints.map(p => ({ x: p.x, y: p.y })),
          originalPoints: localPoints.map(p => ({ x: p.x, y: p.y })),
          color: REGION_COLORS['pe_direito'] || 'rgba(100, 255, 50, 0.5)',
          name: 'Pe Direito',
          selected: false,
          visible: true,
          generated: true,
          anatomical: true
        });
      }
    }

    console.log(`PieceMap: ${this.regions.size} regioes geradas`);
  }

  getBoneWidth(bone) {
    const widths = {
      bacia: 45,
      coluna: 35,
      peito: 50,
      pescoco: 25,
      cabeca: 60,
      ombro_esquerdo: 30,
      cotovelo_esquerdo: 25,
      pulso_esquerdo: 20,
      ombro_direito: 30,
      cotovelo_direito: 25,
      pulso_direito: 20,
      anca_esquerda: 30,
      joelho_esquerdo: 28,
      tornozelo_esquerdo: 22,
      anca_direita: 30,
      joelho_direito: 28,
      tornozelo_direito: 22,
    };
    return widths[bone.id] || 25;
  }

  getRandomColor() {
    const h = Math.random() * 360;
    return `hsla(${h}, 70%, 60%, 0.4)`;
  }

  /**
   * Converte coordenadas de tela para espaco local do personagem
   */
  screenToCharacterLocal(screenX, screenY) {
    const worldPos = this.renderer.screenToWorld(screenX, screenY);
    const charInv = this.characterObject.transform.getInverse();
    return charInv.transformPoint(worldPos.x, worldPos.y);
  }

  /**
   * Hit test em regioes - retorna regionId ou null
   */
  hitTestRegion(screenX, screenY) {
    const localPos = this.screenToCharacterLocal(screenX, screenY);

    const regionArray = Array.from(this.regions.values()).reverse();

    for (const region of regionArray) {
      if (!region.visible) continue;
      if (region.raster ? rasterContains(region.raster, localPos.x + this.characterObject.imageWidth / 2,
        localPos.y + this.characterObject.imageHeight / 2) : this.pointInPolygon(localPos.x, localPos.y, region.points)) {
        return region.id;
      }
    }
    return null;
  }

  pointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  hitTestControlPoint(screenX, screenY) {
    if (!this.selectedRegionId) return null;

    const region = this.regions.get(this.selectedRegionId);
    if (!region || region.raster) return null;

    const localPos = this.screenToCharacterLocal(screenX, screenY);
    const threshold = this.controlPointRadius / this.renderer.viewportScale;

    for (let i = 0; i < region.points.length; i++) {
      const pt = region.points[i];
      const dx = pt.x - localPos.x;
      const dy = pt.y - localPos.y;
      if (dx * dx + dy * dy < threshold * threshold) {
        return { regionId: this.selectedRegionId, pointIndex: i };
      }
    }
    return null;
  }

  /**
   * Atualiza estado de hover nas regioes
   * Chamado durante movimento do rato no modo Mapa de Peças
   */
  updateHover(screenX, screenY) {
    if (!this.renderer) return null;

    const hitRegionId = this.hitTestRegion(screenX, screenY);

    if (this.hoveredRegionId !== hitRegionId) {
      if (this.hoveredRegionId) {
        const prev = this.regions.get(this.hoveredRegionId);
        if (prev) prev.hovered = false;
      }
      this.hoveredRegionId = hitRegionId;
      if (hitRegionId) {
        const region = this.regions.get(hitRegionId);
        if (region) region.hovered = true;
      }
    }

    return hitRegionId;
  }

  /**
   * Seleciona uma região pelo ID
   */
  selectRegion(regionId) {
    if (this.selectedRegionId === regionId) return;
    
    if (this.selectedRegionId) {
      const prev = this.regions.get(this.selectedRegionId);
      if (prev) prev.selected = false;
    }
    
    this.selectedRegionId = regionId;
    
    const region = this.regions.get(regionId);
    if (region) {
      region.selected = true;
    }
    
    if (this.onSelectionChange) {
      this.onSelectionChange(region);
    }
  }

  startDragPoint(screenX, screenY) {
    const hit = this.hitTestControlPoint(screenX, screenY);
    if (hit) {
      this.isEditing = true;
      this.draggedRegionId = hit.regionId;
      this.draggedPointIndex = hit.pointIndex;
      return true;
    }
    return false;
  }

  dragPoint(screenX, screenY) {
    if (!this.isEditing || this.draggedRegionId === null || this.draggedPointIndex < 0) return;

    const region = this.regions.get(this.draggedRegionId);
    if (!region) return;

    const localPos = this.screenToCharacterLocal(screenX, screenY);
    region.points[this.draggedPointIndex] = { x: localPos.x, y: localPos.y };

    if (this.onRegionChange) {
      this.onRegionChange(region);
    }
  }

  endDragPoint() {
    this.isEditing = false;
    this.draggedRegionId = null;
    this.draggedPointIndex = -1;
  }

  /**
   * Gera mascara para uma regiao (para criar Part real)
   */
  generateMask(regionId) {
    const region = this.regions.get(regionId);
    if (!region) return null;

    if (region.raster) {
      const bounds = rasterBounds(region.raster);
      return bounds ? { ...region.raster, bounds } : null;
    }

    const imgCenterX = this.characterObject.imageWidth / 2;
    const imgCenterY = this.characterObject.imageHeight / 2;

    const points = region.points.map(p => ({
      x: p.x + imgCenterX,
      y: p.y + imgCenterY
    }));

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of points) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }

    return {
      type: 'polygon',
      points: points,
      bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    };
  }

  /**
   * Calcula pivo na articulacao do osso (joint do proprio osso)
   * Para o antebraco, o pivo deve estar no cotovelo (proprio osso), nao no pai
   * O pivo é expresso em coordenadas relativas à textura da peça (0-1)
   */
  calculatePivot(regionId) {
    const region = this.regions.get(regionId);
    if (!region) return { x: 0.5, y: 0.5 };

    const bone = this.rig.getBone(region.boneId);
    if (!bone) return { x: 0.5, y: 0.5 };

    const imgCenterX = this.characterObject.imageWidth / 2;
    const imgCenterY = this.characterObject.imageHeight / 2;

    // 1. Obtém a máscara da região
    const mask = this.generateMask(regionId);
    if (!mask) return { x: 0.5, y: 0.5 };

    const joint = bone.getWorldPoint();
    return {
      x: (joint.x + imgCenterX - mask.bounds.x + 2) / (Math.floor(mask.bounds.width + 4)),
      y: (joint.y + imgCenterY - mask.bounds.y + 2) / (Math.floor(mask.bounds.height + 4)),
    };
  }

  /**
   * Desenha todas as regioes
   */
  draw(ctx, viewport) {
    if (!this.characterObject) return;

    ctx.save();

    const charMatrix = this.characterObject.transform.m;
    const viewportMatrix = viewport.m;

    const combined = new Transform2D();
    combined.setMatrix(
      viewportMatrix[0] * charMatrix[0] + viewportMatrix[2] * charMatrix[1],
      viewportMatrix[1] * charMatrix[0] + viewportMatrix[3] * charMatrix[1],
      viewportMatrix[0] * charMatrix[2] + viewportMatrix[2] * charMatrix[3],
      viewportMatrix[1] * charMatrix[2] + viewportMatrix[3] * charMatrix[3],
      viewportMatrix[0] * charMatrix[4] + viewportMatrix[2] * charMatrix[5] + viewportMatrix[4],
      viewportMatrix[1] * charMatrix[4] + viewportMatrix[3] * charMatrix[5] + viewportMatrix[5]
    );

    ctx.transform(
      combined.m[0], combined.m[1],
      combined.m[2], combined.m[3],
      combined.m[4], combined.m[5]
    );

    for (const region of this.regions.values()) {
      if (!region.visible) continue;
      this.drawRegion(ctx, region);
    }

    ctx.restore();
  }

  /**
   * Desenha uma regiao individual
   */
  drawRegion(ctx, region) {
    if (region.raster) {
      ctx.save();
      ctx.translate(-this.characterObject.imageWidth / 2, -this.characterObject.imageHeight / 2);
      ctx.fillStyle = region.selected ? 'rgba(255,204,0,0.7)' : region.color;
      ctx.fill(rasterPath(region.raster));
      ctx.restore();
      return;
    }
    if (region.points.length < 3) return;

    ctx.save();

    ctx.fillStyle = region.color;
    ctx.beginPath();
    ctx.moveTo(region.points[0].x, region.points[0].y);
    for (let i = 1; i < region.points.length; i++) {
      ctx.lineTo(region.points[i].x, region.points[i].y);
    }
    ctx.closePath();
    ctx.fill();

    const isSelected = region.selected;
    const isHovered = region.hovered && !isSelected;

    ctx.strokeStyle = isSelected ? '#ffcc00' : (isHovered ? '#ffffff' : 'rgba(255,255,255,0.6)');
    ctx.lineWidth = isSelected ? 3 : (isHovered ? 2 : 1);
    ctx.setLineDash(isSelected ? [8, 4] : []);
    ctx.beginPath();
    ctx.moveTo(region.points[0].x, region.points[0].y);
    for (let i = 1; i < region.points.length; i++) {
      ctx.lineTo(region.points[i].x, region.points[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    if (isSelected) {
      const radius = this.controlPointRadius / this.renderer.viewportScale;
      ctx.fillStyle = '#ffcc00';
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 2 / this.renderer.viewportScale;

      for (const pt of region.points) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      const centerX = region.points.reduce((sum, p) => sum + p.x, 0) / region.points.length;
      const centerY = region.points.reduce((sum, p) => sum + p.y, 0) / region.points.length;

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.font = '12px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(region.name, centerX, centerY);
      ctx.fillText(region.name, centerX, centerY);
    }

    ctx.restore();
  }

  /**
   * Serializacao para JSON
   */
  toJSON() {
    const regionsData = {};
    for (const [id, region] of this.regions) {
      regionsData[id] = {
        raster: region.raster,
        boneId: region.boneId,
        points: region.points,
        originalPoints: region.originalPoints || region.points,
        color: region.color,
        name: region.name,
        visible: region.visible,
        generated: region.generated
      };
    }
    return {
      regions: regionsData,
      selectedRegionId: this.selectedRegionId
    };
  }

  /**
   * Carrega de JSON
   */
  static fromJSON(data, characterObject, rig, renderer) {
    const map = new PieceMap(characterObject, rig, renderer);
    if (data.regions) {
      for (const [id, regionData] of Object.entries(data.regions)) {
        map.regions.set(id, {
          id,
          raster: regionData.raster,
          boneId: regionData.boneId,
          points: regionData.points.map(p => ({ x: p.x, y: p.y })),
          originalPoints: (regionData.originalPoints || regionData.points).map(p => ({ x: p.x, y: p.y })),
          color: regionData.color,
          name: regionData.name,
          selected: false,
          visible: regionData.visible !== false,
          generated: regionData.generated !== false
        });
      }
      map.selectedRegionId = data.selectedRegionId;
    }
    return map;
  }

  getRegion(regionId) {
    return this.regions.get(regionId);
  }

  getAllRegions() {
    return Array.from(this.regions.values());
  }

  getSelectedRegion() {
    return this.selectedRegionId ? this.regions.get(this.selectedRegionId) : null;
  }
}