/**
 * Scene - Gerenciamento da cena e objetos
 */

import { Transform2D, createTransform } from './Transform2D.js';
import { generateId } from '../editor/ImageImporter.js';
import { Rig } from '../rigging/Rig.js';
import { PartManager } from '../parts/PartManager.js';
import { PieceMap } from '../parts/PieceMap.js';

export class SceneObject {
  constructor(data = {}) {
    this.id = data.id || generateId();
    this.name = data.name || 'Objeto';
    this.type = data.type || 'image';
    this.visible = data.visible !== false;
    this.locked = data.locked || false;

    // Dados da imagem
    this.imageData = data.imageData || null; // Data URL
    this.imageWidth = data.imageWidth || 0;
    this.imageHeight = data.imageHeight || 0;
    this.imageElement = null; // HTMLImageElement carregado

    // Transformação
    this.transform = data.transform ? Transform2D.fromJSON(data.transform) : createTransform();

    // Ordem de camada (maior = mais acima)
    this.layerOrder = data.layerOrder || 0;

    // Rigging (Fase 2)
    this.rig = data.rig ? Rig.fromJSON(data.rig) : null;
    this.hasRig = !!this.rig;

    // Partes recortadas (Fase 2B)
    this.partManager = data.parts ? PartManager.fromJSON(data.parts, this, this.rig) : null;

    // Mapa de Peças / Calibração (Fase 2C)
    this.pieceMap = data.pieceMap ? PieceMap.fromJSON(data.pieceMap, this, this.rig, null) : null;
  }

  /**
   * Obtém os limites do objeto no espaço mundial
   * Retorna { x, y, width, height } no sistema de coordenadas mundial
   */
  getWorldBounds() {
    const w = this.imageWidth;
    const h = this.imageHeight;

    // Cantos da imagem no espaço local (centro da imagem na origem)
    const corners = [
      { x: -w / 2, y: -h / 2 },
      { x: w / 2, y: -h / 2 },
      { x: w / 2, y: h / 2 },
      { x: -w / 2, y: h / 2 }
    ];

    // Transforma para espaço mundial
    const worldCorners = corners.map(c => this.transform.transformPoint(c.x, c.y));

    // Calcula bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of worldCorners) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x);
      maxY = Math.max(maxY, c.y);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    };
  }

  /**
   * Verifica se um ponto (em coordenadas mundiais) está dentro do objeto
   */
  containsPoint(worldX, worldY) {
    // Transforma o ponto para o espaço local do objeto
    const local = this.transform.inverseTransformPoint(worldX, worldY);

    const w = this.imageWidth;
    const h = this.imageHeight;

    return local.x >= -w / 2 && local.x <= w / 2 &&
           local.y >= -h / 2 && local.y <= h / 2;
  }

  /**
   * Obtém os cantos transformados para desenho da seleção
   */
  getTransformedCorners() {
    const w = this.imageWidth;
    const h = this.imageHeight;

    const corners = [
      { x: -w / 2, y: -h / 2 },
      { x: w / 2, y: -h / 2 },
      { x: w / 2, y: h / 2 },
      { x: -w / 2, y: h / 2 }
    ];

    return corners.map(c => this.transform.transformPoint(c.x, c.y));
  }

  /**
   * Serialização para JSON
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      visible: this.visible,
      locked: this.locked,
      imageData: this.imageData,
      imageWidth: this.imageWidth,
      imageHeight: this.imageHeight,
      transform: this.transform.toJSON(),
      layerOrder: this.layerOrder,
      rig: this.rig ? this.rig.toJSON() : null,
      parts: this.partManager ? this.partManager.toJSON() : null,
      pieceMap: this.pieceMap ? this.pieceMap.toJSON() : null
    };
  }

  /**
   * Cria objeto a partir de JSON
   */
  static fromJSON(data) {
    return new SceneObject(data);
  }

  /**
   * Carrega a imagem do Data URL
   */
  async loadImage() {
    if (this.imageElement && this.imageElement.src === this.imageData) {
      return this.imageElement;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.imageElement = img;
        // Atualiza dimensões se não definidas
        if (!this.imageWidth) this.imageWidth = img.width;
        if (!this.imageHeight) this.imageHeight = img.height;
        resolve(img);
      };
      img.onerror = () => reject(new Error('Falha ao carregar imagem'));
      img.src = this.imageData;
    });
  }
}

