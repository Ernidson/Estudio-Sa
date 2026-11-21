/**
 * PartManager - Gerencia as peças recortadas de um personagem
 * Responsável por coordenar partes, calcular transformações mundiais,
 * e coordenar com o Rig/RigEditor
 */

import { Part, createPart } from './Part.js';
import { generateId } from '../editor/ImageImporter.js';

export class PartManager {
  constructor(characterObject, rig, rigRenderer, renderer) {
    this.characterObject = characterObject; // SceneObject com a imagem base
    this.rig = rig; // Rig associado
    this.rigRenderer = null; // RigRenderer para hit-testing
    this.renderer = null; // Renderer principal para coordenadas
    
    // Peças indexadas por ID
    this.parts = new Map();
    
    // Ordem de renderização (z-index)
    this.renderOrder = [];
    
    // Seleção
    this.selectedPartId = null;
    this.hoveredPartId = null;
    
    // Modo de edição
    this.isCuttingMode = false;
    this.cuttingData = null;
    
    // Referências
    this.rigRenderer = null;
    this.renderer = null;
    
    // Callbacks
    this.onSelectionChange = null;
    this.onPartCreated = null;
    this.onPartMove = null;
    this.onPartDelete = null;
  }
  
  /**
   * Inicializa referências
   */
  setReferences(rigRenderer, renderer) {
    this.rigRenderer = rigRenderer;
    this.renderer = renderer;
  }
  
