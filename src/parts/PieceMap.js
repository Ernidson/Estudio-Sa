/**
 * PieceMap - Mapa de Peças automático baseado na armadura
 * Gera regiões coloridas para cada parte do corpo a partir dos ossos
 * Inspirado no Skinning Editor do Unity
 */

import { Transform2D } from '../core/Transform2D.js';

// Cores pré-definidas para cada região (RGBA semi-transparente)
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
  // Regiões anatómicas especiais
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
  pescoco: 'Pescoço',
  cabeca: 'Cabeça',
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
  // Regiões anatómicas especiais
  cabeca_anatomica: 'Cabeça e Cabelo',
  pescoco_anatomico: 'Pescoço',
  mao_esquerda: 'Mão Esquerda',
  mao_direita: 'Mão Direita',
  pe_esquerdo: 'Pé Esquerdo',
  pe_direito: 'Pé Direito',
};

/**
 * Gera uma região poligonal para um osso baseado no seu segmento até o filho
 * @param {Bone} bone - Osso pai
 * @param {Bone} child - Osso filho (opcional)
 * @param {number} width - Largura da região em torno do osso
 * @returns {Array} Pontos do polígono em coordenadas mundiais
 */
export function generateBoneRegion(bone, child, width = 30) {
  if (!bone.worldTransform) return null;
  
  const parentPos = bone.getWorldPoint();
  let childPos;
  
  if (child && child.worldTransform) {
    childPos = child.getWorldPoint();
  } else {
    // Se não tem filho, estende na direção do osso
    const dir = bone.getDirection ? bone.getDirection() : { x: 0, y: -1 };
    childPos = {
      x: parentPos.x + dir.x * (bone.length || 50),
      y: parentPos.y + dir.y * (bone.length || 50)
    };
  }
  
  // Vetor direção do osso
  const dx = childPos.x - parentPos.x;
  const dy = childPos.y - parentPos.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  
  if (len === 0) return null;
  
  // Normal perpendicular
  const nx = -dy / len;
  const ny = dx / len;
  
  const halfWidth = width;
  
  // 4 cantos do retângulo orientado
  return [
    { x: parentPos.x + nx * halfWidth, y: parentPos.y + ny * halfWidth },
    { x: parentPos.x - nx * halfWidth, y: parentPos.y - ny * halfWidth },
    { x: childPos.x - nx * halfWidth, y: childPos.y - ny * halfWidth },
    { x: childPos.x + nx * halfWidth, y: childPos.y + ny * halfWidth }
  ];
}

/**
 * Gera região cónica (tapered) para membros que afinam
 * @param {Bone} bone - Osso pai
 * @param {Bone} child - Osso filho
 * @param {number} widthStart - Largura no início
 * @param {number} widthEnd - Largura no fim
 * @returns {Array} Pontos do polígono cónico
 */
export function generateTaperedBoneRegion(bone, child, widthStart = 30, widthEnd = 20) {
  if (!bone.worldTransform || !child.worldTransform) return null;
  
  const parentPos = bone.getWorldPoint();
  const childPos = child.getWorldPoint();
  
  // Vetor direção do osso
  const dx = childPos.x - parentPos.x;
  const dy = childPos.y - parentPos.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  
  if (len === 0) return null;
  
  // Normal perpendicular
  const nx = -dy / len;
  const ny = dx / len;
  
  const halfWidthStart = widthStart;
  const halfWidthEnd = widthEnd;
  
  // 4 cantos do trapézio orientado
  return [
    { x: parentPos.x + nx * halfWidthStart, y: parentPos.y + ny * halfWidthStart },
    { x: parentPos.x - nx * halfWidthStart, y: parentPos.y - ny * halfWidthStart },
    { x: childPos.x - nx * halfWidthEnd, y: childPos.y - ny * halfWidthEnd },
    { x: childPos.x + nx * halfWidthEnd, y: childPos.y + ny * halfWidthEnd }
  ];
}

/**
 * Gera região para osso terminal (sem filho) - usa octógono
 */
