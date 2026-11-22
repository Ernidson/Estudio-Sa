/**
 * RigEditor - Editor visual de rigging (modo "Editar Armadura")
 * Permite selecionar, mover e ajustar articulações do esqueleto.
 */

import { Transform2D, createTransform } from '../core/Transform2D.js';

export class RigEditor {
  constructor(renderer, rigRenderer, scene, selectionManager) {
    this.renderer = renderer;
    this.rigRenderer = rigRenderer;
    this.scene = scene;
    this.selectionManager = selectionManager;
    
    // Estado do editor
    this.enabled = false;
    this.rig = null;
    this.characterObject = null;
    
    // Interação
    this.isDragging = false;
    this.draggedBone = null;
    this.dragStartScreen = { x: 0, y: 0 };
    this.dragStartLocal = { x: 0, y: 0 };
    
    // Hover
    this.hoveredBone = null;
    
    // Callbacks
    this.onSelectionChange = null;
    this.onBoneMove = null;
    this.onRigReset = null;
    
    // Elementos UI
    this.panelElements = {};
  }

  /**
   * Ativa/desativa modo de edição
   */
  setEnabled(enabled, rig = null, characterObject = null) {
    this.enabled = enabled;
    
    if (enabled) {
      this.rig = rig;
      this.characterObject = characterObject;
      this.rigRenderer.showLabels = true;
      this._updateUI();
    } else {
      this.rig = null;
      this.characterObject = null;
      this.rigRenderer.showLabels = false;
      this._clearSelection();
      this._updateUI();
    }
    
    // Notifica mudança
    if (this.onRigReset) {
      this.onRigReset(enabled);
    }
  }

  /**
   * Verifica se está ativo
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Define rig atual
   */
  setRig(rig, characterObject) {
    this.rig = rig;
    this.characterObject = characterObject;
    if (this.enabled) {
      this._updateUI();
    }
  }

  /**
   * Manipula mouse down no canvas
   */
  handleMouseDown(screenX, screenY) {
    if (!this.enabled || !this.rig || !this.characterObject) return false;
    
    // Hit test em joints
    const bone = this.rigRenderer.hitTestJoint(screenX, screenY, this.rig, this.characterObject);
    
    if (bone) {
      // Seleciona bone
      this.selectBone(bone.id);
      
      // Inicia arraste
      this.isDragging = true;
      this.draggedBone = bone;
      this.dragStartScreen = { x: screenX, y: screenY };
      
      // Salva posição local inicial
      this.dragStartLocal = bone.getLocalPosition();
      
      // Muda cursor
      this.renderer.canvas.style.cursor = 'grabbing';
      
      return true;
    } else {
      // Clique em área vazia - desseleciona
      this._clearSelection();
      return false;
    }
  }

  /**
   * Manipula mouse move
   */
  handleMouseMove(screenX, screenY) {
    if (!this.enabled) return false;
    
    // Atualiza hover
    if (!this.isDragging) {
      const bone = this.rig ? this.rigRenderer.hitTestJoint(screenX, screenY, this.rig, this.characterObject) : null;
      this._setHoveredBone(bone);
    }
    
    // Arrasta bone selecionado
    if (this.isDragging && this.draggedBone) {
      this._dragBone(screenX, screenY);
      return true;
    }
    
    return false;
  }

  /**
   * Manipula mouse up
   */
  handleMouseUp(screenX, screenY) {
    if (!this.enabled) return false;
    
    if (this.isDragging) {
      this.isDragging = false;
      this.draggedBone = null;
      this.renderer.canvas.style.cursor = 'crosshair';
      
      if (this.onBoneMove) {
        this.onBoneMove(this.rig.getSelectedBone());
      }
      
      return true;
    }
    
    return false;
  }

  /**
   * Arrasta bone para nova posição
   */
  _dragBone(screenX, screenY) {
    if (!this.draggedBone || !this.rig || !this.characterObject) return;
    
    // Converte posição da tela para mundo da cena
    const worldPos = this.rigRenderer._screenToWorld(screenX, screenY);
    if (!worldPos) return;
    
    const local = this.characterObject.transform.inverseTransformPoint(worldPos.x, worldPos.y);
    this.rig.moveBoneToWorld(this.draggedBone.id, local.x, local.y);

    // Atualiza UI
    this._updatePropertiesPanel();
  }

