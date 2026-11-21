/**
 * Selection - Sistema de seleção e interação com objetos
 */

import { Transform2D } from '../core/Transform2D.js';

export class SelectionManager {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;

    // Estado de seleção
    this.selectedObject = null;
    this.hoveredObject = null;

    // Estado de interação
    this.isDragging = false;
    this.dragStartWorld = { x: 0, y: 0 };
    this.dragStartTransform = null;
    this.dragType = null; // 'move', 'rotate', 'scale'
    this.dragHandle = null; // Para escala/rotação futura

    // Callbacks
    this.onSelectionChange = null;
    this.onTransformChange = null;
  }

  /**
   * Define callback para mudança de seleção
   */
  setSelectionChangeCallback(callback) {
    this.onSelectionChange = callback;
  }

  /**
   * Define callback para mudança de transformação
   */
  setTransformChangeCallback(callback) {
    this.onTransformChange = callback;
  }

  /**
   * Seleciona um objeto
   */
  selectObject(obj) {
    if (this.selectedObject === obj) return;

    this.selectedObject = obj;
    this.renderer.setSelection(obj);

    if (this.onSelectionChange) {
      this.onSelectionChange(obj);
    }
  }

  /**
   * Limpa seleção
   */
  clearSelection() {
    if (this.selectedObject) {
      this.selectedObject = null;
      this.renderer.clearSelection();

      if (this.onSelectionChange) {
        this.onSelectionChange(null);
      }
    }
  }

  /**
   * Obtém objeto selecionado
   */
  getSelectedObject() {
    return this.selectedObject;
  }

  /**
   * Processa clique no canvas
   */
  handleClick(screenX, screenY) {
    const world = this.renderer.screenToWorld(screenX, screenY);
    const obj = this.scene.getObjectAt(world.x, world.y);

    if (obj) {
      this.selectObject(obj);
    } else {
      this.clearSelection();
    }

    return obj;
  }

  /**
   * Inicia arraste
   */
  handleDragStart(screenX, screenY) {
    if (!this.selectedObject) return false;

    const world = this.renderer.screenToWorld(screenX, screenY);
    this.dragStartWorld = { x: world.x, y: world.y };
    this.dragStartTransform = this.selectedObject.transform.clone();
    this.isDragging = true;
    this.dragType = 'move';

    return true;
  }

  /**
   * Processa arraste
   */
  handleDragMove(screenX, screenY) {
    if (!this.isDragging || !this.selectedObject) return false;

    const world = this.renderer.screenToWorld(screenX, screenY);
    const dx = world.x - this.dragStartWorld.x;
    const dy = world.y - this.dragStartWorld.y;

    // Aplica translação relativa à transformação inicial
    this.selectedObject.transform.copy(this.dragStartTransform);
    this.selectedObject.transform.translate(dx, dy);

    if (this.onTransformChange) {
      this.onTransformChange(this.selectedObject);
    }

    return true;
  }

  /**
   * Finaliza arraste
   */
  handleDragEnd(screenX, screenY) {
    if (!this.isDragging) return false;

    this.isDragging = false;
    this.dragType = null;
    return true;
  }

  /**
   * Atualiza transformação via controles numéricos
   */
  updateTransformFromControls(x, y, rotation, scaleX, scaleY) {
    if (!this.selectedObject) return false;

    this.selectedObject.transform.compose(x, y, rotation, scaleX, scaleY);

    if (this.onTransformChange) {
      this.onTransformChange(this.selectedObject);
    }

    return true;
  }

  /**
   * Repor transformação do objeto selecionado
   */
  resetSelectedTransform() {
    if (!this.selectedObject) return false;

    this.selectedObject.transform.reset();
    // Reposiciona no centro da cena
    this.selectedObject.transform.translate(0, 0);

    if (this.onTransformChange) {
      this.onTransformChange(this.selectedObject);
    }

    return true;
  }

  /**
   * Verifica se está arrastando
   */
  getIsDragging() {
    return this.isDragging;
  }

  /**
   * Atualiza objeto hover (para feedback visual)
   */
  updateHover(screenX, screenY) {
    const world = this.renderer.screenToWorld(screenX, screenY);
    this.hoveredObject = this.scene.getObjectAt(world.x, world.y);
    return this.hoveredObject;
  }

  /**
   * Obtém objeto hover
   */
  getHoveredObject() {
    return this.hoveredObject;
  }
}

