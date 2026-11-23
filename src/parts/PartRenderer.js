/**
 * PartRenderer - Renderiza peças recortadas sobre o personagem
 */

import { Transform2D } from '../core/Transform2D.js';

export class PartRenderer {
  constructor(renderer) {
    this.renderer = renderer;
    this.ctx = renderer.ctx;
    
    // Configurações visuais
    this.selectionColor = '#ffcc00';
    this.selectionBorderColor = '#ff8800';
    this.handleSize = 8;
    this.handleColor = '#ffcc00';
    this.handleBorderColor = '#ff8800';
  }
  
  /**
   * Desenha todas as peças de um personagem
   * @param {PartManager} partManager - Gerenciador de peças
   * @param {SceneObject} characterObject - Objeto do personagem
   */
  drawParts(partManager, characterObject) {
    if (!partManager || !partManager.characterObject) return;
    if (!partManager.rig) return;
    
    const parts = partManager.getPartsForRendering();
    if (parts.length === 0) return;
    
    // Garante que transformações mundiais dos bones estão atualizadas
    partManager.rig.computeWorldTransforms();
    
    this.ctx.save();
    
    // Aplica transformação do personagem + viewport
    const charMatrix = characterObject.transform.m;
    const viewportMatrix = this.renderer.viewport.m;
    
    // Combina: viewport * characterTransform
    const combined = new Transform2D();
    combined.setMatrix(
      viewportMatrix[0] * charMatrix[0] + viewportMatrix[2] * charMatrix[1],
      viewportMatrix[1] * charMatrix[0] + viewportMatrix[3] * charMatrix[1],
      viewportMatrix[0] * charMatrix[2] + viewportMatrix[2] * charMatrix[3],
      viewportMatrix[1] * charMatrix[2] + viewportMatrix[3] * charMatrix[3],
      viewportMatrix[0] * charMatrix[4] + viewportMatrix[2] * charMatrix[5] + viewportMatrix[4],
      viewportMatrix[1] * charMatrix[4] + viewportMatrix[3] * charMatrix[5] + viewportMatrix[5]
    );
    
    this.ctx.transform(
      combined.m[0], combined.m[1],
      combined.m[2], combined.m[3],
      combined.m[4], combined.m[5]
    );
    
    // Desenha cada peça na posição do seu bone
    for (const part of parts) {
      part.selected = part.id === partManager.selectedPartId;
      this.drawPart(part, partManager.rig);
    }
    
    this.ctx.restore();
    const selected = partManager.getSelectedPart();
    if (selected?.visible && selected.imageElement) {
      const bone = partManager.rig.getBone(selected.boneId);
      if (!bone) return;
      const point = combined.multiply(bone.worldTransform).multiply(selected.localTransform).transformPoint(0, 0);
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
      this.ctx.moveTo(point.x - 10, point.y);
      this.ctx.lineTo(point.x + 10, point.y);
      this.ctx.moveTo(point.x, point.y - 10);
      this.ctx.lineTo(point.x, point.y + 10);
      this.ctx.lineWidth = 4;
      this.ctx.strokeStyle = '#17212b';
      this.ctx.stroke();
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = '#ffcf33';
      this.ctx.stroke();
      this.ctx.restore();
    }
  }
  
  /**
   * Desenha uma única peça
   * @param {Part} part - Peça a desenhar
   * @param {Rig} rig - Rig contendo o bone pai
   */
  drawPart(part, rig) {
    if (!part.visible || !part.imageElement) return;
    
    const bone = rig.getBone(part.boneId);
    if (!bone || !bone.worldTransform) return;
    
    this.ctx.save();
    
    // Aplica transformação mundial do bone (já inclui rig.baseTransform)
    const boneWorld = bone.worldTransform;
    this.ctx.transform(
      boneWorld.m[0], boneWorld.m[1],
      boneWorld.m[2], boneWorld.m[3],
      boneWorld.m[4], boneWorld.m[5]
    );
    
    // Aplica transformação local da peça (relativa ao bone)
    const t = part.localTransform;
    this.ctx.transform(t.m[0], t.m[1], t.m[2], t.m[3], t.m[4], t.m[5]);
    
    const w = part.imageWidth;
    const h = part.imageHeight;
    
    // Desenha imagem centrada no pivot (a imagem já vem recortada com transparência)
    this.ctx.drawImage(
      part.imageElement,
      -part.pivot.x * w,
      -part.pivot.y * h
    );
    
    // Desenha seleção se selecionada
    if (part.selected) {
      this.drawSelection(part);
    }
    
    this.ctx.restore();
  }
  
