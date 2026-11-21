/**
 * Part - Representa uma peça recortada da imagem original
 * Cada peça é uma região recortada da imagem original, ligada a um osso da armadura
 */

import { Transform2D, createTransform } from '../core/Transform2D.js';
import { generateId } from '../editor/ImageImporter.js';

export class Part {
  constructor(data = {}) {
    this.id = data.id || generateId('part');
    this.name = data.name || 'Peça';
    this.sourceObjectId = data.sourceObjectId || null; // ID do SceneObject original
    this.boneId = data.boneId || null; // ID do osso ao qual está ligada
    
    // Dados da imagem recortada
    this.imageData = data.imageData || null; // Data URL da peça recortada
    this.imageWidth = data.imageWidth || 0;
    this.imageHeight = data.imageHeight || 0;
    this.imageElement = null; // HTMLImageElement carregado
    
    // Máscara/recorte (polígono ou retângulo em coordenadas da imagem original)
    this.mask = data.mask || null; // { type: 'rect'|'polygon', points: [...], bounds: {x, y, w, h} }
    
    // Pivot e offset (em coordenadas da peça recortada)
    this.pivot = data.pivot || { x: 0.5, y: 0.5 }; // 0-1 relativo ao tamanho da peça
    this.offset = data.offset || { x: 0, y: 0 }; // Offset adicional em pixels
    
    // Posição/rotação/escala locais relativas ao osso pai
    this.localPosition = data.localPosition || { x: 0, y: 0 };
    this.localRotation = data.localRotation || 0; // graus
    this.localScale = data.localScale || { x: 1, y: 1 };
    
    // Transformação local
    this.localTransform = data.localTransform ? Transform2D.fromJSON(data.localTransform) : this._createLocalTransform();
    
    // Transformação mundial calculada
    this.worldTransform = null;
    
    // Referência ao osso pai (definida em runtime)
    this.bone = null;
    
    // Estado visual
    this.visible = data.visible !== false;
    this.visibleInEditor = data.visibleInEditor !== false;
    
    // Z-index para ordenação de renderização
    this.zIndex = data.zIndex || 0;
    
    // Metadados
    this.side = data.side || 'center'; // 'left', 'right', 'center'
    this.type = data.type || 'part';
  }
  
  _createLocalTransform() {
    const t = new Transform2D();
    t.translate(this.localPosition.x, this.localPosition.y);
    t.rotate(this.localRotation || 0);
    t.scale(this.localScale.x || 1, this.localScale.y || 1);
    return t;
  }
  