export function generateEndBoneRegion(bone, width = 30) {
  if (!bone.worldTransform) return null;
  
  const pos = bone.getWorldPoint();
  const radius = width;
  
  // Gera octógono aproximado
  const points = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    points.push({
      x: pos.x + Math.cos(angle) * radius,
      y: pos.y + Math.sin(angle) * radius
    });
  }
  return points;
}

/**
 * Gera região anatómica para a cabeça (inclui cabelo)
 * Cria um polígono oval alongado verticalmente para cobrir cabeça e cabelo
 */
export function generateHeadRegion(bone, imageHeight, imageWidth) {
  if (!bone.worldTransform) return null;
  
  const pos = bone.getWorldPoint();
  // Cabeça: oval alongado verticalmente, centrado na articulação da cabeça
  // Mais largo na base (cabelo), mais estreito no topo
  const widthTop = 50;
  const widthBottom = 80;
  const height = 120;
  
  return [
    { x: pos.x - widthTop / 2, y: pos.y - height * 0.6 },      // Topo esquerdo
    { x: pos.x + widthTop / 2, y: pos.y - height * 0.6 },      // Topo direito
    { x: pos.x + widthBottom / 2, y: pos.y + height * 0.4 },   // Base direita (cabelo)
    { x: pos.x - widthBottom / 2, y: pos.y + height * 0.4 }    // Base esquerda (cabelo)
  ];
}

/**
 * Gera região anatómica para o pescoço
 * Conecta a cabeça ao tronco, formato cilíndrico
 */
export function generateNeckRegion(bone, child) {
  if (!bone.worldTransform || !child || !child.worldTransform) return null;
  
  const parentPos = bone.getWorldPoint();
  const childPos = child.getWorldPoint();
  
  const dx = childPos.x - parentPos.x;
  const dy = childPos.y - parentPos.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  
  if (len === 0) return null;
  
  const nx = -dy / len;
  const ny = dx / len;
  
  const halfWidth = 25; // Pescoço mais estreito
  
  return [
    { x: parentPos.x + nx * halfWidth, y: parentPos.y + ny * halfWidth },
    { x: parentPos.x - nx * halfWidth, y: parentPos.y - ny * halfWidth },
    { x: childPos.x - nx * halfWidth, y: childPos.y - ny * halfWidth },
    { x: childPos.x + nx * halfWidth, y: childPos.y + ny * halfWidth }
  ];
}

/**
 * Gera região anatómica para a mão (pulso)
 * Formato que acompanha a silhueta da mão com dedos
 */
export function generateHandRegion(bone, isLeft = true) {
  if (!bone.worldTransform) return null;
  
  const pos = bone.getWorldPoint();
  // Mão: forma aproximada da palma + dedos
  // Mais larga na base do pulso, estreita nos dedos
  const palmWidth = 45;
  const palmHeight = 35;
  const fingerLength = 45;
  const fingerSpread = 40;
  
  const dir = isLeft ? 1 : -1;
  
  return [
    // Palma - lado externo (lado do mindinho)
    { x: pos.x - dir * palmWidth / 2, y: pos.y - palmHeight / 2 },
    { x: pos.x - dir * palmWidth / 2, y: pos.y + palmHeight / 2 },
    // Dedos - lado externo
    { x: pos.x - dir * fingerSpread / 2, y: pos.y + palmHeight / 2 + fingerLength },
    // Topo dos dedos (curva suave)
    { x: pos.x, y: pos.y + palmHeight / 2 + fingerLength + 5 },
    { x: pos.x + dir * fingerSpread / 2, y: pos.y + palmHeight / 2 + fingerLength },
    // Palma - lado interno (lado do polegar)
    { x: pos.x + dir * palmWidth / 2, y: pos.y + palmHeight / 2 },
    { x: pos.x + dir * palmWidth / 2, y: pos.y - palmHeight / 2 }
  ];
}

/**
 * Gera região anatómica para o pé/sapatilha (tornozelo)
 * Formato que acompanha a sapatilha completa
 */
