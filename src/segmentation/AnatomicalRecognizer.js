/**
 * AnatomicalRecognizer - Reconhecimento anatómico automático usando BodyPix + Silhueta + Armadura
 * Combina IA local (TensorFlow.js BodyPix) com a silhueta do PNG e a armadura de 17 ossos
 * para gerar máscaras anatómicas precisas para cada região do corpo.
 */

import * as tf from '@tensorflow/tfjs';
import * as bodySegmentation from '@tensorflow-models/body-segmentation';

// Mapeamento das classes BodyPix para regiões do Rigby
const BODYPIX_TO_RIGBY_REGIONS = {
  // Cabeça e rosto
  'face': 'cabeca_anatomica',
  'left_eye': 'cabeca_anatomica',
  'right_eye': 'cabeca_anatomica',
  'left_ear': 'cabeca_anatomica',
  'right_ear': 'cabeca_anatomica',
  'nose': 'cabeca_anatomica',
  'mouth': 'cabeca_anatomica',
  'hair': 'cabeca_anatomica',
  
  // Pescoço
  'neck': 'pescoco_anatomico',
  
  // Tronco
  'torso_front': 'peito',
  'torso_back': 'coluna',
  'left_shoulder': 'ombro_esquerdo',
  'right_shoulder': 'ombro_direito',
  'left_hip': 'anca_esquerda',
  'right_hip': 'anca_direita',
  
  // Braços
  'left_upper_arm': 'ombro_esquerdo',
  'right_upper_arm': 'ombro_direito',
  'left_lower_arm': 'cotovelo_esquerdo',
  'right_lower_arm': 'cotovelo_direito',
  'left_hand': 'mao_esquerda',
  'right_hand': 'mao_direita',
  
  // Pernas
  'left_thigh': 'anca_esquerda',
  'right_thigh': 'anca_direita',
  'left_lower_leg': 'joelho_esquerdo',
  'right_lower_leg': 'joelho_direito',
  'left_foot': 'pe_esquerdo',
  'right_foot': 'pe_direito',
};