/**
 * Controles de transformação para UI
 */
export class TransformControls {
  constructor(selectionManager) {
    this.selectionManager = selectionManager;

    // Elementos do formulário
    this.formElements = {
      name: null,
      x: null,
      y: null,
      rotation: null,
      scaleX: null,
      scaleY: null,
      resetBtn: null
    };

    // Estado
    this.updatingFromObject = false;
  }

  /**
   * Liga elementos do DOM
   */
  bindElements(elements) {
    this.formElements = { ...this.formElements, ...elements };

    // Event listeners
    if (this.formElements.x) {
      this.formElements.x.addEventListener('change', () => this.onInputChange());
      this.formElements.x.addEventListener('input', () => this.onInputChange());
    }
    if (this.formElements.y) {
      this.formElements.y.addEventListener('change', () => this.onInputChange());
      this.formElements.y.addEventListener('input', () => this.onInputChange());
    }
    if (this.formElements.rotation) {
      this.formElements.rotation.addEventListener('change', () => this.onInputChange());
      this.formElements.rotation.addEventListener('input', () => this.onInputChange());
    }
    if (this.formElements.scaleX) {
      this.formElements.scaleX.addEventListener('change', () => this.onInputChange());
      this.formElements.scaleX.addEventListener('input', () => this.onInputChange());
    }
    if (this.formElements.scaleY) {
      this.formElements.scaleY.addEventListener('change', () => this.onInputChange());
      this.formElements.scaleY.addEventListener('input', () => this.onInputChange());
    }
    if (this.formElements.resetBtn) {
      this.formElements.resetBtn.addEventListener('click', () => this.onResetClick());
    }
  }

  /**
   * Atualiza UI a partir do objeto selecionado
   */
  updateFromObject(obj) {
    this.updatingFromObject = true;

    if (obj) {
      // Mostra formulário
      const form = document.getElementById('properties-form');
      const noSel = document.getElementById('no-selection');
      if (form) form.classList.remove('hidden');
      if (noSel) noSel.classList.add('hidden');

      const decomp = obj.transform.decompose();

      if (this.formElements.name) {
        this.formElements.name.value = obj.name;
      }
      if (this.formElements.x) {
        this.formElements.x.value = decomp.x.toFixed(2);
      }
      if (this.formElements.y) {
        this.formElements.y.value = decomp.y.toFixed(2);
      }
      if (this.formElements.rotation) {
        this.formElements.rotation.value = decomp.rotation.toFixed(1);
      }
      if (this.formElements.scaleX) {
        this.formElements.scaleX.value = decomp.scaleX.toFixed(2);
      }
      if (this.formElements.scaleY) {
        this.formElements.scaleY.value = decomp.scaleY.toFixed(2);
      }
    } else {
      // Esconde formulário
      const form = document.getElementById('properties-form');
      const noSel = document.getElementById('no-selection');
      if (form) form.classList.add('hidden');
      if (noSel) noSel.classList.remove('hidden');
    }

    this.updatingFromObject = false;
  }

  /**
   * Callback de mudança nos inputs
   */
  onInputChange() {
    if (this.updatingFromObject) return;

    const obj = this.selectionManager.getSelectedObject();
    if (!obj) return;

    const x = parseFloat(this.formElements.x?.value) || 0;
    const y = parseFloat(this.formElements.y?.value) || 0;
    const rotation = parseFloat(this.formElements.rotation?.value) || 0;
    const scaleX = parseFloat(this.formElements.scaleX?.value) || 1;
    const scaleY = parseFloat(this.formElements.scaleY?.value) || 1;

    this.selectionManager.updateTransformFromControls(x, y, rotation, scaleX, scaleY);
  }

  /**
   * Callback de botão resetar
   */
  onResetClick() {
    this.selectionManager.resetSelectedTransform();
    this.updateFromObject(this.selectionManager.getSelectedObject());
  }
}