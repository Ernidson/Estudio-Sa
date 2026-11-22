/**
 * RigRenderer - Desenha o esqueleto (rig) sobre a imagem no canvas
 * Responsável por renderizar bones, joints, labels e feedback visual.
 */

import { Transform2D } from '../core/Transform2D.js';

export class RigRenderer {
  constructor(renderer) {
    this.renderer = renderer; // Referência ao Renderer principal
    this.ctx = renderer.ctx;
    
    // Configurações visuais padrão
    this.boneColor = '#007acc';
    this.boneThickness = 3;
    this.jointRadius = 6;
    this.jointColor = '#ffffff';
    this.jointBorderColor = '#007acc';
    this.jointBorderWidth = 2;
    this.selectedJointColor = '#ffcc00';
    this.selectedJointBorderColor = '#ff8800';
    this.selectedJointRadius = 9;
    this.labelColor = '#ffffff';
    this.labelBackground = 'rgba(0, 0, 0, 0.7)';
    this.labelFont = '11px Segoe UI, sans-serif';
    this.labelPadding = 4;
    
    // Estado
    this.showLabels = false;
    this.showBoneNames = false;
  }

  /**
   * Desenha o rig completo
   * @param {Rig} rig - Rig a desenhar
   * @param {SceneObject} characterObject - Objeto do personagem (para transformação)
   */
  drawRig(rig, characterObject) {
    if (!rig || !rig.visible) return;
    if (!characterObject || !characterObject.visible) return;
    
    this.ctx.save();
    
    // Bone.worldTransform already includes rig.baseTransform.
    const finalMatrix = this.renderer.viewport.clone().multiply(characterObject.transform);
    this.ctx.transform(
      finalMatrix.m[0], finalMatrix.m[1],
      finalMatrix.m[2], finalMatrix.m[3],
      finalMatrix.m[4], finalMatrix.m[5]
    );
    
    // Desenha bones (linhas entre pai e filho)
    this._drawBones(rig);
    
    // Desenha joints (pontos)
    this._drawJoints(rig);
    
    // Desenha labels se habilitado
    if (this.showLabels || rig.showBoneNames) {
      this._drawLabels(rig);
    }
    
    this.ctx.restore();
  }

  /**
   * Desenha conexões entre bones (linhas)
   */
  _drawBones(rig) {
    this.ctx.strokeStyle = this.boneColor;
    this.ctx.lineWidth = this.boneThickness / this.renderer.viewportScale;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    
    for (const bone of rig.getAllBones()) {
      if (!bone.visible) continue;
      
      for (const child of bone.children) {
        if (!child.visible) continue;
        
        const parentPos = bone.getWorldPoint();
        const childPos = child.getWorldPoint();
        
        this.ctx.beginPath();
        this.ctx.moveTo(parentPos.x, parentPos.y);
        this.ctx.lineTo(childPos.x, childPos.y);
        this.ctx.stroke();
      }
    }
  }