  /**
   * Desenha indicador de seleção
   */
  hitsRotationHandle(part,obj,x,y) {
    const bone=obj.rig.getBone(part.boneId);
    const m=this.renderer.viewport.clone().multiply(obj.transform).multiply(bone.worldTransform).multiply(part.localTransform);
    const pt=m.transformPoint((.5-part.pivot.x)*part.imageWidth,-part.pivot.y*part.imageHeight-14);
    return Math.hypot(pt.x-x,pt.y-y)<12;
  }

  drawSelection(part) {
    const w = part.imageWidth;
    const h = part.imageHeight;
    
    this.ctx.save();
    this.ctx.strokeStyle = '#ffcc00';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 5]);
    
    const pivotX = part.pivot.x * part.imageWidth;
    const pivotY = part.pivot.y * part.imageHeight;
    
    this.ctx.beginPath();
    this.ctx.rect(-pivotX, -pivotY, w, h);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    this.ctx.fillStyle='#fdc400';
    for (const [x,y] of [[0,0],[w/2-pivotX,-pivotY-14]]) {
      this.ctx.beginPath(); this.ctx.arc(x,y,5,0,2*Math.PI); this.ctx.fill();
    }
    // Handles nos cantos
    const handleSize = 8;
    const corners = [
      { x: -part.imageWidth/2, y: -part.imageHeight/2 },
      { x: part.imageWidth/2, y: -part.imageHeight/2 },
      { x: part.imageWidth/2, y: part.imageHeight/2 },
      { x: -part.imageWidth/2, y: part.imageHeight/2 }
    ];
    
    this.ctx.fillStyle = '#ffcc00';
    this.ctx.strokeStyle = '#ff8800';
    this.ctx.lineWidth = 1;
    
    for (const corner of corners) {
      this.ctx.beginPath();
      this.ctx.rect(corner.x - 4, corner.y - 4, 8, 8);
      this.ctx.fill();
      this.ctx.stroke();
    }
    
    this.ctx.restore();
  }
  
  /**
   * Hit test em peças
   * @returns {Part|null} Peça sob o cursor ou null
   */
  hitTestPart(partManager, characterObject, screenX, screenY) {
    if (!this.renderer) return null;
    
    // Converte tela para mundo do personagem
    const viewportInv = this.renderer.viewport.getInverse();
    const worldPos = viewportInv.transformPoint(screenX, screenY);
    
    // Inverte transformação do personagem
    const charInv = characterObject.transform.getInverse();
    const charLocal = charInv.transformPoint(worldPos.x, worldPos.y);
    
    for (const part of partManager.getPartsForRendering().reverse()) {
      const bone = partManager.rig.getBone(part.boneId);
      if (!bone || !part.visible || !part.imageElement) continue;
      const transform = bone.worldTransform.clone().multiply(part.localTransform);
      const point = transform.inverseTransformPoint(charLocal.x, charLocal.y);
      const x = Math.floor(point.x + part.pivot.x * part.imageWidth);
      const y = Math.floor(point.y + part.pivot.y * part.imageHeight);
      if (x < 0 || y < 0 || x >= part.imageWidth || y >= part.imageHeight) continue;
      const sample = document.createElement('canvas');
      sample.width = sample.height = 1;
      const ctx = sample.getContext('2d');
      ctx.drawImage(part.imageElement, x, y, 1, 1, 0, 0, 1, 1);
      if (ctx.getImageData(0, 0, 1, 1).data[3]) return part;
    }
    return null;
  }
}