  /**
   * Seleciona bone
   */
  selectBone(boneId) {
    if (!this.rig) return;
    
    const bone = this.rig.selectBone(boneId);
    if (bone) {
      this._updateUI();
      this._updatePropertiesPanel();
      
      if (this.onSelectionChange) {
        this.onSelectionChange(bone);
      }
    }
  }

  /**
   * Limpa seleção
   */
  _clearSelection() {
    if (this.rig) {
      this.rig.selectBone(null);
      this._updateUI();
      this._updatePropertiesPanel();
      
      if (this.onSelectionChange) {
        this.onSelectionChange(null);
      }
    }
  }

  /**
   * Atualiza bone hover
   */
  _setHoveredBone(bone) {
    if (this.hoveredBone === bone) return;
    
    if (this.hoveredBone) {
      this.hoveredBone.hovered = false;
    }
    
    this.hoveredBone = bone;
    
    if (bone) {
      bone.hovered = true;
    }
  }

  /**
   * Repor sugestão automática (reseta para preset)
   */
  async resetToPreset(presetKey = 'humanoid-back-arms-raised') {
    if (!this.rig || !this.characterObject) return;
    
    if (!confirm('Tem a certeza que quer repor a sugestão automática?\nQuaisquer ajustes manuais serão perdidos.')) {
      return;
    }
    
    // Recria rig do preset
    const { createRigFromPreset } = await import('./Rig.js');
    const newRig = createRigFromPreset(presetKey);
    
    // Copia baseTransform
    newRig.setBaseTransform(this.rig.baseTransform);
    
    // Substitui rig
    this.rig = newRig;
    this._clearSelection();
    this._updateUI();
    this._updatePropertiesPanel();
    
    if (this.onRigReset) {
      this.onRigReset(this.rig);
    }
  }

  /**
   * Alterna visibilidade do esqueleto
   */
  toggleVisibility() {
    if (this.rig) {
      this.rig.visible = !this.rig.visible;
      this._updateUI();
    }
  }

  /**
   * Alterna exibição de nomes
   */
  toggleLabels() {
    if (this.rig) {
      this.rig.showBoneNames = !this.rig.showBoneNames;
      this.rigRenderer.showLabels = this.rig.showBoneNames;
      this._updateUI();
    }
  }

  /**
   * Liga elementos do painel de propriedades
   */
  bindPanelElements(elements) {
    this.panelElements = { ...this.panelElements, ...elements };
    
    // Event listeners para inputs
    if (this.panelElements.boneName) {
      this.panelElements.boneName.addEventListener('change', () => this._onBoneNameChange());
    }
    if (this.panelElements.boneX) {
      this.panelElements.boneX.addEventListener('change', () => this._onBonePositionChange());
      this.panelElements.boneX.addEventListener('input', () => this._onBonePositionChange());
    }
    if (this.panelElements.boneY) {
      this.panelElements.boneY.addEventListener('change', () => this._onBonePositionChange());
      this.panelElements.boneY.addEventListener('input', () => this._onBonePositionChange());
    }
    if (this.panelElements.boneParent) {
      this.panelElements.boneParent.addEventListener('change', () => this._onBoneParentChange());
    }
    if (this.panelElements.boneRotation) {
      this.panelElements.boneRotation.addEventListener('change', () => this._onBoneRotationChange());
      this.panelElements.boneRotation.addEventListener('input', () => this._onBoneRotationChange());
    }
    if (this.panelElements.boneRotationSlider) {
      this.panelElements.boneRotationSlider.addEventListener('input', () => this._onBoneRotationChange());
    }
    if (this.panelElements.btnResetRig) {
      this.panelElements.btnResetRig.addEventListener('click', () => this.resetToPreset());
    }
    if (this.panelElements.btnToggleRig) {
      this.panelElements.btnToggleRig.addEventListener('click', () => this.toggleVisibility());
    }
    if (this.panelElements.btnToggleLabels) {
      this.panelElements.btnToggleLabels.addEventListener('click', () => this.toggleLabels());
    }
    if (this.panelElements.btnResetBoneRotation) {
      this.panelElements.btnResetBoneRotation.addEventListener('click', () => this._onResetBoneRotation());
    }
  }