// Classes BodyPix que não mapeiam diretamente (serão tratadas por regras)
const UNMAPPED_CLASSES = ['background', 'clothing', 'accessories'];

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
      modelType: 'MediaPipeSelfieSegmentation', // 'MediaPipeSelfieSegmentation' ou 'BodyPix'
      inputResolution: { width: 256, height: 256 },
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
            runtime: 'tfjs',
            modelType: 'general', // ou 'mobile' para mais velocidade
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
    const method = options.method || this.config.modelType;
    
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
      
      let segmentation;
      if (this.config.modelType === 'BodyPix') {
        segmentation = await this._recognizeWithBodyPix(inputCanvas);
      } else {
        // MediaPipe Selfie Segmentation (padrão)
        const segmentation = await this.mediaPipeModel.segmentPeople(inputCanvas, {
          flipHorizontal: false,
          segmentationThreshold: this.config.segmentationThreshold,
        });
        // Converter formato MediaPipe para formato unificado
        segmentation = this._normalizeMediaPipeResult(segmentation);
      }
      
      // DIAGNÓSTICO: Inspecionar resultado da segmentação
      console.log('[DIAG] Segmentação recebida:', {
        type: typeof segmentation,
        isArray: Array.isArray(segmentation),
        length: segmentation?.length,
        firstPersonKeys: segmentation?.[0] ? Object.keys(segmentation[0]) : null,
        firstPersonConstructor: segmentation?.[0]?.constructor?.name,
        firstPerson: segmentation?.[0] ? {
          hasSegmentation: !!segmentation[0].segmentation,
          segmentationType: typeof segmentation[0].segmentation,
          segmentationConstructor: segmentation[0].segmentation?.constructor?.name,
          segmentationKeys: segmentation[0].segmentation ? Object.keys(segmentation[0].segmentation) : null,
          hasMask: !!segmentation[0].segmentation?.mask,
          maskType: segmentation[0].segmentation?.mask?.constructor?.name,
          maskKeys: segmentation[0].segmentation?.mask ? Object.keys(segmentation[0].segmentation.mask) : null,
          hasToImageData: typeof segmentation[0].segmentation?.mask?.toImageData === 'function',
          hasToTensor: typeof segmentation[0].segmentation?.mask?.toTensor === 'function',
          hasToCanvas: typeof segmentation[0].segmentation?.mask?.toCanvas === 'function',
          hasGetUnderlyingType: typeof segmentation[0].segmentation?.mask?.getUnderlyingType === 'function',
          hasWidth: 'width' in (segmentation[0].segmentation || {}),
          hasHeight: 'height' in (segmentation[0].segmentation || {}),
          hasData: 'data' in (segmentation[0].segmentation || {}),
        } : null
      });
      
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

  /**
   * Normaliza o resultado do MediaPipe para formato unificado
   * MediaPipe retorna array de pessoas com {mask: Mask}, BodyPix retorna array de {mask: Mask, bodyParts: ...}
   */
  _normalizeMediaPipeResult(segmentation) {
    return segmentation.map(person => ({
      mask: person.mask,
      // BodyPix tem bodyParts, MediaPipe não tem
      bodyParts: null
    });
  }

  /**
   * Reconhecimento com BodyPix (suporta segmentBodyParts: true)
   */
  async _recognizeWithBodyPix(inputCanvas) {
    if (!this.bodyPixModel) {
      throw new Error('Modelo BodyPix não carregado');
    }
    
    this._reportProgress(40, 'A executar segmentação BodyPix (24 partes)...');
    
    const segmentation = await this.bodyPixModel.segmentPeople(inputCanvas, {
      flipHorizontal: false,
      segmentationThreshold: this.config.segmentationThreshold,
      multiSegmentation: false,
      segmentBodyParts: true,  // Habilita 24 partes do corpo
    });
    
    // BodyPix já retorna array de pessoas com máscaras e bodyParts
    // Normaliza para formato interno
    return segmentation.map(person => ({
      mask: person.mask,
      bodyParts: person.bodyParts || null
    }));
  }
    const imgW = this.imageElement.width;
    const imgH = this.imageElement.height;
    const modelW = this.config.inputResolution.width;
    const modelH = this.config.inputResolution.height;
    
    // Obtém a silhueta real (canal alfa)
    const silhouetteMask = this.silhouetteAnalyzer.getSilhouetteMask();
    const silW = this.silhouetteAnalyzer._alphaWidth;
    const silH = this.silhouetteAnalyzer._alphaHeight;
    
    // DIAGNÓSTICO: Verificar silhueta
    console.log('[DIAG] Silhueta:', {
      silW, silH,
      totalPixels: silW * silH,
      silhouettePixels: silhouetteMask.reduce((a, b) => a + b, 0),
      silhouettePercent: (silhouetteMask.reduce((a, b) => a + b, 0) / (silW * silH) * 100).toFixed(2) + '%'
    });
    
    // Calcula transformação modelo -> imagem original
    const scale = Math.min(modelW / imgW, modelH / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const offsetX = (modelW - drawW) / 2;
    const offsetY = (modelH - drawH) / 2;
    
    const masks = new Map();
    
    // Processa cada pessoa detectada (normalmente 1)
    for (const person of segmentation) {
      if (!person.mask) {
        console.warn('[DIAG] Pessoa sem máscara, ignorando:', person);
        continue;
      }
      
      // DIAGNÓSTICO: Inspecionar objeto de segmentação
      const segMask = person.mask;
      let segData, segW, segH;
      
      // O MediaPipe Selfie Segmentation retorna um objeto Mask com métodos toImageData/toTensor
      if (segMask && typeof segMask.toImageData === 'function') {
        const imageData = await segMask.toImageData();
        segW = imageData.width;
        segH = imageData.height;
        segData = imageData.data; // Uint8ClampedArray RGBA
        console.log('[DIAG] Máscara do modelo:', { segW, segH, dataLength: segData.length });
      } else if (segMask.width && segMask.height && segMask.data) {
        // Formato antigo/BodyPix
        segW = segMask.width;
        segH = segMask.height;
        segData = segMask.data;
        console.log('[DIAG] Formato BodyPix:', { segW, segH, dataLength: segData.length });
      } else {
        console.error('[DIAG] Formato de segmentação não reconhecido:', segMask);
        continue;
      }
      
      if (!segData || segW !== 256 || segH !== 256) {
        console.warn('[DIAG] Dimensões inesperadas:', { segW, segH, expected: '256x256' });
      }
      
      const personMask = new Uint8Array(silW * silH);
      
      for (let y = 0; y < silH; y++) {
        for (let x = 0; x < silW; x++) {
          // Mapeia coordenadas silhueta -> modelo
          const modelX = (x / silW) * imgW * scale + offsetX;
          const modelY = (y / silH) * imgH * scale + offsetY;
          
          // Mapeia para resolução da segmentação
          const segX = Math.floor((modelX / modelW) * segW);
          const segY = Math.floor((modelY / modelH) * segH);
          
          if (segX >= 0 && segX < segW && segY >= 0 && segY < segH) {
            const segIdx = segY * segW + segX;
            const silIdx = y * silW + x;
            
            // A máscara ImageData tem 4 canais RGBA por píxel.
            // O canal alfa (índice 3) contém a probabilidade de primeiro plano (0-255).
            const alphaIdx = segIdx * 4 + 3;
            const alpha = segData[alphaIdx];
            const threshold255 = this.config.segmentationThreshold * 255;
            
            // Apenas onde há silhueta real E o modelo detecta pessoa (alfa > limiar)
            if (silhouetteMask[silIdx] && alpha > threshold255) {
              personMask[silIdx] = 1;
            }
          }
        }
      }
      
      classMasks.set('person', personMask);
      
      // Se BodyPix com bodyParts, usa mapeamento direto das 24 partes
      if (person.bodyParts && Object.keys(person.bodyParts).length > 0) {
        console.log('[DIAG] Processando BodyPix bodyParts...');
        const bodyPixMasks = this._processBodyPixBodyParts(
          person.bodyParts, silW, silH, personMask, silW, silH
        );
        for (const [regionId, mask] of bodyPixMasks) {
          masks.set(regionId, mask);
        }
      } else {
        // Método tradicional: divide a máscara da pessoa usando a armadura
        const anatomicalMasks = await this._splitPersonMaskByRig(personMask, silW, silH);
        for (const [regionId, mask] of anatomicalMasks) {
          masks.set(regionId, mask);
        }
      }
    }
    
    return masks;
  }

  /**
   * Converte máscaras de partes do corpo do BodyPix para regiões do Rigby
   * BodyPix tem 24 partes: face, left_eye, right_eye, left_ear, right_ear, nose, mouth, hair,
   * neck, torso_front, torso_back, left_shoulder, right_shoulder, left_hip, right_hip,
   * left_upper_arm, right_upper_arm, left_lower_arm, right_lower_arm, left_hand, right_hand,
   * left_thigh, right_thigh, left_lower_leg, right_lower_leg, left_foot, right_foot
   */
  _processBodyPixBodyParts(personBodyParts, silW, silH, personMask, silW, silH) {
    const masks = new Map();
    
    // Mapeamento das classes BodyPix para regiões do Rigby
    const BODYPIX_TO_RIGBY = {
      // Cabeça e rosto
      'face': 'cabeca_anatomica',
      'left_eye': 'cabeca_anatomica',
      'right_eye': 'cabeca_anatomica',
      'left_ear': 'cabeca_anatomica',
      'right_ear': 'cabeca_anatomica',
      'nose': 'cabeca_anatomica',
      'mouth': 'cabeca_anatomica',
      'hair': 'cabeca_anatomica',
      
      // Pescoço
      'neck': 'pescoco_anatomico',
      
      // Tronco
      'torso_front': 'peito',
      'torso_back': 'coluna',
      'left_shoulder': 'ombro_esquerdo',
      'right_shoulder': 'ombro_direito',
      'left_hip': 'anca_esquerda',
      'right_hip': 'anca_direita',
      
      // Braços
      'left_upper_arm': 'ombro_esquerdo',
      'right_upper_arm': 'ombro_direito',
      'left_lower_arm': 'cotovelo_esquerdo',
      'right_lower_arm': 'cotovelo_direito',
      'left_hand': 'mao_esquerda',
      'right_hand': 'mao_direita',
      
      // Pernas
      'left_thigh': 'anca_esquerda',
      'right_thigh': 'anca_direita',
      'left_lower_leg': 'joelho_esquerdo',
      'right_lower_leg': 'joelho_direito',
      'left_foot': 'pe_esquerdo',
      'right_foot': 'pe_direito',
    };
    
    // Agrupa máscaras por região Rigby
    const rigbyMasks = new Map();
    const regionPixels = new Map(); // Para resolver sobreposições
    
    if (!personBodyParts) {
      return new Map();
    }
    
    // Obtém a silhueta real para limitar as máscaras
    const silhouetteMask = this.silhouetteAnalyzer.getSilhouetteMask();
    
    // Processa cada parte do BodyPix
    for (const [bpPart, rigbyRegion] of Object.entries(BODYPIX_TO_RIGBY)) {
      if (!personBodyParts[bpPart]) continue;
      
      const bpMask = personBodyParts[bpPart];
      if (!bpMask || !bpMask.data) continue;
      
      const bpW = bpMask.width;
      const bpH = bpMask.height;
      const bpData = bpMask.data; // RGBA
      
      // Converte máscara BodyPix (256x256) para resolução da silhueta
      const regionMask = new Uint8Array(silW * silH);
      
      // Limiar para considerar pixel como parte (alfa > threshold)
      const threshold255 = this.config.segmentationThreshold * 255;
      
      for (let y = 0; y < silH; y++) {
        for (let x = 0; x < silW; x++) {
          const silIdx = y * silW + x;
          
          // Verifica se está dentro da silhueta real
          if (!personMask[silIdx]) continue;
          
          // Mapeia coordenadas da silhueta para coordenadas BodyPix (256x256)
          const scaleX = bpMask.width / silW;
          const scaleY = bpMask.height / silH;
          const bpX = Math.floor(x * scaleX);
          const bpY = Math.floor(y * scaleY);
          
          if (bpX >= 0 && bpX < bpMask.width && bpY >= 0 && bpY < bpMask.height) {
            const bpIdx = (bpY * bpMask.width + bpX) * 4 + 3; // Canal alfa
            const alpha = bpMask.data[bpIdx];
            
            if (alpha > this.config.segmentationThreshold * 255) {
              // Cria a regionMask para esta parte
              let regionMask = rigbyMasks.get(rigbyRegion);
              if (!regionMask) {
                regionMask = new Uint8Array(silW * silH);
              }
              regionMask[silIdx] = 1;
              rigbyMasks.set(rigbyRegion, regionMask);
            }
          }
        }
      }
      
      // Resolve sobreposições: prioridade por região (ordem anatómica)
      // Se já existe pixel atribuído, decide por prioridade
      // (já tratado dentro do loop acima - sobrescreve apenas se não tinha)
    }
    
    return rigbyMasks;
  }
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
        bonePositions.set(bone.id, silPos);
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
        masks.set(regionId, mask);
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
    const charInv = this.characterObject.transform.getInverse();
    const localPos = charInv.transformPoint(worldPos.x, worldPos.y);
    
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
    
    // Helper: point in polygon test
    const pointInPolygon = (x, y, points) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x, yi = points[i].y;
        const xj = points[j].x, yj = points[j].y;
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    };
    
    // Helper: point in capsule
    const pointInCapsule = (x, y, start, end, radius) => {
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
    };
    
    // Helper: point in ellipse
    const pointInEllipse = (x, y, center, radiusX, radiusY) => {
      const dx = (x - center.x) / radiusX;
      const dy = (y - center.y) / radiusY;
      return dx * dx + dy * dy <= 1;
    };
    
    // Helper: point in rect
    const pointInRect = (x, y, center, width, height) => {
      return Math.abs(x - center.x) <= width / 2 && Math.abs(y - center.y) <= height / 2;
    };
    
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
    
    const silhouetteMask = this.silhouetteAnalyzer.getSilhouetteMask();
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
    const silhouetteMask = this.silhouetteAnalyzer.getSilhouetteMask();
    
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
          const color = regionColors[regionId] || [128, 128, 128];
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