  /**
   * Cria uma nova peça a partir de uma região da imagem
   */
  async createPartFromRegion(characterObject, boneId, mask, name = 'Nova Peça') {
    // Obtém o bone alvo
    const bone = this.rig?.getBone(boneId);
    if (!bone) {
      throw new Error(`Bone ${boneId} não encontrado`);
    }
    
    // Carrega a imagem original se necessário
    if (!this.characterObject.imageElement) {
      await this.characterObject.loadImage();
    }
    
    const sourceImg = this.characterObject.imageElement;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Calcula bounds da máscara em coordenadas da imagem original
    let bounds;
    if (mask.type === 'rect') {
      bounds = mask.bounds;
    } else if (mask.type === 'polygon') {
      // Calcula bounding box do polígono
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
    
    // Adiciona margem para não cortar exatamente na borda
    const margin = 2;
    const sx = Math.max(0, bounds.x - margin);
    const sy = Math.max(0, bounds.y - margin);
    const sw = Math.min(this.characterObject.imageWidth - sx, bounds.width + margin * 2);
    const sh = Math.min(this.characterObject.imageHeight - sy, bounds.height + margin * 2);
    
    // Desenha a região recortada
    canvas.width = sw;
    canvas.height = sh;
    ctx.drawImage(
      this.characterObject.imageElement,
      sx, sy, sw, sh,
      0, 0, sw, sh
    );
    
    // Se máscara é polígono, aplica recorte adicional
    if (mask.type === 'polygon') {
      ctx.save();
      // Ajusta coordenadas do polígono para o canvas recortado
      const adjustedPoints = mask.points.map(pt => ({
        x: pt.x - sx,
        y: pt.y - sy
      }));
      
      ctx.beginPath();
      ctx.moveTo(adjustedPoints[0].x, adjustedPoints[0].y);
      for (let i = 1; i < adjustedPoints.length; i++) {
        ctx.lineTo(adjustedPoints[i].x, adjustedPoints[i].y);
      }
      ctx.closePath();
      ctx.clip();
      // Redesenha a imagem original recortada no polígono
      ctx.drawImage(
        this.characterObject.imageElement,
        sx, sy, sw, sh,
        0, 0, sw, sh
      );
      ctx.restore();
    }
    
    // Converte para Data URL
    const imageData = canvas.toDataURL('image/png');
    
    // Calcula posição local relativa à articulação do osso (joint do próprio osso)
    // A posição da peça no espaço do personagem (centro da imagem = 0,0)
    const pieceCenterX = bounds.x + bounds.width / 2;
    const pieceCenterY = bounds.y + bounds.height / 2;
    
    // Converte para coordenadas locais do personagem (origem no centro da imagem)
    const charCenterX = this.characterObject.imageWidth / 2;
    const charCenterY = this.characterObject.imageHeight / 2;
    let localX = pieceCenterX - charCenterX;
    let localY = pieceCenterY - charCenterY;
    
    // Converte para coordenadas locais da articulação do osso (joint do próprio osso)
    // A articulação está na posição mundial do PRÓPRIO osso
    const jointWorld = bone.getWorldPoint();
    const jointLocalX = jointWorld.x - this.characterObject.imageWidth / 2;
    const jointLocalY = jointWorld.y - this.characterObject.imageHeight / 2;
    
    // Posição local relativa à articulação do osso
    localX = localX - jointLocalX;
    localY = localY - jointLocalY;
    
    // Cria a peça
    const part = new Part({
      name,
      sourceObjectId: this.characterObject.id,
      boneId,
      mask,
      localPosition: { x: localX, y: localY },
      pivot: { x: 0.5, y: 0.5 }, // Centro da peça por padrão
      zIndex: this.getNextZIndex()
    });
    
    // Define imageData depois de criar o canvas
    part.imageData = canvas.toDataURL('image/png');
    part.imageWidth = bounds.width + 4; // com margem
    part.imageHeight = bounds.height + 4;
    
    // Carrega a imagem
    await part.loadImage();
    
    // Calcula pivot (centro da peça)
    part.pivot = { x: 0.5, y: 0.5 };
    
    // Adiciona ao manager
    this.addPart(part);
    
    return part;
  }
  
  /**
   * Adiciona uma peça
   */
  addPart(part) {
    if (!(part instanceof Part)) {
      part = new Part(part);
    }
    this.parts.set(part.id, part);
    this.renderOrder.push(part.id);
    this.renderOrder.sort((a, b) => {
      const pa = this.parts.get(a);
      const pb = this.parts.get(b);
      return (pa.zIndex || 0) - (pb.zIndex || 0);
    });
    
    if (this.onPartCreated) {
      this.onPartCreated(part);
    }
    return part;
  }
  
  /**
   * Remove uma peça
   */
  removePart(partId) {
    const part = this.parts.get(partId);
    if (!part) return false;
    
    this.parts.delete(partId);
    this.renderOrder = this.renderOrder.filter(id => id !== partId);
    
    if (this.selectedPartId === partId) {
      this.selectedPartId = null;
    }
    if (this.hoveredPartId === partId) {
      this.hoveredPartId = null;
    }
    
    if (this.onPartDelete) {
      this.onPartDelete(partId);
    }
    return true;
  }
  
  /**
   * Obtém peça por ID
   */
  getPart(partId) {
    return this.parts.get(partId);
  }
  
  /**
   * Obtém todas as peças
   */
  getAllParts() {
    return Array.from(this.parts.values());
  }
  
  /**
   * Obtém peças ordenadas para renderização
   */
  getPartsForRendering() {
    return this.renderOrder
      .map(id => this.parts.get(id))
      .filter(p => p && p.visible);
  }
  
  /**
   * Seleciona uma peça
   */
  selectPart(partId) {
    if (this.selectedPartId === partId) return;
    
    const part = this.parts.get(partId);
    if (!part) return false;
    
    this.selectedPartId = partId;
    
    if (this.onSelectionChange) {
      this.onSelectionChange(this.getPart(partId));
    }
    return true;
  }
  
  /**
   * Desseleciona
   */
  clearSelection() {
    if (this.selectedPartId) {
      this.selectedPartId = null;
      if (this.onSelectionChange) {
        this.onSelectionChange(null);
      }
    }
  }
  
  /**
   * Obtém peça selecionada
   */
  getSelectedPart() {
    return this.selectedPartId ? this.parts.get(this.selectedPartId) : null;
  }
  
  /**
   * Atualiza hover
   */
  updateHover(screenX, screenY) {
    if (!this.renderer) return null;
    
    // Converte para coordenadas do canvas
    const canvas = this.renderer.canvas;
    const rect = canvas.getBoundingClientRect();
    const x = screenX - rect.left;
    const y = screenY - rect.top;
    
    // Hit test em todas as peças visíveis (ordem reversa - topo primeiro)
    const parts = this.getPartsForRendering().reverse();
    for (const part of parts) {
      if (part.visible && part.hitTest(screenX, screenY, this.renderer)) {
        this.hoveredPartId = part.id;
        return part;
      }
    }
    
    this.hoveredPartId = null;
    return null;
  }
  
  /**
   * Inicia modo de recorte
   */
  startCuttingMode(boneId, maskType = 'rect') {
    if (!this.rig) return false;
    
    const bone = this.rig.getBone(boneId);
    if (!bone) return false;
    
    this.isCuttingMode = true;
    this.cuttingData = {
      boneId,
      maskType,
      startPoint: null,
      currentRect: null,
      polygonPoints: []
    };
    
    return true;
  }
  
  /**
   * Atualiza recorte em andamento
   * @param {number} canvasX - X relativo ao canvas (já convertido do screen)
   * @param {number} canvasY - Y relativo ao canvas (já convertido do screen)
   */
  updateCutting(canvasX, canvasY) {
    if (!this.isCuttingMode || !this.cuttingData) return;
    
    // Converte para coordenadas da imagem original
    const worldPos = this.renderer.screenToWorld(canvasX, canvasY);
    const charInv = this.characterObject.transform.getInverse();
    const localPos = charInv.transformPoint(worldPos.x, worldPos.y);
    
    const data = this.cuttingData;
    
    if (data.maskType === 'rect') {
      if (!data.startPoint) {
        data.startPoint = { x: localPos.x, y: localPos.y };
      }
      data.currentRect = {
        x: Math.min(data.startPoint.x, localPos.x),
        y: Math.min(data.startPoint.y, localPos.y),
        width: Math.abs(localPos.x - data.startPoint.x),
        height: Math.abs(localPos.y - data.startPoint.y)
      };
    } else if (data.maskType === 'polygon') {
      // Para polígono, adiciona ponto
      if (!data.polygonPoints) data.polygonPoints = [];
      data.polygonPoints.push({ x: localPos.x, y: localPos.y });
    }
  }
  
  /**
   * Finaliza recorte
   */
  async finishCutting() {
    if (!this.isCuttingMode || !this.cuttingData) return null;
    
    const data = this.cuttingData;
    let mask;
    
    if (data.maskType === 'rect' && data.currentRect) {
      mask = {
        type: 'rect',
        bounds: data.currentRect
      };
    } else if (data.maskType === 'polygon' && data.polygonPoints && data.polygonPoints.length >= 3) {
      mask = {
        type: 'polygon',
        points: data.polygonPoints
      };
    }
    
    this.isCuttingMode = false;
    this.cuttingData = null;
    
    return mask;
  }
  
  /**
   * Cancela recorte
   */
  cancelCutting() {
    this.isCuttingMode = false;
    this.cuttingData = null;
  }
  
  /**
   * Obtém próximo z-index
   */
  getNextZIndex() {
    let maxZ = 0;
    for (const part of this.parts.values()) {
      if (part.zIndex > maxZ) maxZ = part.zIndex;
    }
    return maxZ + 1;
  }
  
  /**
   * Atualiza transformações mundiais de todas as peças
   */
  updateWorldTransforms() {
    if (!this.characterObject || !this.rig) return;
    
    // Calcula transformação mundial do personagem
    const charWorld = this.characterObject.transform;
    
    // Calcula transformação base do rig
    const baseTransform = this.rig.baseTransform;
    
    // Para cada peça, calcula transformação mundial
    for (const part of this.parts.values()) {
      if (!part.visible) continue;
      
      const bone = this.rig.getBone(part.boneId);
      if (!bone) continue;
      
      // Posição mundial do osso pai
      const parentWorld = bone.getWorldPoint();
      
      // Cria transformação mundial da peça
      part.computeWorldTransform(
        { x: parentWorld.x, y: parentWorld.y },
        this.characterObject.transform,
        this.rig.baseTransform
      );
    }
  }
  
  /**
   * Renderiza todas as peças
   */
  renderParts(renderer) {
    if (!this.characterObject || !this.characterObject.visible) return;
    
    const parts = this.getPartsForRendering();
    if (parts.length === 0) return;
    
    // Salva contexto
    const ctx = renderer.ctx;
    ctx.save();
    
    // Aplica transformação do personagem
    const charMatrix = this.characterObject.transform.m;
    ctx.transform(
      charMatrix[0], charMatrix[1],
      charMatrix[2], charMatrix[3],
      charMatrix[4], charMatrix[5]
    );
    
    // Desenha cada peça
    for (const part of this.getPartsForRendering()) {
      if (!part.visible || !part.imageElement) continue;
      
      // Calcula transformação da peça relativa ao personagem
      // A peça está em coordenadas locais do personagem
      const partTransform = part.localTransform;
      
      ctx.save();
      ctx.transform(
        partTransform.m[0], partTransform.m[1],
        partTransform.m[2], partTransform.m[3],
        partTransform.m[4], partTransform.m[5]
      );
      
      // Desenha imagem centrada no pivot
      const w = part.imageWidth;
      const h = part.imageHeight;
      const pivotX = w * part.pivot.x;
      const pivotY = h * part.pivot.y;
      
      ctx.drawImage(
        part.imageElement,
        -pivotX, -pivotY, w, h
      );
      
      // Se há máscara, aplica recorte
      if (part.mask) {
        ctx.save();
        ctx.beginPath();
        if (part.mask.type === 'rect') {
          ctx.rect(
            part.mask.bounds.x,
            part.mask.bounds.y,
            part.mask.bounds.width,
            part.mask.bounds.height
          );
        } else if (part.mask.type === 'polygon') {
          ctx.beginPath();
          ctx.moveTo(part.mask.points[0].x, part.mask.points[0].y);
          for (let i = 1; i < part.mask.points.length; i++) {
            ctx.lineTo(part.mask.points[i].x, part.mask.points[i].y);
          }
          ctx.closePath();
        }
        ctx.clip();
        ctx.drawImage(part.imageElement, -w/2, -h/2, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(part.imageElement, -w/2, -h/2, w, h);
      }
      
      ctx.restore();
    }
    
    ctx.restore();
  }
  
  /**
   * Hit test em peças
   */
  hitTestPart(screenX, screenY) {
    if (!this.renderer) return null;
    
    const canvas = this.renderer.canvas;
    const rect = canvas.getBoundingClientRect();
    const x = screenX - rect.left;
    const y = screenY - rect.top;
    
    // Testa em ordem reversa (topo primeiro)
    const parts = this.getPartsForRendering().reverse();
    
    for (const part of parts) {
      if (!part.visible || !part.imageElement) continue;
      
      // Converte para coordenadas locais da peça
      // Simplificado: usa hit test retangular
      const rect = canvas.getBoundingClientRect();
      const screenX = screenX - rect.left;
      const screenY = screenY - rect.top;
      
      // TODO: hit test preciso com transformações
      // Por enquanto, usa bounding box aproximado
    }
    
    return null;
  }
  
  /**
   * Serialização para JSON
   */
  toJSON() {
    return {
      parts: this.getAllParts().map(p => p.toJSON()),
      selectedPartId: this.selectedPartId
    };
  }
  
  /**
   * Carrega de JSON
   */
  static fromJSON(data, characterObject, rig) {
    const manager = new PartManager(characterObject, rig, null, null);
    if (data.parts) {
      for (const partData of data.parts) {
        const part = Part.fromJSON(partData);
        manager.addPart(part);
      }
      manager.selectedPartId = data.selectedPartId;
    }
    return manager;
  }
}