  /**
   * Callback mudança nome do bone
   */
  _onBoneNameChange() {
    const bone = this.rig?.getSelectedBone();
    if (!bone || !this.panelElements.boneName) return;
    
    bone.name = this.panelElements.boneName.value;
    this._updateUI();
  }

  /**
   * Callback mudança posição do bone
   */
  _onBonePositionChange() {
    const bone = this.rig?.getSelectedBone();
    if (!bone) return;
    
    const x = parseFloat(this.panelElements.boneX?.value) || 0;
    const y = parseFloat(this.panelElements.boneY?.value) || 0;
    
    bone.setLocalPosition(x, y);
    this.rig.computeWorldTransforms();
    this._updatePropertiesPanel();
  }

  /**
   * Callback mudança rotação do bone
   */
  _onBoneRotationChange() {
    const bone = this.rig?.getSelectedBone();
    if (!bone) return;
    
    // Lê do input ou slider (qualquer um que disparou o evento)
    const rotation = parseFloat(
      this.panelElements.boneRotation?.value || 
      this.panelElements.boneRotationSlider?.value || 
      0
    );
    
    bone.setLocalRotation(rotation);
    
    // Sincroniza input e slider
    if (this.panelElements.boneRotation) {
      this.panelElements.boneRotation.value = rotation.toFixed(1);
    }
    if (this.panelElements.boneRotationSlider) {
      this.panelElements.boneRotationSlider.value = rotation.toFixed(1);
    }
    
    this.rig.computeWorldTransforms();
    this._updatePropertiesPanel();
  }

  /**
   * Callback reset rotação do bone
   */
  _onResetBoneRotation() {
    const bone = this.rig?.getSelectedBone();
    if (!bone) return;
    
    bone.setLocalRotation(0);
    
    // Atualiza UI
    if (this.panelElements.boneRotation) {
      this.panelElements.boneRotation.value = '0';
    }
    if (this.panelElements.boneRotationSlider) {
      this.panelElements.boneRotationSlider.value = '0';
    }
    
    this.rig.computeWorldTransforms();
    this._updatePropertiesPanel();
  }

  /**
   * Callback mudança pai do bone
   */
  _onBoneParentChange() {
    const bone = this.rig?.getSelectedBone();
    if (!bone || !this.panelElements.boneParent) return;
    
    const newParentId = this.panelElements.boneParent.value || null;
    
    if (newParentId && newParentId !== bone.parentId) {
      // Verifica se não cria ciclo
      const newParent = this.rig.getBone(newParentId);
      if (newParent && !bone.isAncestorOf(newParent)) {
        // Remove do pai atual
        if (bone.parent) {
          bone.parent.removeChild(bone);
        }
        // Adiciona ao novo pai
        newParent.addChild(bone);
        this.rig.computeWorldTransforms();
        this._updatePropertiesPanel();
      }
    }
  }

  /**
   * Atualiza painel de propriedades do bone selecionado
   */
  _updatePropertiesPanel() {
    const bone = this.rig?.getSelectedBone();
    
    if (!bone) {
      this._showNoSelection();
      return;
    }
    
    this._showBoneProperties(bone);
  }

