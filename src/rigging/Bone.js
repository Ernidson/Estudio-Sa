/**
 * Bone - Representa uma articulação/osso no esqueleto 2D
 * Cada bone tem posição local relativa ao pai, transformação mundial calculada,
 * e referências para hierarquia pai-filho.
 */

import { Transform2D, createTransform } from '../core/Transform2D.js';
import { generateId } from '../editor/ImageImporter.js';

export class Bone {
  constructor(data = {}) {
    this.id = data.id || generateId('bone');
    this.name = data.name || 'Bone';
    this.parentId = data.parentId || null;
    
    // Posição local (relativa ao pai, no espaço do personagem)
    this.localPosition = data.localPosition ? { ...data.localPosition } : { x: 0, y: 0 };
    
    // Transformação local (rotação, escala local)
    const hasLocalTransform = !!data.localTransform;
    this.localTransform = hasLocalTransform ? Transform2D.fromJSON(data.localTransform) : createTransform();
    
    // Só aplica translação se NÃO há localTransform nos dados (criação nova, não desserialização)
    // O localTransform salvo já inclui a translação da localPosition
    if (!hasLocalTransform) {
      this.localTransform.translate(this.localPosition.x, this.localPosition.y);
    }
    
    // Transformação mundial calculada
    this.worldTransform = createTransform();
    
    // Hierarquia
    this.children = [];
    this.poseReferenceAngle = data.poseReferenceAngle ?? null;
    this.parent = null;
    
    // Visual
    this.length = data.length || 50;
    this.color = data.color || '#007acc';
    this.visible = data.visible !== false;
    this.selected = false;
    
    // Metadados
    this.side = data.side || 'center'; // 'left', 'right', 'center'
    this.type = data.type || 'joint'; // 'joint', 'end'
  }

  /**
   * Atualiza a transformação local a partir da posição local e rotação
   * Preserva a rotação e escala existentes, apenas atualiza a translação
   */
  updateLocalTransform() {
    this.localTransform.m[4] = this.localPosition.x;
    this.localTransform.m[5] = this.localPosition.y;
  }

  /**
   * Define posição local
   */
  setLocalPosition(x, y) {
    this.localPosition.x = x;
    this.localPosition.y = y;
    this.updateLocalTransform();
  }

  /**
   * Define rotação local em graus
   */
  setLocalRotation(degrees) {
    const delta = degrees - this.getLocalRotation();
    const m = this.localTransform.m;
    const linear = createTransform(0, 0, delta);
    linear.multiply(this.localTransform);
    linear.m[4] = m[4];
    linear.m[5] = m[5];
    this.localTransform = linear;
  }

  /**
   * Obtém rotação local em graus
   */
  getLocalRotation() {
    return this.localTransform.decompose().rotation;
  }

  /**
   * Adiciona rotação local (relativa)
   */
  poseAt(degrees) {
    this.poseReferenceAngle ??= this.getLocalRotation();
    this.setLocalRotation(degrees);
  }

  restorePose() {
    if (this.poseReferenceAngle === null) return;
    this.setLocalRotation(this.poseReferenceAngle);
    this.poseReferenceAngle = null;
  }

  rotateLocal(deltaDegrees) {
    const currentRotation = this.getLocalRotation();
    this.setLocalRotation(currentRotation + deltaDegrees);
  }

  /**
   * Obtém posição local
   */
  getLocalPosition() {
    return { ...this.localPosition };
  }

  /**
   * Calcula transformação mundial recursivamente
   * @param {Transform2D} parentWorldTransform - Transformação mundial do pai
   */
  computeWorldTransform(parentWorldTransform = null) {
    if (parentWorldTransform) {
      // world = parent * local
      this.worldTransform.copy(parentWorldTransform);
      this.worldTransform.multiply(this.localTransform);
    } else {
      // Raiz: world = local
      this.worldTransform.copy(this.localTransform);
    }

    // Propaga para filhos
    for (const child of this.children) {
      child.computeWorldTransform(this.worldTransform);
    }
  }

  /**
   * Obtém posição mundial
   */
  getWorldPosition() {
    return this.worldTransform.decompose();
  }

  /**
   * Obtém posição mundial como ponto simples
   */
  getWorldPoint() {
    const decomp = this.worldTransform.decompose();
    return { x: decomp.x, y: decomp.y };
  }

  /**
   * Converte ponto mundial para local deste bone
   */
  worldToLocal(worldX, worldY) {
    return this.worldTransform.inverseTransformPoint(worldX, worldY);
  }

  /**
   * Converte ponto local para mundial
   */
  localToWorld(localX, localY) {
    return this.worldTransform.transformPoint(localX, localY);
  }

  /**
   * Adiciona filho
   */
  addChild(child) {
    if (!this.children.includes(child)) {
      this.children.push(child);
      child.parent = this;
      child.parentId = this.id;
    }
  }

  /**
   * Remove filho
   */
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parent = null;
      child.parentId = null;
    }
  }

  /**
   * Obtém todos os descendentes (recursivo)
   */
  getAllDescendants() {
    const descendants = [];
    for (const child of this.children) {
      descendants.push(child);
      descendants.push(...child.getAllDescendants());
    }
    return descendants;
  }

  /**
   * Obtém ancestralidade (pai, avô, etc.)
   */
  getAncestors() {
    const ancestors = [];
    let current = this.parent;
    while (current) {
      ancestors.push(current);
      current = current.parent;
    }
    return ancestors;
  }

  /**
   * Verifica se é ancestral de outro bone
   */
  isAncestorOf(bone) {
    let current = bone.parent;
    while (current) {
      if (current === this) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Serialização para JSON
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      parentId: this.parentId,
      localPosition: { ...this.localPosition },
      localTransform: this.localTransform.toJSON(),
      poseReferenceAngle: this.poseReferenceAngle,
      length: this.length,
      color: this.color,
      visible: this.visible,
      side: this.side,
      type: this.type
    };
  }

  /**
   * Cria bone a partir de JSON
   */
  static fromJSON(data) {
    return new Bone(data);
  }

  /**
   * Clona o bone (sem referências de hierarquia)
   */
  clone() {
    const cloned = new Bone(this.toJSON());
    return cloned;
  }
}

/**
 * Cria bone com ID gerado
 */
export function createBone(name, localPosition = { x: 0, y: 0 }, options = {}) {
  return new Bone({
    name,
    localPosition,
    ...options
  });
}