  /**
   * Desenha articulações (pontos)
   */
  _drawJoints(rig) {
    const scale = this.renderer.viewportScale;
    
    for (const bone of rig.getAllBones()) {
      if (!bone.visible) continue;
      
      const pos = bone.getWorldPoint();
      const isSelected = bone.selected || (rig.selectedBoneId === bone.id);
      
      // Configura estilo
      const radius = (isSelected ? this.selectedJointRadius : this.jointRadius) / scale;
      const fillColor = isSelected ? this.selectedJointColor : bone.color;
      const borderColor = isSelected ? this.selectedJointBorderColor : this.jointBorderColor;
      const borderWidth = (isSelected ? 3 : this.jointBorderWidth) / scale;
      
      // Desenha círculo
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = fillColor;
      this.ctx.fill();
      
      // Borda
      this.ctx.strokeStyle = borderColor;
      this.ctx.lineWidth = borderWidth;
      this.ctx.stroke();
      
      // Indicador de tipo 'end' (ponta)
      if (bone.type === 'end') {
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, radius * 0.5, 0, Math.PI * 2);
        this.ctx.fillStyle = borderColor;
        this.ctx.fill();
      }
    }
  }

  /**
   * Desenha nomes dos bones
   */
  _drawLabels(rig) {
    const scale = this.renderer.viewportScale;
    this.ctx.font = this.labelFont;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    
    for (const bone of rig.getAllBones()) {
      if (!bone.visible) continue;
      
      const pos = bone.getWorldPoint();
      const label = bone.name;
      
      // Mede texto
      const metrics = this.ctx.measureText(label);
      const textWidth = metrics.width;
      const textHeight = parseInt(this.labelFont, 10);
      const padding = this.labelPadding / scale;
      
      // Background
      this.ctx.fillStyle = this.labelBackground;
      this.ctx.fillRect(
        pos.x - textWidth / 2 - padding,
        pos.y - this.jointRadius / scale - textHeight - padding * 2,
        textWidth + padding * 2,
        textHeight + padding * 2
      );
      
      // Texto
      this.ctx.fillStyle = this.labelColor;
      this.ctx.fillText(
        label,
        pos.x,
        pos.y - this.jointRadius / scale - padding
      );
    }
  }

  /**
   * Desenha bone específico (para preview/feedback)
   */
  drawBonePreview(bone, color = '#ffcc00', thickness = 4) {
    if (!bone || !bone.parent) return;
    
    this.ctx.save();
    
    // Aplica mesma transformação do drawRig
    // (assumindo que já está no contexto correto)
    
    const parentPos = bone.parent.getWorldPoint();
    const childPos = bone.getWorldPoint();
    
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = thickness / this.renderer.viewportScale;
    this.ctx.lineCap = 'round';
    this.ctx.setLineDash([8 / this.renderer.viewportScale, 4 / this.renderer.viewportScale]);
    
    this.ctx.beginPath();
    this.ctx.moveTo(parentPos.x, parentPos.y);
    this.ctx.lineTo(childPos.x, childPos.y);
    this.ctx.stroke();
    
    this.ctx.setLineDash([]);
    this.ctx.restore();
  }

  /**
   * Verifica se ponto da tela está sobre um joint
   * @param {number} screenX - Coordenada X da tela
   * @param {number} screenY - Coordenada Y da tela
   * @param {Rig} rig - Rig a testar
   * @param {SceneObject} characterObject - Objeto do personagem
   * @returns {Bone|null} Bone sob o cursor ou null
   */
  hitTestJoint(screenX, screenY, rig, characterObject) {
    if (!rig || !rig.visible) return null;
    
    // Converte tela para mundo da cena
    const worldPos = this._screenToWorld(screenX, screenY);
    if (!worldPos) return null;
    
    // Converte mundo para espaço local do rig
    const charInv = characterObject.transform.getInverse();
    const charLocal = charInv.transformPoint(worldPos.x, worldPos.y);

    
    const threshold = (this.jointRadius * 2) / this.renderer.viewportScale;
    const thresholdSq = threshold * threshold;
    
    // Testa joints em ordem inversa (topmost first - filhos primeiro)
    const bones = rig.getAllBones().reverse();
    
    for (const bone of bones) {
      if (!bone.visible) continue;
      
      const pos = bone.getWorldPoint();
      const dx = pos.x - charLocal.x;
      const dy = pos.y - charLocal.y;
      const distSq = dx * dx + dy * dy;
      
      if (distSq <= thresholdSq) {
        return bone;
      }
    }
    
    return null;
  }

  /**
   * Converte coordenadas de tela para espaço mundial da cena
   */
  _screenToWorld(screenX, screenY) {
    // Inverte viewport: tela -> mundo
    const viewportInv = this.renderer.viewport.getInverse();
    return viewportInv.transformPoint(screenX, screenY);
  }

  /**
   * Atualiza configurações visuais
   */
  setOptions(options) {
    if (options.boneColor) this.boneColor = options.boneColor;
    if (options.boneThickness) this.boneThickness = options.boneThickness;
    if (options.jointRadius) this.jointRadius = options.jointRadius;
    if (options.showLabels !== undefined) this.showLabels = options.showLabels;
    if (options.showBoneNames !== undefined) this.showBoneNames = options.showBoneNames;
  }
}