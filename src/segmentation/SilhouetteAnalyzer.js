/**
 * SilhouetteAnalyzer - Análise da silhueta do personagem via canal alfa
 * Extrai máscara binária, contornos e métricas de cobertura a partir do PNG
 */

export class SilhouetteAnalyzer {
  constructor(imageElement, options = {}) {
    this.imageElement = imageElement;
    this.alphaThreshold = options.alphaThreshold || 128; // 0-255
    this.downsample = options.downsample || 1; // 1 = resolução original
    
    this.width = imageElement.width;
    this.height = imageElement.height;
    
    // Cache
    this._alphaData = null;
    this._silhouetteMask = null;
    this._contours = null;
    this._boundingBox = null;
    this._coverageStats = null;
  }

  /**
   * Extrai dados do canal alfa da imagem
   * @returns {Uint8Array} Array com valores alfa (0-255) por pixel
   */
  getAlphaData() {
    if (this._alphaData) return this._alphaData;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    const w = Math.floor(this.width / this.downsample);
    const h = Math.floor(this.height / this.downsample);
    canvas.width = w;
    canvas.height = h;
    
    ctx.drawImage(this.imageElement, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    
    const alphaData = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      alphaData[j] = data[i + 3]; // Canal alfa
    }
    
    this._alphaData = alphaData;
    this._alphaWidth = w;
    this._alphaHeight = h;
    
    return alphaData;
  }

  /**
   * Gera máscara binária da silhueta (true = pixel do personagem)
   * @param {number} threshold - Limiar de alfa (0-255)
   * @returns {Uint8Array} Máscara binária (0 ou 1)
   */
  getSilhouetteMask(threshold = null) {
    const th = threshold ?? this.alphaThreshold;
    const alphaData = this.getAlphaData();
    const w = this._alphaWidth;
    const h = this._alphaHeight;
    
    if (this._silhouetteMask && threshold === null) return this._silhouetteMask;
    
    const mask = new Uint8Array(w * h);
    let count = 0;
    for (let i = 0; i < alphaData.length; i++) {
      if (alphaData[i] >= th) {
        mask[i] = 1;
        count++;
      }
    }
    
    if (threshold === null) {
      this._silhouetteMask = mask;
      this._silhouettePixelCount = count;
    }
    
    return mask;
  }

  /**
   * Obtém bounding box da silhueta
   * @returns {Object} {x, y, width, height} em coordenadas da imagem downsampled
   */
  getBoundingBox() {
    if (this._boundingBox) return this._boundingBox;
    
    const mask = this.getSilhouetteMask();
    const w = this._alphaWidth;
    const h = this._alphaHeight;
    
    let minX = w, minY = h, maxX = -1, maxY = -1;
    
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mask[y * w + x]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    
    if (maxX < minX || maxY < minY) {
      this._boundingBox = { x: 0, y: 0, width: w, height: h };
    } else {
      this._boundingBox = {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      };
    }
    
    return this._boundingBox;
  }