export function generateFootRegion(bone, isLeft = true) {
  if (!bone.worldTransform) return null;
  
  const pos = bone.getWorldPoint();
  // Pé/Sapatilha: formato alongado, mais largo na ponta
  const footLength = 90;
  const heelWidth = 35;
  const toeWidth = 50;
  const ankleHeight = 25;
  
  const dir = isLeft ? 1 : -1;
  
  return [
    // Calcanhar
    { x: pos.x - dir * heelWidth / 2, y: pos.y - ankleHeight / 2 },
    { x: pos.x - dir * heelWidth / 2, y: pos.y + ankleHeight / 2 },
    // Lateral externa do pé
    { x: pos.x + dir * footLength * 0.3, y: pos.y + toeWidth / 2 },
    { x: pos.x + dir * footLength * 0.7, y: pos.y + toeWidth / 2 },
    // Ponta do pé
    { x: pos.x + dir * footLength, y: pos.y },
    { x: pos.x + dir * footLength * 0.7, y: pos.y - toeWidth / 2 },
    { x: pos.x + dir * footLength * 0.3, y: pos.y - toeWidth / 2 },
    // Lateral interna do pé
    { x: pos.x - dir * heelWidth / 2, y: pos.y - ankleHeight / 2 }
  ];
}

/**
 * Classe para gerenciar o Mapa de Peças
 */
export class PieceMap {
  constructor(characterObject, rig, renderer) {
    this.characterObject = characterObject;
    this.rig = rig;
    this.renderer = renderer;
    this.regions = new Map(); // boneId -> { points, color, name, boneId, selected }
    this.selectedRegionId = null;
    this.hoveredRegionId = null;
    this.controlPointRadius = 8;
    this.isEditing = false;
    this.draggedPointIndex = -1;
    this.draggedRegionId = null;
    
    // Callbacks
    this.onSelectionChange = null;
    this.onRegionChange = null;
  }
  
