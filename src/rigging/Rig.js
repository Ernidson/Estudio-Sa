/**
 * Rig - Gerencia o esqueleto completo (hierarquia de bones)
 * Responsável por coordenar bones, calcular transformações mundiais,
 * serialização e busca.
 */

import { Bone, createBone } from './Bone.js';
import { Transform2D, createTransform } from '../core/Transform2D.js';
import { generateId } from '../editor/ImageImporter.js';

export class Rig {
  constructor(data = {}) {
    this.id = data.id || generateId('rig');
    this.name = data.name || 'Rig';
    this.version = data.version || '1.0.0';
    
    // Bones indexados por ID
    this.bones = new Map();
    
    // Raiz do esqueleto (bacia)
    this.rootBoneId = data.rootBoneId || null;
    
    // Transformação base do personagem (para alinhar com a imagem)
    this.baseTransform = data.baseTransform ? Transform2D.fromJSON(data.baseTransform) : createTransform();
    
    // Configurações visuais
    this.visible = data.visible !== false;
    this.showBoneNames = data.showBoneNames || false;
    this.boneThickness = data.boneThickness || 3;
    this.jointRadius = data.jointRadius || 6;
    
    // Seleção
    this.selectedBoneId = data.selectedBoneId || null;
    
    // Metadados do preset usado
    this.preset = data.preset || null;
    this.presetVersion = data.presetVersion || 1;
  }

  /**
   * Adiciona um bone ao rig
   */
  addBone(bone, parentId = null) {
    if (!(bone instanceof Bone)) {
      bone = new Bone(bone);
    }
    
    this.bones.set(bone.id, bone);
    
    if (parentId) {
      const parent = this.bones.get(parentId);
      if (parent) {
        parent.addChild(bone);
      } else {
        console.warn(`Pai ${parentId} não encontrado para bone ${bone.id}`);
      }
    } else if (!this.rootBoneId) {
      // Primeiro bone vira raiz
      this.rootBoneId = bone.id;
    }
    
    return bone;
  }

  /**
   * Remove bone e todos seus descendentes
   */
  removeBone(boneId) {
    const bone = this.bones.get(boneId);
    if (!bone) return false;
    
    // Remove descendentes primeiro
    const descendants = bone.getAllDescendants();
    for (const descendant of descendants) {
      this.bones.delete(descendant.id);
    }
    
    // Remove do pai
    if (bone.parent) {
      bone.parent.removeChild(bone);
    }
    
    // Se era raiz, define nova raiz
    if (this.rootBoneId === boneId) {
      this.rootBoneId = null;
      // Tenta encontrar outro bone sem pai
      for (const b of this.bones.values()) {
        if (!b.parent) {
          this.rootBoneId = b.id;
          break;
        }
      }
    }
    
    this.bones.delete(boneId);
    
    // Limpa seleção se era o selecionado
    if (this.selectedBoneId === boneId) {
      this.selectedBoneId = null;
    }
    
    return true;
  }

  /**
   * Obtém bone por ID
   */
  getBone(boneId) {
    return this.bones.get(boneId);
  }

  /**
   * Obtém raiz
   */
  getRoot() {
    return this.rootBoneId ? this.bones.get(this.rootBoneId) : null;
  }

  /**
   * Obtém todos os bones como array
   */
  getAllBones() {
    return Array.from(this.bones.values());
  }

  /**
   * Obtém bones em ordem de hierarquia (pai antes dos filhos)
   */
  getBonesHierarchical() {
    const result = [];
    const root = this.getRoot();
    if (root) {
      this._collectHierarchical(root, result);
    }
    return result;
  }

  _collectHierarchical(bone, result) {
    result.push(bone);
    for (const child of bone.children) {
      this._collectHierarchical(child, result);
    }
  }

  /**
   * Recalcula todas as transformações mundiais
   */
  computeWorldTransforms() {
    const root = this.getRoot();
    if (root) {
      root.computeWorldTransform(this.baseTransform);
    }
  }

  /**
   * Define transformação base (alinhamento com imagem)
   */
  setBaseTransform(transform) {
    this.baseTransform = transform instanceof Transform2D ? transform.clone() : Transform2D.fromJSON(transform);
    this.computeWorldTransforms();
  }