  /**
   * Extrai contornos da silhueta usando algoritmo de marching squares simplificado
   * @returns {Array<Array<{x,y}>>} Array de contornos (cada contorno é array de pontos)
   */
  getContours() {
    if (this._contours) return this._contours;
    
    const mask = this.getSilhouetteMask();
    const w = this._alphaWidth;
    const h = this._alphaHeight;
    
    const visited = new Uint8Array(w * h);
    const contours = [];
    
    // Direções: 0=direita, 1=baixo, 2=esquerda, 3=cima
    const dirs = [
      { dx: 1, dy: 0 },  // direita
      { dx: 0, dy: 1 },  // baixo
      { dx: -1, dy: 0 }, // esquerda
      { dx: 0, dy: -1 }  // cima
    ];
    
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (mask[idx] && !visited[idx]) {
          // Inicia novo contorno
          const contour = this._traceContour(mask, visited, w, h, x, y, dirs);
          if (contour.length > 2) {
            contours.push(contour);
          }
        }
      }
    }
    
    this._contours = contours;
    return contours;
  }

  _traceContour(mask, visited, w, h, startX, startY, dirs) {
    const contour = [];
    let x = startX;
    let y = startY;
    let dir = 0; // Começa olhando para direita
    
    do {
      const idx = y * w + x;
      if (!visited[idx]) {
        visited[idx] = 1;
        contour.push({ x, y });
      }
      
      // Tenta virar à direita (sentido horário)
      let found = false;
      for (let i = 0; i < 4; i++) {
        const testDir = (dir + 3 - i + 4) % 4; // direita, frente, esquerda, trás
        const nx = x + dirs[testDir].dx;
        const ny = y + dirs[testDir].dy;
        
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx]) {
          x = nx;
          y = ny;
          dir = testDir;
          found = true;
          break;
        }
      }
      
      if (!found) break;
    } while (x !== startX || y !== startY);
    
    return contour;
  }

  /**
   * Calcula estatísticas de cobertura entre regiões e silhueta
   * @param {PieceMap} pieceMap - Mapa de peças com regiões
   * @param {Object} characterObject - Objeto do personagem (para transformações)
   * @param {Renderer} renderer - Renderer para coordenadas
   * @returns {Object} Estatísticas de cobertura
   */
  calculateCoverage(pieceMap, characterObject, renderer) {
    const mask = this.getSilhouetteMask();
    const w = this._alphaWidth;
    const h = this._alphaHeight;
    const totalSilhouettePixels = this._silhouettePixelCount || this.getSilhouetteMask().reduce((a, b) => a + b, 0);
    
    if (totalSilhouettePixels === 0) {
      return { coverage: 0, uncovered: 0, overlapping: 0, outside: 0, regions: {} };
    }
    
    // Cria buffer de atribuição de região por pixel
    const regionAssignment = new Int16Array(w * h); // -1 = não atribuído, -2 = sobreposição, >=0 = region index
    regionAssignment.fill(-1);
    
    const regions = pieceMap.getAllRegions();
    const regionStats = {};
    let uncoveredCount = 0;
    let overlappingCount = 0;
    let outsideCount = 0;
    
    // Para cada região, rasteriza seu polígono no buffer
    regions.forEach((region, regionIndex) => {
      const points = region.points;
      if (points.length < 3) return;
      
      // Converte pontos da região (espaço local do personagem) para espaço da imagem downsampled
      const imgPoints = this._transformRegionPointsToImage(points, characterObject, renderer);
      
      // Rasteriza polígono (scanline fill)
      const pixelCount = this._rasterizePolygon(imgPoints, regionAssignment, w, h, regionIndex, mask);
      
      regionStats[region.id] = {
        name: region.name,
        pixelCount,
        boneId: region.boneId
      };
    });
    
    // Conta estatísticas finais
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        const assignment = regionAssignment[i];
        if (assignment === -1) {
          uncoveredCount++;
        } else if (assignment === -2) {
          overlappingCount++;
        }
      } else if (regionAssignment[i] >= 0) {
        outsideCount++;
      }
    }
    
    const coveredPixels = totalSilhouettePixels - uncoveredCount;
    const coverage = totalSilhouettePixels > 0 ? (coveredPixels / totalSilhouettePixels) * 100 : 0;
    
    this._coverageStats = {
      coverage: Math.round(coverage * 100) / 100,
      totalSilhouettePixels,
      coveredPixels,
      uncoveredPixels: uncoveredCount,
      overlappingPixels: overlappingCount,
      outsidePixels: outsideCount,
      regions: regionStats
    };
    
    return this._coverageStats;
  }

  /**
   * Transforma pontos da região (espaço local do personagem) para espaço da imagem downsampled
   */
  _transformRegionPointsToImage(points, characterObject, renderer) {
    // Matriz: characterTransform * rigBaseTransform
    const charMatrix = characterObject.transform.m;
    const rigBaseMatrix = characterObject.rig?.baseTransform?.m || [1,0,0,1,0,0];
    
    // Combina: world = viewport * character * rigBase
    // Precisamos do inverso: image -> world -> character local
    const viewport = renderer.viewport;
    const viewportInv = viewport.getInverse();
    
    // Centro da imagem em coordenadas do personagem
    const imgCenterX = characterObject.imageWidth / 2;
    const imgCenterY = characterObject.imageHeight / 2;
    
    // Escala do downsample
    const scaleX = this._alphaWidth / characterObject.imageWidth;
    const scaleY = this._alphaHeight / characterObject.imageHeight;
    
    return points.map(pt => {
      // Ponto em espaço local do personagem -> mundo
      const worldX = charMatrix[0] * pt.x + charMatrix[2] * pt.y + charMatrix[4];
      const worldY = charMatrix[1] * pt.x + charMatrix[3] * pt.y + charMatrix[5];
      
      // Mundo -> tela (canvas)
      const screenX = viewport.m[0] * worldX + viewport.m[2] * worldY + viewport.m[4];
      const screenY = viewport.m[1] * worldX + viewport.m[3] * worldY + viewport.m[5];
      
      // Tela -> imagem original (centro da imagem na origem do personagem)
      const imgX = (screenX - renderer.canvas.width / 2) + imgCenterX;
      const imgY = (screenY - renderer.canvas.height / 2) + imgCenterY;
      
      // Downsample
      return { x: imgX * scaleX, y: imgY * scaleY };
    });
  }

  /**
   * Rasteriza polígono usando scanline fill
   * @returns {number} Número de pixels preenchidos
   */
  _rasterizePolygon(points, assignmentBuffer, w, h, regionIndex, silhouetteMask) {
    if (points.length < 3) return 0;
    
    // Encontra bounds do polígono
    let minY = h, maxY = -1;
    for (const pt of points) {
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(h - 1, Math.ceil(maxY));
    
    let fillCount = 0;
    
    for (let y = minY; y <= maxY; y++) {
      const intersections = [];
      
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const yi = points[i].y;
        const yj = points[j].y;
        const xi = points[i].x;
        const xj = points[j].x;
        
        if ((yi <= y && yj > y) || (yj <= y && yi > y)) {
          const x = xi + (y - yi) * (xj - xi) / (yj - yi);
          intersections.push(x);
        }
      }
      
      intersections.sort((a, b) => a - b);
      
      for (let k = 0; k < intersections.length; k += 2) {
        if (k + 1 >= intersections.length) break;
        
        const xStart = Math.max(0, Math.ceil(intersections[k]));
        const xEnd = Math.min(w - 1, Math.floor(intersections[k + 1]));
        
        for (let x = xStart; x <= xEnd; x++) {
          const idx = y * w + x;
          if (assignmentBuffer[idx] === -1) {
            assignmentBuffer[idx] = regionIndex;
            if (silhouetteMask[idx]) fillCount++;
          } else if (assignmentBuffer[idx] >= 0) {
            assignmentBuffer[idx] = -2; // Sobreposição
          }
        }
      }
    }
    
    return fillCount;
  }

  /**
   * Gera visualização da cobertura (para debug/visualização)
   * @returns {HTMLCanvasElement} Canvas com visualização
   */
  generateCoverageVisualization(pieceMap, characterObject, renderer, options = {}) {
    const {
      showSilhouette = true,
      showRegions = true,
      showUncovered = true,
      showOverlapping = true,
      showOutside = true,
      regionColors = null
    } = options;
    
    const mask = this.getSilhouetteMask();
    const w = this._alphaWidth;
    const h = this._alphaHeight;
    
    // Calcula cobertura se não feito
    const stats = this._coverageStats || this.calculateCoverage(pieceMap, characterObject, renderer);
    
    // Cria buffer de cor por pixel
    const colorBuffer = new Uint32Array(w * h);
    
    // Cores padrão
    const defaultColors = {
      silhouette: 0xFF333333,      // Cinza escuro para silhueta
      uncovered: 0xFFFF0000,       // Vermelho para não coberto
      overlapping: 0xFFFF00FF,     // Magenta para sobreposição
      outside: 0xFFFFFF00,         // Amarelo para fora da silhueta
      background: 0x00000000       // Transparente
    };
    
    const colors = { ...defaultColors, ...regionColors };
    
    // Cria assignment buffer para visualização
    const assignment = new Int16Array(w * h);
    assignment.fill(-1);
    
    const regions = pieceMap.getAllRegions();
    regions.forEach((region, regionIndex) => {
      const points = region.points;
      if (points.length < 3) return;
      const imgPoints = this._transformRegionPointsToImage(points, characterObject, renderer);
      this._rasterizePolygon(imgPoints, assignment, w, h, regionIndex, mask);
    });
    
    // Preenche color buffer
    for (let i = 0; i < w * h; i++) {
      const isSilhouette = mask[i];
      const assigned = assignment[i];
      
      if (isSilhouette) {
        if (assigned === -1) {
          colorBuffer[i] = showUncovered ? colors.uncovered : colors.silhouette;
        } else if (assigned === -2) {
          colorBuffer[i] = showOverlapping ? colors.overlapping : colors.silhouette;
        } else {
          // Tem região atribuída
          if (showRegions) {
            const region = regions[assigned];
            const colorStr = region?.color || '#888888';
            colorBuffer[i] = this._parseColor(colorStr, 180); // Alpha ~0.7
          } else {
            colorBuffer[i] = colors.silhouette;
          }
        }
      } else if (assigned >= 0) {
        colorBuffer[i] = showOutside ? colors.outside : colors.background;
      } else {
        colorBuffer[i] = colors.background;
      }
    }
    
    // Cria canvas de saída
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    
    for (let i = 0; i < colorBuffer.length; i++) {
      const color = colorBuffer[i];
      data[i * 4] = (color >> 16) & 0xFF;
      data[i * 4 + 1] = (color >> 8) & 0xFF;
      data[i * 4 + 2] = color & 0xFF;
      data[i * 4 + 3] = (color >> 24) & 0xFF;
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    return {
      canvas,
      stats,
      width: w,
      height: h
    };
  }

  _parseColor(colorStr, alpha = 255) {
    // Parse "rgba(r,g,b,a)" ou "rgb(r,g,b)" ou "#rrggbb"
    if (colorStr.startsWith('rgba')) {
      const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match) {
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        const a = match[4] ? Math.round(parseFloat(match[4]) * 255) : alpha;
        return (a << 24) | (r << 16) | (g << 8) | b;
      }
    } else if (colorStr.startsWith('#')) {
      const hex = colorStr.slice(1);
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return (alpha << 24) | (r << 16) | (g << 8) | b;
      }
    }
    return (alpha << 24) | 0x888888;
  }

  /**
   * Serializa estado para salvamento
   */
  toJSON() {
    return {
      alphaThreshold: this.alphaThreshold,
      downsample: this.downsample,
      width: this.width,
      height: this.height,
      boundingBox: this._boundingBox,
      coverageStats: this._coverageStats
    };
  }

  /**
   * Cria analisador a partir de JSON
   */
  static fromJSON(data, imageElement) {
    const analyzer = new SilhouetteAnalyzer(imageElement, {
      alphaThreshold: data.alphaThreshold,
      downsample: data.downsample
    });
    if (data.boundingBox) analyzer._boundingBox = data.boundingBox;
    if (data.coverageStats) analyzer._coverageStats = data.coverageStats;
    return analyzer;
  }
}

/**
 * Cria analisador de silhueta para um personagem
 */
export async function createSilhouetteAnalyzer(characterObject, options = {}) {
  // Garante que a imagem está carregada
  if (!characterObject.imageElement) {
    await characterObject.loadImage();
  }
  return new SilhouetteAnalyzer(characterObject.imageElement, options);
}