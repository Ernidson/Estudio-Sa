import { remainingImage } from '../parts/RasterPieces.js';
/**
 * Renderer - Renderização 2D no Canvas
 */

import { Transform2D } from './Transform2D.js';
import { RigRenderer } from '../rigging/RigRenderer.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });

    // Transformação de viewport (canvas -> mundo)
    this.viewport = new Transform2D();
    this.viewportScale = 1;
    this.viewportOffsetX = 0;
    this.viewportOffsetY = 0;

    // Configurações de renderização
    this.showGrid = true;
    this.gridSize = 50;
    this.gridColor = '#333333';
    this.gridMajorColor = '#3a3a3a';
    this.gridMajorInterval = 5;

    // Seleção
    this.selectedObject = null;
    this.selectionColor = '#007acc';
    this.selectionLineWidth = 2;
    this.selectionHandleSize = 8;

    // Rigging (Fase 2)
    this.rigRenderer = new RigRenderer(this);

    // Dimensões do canvas
    this.canvasWidth = 0;
    this.canvasHeight = 0;

    // Callbacks
    onResize: null;
  }

  /**
   * Redimensiona o canvas para preencher o container
   */
  resize() {
    const container = this.canvas.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvasWidth = Math.max(1, Math.floor(rect.width));
    this.canvasHeight = Math.max(1, Math.floor(rect.height));

    // Define tamanho do canvas em pixels CSS
    this.canvas.style.width = this.canvasWidth + 'px';
    this.canvas.style.height = this.canvasHeight + 'px';

    // Define resolução real do canvas
    this.canvas.width = this.canvasWidth * dpr;
    this.canvas.height = this.canvasHeight * dpr;

    // Escala o contexto para compensar DPR
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Atualiza viewport para manter coordenadas mundiais consistentes
    this.updateViewportTransform();
  }

  /**
   * Atualiza a transformação de viewport (tela -> mundo)
   */
  updateViewportTransform() {
    // Centro do canvas em coordenadas de tela
    const centerX = this.canvasWidth / 2;
    const centerY = this.canvasHeight / 2;

    // Viewport: mundo -> tela
    // Primeiro translada para o centro, depois escala, depois aplica offset
    this.viewport.reset();
    this.viewport.translate(centerX, centerY);
    this.viewport.scale(this.viewportScale, this.viewportScale);
    this.viewport.translate(this.viewportOffsetX, this.viewportOffsetY);
  }

  /**
   * Converte coordenadas de tela para mundo
   */
  screenToWorld(screenX, screenY, out = {}) {
    const inv = this.viewport.getInverse();
    return inv.transformPoint(screenX, screenY, out);
  }

  /**
   * Converte coordenadas de mundo para tela
   */
  worldToScreen(worldX, worldY, out = {}) {
    return this.viewport.transformPoint(worldX, worldY, out);
  }

  /**
   * Define zoom (escala da viewport)
   */
  setZoom(scale, centerX = null, centerY = null) {
    const oldScale = this.viewportScale;
    this.viewportScale = Math.max(0.01, Math.min(100, scale));

    if (centerX !== null && centerY !== null) {
      // Zoom em torno de um ponto específico
      const worldBefore = this.screenToWorld(centerX, centerY);
      this.updateViewportTransform();
      const worldAfter = this.screenToWorld(centerX, centerY);

      this.viewportOffsetX += worldBefore.x - worldAfter.x;
      this.viewportOffsetY += worldBefore.y - worldAfter.y;
    }

    this.updateViewportTransform();
    return this.viewportScale;
  }

  /**
   * Pan (deslocamento da viewport)
   */
  pan(dx, dy) {
    this.viewportOffsetX += dx / this.viewportScale;
    this.viewportOffsetY += dy / this.viewportScale;
    this.updateViewportTransform();
  }

  /**
   * Centraliza a viewport na origem (0,0)
   */
  centerOnOrigin() {
    this.viewportOffsetX = 0;
    this.viewportOffsetY = 0;
    this.updateViewportTransform();
  }

  /**
   * Ajusta zoom para mostrar todos os objetos
   */
  fitToObjects(objects, padding = 50) {
    if (!objects || objects.length === 0) {
      this.centerOnOrigin();
      this.setZoom(1);
      return;
    }

    // Calcula bounds de todos os objetos
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const obj of objects) {
      const bounds = obj.getWorldBounds();
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Calcula escala necessária
    const scaleX = (this.canvasWidth - padding * 2) / contentWidth;
    const scaleY = (this.canvasHeight - padding * 2) / contentHeight;
    const scale = Math.min(scaleX, scaleY, 10); // Max zoom 10x

    this.viewportScale = Math.max(0.01, scale);
    this.viewportOffsetX = -centerX;
    this.viewportOffsetY = -centerY;
    this.updateViewportTransform();
  }

  /**
   * Renderiza a cena completa
   */
  render(scene, originalObject = null) {
    // Limpa canvas
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    // Desenha grelha
    if (this.showGrid) {
      this.drawGrid();
    }

    // Desenha eixos
    this.drawAxes();

    // Objetos visíveis ordenados
    const objects = scene.getVisibleObjects();

    // Renderiza cada objeto
    for (const obj of objects) {
      this.renderObject(obj, obj === originalObject);
      
      // Renderiza rig se existir
      if (obj.rig && obj.hasRig) {
        this.rigRenderer.drawRig(obj.rig, obj);
      }
    }

    // Renderiza seleção por cima
    if (this.selectedObject) {
      this.renderSelection(this.selectedObject);
    }
  }

  /**
   * Desenha grelha
   */
  drawGrid() {
    const ctx = this.ctx;
    const gridSize = this.gridSize * this.viewportScale;

    // Se grid muito pequeno, não desenha
    if (gridSize < 5) return;

    // Calcula limites visíveis em coordenadas mundiais
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(this.canvasWidth, this.canvasHeight);

    const minX = Math.floor(Math.min(tl.x, br.x) / this.gridSize) * this.gridSize;
    const maxX = Math.ceil(Math.max(tl.x, br.x) / this.gridSize) * this.gridSize;
    const minY = Math.floor(Math.min(tl.y, br.y) / this.gridSize) * this.gridSize;
    const maxY = Math.ceil(Math.max(tl.y, br.y) / this.gridSize) * this.gridSize;

    ctx.save();
    ctx.strokeStyle = this.gridColor;
    ctx.lineWidth = 1 / this.viewportScale;

    // Linhas verticais
    for (let x = minX; x <= maxX; x += this.gridSize) {
      const isMajor = (x / this.gridSize) % this.gridMajorInterval === 0;
      if (isMajor) {
        ctx.strokeStyle = this.gridMajorColor;
      } else {
        ctx.strokeStyle = this.gridColor;
      }

      const screen = this.worldToScreen(x, minY);
      const screenEnd = this.worldToScreen(x, maxY);
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      ctx.lineTo(screenEnd.x, screenEnd.y);
      ctx.stroke();
    }

    // Linhas horizontais
    for (let y = minY; y <= maxY; y += this.gridSize) {
      const isMajor = (y / this.gridSize) % this.gridMajorInterval === 0;
      if (isMajor) {
        ctx.strokeStyle = this.gridMajorColor;
      } else {
        ctx.strokeStyle = this.gridColor;
      }

      const screen = this.worldToScreen(minX, y);
      const screenEnd = this.worldToScreen(maxX, y);
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      ctx.lineTo(screenEnd.x, screenEnd.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Desenha eixos X e Y
   */
  drawAxes() {
    const ctx = this.ctx;

    // Verifica se a origem está visível
    const origin = this.worldToScreen(0, 0);
    if (origin.x < -100 || origin.x > this.canvasWidth + 100 ||
        origin.y < -100 || origin.y > this.canvasHeight + 100) {
      return;
    }

    ctx.save();
    ctx.lineWidth = 2 / this.viewportScale;

    // Eixo X (vermelho)
    ctx.strokeStyle = '#cc4444';
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(this.canvasWidth, origin.y);
    ctx.stroke();

    // Eixo Y (verde)
    ctx.strokeStyle = '#44cc44';
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, this.canvasHeight);
    ctx.stroke();

    // Marcador de origem
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 4 / this.viewportScale, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Renderiza um objeto
   */
  renderObject(obj, showOriginal = false) {
    if (!obj.imageElement || !obj.visible) return;

    const ctx = this.ctx;
    const w = obj.imageWidth;
    const h = obj.imageHeight;

    ctx.save();

    // Aplica transformação do objeto + viewport
    // Ordem: viewport * objectTransform
    const m = obj.transform.m;
    const v = this.viewport.m;

    // Multiplica matrizes: result = viewport * objectTransform
    const a = v[0] * m[0] + v[2] * m[1];
    const b = v[1] * m[0] + v[3] * m[1];
    const c = v[0] * m[2] + v[2] * m[3];
    const d = v[1] * m[2] + v[3] * m[3];
    const e = v[0] * m[4] + v[2] * m[5] + v[4];
    const f = v[1] * m[4] + v[3] * m[5] + v[5];

    ctx.transform(a, b, c, d, e, f);

    // Desenha imagem centrada na origem
    ctx.drawImage(showOriginal ? obj.imageElement : remainingImage(obj), -w / 2, -h / 2, w, h);

    ctx.restore();
  }

  /**
   * Renderiza contorno de seleção
   */
  renderSelection(obj) {
    const ctx = this.ctx;
    const corners = obj.getTransformedCorners();

    // Transforma cantos para tela
    const screenCorners = corners.map(c => this.worldToScreen(c.x, c.y));

    ctx.save();
    ctx.strokeStyle = this.selectionColor;
    ctx.lineWidth = this.selectionLineWidth / this.viewportScale;
    ctx.setLineDash([8 / this.viewportScale, 4 / this.viewportScale]);

    // Desenha retângulo de seleção
    ctx.beginPath();
    ctx.moveTo(screenCorners[0].x, screenCorners[0].y);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(screenCorners[i].x, screenCorners[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // Desenha handles nos cantos
    ctx.setLineDash([]);
    ctx.fillStyle = this.selectionColor;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 / this.viewportScale;

    const handleSize = this.selectionHandleSize / this.viewportScale;

    for (const corner of screenCorners) {
      ctx.beginPath();
      ctx.rect(
        corner.x - handleSize / 2,
        corner.y - handleSize / 2,
        handleSize,
        handleSize
      );
      ctx.fill();
      ctx.stroke();
    }

    // Desenha indicador de rotação (linha do centro para cima)
    const center = this.worldToScreen(
      (screenCorners[0].x + screenCorners[2].x) / 2,
      (screenCorners[0].y + screenCorners[2].y) / 2
    );

    // Calcula direção "para cima" no objeto rotacionado
    const upLocal = { x: 0, y: -Math.max(obj.imageWidth, obj.imageHeight) / 2 - 20 };
    const upWorld = obj.transform.transformPoint(upLocal.x, upLocal.y);
    const upScreen = this.worldToScreen(upWorld.x, upWorld.y);

    ctx.setLineDash([4 / this.viewportScale, 2 / this.viewportScale]);
    ctx.strokeStyle = this.selectionColor;
    ctx.lineWidth = 2 / this.viewportScale;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(upScreen.x, upScreen.y);
    ctx.stroke();

    // Círculo no final da linha de rotação
    ctx.setLineDash([]);
    ctx.fillStyle = this.selectionColor;
    ctx.beginPath();
    ctx.arc(upScreen.x, upScreen.y, 6 / this.viewportScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 / this.viewportScale;
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Define objeto selecionado
   */
  setSelection(obj) {
    this.selectedObject = obj;
  }

  /**
   * Obtém objeto selecionado
   */
  getSelection() {
    return this.selectedObject;
  }

  /**
   * Limpa seleção
   */
  clearSelection() {
    this.selectedObject = null;
  }
}