  /**
   * Gera regiões automáticas para todos os ossos da armadura
   */
  generateRegions() {
    this.regions.clear();
    
    if (!this.rig || !this.characterObject) return;
    
    const bones = this.rig.getAllBones();
    
    // Transformação inversa do personagem (world -> character local)
    const charInv = this.characterObject.transform.getInverse();
    
    // Primeiro: gera regiões baseadas nos ossos (membros, tronco, etc.)
    for (const bone of bones) {
      // Encontra filho direto (apenas um para simplicidade)
      const child = bone.children[0];
      
      let points;
      
      // Regiões cónicas (tapered) para membros que afinam
      // Antebraços: cotovelo -> pulso
      // Coxas: anca -> joelho
      const isLeftForearm = bone.id === 'cotovelo_esquerdo' && child && child.id === 'pulso_esquerdo';
      const isRightForearm = bone.id === 'cotovelo_direito' && child && child.id === 'pulso_direito';
      const isLeftThigh = bone.id === 'anca_esquerda' && child && child.id === 'joelho_esquerdo';
      const isRightThigh = bone.id === 'anca_direita' && child && child.id === 'joelho_direito';
      
      if (isLeftForearm || isRightForearm) {
        // Antebraços: mais largos no cotovelo, mais finos no pulso
        points = generateTaperedBoneRegion(bone, child, 35, 20);
      } else if (isLeftThigh || isRightThigh) {
        // Coxas: mais largas na anca, mais finas no joelho
        points = generateTaperedBoneRegion(bone, child, 40, 25);
      } else if (child) {
        const baseWidth = this.getBoneWidth(bone);
        points = generateBoneRegion(bone, child, baseWidth);
      } else {
        points = generateEndBoneRegion(bone, this.getBoneWidth(bone));
      }
      
      if (!points || points.length < 3) continue;
      
      // Converte pontos de coordenadas mundiais para coordenadas locais do personagem
      const localPoints = points.map(p => charInv.transformPoint(p.x, p.y));
      
      // Determina cor e nome
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
    
    // --- REGIÕES ANATÓMICAS ESPECIAIS ---
    // Estas são regiões adicionais que melhoram a precisão anatómica
    
    // 1. CABEÇA (inclui cabelo) - região separada para 'cabeca'
    const headBone = this.rig.getBone('cabeca');
    if (headBone && headBone.worldTransform) {
      const points = generateHeadRegion(headBone, this.characterObject.imageHeight, this.characterObject.imageWidth);
      if (points && points.length >= 3) {
        const localPoints = points.map(p => charInv.transformPoint(p.x, p.y));
        this.regions.set('cabeca_anatomica', {
          id: 'cabeca_anatomica',
          boneId: 'cabeca',
          points: localPoints.map(p => ({ x: p.x, y: p.y })),
          originalPoints: localPoints.map(p => ({ x: p.x, y: p.y })),
          color: REGION_COLORS['cabeca_anatomica'] || 'rgba(255, 100, 100, 0.5)',
          name: 'Cabeça e Cabelo',
          selected: false,
          visible: true,
          generated: true,
          anatomical: true
        });
      }
      
      // 2. PESCOÇO - região separada para 'pescoco'
      const neckBone = this.rig.getBone('pescoco');
      const headBone2 = this.rig.getBone('cabeca');
      if (neckBone && neckBone.worldTransform && headBone2 && headBone2.worldTransform) {
        const points = generateNeckRegion(neckBone, headBone2);
        if (points && points.length >= 3) {
          const localPoints = points.map(p => charInv.transformPoint(p.x, p.y));
          this.regions.set('pescoco_anatomico', {
            id: 'pescoco_anatomico',
            boneId: 'pescoco',
            points: localPoints.map(p => ({ x: p.x, y: p.y })),
            originalPoints: localPoints.map(p => ({ x: p.x, y: p.y })),
            color: REGION_COLORS['pescoco_anatomico'] || 'rgba(255, 150, 100, 0.5)',
            name: 'Pescoço',
            selected: false,
            visible: true,
            generated: true,
            anatomical: true
          });
        }
      }
      
      // 3. MÃO ESQUERDA - região separada para 'pulso_esquerdo'
      const leftWristBone = this.rig.getBone('pulso_esquerdo');
      if (leftWristBone && leftWristBone.worldTransform) {
        const points = generateHandRegion(leftWristBone, true);
        if (points && points.length >= 3) {
          const localPoints = points.map(p => charInv.transformPoint(p.x, p.y));
          this.regions.set('mao_esquerda', {
            id: 'mao_esquerda',
            boneId: 'pulso_esquerdo',
            points: localPoints.map(p => ({ x: p.x, y: p.y })),
            originalPoints: localPoints.map(p => ({ x: p.x, y: p.y })),
            color: REGION_COLORS['mao_esquerda'] || 'rgba(255, 100, 50, 0.5)',
            name: 'Mão Esquerda',
            selected: false,
            visible: true,
            generated: true,
            anatomical: true
          });
        }
      }
      
      // 4. MÃO DIREITA - região separada para 'pulso_direito'
      const rightWristBone = this.rig.getBone('pulso_direito');
      if (rightWristBone && rightWristBone.worldTransform) {
        const points = generateHandRegion(rightWristBone, false);
        if (points && points.length >= 3) {
          const localPoints = points.map(p => charInv.transformPoint(p.x, p.y));
          this.regions.set('mao_direita', {
            id: 'mao_direita',
            boneId: 'pulso_direito',
            points: localPoints.map(p => ({ x: p.x, y: p.y })),
            originalPoints: localPoints.map(p => ({ x: p.x, y: p.y })),
            color: REGION_COLORS['mao_direita'] || 'rgba(50, 100, 255, 0.5)',
            name: 'Mão Direita',
            selected: false,
            visible: true,
            generated: true,
            anatomical: true
          });
        }
      }
      
      // 5. PÉ ESQUERDO - região separada para 'tornozelo_esquerdo'
      const leftAnkleBone = this.rig.getBone('tornozelo_esquerdo');
      if (leftAnkleBone && leftAnkleBone.worldTransform) {
        const points = generateFootRegion(leftAnkleBone, true);
        if (points && points.length >= 3) {
          const localPoints = points.map(p => charInv.transformPoint(p.x, p.y));
          this.regions.set('pe_esquerdo', {
            id: 'pe_esquerdo',
            boneId: 'tornozelo_esquerdo',
            points: localPoints.map(p => ({ x: p.x, y: p.y })),
            originalPoints: localPoints.map(p => ({ x: p.x, y: p.y })),
            color: REGION_COLORS['pe_esquerdo'] || 'rgba(50, 255, 100, 0.5)',
            name: 'Pé Esquerdo',
            selected: false,
            visible: true,
            generated: true,
            anatomical: true
          });
        }
      }
      
      // 6. PÉ DIREITO - região separada para 'tornozelo_direito'
      const rightAnkleBone = this.rig.getBone('tornozelo_direito');
      if (rightAnkleBone && rightAnkleBone.worldTransform) {
        const points = generateFootRegion(rightAnkleBone, false);
        if (points && points.length >= 3) {
          const localPoints = points.map(p => charInv.transformPoint(p.x, p.y));
          this.regions.set('pe_direito', {
            id: 'pe_direito',
            boneId: 'tornozelo_direito',
            points: localPoints.map(p => ({ x: p.x, y: p.y })),
            originalPoints: localPoints.map(p => ({ x: p.x, y: p.y })),
            color: REGION_COLORS['pe_direito'] || 'rgba(100, 255, 50, 0.5)',
            name: 'Pé Direito',
            selected: false,
            visible: true,
            generated: true,
            anatomical: true
          });
        }
      }
    
    console.log(`PieceMap: ${this.regions.size} regioes geradas`);
  }
  
  getBoneWidth = (bone) => {
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
  };
  
  getRandomColor() {
    const h = Math.random() * 360;
    return `hsla(${h}, 70%, 60%, 0.4)`;
  }
  
  /**
   * Converte coordenadas de tela para espaço local do personagem
   */
  screenToCharacterLocal(screenX, screenY) {
    const worldPos = this.renderer.screenToWorld(screenX, screenY);
    const charInv = this.characterObject.transform.getInverse();
    return charInv.transformPoint(worldPos.x, worldPos.y);
  }
  
  /**
   * Hit test em regiões - retorna regionId ou null
   */
  hitTestRegion(screenX, screenY) {
    const localPos = this.screenToCharacterLocal(screenX, screenY);
    
    // Testa em ordem reversa (último desenhado = por cima)
    const regionArray = Array.from(this.regions.values()).reverse();
    
    for (const region of regionArray) {
      if (!region.visible) continue;
      if (this.pointInPolygon(localPos.x, localPos.y, region.points)) {
        return region.id;
      }
    }
    return null;
  }
  
  /**
   * Point in polygon test
   */
  pointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;
      const intersect = ((yi > y) !== (yj > y)) &&
                       (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  
  /**
   * Hit test em pontos de controlo
   */
  hitTestControlPoint(screenX, screenY) {
    if (!this.selectedRegionId) return null;
    
    const region = this.regions.get(this.selectedRegionId);
    if (!region) return null;
    
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
   * Seleciona uma região
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
  
  /**
   * Atualiza hover
   */
  updateHover(screenX, screenY) {
    const hit = this.hitTestRegion(screenX, screenY);
    
    if (this.hoveredRegionId !== hit) {
      if (this.hoveredRegionId) {
        const prev = this.regions.get(this.hoveredRegionId);
        if (prev) prev.hovered = false;
      }
      this.hoveredRegionId = hit;
      if (hit) {
        const region = this.regions.get(hit);
        if (region) region.hovered = true;
      }
    }
  }
  
  /**
   * Inicia arraste de ponto de controlo
   */
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
  
  /**
   * Arrasta ponto de controlo
   */
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
  
  /**
   * Termina arraste
   */
  endDragPoint() {
    this.isEditing = false;
    this.draggedRegionId = null;
    this.draggedPointIndex = -1;
  }
  
  /**
   * Gera máscara para uma região (para criar Part real)
   */
  generateMask(regionId) {
    const region = this.regions.get(regionId);
    if (!region) return null;
    
    // Converte pontos para formato de máscara poligonal
    // Coordenadas já estão em espaço local do personagem (centro da imagem = 0,0)
    // Precisa converter para coordenadas da imagem original (topo-esquerdo = 0,0)
    const imgCenterX = this.characterObject.imageWidth / 2;
    const imgCenterY = this.characterObject.imageHeight / 2;
    
    const points = region.points.map(p => ({
      x: p.x + imgCenterX,
      y: p.y + imgCenterY
    }));
    
    // Calcula bounds
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
   * Calcula pivô na articulação do osso (joint do próprio osso)
   * Para o antebraço, o pivô deve estar no cotovelo (próprio osso), não no pai
   */
  calculatePivot(regionId) {
    const region = this.regions.get(regionId);
    if (!region) return { x: 0.5, y: 0.5 };
    
    const bone = this.rig.getBone(region.boneId);
    if (!bone) return { x: 0.5, y: 0.5 };
    
    // A articulação está na posição mundial do PRÓPRIO osso (joint)
    const jointWorld = bone.getWorldPoint();
    const imgCenterX = this.characterObject.imageWidth / 2;
    const imgCenterY = this.characterObject.imageHeight / 2;
    
    // Joint position in character-local coordinates (center origin)
    const jointLocalX = jointWorld.x - imgCenterX;
    const jointLocalY = jointWorld.y - imgCenterY;
    
    // Converte para coordenadas relativas ao bounds da máscara
    // mask.bounds está em coordenadas da imagem (origem topo-esquerda)
    // jointLocal está em coordenadas do personagem (origem no centro)
    const mask = this.generateMask(regionId);
    if (!mask) return { x: 0.5, y: 0.5 };
    
    // Converte jointLocal (centro da imagem) para coordenadas da imagem (topo-esquerda)
    const imgCenterX = this.characterObject.imageWidth / 2;
    const imgCenterY = this.characterObject.imageHeight / 2;
    const jointImgX = jointLocalX + imgCenterX;
    const jointImgY = jointLocalY + imgCenterY;
    
    const relX = (jointImgX - mask.bounds.x) / mask.bounds.width;
    const relY = (jointImgY - mask.bounds.y) / mask.bounds.height;
    
    return { x: Math.max(0, Math.min(1, relX)), y: Math.max(0, Math.min(1, relY)) };
  }
  
  /**
   * Desenha todas as regiões
   */
  draw(ctx, viewport) {
    if (!this.characterObject) return;
    
    ctx.save();
    
    // Transformação: viewport * characterTransform
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
    
    // Desenha cada região
    for (const region of this.regions.values()) {
      if (!region.visible) continue;
      
      this.drawRegion(ctx, region);
    }
    
    ctx.restore();
  }
  
  /**
   * Desenha uma região individual
   */
  drawRegion(ctx, region) {
    if (region.points.length < 3) return;
    
    ctx.save();
    
    // Preenchimento
    ctx.fillStyle = region.color;
    ctx.beginPath();
    ctx.moveTo(region.points[0].x, region.points[0].y);
    for (let i = 1; i < region.points.length; i++) {
      ctx.lineTo(region.points[i].x, region.points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    
    // Contorno
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
    
    // Pontos de controlo se selecionada
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
      
      // Label com nome
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
   * Serialização para JSON
   */
  toJSON() {
    const regionsData = {};
    for (const [id, region] of this.regions) {
      regionsData[id] = {
        boneId: region.boneId,
        points: region.points,
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
          boneId: regionData.boneId,
          points: regionData.points.map(p => ({ x: p.x, y: p.y })),
          originalPoints: regionData.points.map(p => ({ x: p.x, y: p.y })),
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
  
  /**
   * Obtém região por ID
   */
  getRegion(regionId) {
    return this.regions.get(regionId);
  }
  
  /**
   * Obtém todas as regiões
   */
  getAllRegions() {
    return Array.from(this.regions.values());
  }
  
  /**
   * Obtém região selecionada
   */
  getSelectedRegion() {
    return this.selectedRegionId ? this.regions.get(this.selectedRegionId) : null;
  }
}

export { PieceMap };