  /**
   * Atualiza a transformação local a partir de posição/rotação/escala
   */
  updateLocalTransform() {
    this.localTransform = new Transform2D();
    this.localTransform.translate(this.localPosition.x, this.localPosition.y);
    this.localTransform.rotate(this.localRotation || 0);
    this.localTransform.scale(this.localScale.x || 1, this.localScale.y || 1);
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
   * Obtém posição local
   */
  getLocalPosition() {
    return { ...this.localPosition };
  }
  
  /**
   * Define rotação local (graus)
   */
  setLocalRotation(degrees) {
    this.localRotation = degrees;
    this.updateLocalTransform();
  }
  
  /**
   * Define escala local
   */
  setLocalScale(scaleX, scaleY = scaleX) {
    this.localScale.x = scaleX;
    this.localScale.y = scaleY;
    this.updateLocalTransform();
  }
  
  /**
   * Calcula transformação mundial (chamado pelo PartManager)
   * @param {Transform2D} parentWorldTransform - Transformação mundial do osso pai
   * @param {Transform2D} characterWorldTransform - Transformação mundial do personagem
   * @param {Transform2D} baseTransform - Transformação base do rig
   */
  computeWorldTransform(parentWorldTransform, characterWorldTransform, baseTransform) {
    // A transformação mundial da peça é:
    // characterTransform * rigBaseTransform * parentBoneWorldTransform * localTransform
    // Mas como a peça é filha do osso, ela herda a transformação do osso
    
    if (parentWorldTransform) {
      // world = parentWorld * localTransform
      this.worldTransform = parentWorldTransform.clone();
      this.worldTransform.multiply(this.localTransform);
    } else {
      // Se não tem pai (não deveria acontecer para peças), usa transformação local
      this.worldTransform = this.localTransform.clone();
    }
  }
  
  /**
   * Obtém posição mundial
   */
  getWorldPosition() {
    if (!this.worldTransform) return { x: 0, y: 0 };
    return this.worldTransform.decompose();
  }
  
  /**
   * Obtém ponto mundial do pivot
   */
  getWorldPivotPoint() {
    if (!this.worldTransform) return { x: 0, y: 0 };
    const w = this.imageWidth;
    const h = this.imageHeight;
    const pivotX = w * this.pivot.x;
    const pivotY = h * this.pivot.y;
    return this.worldTransform.transformPoint(pivotX, pivotY);
  }
  
  /**
   * Verifica se um ponto (em coordenadas da peça) está dentro da máscara
   */
  containsPoint(localX, localY) {
    if (!this.mask) return true;
    
    if (this.mask.type === 'rect') {
      const b = this.mask.bounds;
      return localX >= b.x && localX <= b.x + b.w &&
             localY >= b.y && localY <= b.y + b.h;
    }
    
    if (this.mask.type === 'polygon') {
      // Point in polygon algorithm
      const points = this.mask.points;
      let inside = false;
      for (let i = 0, j = this.mask.points.length - 1; i < this.mask.points.length; j = i++) {
        const xi = this.mask.points[i].x, yi = this.mask.points[i].y;
        const xj = this.mask.points[j].x, yj = this.mask.points[j].y;
        const intersect = ((yi > localY) !== (yj > localY)) &&
                         (localX < (xj - xi) * (localY - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }
    return true;
  }
  
  /**
   * Serialização para JSON
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      sourceObjectId: this.sourceObjectId,
      boneId: this.boneId,
      imageData: this.imageData,
      imageWidth: this.imageWidth,
      imageHeight: this.imageHeight,
      mask: this.mask,
      pivot: { ...this.pivot },
      offset: { ...this.offset },
      localPosition: { ...this.localPosition },
      localRotation: this.localRotation,
      localScale: { ...this.localScale },
      localTransform: this.localTransform.toJSON(),
      zIndex: this.zIndex,
      visible: this.visible,
      visibleInEditor: this.visibleInEditor,
      side: this.side,
      type: this.type,
      boneId: this.boneId
    };
  }
  
  /**
   * Cria Part a partir de JSON
   */
  static fromJSON(data) {
    const part = new Part(data);
    // Não reconstrói imageElement aqui - será carregado sob demanda
    return part;
  }
  
  /**
   * Carrega a imagem da peça
   */
  async loadImage() {
    if (this.imageElement && this.imageElement.src === this.imageData) {
      return this.imageElement;
    }
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.imageElement = img;
        if (!this.imageWidth) this.imageWidth = img.width;
        if (!this.imageHeight) this.imageHeight = img.height;
        resolve(img);
      };
      img.onerror = () => reject(new Error('Falha ao carregar imagem da peça'));
      img.src = this.imageData;
    });
  }
  
  /**
   * Verifica se um ponto (em coordenadas do canvas) está sobre a peça
   */
  hitTest(screenX, screenY, renderer) {
    if (!this.visible || !this.imageElement || !this.worldTransform) return false;
    
    // Converte coordenadas de tela para mundo da peça
    const worldPos = this.worldTransform.getInverse().transformPoint(screenX, screenY);
    
    // Verifica se está dentro dos limites da imagem
    if (worldPos.x < 0 || worldPos.x > this.imageWidth ||
        worldPos.y < 0 || worldPos.y > this.imageHeight) {
      return false;
    }
    
    // Verifica máscara se existir
    if (this.mask) {
      return this.containsPoint(worldPos.x, worldPos.y);
    }
    
    return true;
  }
}

/**
 * Cria uma Part a partir de dados
 */
export function createPart(name, localPosition = { x: 0, y: 0 }, options = {}) {
  return new Part({
    name,
    localPosition,
    ...options
  });
}