  /**
   * Seleciona bone
   */
  selectBone(boneId) {
    if (this.bones.has(boneId)) {
      // Desseleciona anterior
      if (this.selectedBoneId) {
        const prev = this.bones.get(this.selectedBoneId);
        if (prev) prev.selected = false;
      }
      this.selectedBoneId = boneId;
      const bone = this.bones.get(boneId);
      if (bone) bone.selected = true;
      return bone;
    }
    this.selectedBoneId = null;
    return null;
  }

  /**
   * Obtém bone selecionado
   */
  getSelectedBone() {
    return this.selectedBoneId ? this.bones.get(this.selectedBoneId) : null;
  }

  /**
   * Move bone para nova posição mundial
   * Atualiza posição local mantendo hierarquia
   */
  moveBoneToWorld(boneId, worldX, worldY) {
    const bone = this.bones.get(boneId);
    if (!bone) return false;
    
    // Converte coordenada mundial para local relativa ao pai
    let localPos;
    if (bone.parent) {
      const parentWorld = bone.parent.worldTransform;
      localPos = parentWorld.inverseTransformPoint(worldX, worldY);
    } else {
      // Raiz: mundo = local (com baseTransform)
      const invBase = this.baseTransform.getInverse();
      localPos = invBase.transformPoint(worldX, worldY);
    }
    
    bone.setLocalPosition(localPos.x, localPos.y);
    this.computeWorldTransforms();
    return true;
  }

  /**
   * Busca bone por nome (case-insensitive, partial match)
   */
  findBoneByName(name) {
    const lower = name.toLowerCase();
    for (const bone of this.bones.values()) {
      if (bone.name.toLowerCase().includes(lower)) {
        return bone;
      }
    }
    return null;
  }

  /**
   * Obtém bones por lado
   */
  getBonesBySide(side) {
    return this.getAllBones().filter(b => b.side === side);
  }

  /**
   * Serialização para JSON
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      rootBoneId: this.rootBoneId,
      baseTransform: this.baseTransform.toJSON(),
      visible: this.visible,
      showBoneNames: this.showBoneNames,
      boneThickness: this.boneThickness,
      jointRadius: this.jointRadius,
      selectedBoneId: this.selectedBoneId,
      preset: this.preset,
      presetVersion: this.presetVersion,
      bones: this.getAllBones().map(b => b.toJSON())
    };
  }

  /**
   * Cria rig a partir de JSON
   */
  static fromJSON(data) {
    const rig = new Rig(data);
    
    // Primeiro cria todos os bones
    if (data.bones) {
      for (const boneData of data.bones) {
        const bone = Bone.fromJSON(boneData);
        rig.bones.set(bone.id, bone);
      }
    }
    
    // Depois reconstrói hierarquia
    if (data.bones) {
      for (const boneData of data.bones) {
        const bone = rig.bones.get(boneData.id);
        if (boneData.parentId) {
          const parent = rig.bones.get(boneData.parentId);
          if (parent) {
            parent.addChild(bone);
          }
        }
      }
    }
    
    // Recalcula transformações
    rig.computeWorldTransforms();
    
    return rig;
  }

  /**
   * Clona rig completo
   */
  clone() {
    return Rig.fromJSON(this.toJSON());
  }

  /**
   * Limpa rig
   */
  clear() {
    this.bones.clear();
    this.rootBoneId = null;
    this.selectedBoneId = null;
    this.baseTransform.reset();
  }
}

/**
 * Presets de rigging pré-definidos
 */