export class Scene {
  constructor() {
    this.objects = [];
    this.nextLayerOrder = 0;
    this.version = '1.0.0';
    this.projectId = generateId();
    this.name = 'Projeto Sem Título';
  }

  /**
   * Adiciona um objeto à cena
   */
  addObject(obj) {
    if (!(obj instanceof SceneObject)) {
      obj = new SceneObject(obj);
    }
    obj.layerOrder = this.nextLayerOrder++;
    this.objects.push(obj);
    this.sortObjects();
    return obj;
  }

  /**
   * Remove um objeto da cena
   */
  removeObject(id) {
    const index = this.objects.findIndex(o => o.id === id);
    if (index !== -1) {
      this.objects.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Obtém objeto por ID
   */
  getObject(id) {
    return this.objects.find(o => o.id === id);
  }

  /**
   * Ordena objetos por layerOrder
   */
  sortObjects() {
    this.objects.sort((a, b) => a.layerOrder - b.layerOrder);
  }

  /**
   * Move objeto para nova posição na ordem das camadas
   */
  moveObjectToLayerOrder(id, newLayerOrder) {
    const obj = this.getObject(id);
    if (!obj) return false;

    const oldOrder = obj.layerOrder;
    obj.layerOrder = newLayerOrder;

    // Ajusta outros objetos
    if (newLayerOrder > oldOrder) {
      // Moveu para cima - decrementa os que estavam entre
      for (const o of this.objects) {
        if (o.id !== id && o.layerOrder > oldOrder && o.layerOrder <= newLayerOrder) {
          o.layerOrder--;
        }
      }
    } else if (newLayerOrder < oldOrder) {
      // Moveu para baixo - incrementa os que estavam entre
      for (const o of this.objects) {
        if (o.id !== id && o.layerOrder >= newLayerOrder && o.layerOrder < oldOrder) {
          o.layerOrder++;
        }
      }
    }

    this.sortObjects();
    return true;
  }

  /**
   * Obtém objetos visíveis ordenados para renderização
   */
  getVisibleObjects() {
    return this.objects.filter(o => o.visible);
  }

  /**
   * Obtém objeto no ponto (coordenadas mundiais) - topmost first
   */
  getObjectAt(worldX, worldY) {
    // Percorre de trás para frente (topmost first)
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const obj = this.objects[i];
      if (obj.visible && !obj.locked && obj.containsPoint(worldX, worldY)) {
        return obj;
      }
    }
    return null;
  }

  /**
   * Serialização para JSON
   */
  toJSON() {
    return {
      version: this.version,
      projectId: this.projectId,
      name: this.name,
      objects: this.objects.map(o => o.toJSON()),
      nextLayerOrder: this.nextLayerOrder
    };
  }

  /**
   * Cria cena a partir de JSON
   */
  static fromJSON(data) {
    const scene = new Scene();
    if (!data) return scene;

    scene.version = data.version || '1.0.0';
    scene.projectId = data.projectId || generateId();
    scene.name = data.name || 'Projeto Sem Título';
    scene.nextLayerOrder = data.nextLayerOrder || 0;

    if (data.objects) {
      scene.objects = data.objects.map(objData => SceneObject.fromJSON(objData));
      scene.sortObjects();
    }

    return scene;
  }

  /**
   * Carrega todas as imagens
   */
  async loadAllImages() {
    await Promise.all(this.objects.flatMap(obj => [obj.loadImage(),
      ...(obj.partManager?.getAllParts() || []).map(part => part.loadImage())]));
  }

  /**
   * Limpa a cena
   */
  clear() {
    this.objects = [];
    this.nextLayerOrder = 0;
  }
}