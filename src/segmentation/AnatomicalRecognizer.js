import { refineLabels, recoverHeadBoundary } from './refineLabels.js';
/**
 * AnatomicalRecognizer - Reconhecimento anatómico automático usando BodyPix + Silhueta + Armadura
 * Combina IA local (TensorFlow.js BodyPix) com a silhueta do PNG e a armadura de 17 ossos
 * para gerar máscaras anatómicas precisas para cada região do corpo.
 */

import * as tf from '@tensorflow/tfjs';
import * as bodySegmentation from '@tensorflow-models/body-segmentation';

// Index order is PART_CHANNELS in @tensorflow-models/body-segmentation.
const PART_REGION = [
  'head', 'head', 'l_shoulder', 'l_shoulder', 'r_shoulder', 'r_shoulder',
  'l_elbow', 'l_elbow', 'r_elbow', 'r_elbow', 'l_wrist', 'r_wrist',
  'chest', 'chest', 'l_hip', 'l_hip', 'r_hip', 'r_hip',
  'l_knee', 'l_knee', 'r_knee', 'r_knee', 'l_ankle', 'r_ankle',
];

const LEGACY_REGIONS = {
  head: 'cabeca_anatomica', neck: 'pescoco_anatomico', chest: 'peito', pelvis: 'bacia',
  l_shoulder: 'ombro_esquerdo', r_shoulder: 'ombro_direito',
  l_elbow: 'cotovelo_esquerdo', r_elbow: 'cotovelo_direito',
  l_wrist: 'mao_esquerda', r_wrist: 'mao_direita',
  l_hip: 'anca_esquerda', r_hip: 'anca_direita',
  l_knee: 'joelho_esquerdo', r_knee: 'joelho_direito',
  l_ankle: 'pe_esquerdo', r_ankle: 'pe_direito',
};

// Learn clothing colours from this prediction. Only use them where the rig
// already places two neighbouring anatomical classes close to their boundary.
function clothingMeans(labels, rgba) {
  const sums = new Map();
  for (let i = 0; i < labels.length; i++) {
    const key = PART_REGION[labels[i] - 1]?.replace(/^[lr]_/, '');
    if (!key || !['chest', 'hip', 'knee', 'ankle'].includes(key)) continue;
    if (!sums.has(key)) sums.set(key, [0, 0, 0, 0]);
    const sum = sums.get(key);
    for (let c = 0; c < 3; c++) sum[c] += rgba[4*i+c];
    sum[3]++;
  }
  return new Map([...sums].map(([key, sum]) => [key, sum.slice(0, 3).map(v => v / sum[3])]));
}

function matchesNeighbour(rgba, i, means, from, to) {
  const a = means.get(from), b = means.get(to);
  if (!a || !b) return false;
  let separation = 0, current = 0, neighbour = 0;
  for (let c = 0; c < 3; c++) {
    separation += (a[c] - b[c]) ** 2;
    current += (rgba[4*i+c] - a[c]) ** 2;
    neighbour += (rgba[4*i+c] - b[c]) ** 2;
  }
  return separation > 3600 && neighbour < separation * 0.25 && neighbour < current * 0.2;
}

export class AnatomicalRecognizer {
  constructor(imageElement, silhouetteAnalyzer, rig, characterObject, renderer) {
    this.imageElement = imageElement;
    this.silhouetteAnalyzer = silhouetteAnalyzer;
    this.rig = rig;
    this.characterObject = characterObject;
    this.renderer = renderer;
    
    this.bodyPixModel = null;
    this.isLoading = false;
    this.isProcessing = false;
    this.progressCallback = null;
    this.cancelRequested = false;
    
    // Resultados
    this.segmentationResult = null;
    this.anatomicalMasks = null; // Map<regionId, Uint8Array mask>
    this.qualityMetrics = null;
    
    // Configuração
    this.config = {
      modelType: 'BodyPix', // 'MediaPipeSelfieSegmentation' ou 'BodyPix'
      inputResolution: { width: 640, height: 640 },
      segmentationThreshold: 0.5,
      maxDetections: 1,
      scoreThreshold: 0.3,
    };
    
    // Modelos carregados
    this.mediaPipeModel = null;
    this.bodyPixModel = null;
  }