export const RIG_PRESETS = {
  'humanoid-back-arms-raised': {
    name: 'Humanoide — Costas — Braços elevados',
    version: 3,
    description: 'Preset calibrado para treinador (200x400): pelve no centro, braços elevados, pernas proporcionais',
    bones: [
      // Raiz: Bacia (centro dos quadris, aproximadamente y=200 na imagem 400px)
      { id: 'pelvis', name: 'Bacia', localPosition: { x: 0, y: 0 }, length: 0, side: 'center', type: 'joint' },
      
      // Coluna vertebral (subindo do centro da pelve)
      { id: 'spine', name: 'Coluna', parentId: 'pelvis', localPosition: { x: 0, y: -40 }, length: 40, side: 'center', type: 'joint' },
      { id: 'chest', name: 'Peito', parentId: 'spine', localPosition: { x: 0, y: -45 }, length: 45, side: 'center', type: 'joint' },
      
      // Pescoço e cabeça
      { id: 'neck', name: 'Pescoço', parentId: 'chest', localPosition: { x: 0, y: -30 }, length: 30, side: 'center', type: 'joint' },
      { id: 'head', name: 'Cabeça', parentId: 'neck', localPosition: { x: 0, y: -35 }, length: 35, side: 'center', type: 'end' },
      
      // Braço esquerdo (elevado - cotovelos acima dos ombros, pulsos perto da cabeça)
      { id: 'l_shoulder', name: 'Ombro Esquerdo', parentId: 'chest', localPosition: { x: -30, y: 0 }, length: 0, side: 'left', type: 'joint' },
      { id: 'l_elbow', name: 'Cotovelo Esquerdo', parentId: 'l_shoulder', localPosition: { x: -25, y: -25 }, length: 45, side: 'left', type: 'joint' },
      { id: 'l_wrist', name: 'Pulso Esquerdo', parentId: 'l_elbow', localPosition: { x: -10, y: -25 }, length: 40, side: 'left', type: 'end' },
      
      // Braço direito (elevado)
      { id: 'r_shoulder', name: 'Ombro Direito', parentId: 'chest', localPosition: { x: 30, y: 0 }, length: 0, side: 'right', type: 'joint' },
      { id: 'r_elbow', name: 'Cotovelo Direito', parentId: 'r_shoulder', localPosition: { x: 25, y: -25 }, length: 45, side: 'right', type: 'joint' },
      { id: 'r_wrist', name: 'Pulso Direito', parentId: 'r_elbow', localPosition: { x: 10, y: -25 }, length: 40, side: 'right', type: 'end' },
      
      // Perna esquerda (descendo)
      { id: 'l_hip', name: 'Anca Esquerda', parentId: 'pelvis', localPosition: { x: -15, y: 20 }, length: 0, side: 'left', type: 'joint' },
      { id: 'l_knee', name: 'Joelho Esquerdo', parentId: 'l_hip', localPosition: { x: 0, y: 45 }, length: 45, side: 'left', type: 'joint' },
      { id: 'l_ankle', name: 'Tornozelo Esquerdo', parentId: 'l_knee', localPosition: { x: 0, y: 45 }, length: 45, side: 'left', type: 'end' },
      
      // Perna direita
      { id: 'r_hip', name: 'Anca Direita', parentId: 'pelvis', localPosition: { x: 15, y: 20 }, length: 0, side: 'right', type: 'joint' },
      { id: 'r_knee', name: 'Joelho Direito', parentId: 'r_hip', localPosition: { x: 0, y: 45 }, length: 45, side: 'right', type: 'joint' },
      { id: 'r_ankle', name: 'Tornozelo Direito', parentId: 'r_knee', localPosition: { x: 0, y: 45 }, length: 45, side: 'right', type: 'end' }
    ]
  },
  
  'humanoid-work-reference': {
    name: 'Humanoide — Referência Work (1024×1536)',
    version: 1,
    description: 'Calibração baseada no Rigby Auto-Rig 2D Work v0.4 (15 juntas originais + 2 estimadas). Coordenadas convertidas do Work (topo-esquerdo) para Studio (centro). Imagem 1024x1536.',
    bones: [
      // Raiz: Bacia (centro dos quadris)
      { id: 'bacia', name: 'Bacia', localPosition: { x: 0.0, y: 22.0 }, length: 0, side: 'center', type: 'joint' },
      
      // Coluna vertebral (subindo)
      { id: 'coluna', name: 'Coluna', parentId: 'bacia', localPosition: { x: 0.0, y: -180.0 }, length: 180, side: 'center', type: 'joint' },
      { id: 'peito', name: 'Peito', parentId: 'coluna', localPosition: { x: 0.0, y: -135.0 }, length: 135, side: 'center', type: 'joint' },
      
      // Pescoço e cabeça
      { id: 'pescoco', name: 'Pescoço', parentId: 'peito', localPosition: { x: 0.0, y: -45.0 }, length: 45, side: 'center', type: 'joint' },
      { id: 'cabeca', name: 'Cabeça', parentId: 'pescoco', localPosition: { x: 0.0, y: -160.0 }, length: 160, side: 'center', type: 'end' },
      
      // Braço esquerdo (elevado)
      { id: 'ombro_esquerdo', name: 'Ombro Esquerdo', parentId: 'peito', localPosition: { x: -139.0, y: -39.0 }, length: 0, side: 'left', type: 'joint' },
      { id: 'cotovelo_esquerdo', name: 'Cotovelo Esquerdo', parentId: 'ombro_esquerdo', localPosition: { x: -53.0, y: -172.0 }, length: 172, side: 'left', type: 'joint' },
      { id: 'pulso_esquerdo', name: 'Pulso Esquerdo', parentId: 'cotovelo_esquerdo', localPosition: { x: -21.0, y: -189.0 }, length: 189, side: 'left', type: 'end' },
      
      // Braço direito (elevado)
      { id: 'ombro_direito', name: 'Ombro Direito', parentId: 'peito', localPosition: { x: 138.0, y: -39.0 }, length: 0, side: 'right', type: 'joint' },
      { id: 'cotovelo_direito', name: 'Cotovelo Direito', parentId: 'ombro_direito', localPosition: { x: 53.0, y: -172.0 }, length: 172, side: 'right', type: 'joint' },
      { id: 'pulso_direito', name: 'Pulso Direito', parentId: 'cotovelo_direito', localPosition: { x: 21.0, y: -189.0 }, length: 189, side: 'right', type: 'end' },
      
      // Perna esquerda
      { id: 'anca_esquerda', name: 'Anca Esquerda', parentId: 'bacia', localPosition: { x: -62.0, y: 30.0 }, length: 0, side: 'left', type: 'joint' },
      { id: 'joelho_esquerdo', name: 'Joelho Esquerdo', parentId: 'anca_esquerda', localPosition: { x: -18.0, y: 290.0 }, length: 290, side: 'left', type: 'joint' },
      { id: 'tornozelo_esquerdo', name: 'Tornozelo Esquerdo', parentId: 'joelho_esquerdo', localPosition: { x: 33.0, y: 290.0 }, length: 290, side: 'left', type: 'end' },
      
      // Perna direita
      { id: 'anca_direita', name: 'Anca Direita', parentId: 'bacia', localPosition: { x: 53.0, y: 30.0 }, length: 0, side: 'right', type: 'joint' },
      { id: 'joelho_direito', name: 'Joelho Direito', parentId: 'anca_direita', localPosition: { x: 12.0, y: 290.0 }, length: 290, side: 'right', type: 'joint' },
      { id: 'tornozelo_direito', name: 'Tornozelo Direito', parentId: 'joelho_direito', localPosition: { x: -29.0, y: 290.0 }, length: 290, side: 'right', type: 'end' }
    ]
  }
};

/**
 * Cria rig a partir de preset
 */
export function createRigFromPreset(presetKey, options = {}) {
  const preset = RIG_PRESETS[presetKey];
  if (!preset) {
    throw new Error(`Preset não encontrado: ${presetKey}`);
  }
  
  const rig = new Rig({
    name: options.name || preset.name,
    preset: presetKey,
    presetVersion: preset.version
  });
  
  // Cria bones
  const boneMap = new Map();
  for (const boneData of preset.bones) {
    const bone = createBone(boneData.name, boneData.localPosition, {
      length: boneData.length,
      side: boneData.side,
      type: boneData.type,
      color: boneData.side === 'left' ? '#e74c3c' : (boneData.side === 'right' ? '#3498db' : '#2ecc71')
    });
    bone.id = boneData.id; // Usa ID fixo do preset
    rig.addBone(bone, boneData.parentId || null);
    boneMap.set(boneData.id, bone);
  }
  
  // Recalcula transformações
  rig.computeWorldTransforms();
  
  return rig;
}