  /**
   * Mostra propriedades do bone
   */
  _showBoneProperties(bone) {
    const form = this.panelElements.bonePropertiesForm;
    const noSel = this.panelElements.noBoneSelected;
    
    if (form) form.classList.remove('hidden');
    if (noSel) noSel.classList.add('hidden');
    
    const localPos = bone.getLocalPosition();
    const worldPos = bone.getWorldPoint();
    const localRotation = bone.getLocalRotation();
    
    if (this.panelElements.boneName) this.panelElements.boneName.value = bone.name;
    if (this.panelElements.boneX) this.panelElements.boneX.value = localPos.x.toFixed(1);
    if (this.panelElements.boneY) this.panelElements.boneY.value = localPos.y.toFixed(1);
    if (this.panelElements.boneRotation) this.panelElements.boneRotation.value = localRotation.toFixed(1);
    if (this.panelElements.boneRotationSlider) this.panelElements.boneRotationSlider.value = localRotation.toFixed(1);
    if (this.panelElements.boneWorldX) this.panelElements.boneWorldX.textContent = worldPos.x.toFixed(1);
    if (this.panelElements.boneWorldY) this.panelElements.boneWorldY.textContent = worldPos.y.toFixed(1);
    if (this.panelElements.boneSide) this.panelElements.boneSide.textContent = bone.side;
    if (this.panelElements.boneType) this.panelElements.boneType.textContent = bone.type;
    
    // Atualiza dropdown de pai
    if (this.panelElements.boneParent) {
      const currentParentId = bone.parentId;
      this.panelElements.boneParent.innerHTML = '<option value="">(nenhum - raiz)</option>';
      
      for (const b of this.rig.getAllBones()) {
        if (b.id !== bone.id && !bone.isAncestorOf(b)) {
          const option = document.createElement('option');
          option.value = b.id;
          option.textContent = `${b.name} (${b.id})`;
          if (b.id === currentParentId) option.selected = true;
          this.panelElements.boneParent.appendChild(option);
        }
      }
    }
  }

  /**
   * Mostra estado sem seleção
   */
  _showNoSelection() {
    const form = this.panelElements.bonePropertiesForm;
    const noSel = this.panelElements.noBoneSelected;
    
    if (form) form.classList.add('hidden');
    if (noSel) noSel.classList.remove('hidden');
  }

  /**
   * Atualiza UI geral (botões, estado)
   */
  _updateUI() {
    // Botão toggle rig
    if (this.panelElements.btnToggleRig) {
      this.panelElements.btnToggleRig.textContent = this.rig?.visible ? 'Ocultar Armadura' : 'Mostrar Armadura';
      this.panelElements.btnToggleRig.classList.toggle('active', this.rig?.visible);
    }
    
    // Botão toggle labels
    if (this.panelElements.btnToggleLabels) {
      this.panelElements.btnToggleLabels.textContent = this.rig?.showBoneNames ? 'Ocultar Nomes' : 'Mostrar Nomes';
      this.panelElements.btnToggleLabels.classList.toggle('active', this.rig?.showBoneNames);
    }
    
    // Painel lateral (hierarquia)
    this._updateHierarchyPanel();
  }

  /**
   * Atualiza painel de hierarquia
   */
  _updateHierarchyPanel() {
    const list = this.panelElements.hierarchyList;
    if (!list || !this.rig) return;
    
    list.innerHTML = '';
    
    const bones = this.rig.getBonesHierarchical();
    
    for (const bone of bones) {
      const li = document.createElement('li');
      li.className = 'rig-hierarchy-item' + (bone.selected ? ' selected' : '');
      li.dataset.boneId = bone.id;
      
      const indent = bone.getAncestors().length * 16;
      li.style.paddingLeft = `${indent}px`;
      
      li.innerHTML = `
        <span class="rig-bone-name" style="color: ${bone.color}">${bone.name}</span>
        <span class="rig-bone-side">${bone.side !== 'center' ? ` [${bone.side}]` : ''}</span>
      `;
      
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectBone(bone.id);
      });
      
      list.appendChild(li);
    }
  }
}

/**
 * Cria UI de rigging no painel lateral
 */
export function createRiggingUI() {
  return {
    // Painel de propriedades do bone
    bonePropertiesForm: null,
    noBoneSelected: null,
    boneName: null,
    boneX: null,
    boneY: null,
    boneWorldX: null,
    boneWorldY: null,
    boneSide: null,
    boneType: null,
    boneParent: null,
    
    // Botões
    btnResetRig: null,
    btnToggleRig: null,
    btnToggleLabels: null,
    
    // Hierarquia
    hierarchyList: null
  };
}