  /**
   * Carrega o modelo de segmentação (MediaPipe ou BodyPix)
   */
  async loadModel(onProgress = null) {
    // Verifica se o modelo solicitado já está carregado
    if (this.config.modelType === 'BodyPix' && this.bodyPixModel) return this.bodyPixModel;
    if (this.config.modelType === 'MediaPipeSelfieSegmentation' && this.mediaPipeModel) return this.mediaPipeModel;
    
    this.isLoading = true;
    this.progressCallback = onProgress;
    
    try {
      this._reportProgress(10, 'A carregar TensorFlow.js...');
      
      // Garante que TF.js está pronto
      await tf.ready();
      this._reportProgress(30, 'A carregar modelo de segmentação...');
      
      if (this.config.modelType === 'BodyPix') {
        // Carrega BodyPix (suporta 24 partes do corpo)
        console.log('[DIAG] Carregando modelo:', {
          model: 'BodyPix',
          runtime: 'tfjs',
        });
        
        this.bodyPixModel = await bodySegmentation.createSegmenter(
          bodySegmentation.SupportedModels.BodyPix,
          {
            architecture: 'MobileNetV1', outputStride: 16, multiplier: 0.75, quantBytes: 2,
            modelUrl: new URL('models/bodypix/model.json', document.baseURI).href,
          }
        );
        
        this._reportProgress(100, 'Modelo BodyPix carregado com sucesso');
        return this.bodyPixModel;
      } else {
        // Usa MediaPipe Selfie Segmentation (mais leve, ~3MB) com runtime TFJS
        console.log('[DIAG] Carregando modelo:', {
          model: 'MediaPipeSelfieSegmentation',
          runtime: 'tfjs',
          modelType: 'general'
        });
        
        this.mediaPipeModel = await bodySegmentation.createSegmenter(
          bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
          {
            runtime: 'tfjs',
            modelType: 'general', // ou 'landscape' para fotos de corpo inteiro
          }
        );
        
        // DIAGNÓSTICO: Verificar modelo carregado
        console.log('[DIAG] Modelo carregado:', {
          hasSegmentPeople: typeof this.mediaPipeModel?.segmentPeople === 'function',
          hasEstimatePeopleSegments: typeof this.mediaPipeModel?.estimatePeopleSegments === 'function',
          modelKeys: this.mediaPipeModel ? Object.keys(this.mediaPipeModel) : null,
          modelConstructor: this.mediaPipeModel?.constructor?.name,
        });
        
        this._reportProgress(100, 'Modelo MediaPipe carregado com sucesso');
        return this.mediaPipeModel;
      }
    } catch (err) {
      console.error('Erro ao carregar modelo de segmentação:', err);
      throw new Error(`Falha ao carregar modelo de segmentação: ${err.message}`);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Executa reconhecimento anatómico completo
   * @param {Object} options - Opções de execução
   * @returns {Object} Resultado com máscaras por região
   */
  async recognize(options = {}) {
    if (this.isProcessing) {
      throw new Error('Reconhecimento já em andamento');
    }
    
    this.isProcessing = true;
    this.cancelRequested = false;
    const onProgress = options.onProgress || (() => {});
    this.config.modelType = options.method || this.config.modelType;
    this.progressCallback = onProgress;
    
    try {
      // 1. Carrega modelo se necessário
      await this.loadModel(onProgress);
      if (this.cancelRequested) throw new Error('Cancelado pelo utilizador');
      
      this._reportProgress(20, 'A preparar imagem para inferência...');
      
      // 2. Prepara canvas para o modelo
      const inputCanvas = this._prepareInputCanvas();
      if (this.cancelRequested) throw new Error('Cancelado pelo utilizador');
      
      // 3. Executa inferência com o modelo apropriado
      this._reportProgress(40, 'A executar segmentação anatómica...');
      
      const segmentation = this.config.modelType === 'BodyPix'
        ? await this._recognizeWithBodyPix(inputCanvas)
        : await this.mediaPipeModel.segmentPeople(inputCanvas);
      if (this.cancelRequested) throw new Error('Cancelado pelo utilizador');
      
      // 4. Processa resultados
      this._reportProgress(60, 'A reprojetar para resolução original...');
      this.segmentationResult = segmentation;
      this.anatomicalMasks = await this._reprojectAndCombineMasks(segmentation);
      
      if (this.cancelRequested) throw new Error('Cancelado pelo utilizador');
      
      // 5. Calcula métricas de qualidade
      this._reportProgress(80, 'A calcular métricas de qualidade...');
      this.qualityMetrics = this._calculateQualityMetrics();
      
      this._reportProgress(100, 'Reconhecimento concluído');
      
      return {
        masks: this.anatomicalMasks,
        quality: this.qualityMetrics,
        segmentation: this.segmentationResult,
        method: this.config.modelType,
      };
    } catch (err) {
      console.error('Erro no reconhecimento anatómico:', err);
      throw err;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Prepara a imagem do personagem para entrada no modelo
   * Redimensiona mantendo aspect ratio, faz padding se necessário
   * Retorna o canvas diretamente para ser usado pelo segmentPeople()
   */
  _prepareInputCanvas() {
    const { width, height } = this.config.inputResolution;
    
    // Cria canvas temporário
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Calcula escala mantendo aspect ratio
    const imgW = this.imageElement.width;
    const imgH = this.imageElement.height;
    const scale = Math.min(width / imgW, height / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const offsetX = (width - drawW) / 2;
    const offsetY = (height - drawH) / 2;
    
    // Fundo preto (transparent pixels -> preto)
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);
    
    // Desenha imagem redimensionada
    ctx.drawImage(this.imageElement, offsetX, offsetY, drawW, drawH);
    
    return canvas;
  }

  async _recognizeWithBodyPix(canvas) {
    return this.bodyPixModel.segmentPeople(canvas, {
      segmentBodyParts: true, multiSegmentation: false,
      internalResolution: 'high', segmentationThreshold: this.config.segmentationThreshold,
    });
  }

  async _reprojectAndCombineMasks(people) {
    const silhouette = this.silhouetteAnalyzer.getSilhouetteMask(1);
    const w = this.silhouetteAnalyzer._alphaWidth;
    const h = this.silhouetteAnalyzer._alphaHeight;
    const input = this.config.inputResolution;
    const scale = Math.min(input.width / w, input.height / h);
    const dx = (input.width - w * scale) / 2;
    const dy = (input.height - h * scale) / 2;
    const masks = new Map();
    const foreground = new Uint8Array(w * h);
    for (const person of people) {
      const { data, width, height } = await person.mask.toImageData();
      for (let y = 0; y < h; y++) {
        const sy = Math.floor(((y + 0.5) * scale + dy) * height / input.height);
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (!silhouette[i] || foreground[i]) continue;
          const sx = Math.floor(((x + 0.5) * scale + dx) * width / input.width);
          const pixel = (sy * width + sx) * 4;
          if (data[pixel + 3] < this.config.segmentationThreshold * 255) continue;
          if (this.config.modelType === 'BodyPix') {
            if (data[pixel] >= PART_REGION.length) continue;
            foreground[i] = data[pixel] + 1;
          } else foreground[i] = 1;
        }
      }
    }
    if (this.config.modelType !== 'BodyPix') return this._splitPersonMaskByRig(foreground, w, h);
    const source = document.createElement('canvas');
    source.width = w;
    source.height = h;
    const ctx = source.getContext('2d');
    ctx.drawImage(this.imageElement, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const labels = refineLabels(foreground, silhouette, rgba, w, h);
    recoverHeadBoundary(labels, rgba, w, h);
    // The calibrated pair disambiguates left/right when the prediction is much
    // closer to the opposite limb (common in rear views).
    const names = {head:'cabeca', chest:'peito', l_wrist:'pulso_esquerdo', r_wrist:'pulso_direito',
      l_ankle:'tornozelo_esquerdo', r_ankle:'tornozelo_direito'};
    const centers = {};
    this.rig.computeWorldTransforms();
    for (const key of new Set(PART_REGION)) {
      const bone = this.rig.getBone(key) || this.rig.getBone(names[key] || LEGACY_REGIONS[key]);
      if (!bone) continue;
      const start = bone.getWorldPoint(), end = bone.children[0]?.getWorldPoint() || start;
      centers[key] = [start.x + w / 2, start.y + h / 2, end.x + w / 2, end.y + h / 2];
    }
    const pelvis = this.rig.getBone('pelvis') || this.rig.getBone('bacia');
    const hips = [centers.l_hip, centers.r_hip];
    // The upper edge follows the predicted clothing transition. The lower edge
    // has no dedicated BodyPix class; estimate it in the calibrated thigh frame.
    const hipLine = hips.every(Boolean) && pelvis ? {
      x: (hips[0][0] + hips[1][0]) / 2,
      y: (hips[0][1] + hips[1][1]) / 2,
      dx: ((hips[0][2] - hips[0][0]) + (hips[1][2] - hips[1][0])) / 2,
      dy: ((hips[0][3] - hips[0][1]) + (hips[1][3] - hips[1][1])) / 2,
    } : null;
    const means = clothingMeans(labels, rgba);
    for (let i = 0; i < labels.length; i++) {
      if (!labels[i]) continue;
      let key = PART_REGION[labels[i] - 1];
      if (key[1] === '_') {
        const other = (key[0] === 'l' ? 'r' : 'l') + key.slice(1);
        const a = centers[key], b = centers[other];
        if (a && b) {
          const x = i % w, y = Math.floor(i / w);
          const dist = p => this._pointToSegmentDistSq(x, y, ...p);
          const ambiguity = /_(knee|ankle)$/.test(key) ? 0.025 : 0.15;
          const margin = ((a[0]-b[0])**2 + (a[1]-b[1])**2) * ambiguity;
          if (dist(b) + margin < dist(a)) key = other;
        }
      }
      if (hipLine && (key === 'l_hip' || key === 'r_hip' || key === 'chest')) {
        const {x, y, dx, dy} = hipLine;
        const along = ((i % w - x)*dx + (Math.floor(i / w) - y)*dy) / (dx*dx + dy*dy || 1);
        if (along < 0.36 && along > -0.5 &&
            (key !== 'chest' || matchesNeighbour(rgba, i, means, 'chest', 'hip'))) key = 'pelvis';
      }
      if (/_(knee|ankle)$/.test(key)) {
        const side = key.slice(0, 2);
        const ankle = centers[side + 'ankle'], shin = centers[side + 'knee'];
        if (ankle && shin) {
          const length = Math.hypot(shin[2]-shin[0], shin[3]-shin[1]);
          const distance = Math.hypot(i % w - ankle[0], Math.floor(i / w) - ankle[1]);
          const from = key.slice(2), to = from === 'ankle' ? 'knee' : 'ankle';
          if (distance < length * 0.55 && matchesNeighbour(rgba, i, means, from, to)) key = side + to;
        }
      }
      const id = this.rig.getBone(key) ? key : LEGACY_REGIONS[key];
      if (!masks.has(id)) masks.set(id, new Uint8Array(w*h));
      masks.get(id)[i] = 1;
    }
    if (!masks.size) throw new Error('BodyPix não identificou partes nesta imagem.');
    return masks;
  }

  /**
   * Combina: posição dos ossos + heurísticas anatómicas + silhueta
   */
  async _splitPersonMaskByRig(personMask, silW, silH) {
    const masks = new Map();
    const bones = this.rig.getAllBones();
    
    // Obtém posições mundiais dos ossos
    this.rig.computeWorldTransforms();
    
    // Converte posições dos ossos para espaço da silhueta
    const bonePositions = new Map();
    for (const bone of bones) {
      const worldPos = bone.getWorldPoint();
      const silPos = this._worldToSilhouetteSpace(worldPos, silW, silH);
      if (silPos) {
        const aliases = {head:'cabeca', neck:'pescoco', l_wrist:'pulso_esquerdo', r_wrist:'pulso_direito',
          l_ankle:'tornozelo_esquerdo', r_ankle:'tornozelo_direito'};
        bonePositions.set(aliases[bone.id] || LEGACY_REGIONS[bone.id] || bone.id, silPos);
      }
    }
    
    // Define regiões baseadas nos ossos
    const regionDefinitions = this._getRegionDefinitions(bonePositions, silW, silH);
    
    // Para cada região, cria máscara por flood fill / proximity a partir dos ossos
    // Pass existing masks to prevent overlaps
    const existingMasks = new Map();
    for (const [regionId, def] of Object.entries(regionDefinitions)) {
      const mask = this._createRegionMask(personMask, def, silW, silH, bonePositions, existingMasks);
      if (mask) {
        const key = Object.keys(LEGACY_REGIONS).find(id => LEGACY_REGIONS[id] === regionId);
        masks.set(key && this.rig.getBone(key) ? key : regionId, mask);
        existingMasks.set(regionId, mask);
      }
    }
    
    return masks;
  }

  /**
   * Converte coordenadas mundiais para espaço da silhueta
   * Usa a transformação completa do personagem (position, rotation, scale)
   */
  _worldToSilhouetteSpace(worldPos, silW, silH) {
    if (!this.characterObject || !this.renderer) return null;
    
    // Mundo -> espaço local do personagem (usa a transform inversa do personagem)
    const localPos = worldPos;
    
    // Espaço local do personagem -> espaço da imagem (centro da imagem na origem)
    const imgCenterX = this.characterObject.imageWidth / 2;
    const imgCenterY = this.characterObject.imageHeight / 2;
    const imgX = localPos.x + imgCenterX;
    const imgY = localPos.y + imgCenterY;
    
    // Imagem original -> silhueta (downsample)
    const scaleX = silW / this.characterObject.imageWidth;
    const scaleY = silH / this.characterObject.imageHeight;
    
    return {
      x: Math.round(imgX * scaleX),
      y: Math.round(imgY * scaleY)
    };
  }

  /**
   * Define regiões anatómicas baseadas na armadura
   */
  _getRegionDefinitions(bonePositions, silW, silH) {
    const getPos = (id) => bonePositions.get(id);
    
    return {
      // Cabeça e cabelo
      cabeca_anatomica: {
        type: 'ellipse',
        center: getPos('cabeca') || getPos('pescoco'),
        radiusX: 60,
        radiusY: 80,
        bones: ['cabeca', 'pescoco'],
      },
      
      // Pescoço
      pescoco_anatomico: {
        type: 'rect',
        center: getPos('pescoco'),
        width: 30,
        height: 40,
        bones: ['pescoco'],
      },
      
      // Tronco (peito + coluna)
      peito: {
        type: 'polygon',
        points: [
          getPos('ombro_esquerdo'),
          getPos('ombro_direito'),
          getPos('anca_direita'),
          getPos('anca_esquerda'),
        ].filter(Boolean),
        bones: ['peito', 'coluna', 'ombro_esquerdo', 'ombro_direito'],
      },
      
      // Pelvis/Bacia
      bacia: {
        type: 'ellipse',
        center: getPos('bacia'),
        radiusX: 45,
        radiusY: 25,
        bones: ['bacia'],
      },
      
      // Braço esquerdo
      ombro_esquerdo: {
        type: 'capsule',
        start: getPos('ombro_esquerdo'),
        end: getPos('cotovelo_esquerdo'),
        radius: 20,
        bones: ['ombro_esquerdo'],
      },
      cotovelo_esquerdo: {
        type: 'capsule',
        start: getPos('cotovelo_esquerdo'),
        end: getPos('pulso_esquerdo'),
        radius: 18,
        bones: ['cotovelo_esquerdo'],
      },
      mao_esquerda: {
        type: 'ellipse',
        center: getPos('pulso_esquerdo'),
        radiusX: 22,
        radiusY: 18,
        bones: ['pulso_esquerdo'],
      },
      
      // Braço direito
      ombro_direito: {
        type: 'capsule',
        start: getPos('ombro_direito'),
        end: getPos('cotovelo_direito'),
        radius: 20,
        bones: ['ombro_direito'],
      },
      cotovelo_direito: {
        type: 'capsule',
        start: getPos('cotovelo_direito'),
        end: getPos('pulso_direito'),
        radius: 18,
        bones: ['cotovelo_direito'],
      },
      mao_direita: {
        type: 'ellipse',
        center: getPos('pulso_direito'),
        radiusX: 22,
        radiusY: 18,
        bones: ['pulso_direito'],
      },
      
      // Perna esquerda
      anca_esquerda: {
        type: 'capsule',
        start: getPos('anca_esquerda'),
        end: getPos('joelho_esquerdo'),
        radius: 22,
        bones: ['anca_esquerda'],
      },
      joelho_esquerdo: {
        type: 'capsule',
        start: getPos('joelho_esquerdo'),
        end: getPos('tornozelo_esquerdo'),
        radius: 20,
        bones: ['joelho_esquerdo'],
      },
      pe_esquerdo: {
        type: 'ellipse',
        center: getPos('tornozelo_esquerdo'),
        radiusX: 18,
        radiusY: 35,
        bones: ['tornozelo_esquerdo'],
      },
      
      // Perna direita
      anca_direita: {
        type: 'capsule',
        start: getPos('anca_direita'),
        end: getPos('joelho_direito'),
        radius: 22,
        bones: ['anca_direita'],
      },
      joelho_direito: {
        type: 'capsule',
        start: getPos('joelho_direito'),
        end: getPos('tornozelo_direito'),
        radius: 20,
        bones: ['joelho_direito'],
      },
      pe_direito: {
        type: 'ellipse',
        center: getPos('tornozelo_direito'),
        radiusX: 18,
        radiusY: 35,
        bones: ['tornozelo_direito'],
      },
    };
  }

  /**
   * Cria máscara para uma região usando flood fill limitado pela silhueta da pessoa
   * Corrige: suporte a polígonos, eliminação de sobreposições, coord transforms
   */
  _createRegionMask(personMask, def, silW, silH, bonePositions, existingMasks = null) {
    const mask = new Uint8Array(silW * silH);
    
    if (!def.center && !def.start && !def.points) return null;
    
    // Para polígonos, usar point-in-polygon test direto (sem flood fill)
    if (def.type === 'polygon' && def.points && def.points.length >= 3) {
      for (let y = 0; y < silH; y++) {
        for (let x = 0; x < silW; x++) {
          const idx = y * silW + x;
          if (!personMask[idx]) continue;
          
          // Verificar se já atribuído a outra região
          if (existingMasks) {
            let alreadyAssigned = false;
            for (const [otherId, otherMask] of existingMasks) {
              if (otherMask[idx]) {
                alreadyAssigned = true;
                break;
              }
            }
            if (alreadyAssigned) continue;
          }
          
          if (this._pointInPolygon(x, y, def.points)) {
            mask[y * silW + x] = 1;
          }
        }
      }
      return mask;
    }
    
    // Para outros tipos, usar flood fill com verificação geométrica
    const seeds = [];
    
    if (def.type === 'ellipse' && def.center) {
      // Semente no centro da elipse
      seeds.push({ x: Math.round(def.center.x), y: Math.round(def.center.y) });
    } else if (def.type === 'capsule' && def.start && def.end) {
      // Sementes ao longo do capsule
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.round(def.start.x + (def.end.x - def.start.x) * t);
        const y = Math.round(def.start.y + (def.end.y - def.start.y) * t);
        seeds.push({ x, y });
      }
    } else if (def.type === 'rect' && def.center) {
      seeds.push({ x: Math.round(def.center.x), y: Math.round(def.center.y) });
    }
    
    if (seeds.length === 0) return null;
    
    // DIAGNÓSTICO: Verificar personMask
    const personPixels = personMask.reduce((a, b) => a + b, 0);
    console.log('[DIAG] _createRegionMask:', {
      regionType: def.type,
      personMaskPixels: personPixels,
      silW, silH
    });
    
    if (personPixels === 0) {
      console.warn('[DIAG] personMask vazia para região:', def.type);
      return null;
    }
    
    // Flood fill com verificação geométrica por tipo
    const visited = new Uint8Array(silW * silH);
    const queue = [...seeds];
    const radius = def.radius || def.radiusX || 20;
    const radiusSq = radius * radius;
    
    while (queue.length > 0) {
      const { x, y } = queue.pop();
      if (x < 0 || x >= silW || y < 0 || y >= silH) continue;
      
      const idx = y * silW + x;
      if (visited[idx]) continue;
      visited[idx] = 1;
      
      // Verifica se está dentro da máscara da pessoa
      if (!personMask[idx]) continue;
      
      // Verifica se já atribuído a outra região
      if (existingMasks) {
        let alreadyAssigned = false;
        for (const [otherId, otherMask] of existingMasks) {
          if (otherMask[idx]) {
            alreadyAssigned = true;
            break;
          }
        }
        if (alreadyAssigned) continue;
      }
      
      // Verifica distância para formas geométricas
      let inside = false;
      if (def.type === 'ellipse' && def.center) {
        inside = this._pointInEllipse(x, y, def.center, def.radiusX || radius, def.radiusY || radius);
      } else if (def.type === 'capsule' && def.start && def.end) {
        inside = this._pointInCapsule(x, y, def.start, def.end, radius);
      } else if (def.type === 'rect' && def.center) {
        inside = this._pointInRect(x, y, def.center, def.width, def.height);
      }
      
      if (!inside) continue;
      
      mask[idx] = 1;
      
      // Vizinhos 4-conectados
      queue.push({ x: x + 1, y });
      queue.push({ x: x - 1, y });
      queue.push({ x, y: y + 1 });
      queue.push({ x, y: y - 1 });
    }
    
    // Verifica se a máscara tem pixels
    const count = mask.reduce((a, b) => a + b, 0);
    if (count === 0) return null;
    
    return mask;
  }

  _pointToSegmentDistSq(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    
    if (lenSq === 0) {
      const dpx = px - x1;
      const dpy = py - y1;
      return dpx * dpx + dpy * dpy;
    }
    
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const dpx = px - projX;
    const dpy = py - projY;
    return dpx * dpx + dpy * dpy;
  }

  /**
   * Calcula métricas de qualidade das máscaras geradas
   */
  _calculateQualityMetrics() {
    if (!this.anatomicalMasks || !this.silhouetteAnalyzer) return null;
    
    const silhouetteMask = this.silhouetteAnalyzer.getSilhouetteMask(1);
    const totalSilhouette = silhouetteMask.reduce((a, b) => a + b, 0);
    
    let covered = 0;
    let overlapping = 0;
    let outside = 0;
    const regionMetrics = {};
    
    // Buffer de atribuição
    const assignment = new Int16Array(silhouetteMask.length);
    assignment.fill(-1);
    
    for (const [regionId, mask] of this.anatomicalMasks) {
      let regionCount = 0;
      for (let i = 0; i < mask.length; i++) {
        if (mask[i]) {
          regionCount++;
          if (silhouetteMask[i]) {
            if (assignment[i] === -1) {
              assignment[i] = 1;
              covered++;
            } else {
              assignment[i] = -2;
              overlapping++;
            }
          } else {
            outside++;
          }
        }
      }
      regionMetrics[regionId] = { pixelCount: regionCount };
    }
    
    const uncovered = totalSilhouette - covered;
    const coverage = totalSilhouette > 0 ? (covered / totalSilhouette) * 100 : 0;
    
    return {
      coverage: Math.round(coverage * 100) / 100,
      totalSilhouettePixels: totalSilhouette,
      coveredPixels: covered,
      uncoveredPixels: uncovered,
      overlappingPixels: overlapping,
      outsidePixels: outside,
      regions: regionMetrics,
    };
  }

  /**
   * Gera visualização das máscaras anatómicas
   */
  generateVisualization(options = {}) {
    if (!this.anatomicalMasks) return null;
    
    const silW = this.silhouetteAnalyzer._alphaWidth;
    const silH = this.silhouetteAnalyzer._alphaHeight;
    const silhouetteMask = this.silhouetteAnalyzer.getSilhouetteMask(1);
    
    const canvas = document.createElement('canvas');
    canvas.width = silW;
    canvas.height = silH;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(silW, silH);
    const data = imageData.data;
    
    // Cores para cada região (usando REGION_COLORS do PieceMap se disponível)
    const regionColors = {
      cabeca_anatomica: [255, 100, 100],
      pescoco_anatomico: [255, 150, 100],
      peito: [100, 255, 100],
      coluna: [100, 200, 100],
      bacia: [200, 100, 255],
      ombro_esquerdo: [255, 200, 100],
      cotovelo_esquerdo: [255, 150, 50],
      mao_esquerda: [255, 100, 50],
      ombro_direito: [100, 200, 255],
      cotovelo_direito: [50, 150, 255],
      mao_direita: [50, 100, 255],
      anca_esquerda: [100, 255, 200],
      joelho_esquerdo: [50, 255, 150],
      pe_esquerdo: [50, 255, 100],
      anca_direita: [200, 255, 100],
      joelho_direito: [150, 255, 50],
      pe_direito: [100, 255, 50],
    };
    
    // Preenche cores
    for (let i = 0; i < silhouetteMask.length; i++) {
      if (!silhouetteMask[i]) {
        data[i * 4 + 3] = 0; // Transparente fora da silhueta
        continue;
      }
      
      let assigned = false;
      for (const [regionId, mask] of this.anatomicalMasks) {
        if (mask[i]) {
          const color = regionColors[LEGACY_REGIONS[regionId] || regionId] || [128, 128, 128];
          data[i * 4] = color[0];
          data[i * 4 + 1] = color[1];
          data[i * 4 + 2] = color[2];
          data[i * 4 + 3] = 180; // Semi-transparente
          assigned = true;
          break;
        }
      }
      
      if (!assigned) {
        // Não coberto - vermelho
        data[i * 4] = 255;
        data[i * 4 + 1] = 0;
        data[i * 4 + 2] = 0;
        data[i * 4 + 3] = 200;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    return {
      canvas,
      quality: this.qualityMetrics,
    };
  }

  _reportProgress(percent, message) {
    if (this.progressCallback) {
      this.progressCallback(percent, message);
    }
  }

  /**
   * Point-in-polygon test
   */
  _pointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Point in capsule test
   */
  _pointInCapsule(x, y, start, end, radius) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return false;
    const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / lenSq));
    const projX = start.x + t * dx;
    const projY = start.y + t * dy;
    const dx2 = x - projX;
    const dy2 = y - projY;
    return dx2 * dx2 + dy2 * dy2 <= radius * radius;
  }

  /**
   * Point in ellipse test
   */
  _pointInEllipse(x, y, center, radiusX, radiusY) {
    const dx = (x - center.x) / radiusX;
    const dy = (y - center.y) / radiusY;
    return dx * dx + dy * dy <= 1;
  }

  /**
   * Point in rect test
   */
  _pointInRect(x, y, center, width, height) {
    return Math.abs(x - center.x) <= width / 2 && Math.abs(y - center.y) <= height / 2;
  }

  /**
   * Cancela operação em andamento
   */
  cancel() {
    this.cancelRequested = true;
  }

  /**
   * Libera recursos
   */
  dispose() {
    if (this.bodyPixModel) {
      this.bodyPixModel.dispose();
      this.bodyPixModel = null;
    }
    this.mediaPipeModel?.dispose();
    this.mediaPipeModel = null;
    this.segmentationResult = null;
    this.anatomicalMasks = null;
    this.qualityMetrics = null;
  }
}

/**
 * Factory para criar reconhecedor anatómico
 */
export async function createAnatomicalRecognizer(characterObject, silhouetteAnalyzer, rig, renderer, options = {}) {
  if (!characterObject.imageElement) {
    await characterObject.loadImage();
  }
  
  const recognizer = new AnatomicalRecognizer(
    characterObject.imageElement,
    silhouetteAnalyzer,
    rig,
    characterObject,
    renderer
  );
  
  // Aplica configurações personalizadas
  if (options.config) {
    recognizer.config = { ...recognizer.config, ...options.config };
  }
  
  return recognizer;
}