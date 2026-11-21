/**
 * Rigby Studio 2D - Ponto de entrada principal
 */

import { Scene, SceneObject } from './core/Scene.js';
import { Renderer } from './core/Renderer.js';
import { projectStorage } from './core/ProjectStorage.js';
import { SelectionManager, TransformControls } from './editor/Selection.js';
import { ImageImporterUI, createSceneObjectFromFile } from './editor/ImageImporter.js';
import { Rig, createRigFromPreset, RIG_PRESETS } from './rigging/Rig.js';
import { RigRenderer } from './rigging/RigRenderer.js';
import { RigEditor, createRiggingUI } from './rigging/RigEditor.js';
import { estimateRigForImage, detectBestPreset } from './rigging/RigEstimator.js';
import { PartManager } from './parts/PartManager.js';
import { PartRenderer } from './parts/PartRenderer.js';
import { PieceMap } from './parts/PieceMap.js';

// Estado global da aplicação
const app = {
  scene: null,
  renderer: null,
  selectionManager: null,
  transformControls: null,
  imageImporter: null,
  canvas: null,
  isMouseDown: false,
  lastMousePos: { x: 0, y: 0 },
  isDragOver: false,
  
  // Rigging (Fase 2)
  rigEditor: null,
  riggingUI: null,
  isRiggingMode: false,
  currentCharacterObject: null,
  
  // Partes recortadas (Fase 2B)
  partManager: null,
  partRenderer: null,
  isCuttingMode: false,
  cuttingData: null,
  
  // Mapa de Peças (Fase 2B.1)
  pieceMap: null,
  isPieceMapMode: false
};

/**
 * Inicializa a aplicação
 */
async function init() {
  // Obtém elementos DOM
  app.canvas = document.getElementById('main-canvas');

  // Cena
  app.scene = new Scene();

  // Renderer
  app.renderer = new Renderer(app.canvas);

  // Selection Manager
  app.selectionManager = new SelectionManager(app.renderer, app.scene);
  app.selectionManager.setSelectionChangeCallback(onSelectionChange);
  app.selectionManager.setTransformChangeCallback(onTransformChange);

  // Transform Controls
  app.transformControls = new TransformControls(app.selectionManager);
  app.transformControls.bindElements({
    name: document.getElementById('prop-name'),
    x: document.getElementById('prop-x'),
    y: document.getElementById('prop-y'),
    rotation: document.getElementById('prop-rotation'),
    scaleX: document.getElementById('prop-scale-x'),
    scaleY: document.getElementById('prop-scale-y'),
    resetBtn: document.getElementById('btn-reset-transform')
  });

  // Image Importer
  app.imageImporter = new ImageImporterUI(app.scene, app.selectionManager, app.renderer);
  app.imageImporter.bindInput(document.getElementById('file-import-png'));

  // Rigging (Fase 2)
  app.rigEditor = new RigEditor(
    app.renderer,
    app.renderer.rigRenderer,
    app.scene,
    app.selectionManager
  );
  
  app.riggingUI = createRiggingUI();
  
  // Configura callbacks do rig editor
  app.rigEditor.onSelectionChange = onRigBoneSelectionChange;
  app.rigEditor.onBoneMove = onRigBoneMove;
  app.rigEditor.onRigReset = onRigReset;
  
  // Liga elementos UI do rigging
  app.rigEditor.bindPanelElements({
    // Painel de propriedades do bone
    bonePropertiesForm: document.getElementById('bone-properties-form'),
    noBoneSelected: document.getElementById('no-bone-selected'),
    boneName: document.getElementById('bone-prop-name'),
    boneX: document.getElementById('bone-prop-x'),
    boneY: document.getElementById('bone-prop-y'),
    boneWorldX: document.getElementById('bone-prop-world-x'),
    boneWorldY: document.getElementById('bone-prop-world-y'),
    boneSide: document.getElementById('bone-prop-side'),
    boneType: document.getElementById('bone-prop-type'),
    boneParent: document.getElementById('bone-prop-parent'),
    
    // Botões
    btnResetRig: document.getElementById('btn-reset-rig'),
    btnToggleRig: document.getElementById('btn-toggle-rig'),
    btnToggleLabels: document.getElementById('btn-toggle-labels'),
    
    // Hierarquia
    hierarchyList: document.getElementById('rig-hierarchy-list')
  });

  // Partes recortadas (Fase 2B)
  app.partManager = new PartManager(
    null, // characterObject será definido ao entrar no modo de recorte
    null, // rig será definido ao entrar no modo de recorte
    app.renderer.rigRenderer,
    app.renderer
  );
  
  app.partRenderer = new PartRenderer(app.renderer);
  
  // Mapa de Peças (Fase 2B.1)
  app.pieceMap = null;
  
  // Event listeners
  setupEventListeners();

  // Redimensionamento inicial
  window.addEventListener('resize', onResize);
  onResize();

  // Cria novo projeto
  projectStorage.createNewProject();
  app.scene.name = projectStorage.getCurrentProject().name;

  // Loop de renderização
  requestAnimationFrame(renderLoop);

  updateStatus('Pronto');
  updateLayersPanel();
  
  // Expose app globally for debugging/calibration
  window.app = app;
}

/**
 * Loop de renderização
 */
function renderLoop() {
  // Render cena normal (inclui rig)
  app.renderer.render(app.scene);
  
  // Render peças recortadas por cima
  if (app.partManager && app.partRenderer && app.currentCharacterObject) {
    app.partRenderer.drawParts(app.partManager, app.currentCharacterObject);
  }
  
  // Render preview de recorte se no modo de recorte
  if (app.isCuttingMode && app.cuttingData && app.partManager && app.partRenderer) {
    drawCuttingPreview();
  }
  
  // Render Mapa de Peças
  if (app.isPieceMapMode && app.pieceMap) {
    app.pieceMap.draw(app.renderer.ctx, app.renderer.viewport);
  }
  
  requestAnimationFrame(renderLoop);
}

/**
 * Callback de mudança de seleção
 */
function onSelectionChange(obj) {
  app.transformControls.updateFromObject(obj);
  updateLayersPanel();
  updateStatus(obj ? `Selecionado: ${obj.name}` : 'Nenhum objeto selecionado');
}

/**
 * Callback de mudança de transformação
 */
function onTransformChange(obj) {
  app.transformControls.updateFromObject(obj);
  updateStatus(`Transformado: ${obj.name}`);
}

/**
 * Callback de seleção de bone no rig
 */
function onRigBoneSelectionChange(bone) {
  if (bone) {
    updateStatus(`Bone selecionado: ${bone.name}`);
  } else {
    updateStatus('Nenhum bone selecionado');
  }
}

/**
 * Callback de movimento de bone
 */
function onRigBoneMove(bone) {
  if (bone) {
    updateStatus(`Bone movido: ${bone.name}`);
  }
}

/**
 * Callback de reset do rig
 */
function onRigReset(rig) {
  if (rig) {
    updateStatus('Armadura reposta para sugestão automática');
  }
}

/**
 * Atualiza painel de camadas
 */
function updateLayersPanel() {
  const list = document.getElementById('layers-list');
  if (!list) return;

  list.innerHTML = '';

  // Ordena por layerOrder (maior por cima)
  const objects = [...app.scene.objects].sort((a, b) => a.layerOrder - b.layerOrder);

  for (const obj of objects) {
    const li = document.createElement('li');
    li.className = 'layer-item' + (obj === app.selectionManager.getSelectedObject() ? ' selected' : '');
    li.dataset.id = obj.id;

    li.innerHTML = `
      <div class="layer-visibility" title="${obj.visible ? 'Ocultar' : 'Mostrar'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </div>
      <span class="layer-name">${escapeHtml(obj.name)}</span>
      <span class="layer-type">${obj.type}</span>
    `;

    // Clique para selecionar
    li.addEventListener('click', (e) => {
      if (e.target.closest('.layer-visibility')) return;
      app.selectionManager.selectObject(obj);
    });

    // Visibilidade
    const visBtn = li.querySelector('.layer-visibility');
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      obj.visible = !obj.visible;
      updateLayersPanel();
    });

    list.appendChild(li);
  }
}

/**
 * Escapa HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Configura event listeners
 */
function setupEventListeners() {
  // Canvas events
  app.canvas.addEventListener('mousedown', onMouseDown);
  app.canvas.addEventListener('mousemove', onMouseMove);
  app.canvas.addEventListener('mouseup', onMouseUp);
  app.canvas.addEventListener('mouseleave', onMouseUp);
  app.canvas.addEventListener('wheel', onWheel, { passive: false });
  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Drag & Drop events
  app.canvas.addEventListener('dragover', onDragOver);
  app.canvas.addEventListener('dragleave', onDragLeave);
  app.canvas.addEventListener('drop', onDrop);

  // Touch events
  app.canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  app.canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  app.canvas.addEventListener('touchend', onTouchEnd);

  // Botões da toolbar
  document.getElementById('btn-new-project').addEventListener('click', newProject);
  document.getElementById('btn-open-project').addEventListener('click', openProject);
  document.getElementById('btn-save-project').addEventListener('click', saveProject);
  document.getElementById('btn-import-png').addEventListener('click', () => app.imageImporter.openFilePicker());
  
  // Rigging (Fase 2)
  document.getElementById('btn-prepare-character').addEventListener('click', prepareCharacter);
  document.getElementById('btn-exit-rigging').addEventListener('click', exitRiggingMode);
  
  // Recorte de peças (Fase 2B)
  document.getElementById('btn-cut-piece').addEventListener('click', enterCuttingMode);
  document.getElementById('btn-confirm-cut').addEventListener('click', finishCutting);
  document.getElementById('btn-cancel-cut').addEventListener('click', exitCuttingMode);
  
  // Mapa de Peças (Fase 2B.1)
  document.getElementById('btn-piece-map').addEventListener('click', togglePieceMapMode);
  document.getElementById('btn-generate-piece').addEventListener('click', generatePieceFromMap);
  document.getElementById('btn-exit-piece-map').addEventListener('click', exitPieceMapMode);
  document.getElementById('btn-preview-piece').addEventListener('click', previewPieceFromMap);

  // Keyboard shortcuts
  document.addEventListener('keydown', onKeyDown);
}

/**
 * Redimensionamento da janela
 */
function onResize() {
  app.renderer.resize();
}

/**
 * Mouse down
 */
function onMouseDown(e) {
  if (e.button !== 0) return; // Apenas botão esquerdo

  const rect = app.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  app.lastMousePos = { x, y };
  app.isMouseDown = true;

  // Modo de recorte: delega para partManager
  if (app.isCuttingMode && app.partManager) {
    app.partManager.updateCutting(x, y);
    e.preventDefault();
    return;
  }

  // Mapa de Peças: seleção e edição de pontos
  if (app.isPieceMapMode && app.pieceMap) {
    // Tenta iniciar arraste de ponto de controlo
    if (app.pieceMap.startDragPoint(x, y)) {
      e.preventDefault();
      return;
    }
    
    // Tenta selecionar região
    const hitRegion = app.pieceMap.hitTestRegion(x, y);
    if (hitRegion) {
      app.pieceMap.selectRegion(hitRegion);
      e.preventDefault();
      return;
    }
  }

  // Modo rigging: delega para rig editor
  if (app.isRiggingMode && app.rigEditor) {
    const handled = app.rigEditor.handleMouseDown(x, y);
    if (handled) {
      e.preventDefault();
      return;
    }
  }

  // Modo normal: seleção e transformação de objetos
  const obj = app.selectionManager.handleClick(x, y);

  if (obj) {
    // Inicia arraste se clicou em objeto selecionado
    app.selectionManager.handleDragStart(x, y);
  } else {
    // Inicia pan da viewport
    app.canvas.style.cursor = 'grabbing';
  }

  e.preventDefault();
}

/**
 * Mouse move
 */
function onMouseMove(e) {
  const rect = app.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Modo de recorte: atualiza preview
  if (app.isCuttingMode && app.partManager) {
    app.partManager.updateCutting(x, y);
    updateCanvasInfo(x, y);
    // Atualiza botão de confirmar enquanto desenha
    updateCuttingConfirmButton();
    return;
  }

  // Mapa de Peças: arraste de pontos e hover
  if (app.isPieceMapMode && app.pieceMap) {
    if (app.pieceMap.isEditing) {
      app.pieceMap.dragPoint(x, y);
    } else {
      app.pieceMap.updateHover(x, y);
    }
    updateCanvasInfo(x, y);
    return;
  }

  // Modo rigging: delega para rig editor
  if (app.isRiggingMode && app.rigEditor) {
    const handled = app.rigEditor.handleMouseMove(x, y);
    if (handled) {
      updateCanvasInfo(x, y);
      return;
    }
  }

  // Modo normal
  app.selectionManager.updateHover(x, y);

  if (app.isMouseDown) {
    if (app.selectionManager.getIsDragging()) {
      // Arrastando objeto
      app.selectionManager.handleDragMove(x, y);
    } else {
      // Pan da viewport
      const dx = x - app.lastMousePos.x;
      const dy = y - app.lastMousePos.y;
      app.renderer.pan(dx, dy);
    }
    app.lastMousePos = { x, y };
  }

  updateCanvasInfo(x, y);
}

/**
 * Mouse up
 */
function onMouseUp(e) {
  const rect = app.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Modo de recorte: finaliza o retângulo
  if (app.isCuttingMode && app.partManager) {
    app.isMouseDown = false;
    app.canvas.style.cursor = 'crosshair';
    // O retângulo já foi atualizado no último mousemove
    updateCuttingConfirmButton();
    return;
  }

  // Mapa de Peças: finaliza arraste de ponto
  if (app.isPieceMapMode && app.pieceMap) {
    if (app.pieceMap.isEditing) {
      app.pieceMap.endDragPoint();
    }
    app.isMouseDown = false;
    app.canvas.style.cursor = 'crosshair';
    return;
  }

  // Modo rigging: delega para rig editor
  if (app.isRiggingMode && app.rigEditor) {
    const handled = app.rigEditor.handleMouseUp(x, y);
    if (handled) {
      app.isMouseDown = false;
      app.canvas.style.cursor = 'crosshair';
      return;
    }
  }

  // Modo normal
  if (app.isMouseDown) {
    app.selectionManager.handleDragEnd(x, y);
    app.isMouseDown = false;
    app.canvas.style.cursor = 'crosshair';
  }
}

/**
 * Wheel (zoom)
 */
function onWheel(e) {
  e.preventDefault();

  const rect = app.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  const newScale = app.renderer.viewportScale * zoomFactor;
  app.renderer.setZoom(newScale, x, y);
}

/**
 * Touch start
 */
function onTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    const touch = e.touches[0];
    const rect = app.canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    app.lastMousePos = { x, y };
    app.isMouseDown = true;

    const obj = app.selectionManager.handleClick(x, y);
    if (obj) {
      app.selectionManager.handleDragStart(x, y);
    }
  }
}

/**
 * Touch move
 */
function onTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 1 && app.isMouseDown) {
    const touch = e.touches[0];
    const rect = app.canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    if (app.selectionManager.getIsDragging()) {
      app.selectionManager.handleDragMove(x, y);
    } else {
      const dx = x - app.lastMousePos.x;
      const dy = y - app.lastMousePos.y;
      app.renderer.pan(dx, dy);
    }
    app.lastMousePos = { x, y };
  }
}

/**
 * Touch end
 */
function onTouchEnd(e) {
  if (app.isMouseDown) {
    app.selectionManager.handleDragEnd(app.lastMousePos.x, app.lastMousePos.y);
    app.isMouseDown = false;
  }
}

/**
 * Drag Over - quando arrasta arquivo sobre o canvas
 */
function onDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // Verifica se há arquivos sendo arrastados
  if (e.dataTransfer.types.includes('Files')) {
    e.dataTransfer.dropEffect = 'copy';
    
    if (!app.isDragOver) {
      app.isDragOver = true;
      app.canvas.classList.add('drag-over');
      updateStatus('Larga aqui para importar PNG');
    }
  }
}

/**
 * Drag Leave - quando arrasta arquivo para fora do canvas
 */
function onDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // Só remove se realmente saiu do canvas (não entrou em um filho)
  if (!e.currentTarget.contains(e.relatedTarget)) {
    app.isDragOver = false;
    app.canvas.classList.remove('drag-over');
    updateStatus('Pronto');
  }
}

/**
 * Drop - quando larga arquivo no canvas
 */
async function onDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  
  app.isDragOver = false;
  app.canvas.classList.remove('drag-over');
  
  const files = e.dataTransfer.files;
  if (files.length === 0) {
    updateStatus('Pronto');
    return;
  }
  
  // Verifica se todos são PNGs
  const invalidFiles = Array.from(files).filter(f => 
    f.type !== 'image/png' && !f.name.toLowerCase().endsWith('.png')
  );
  
  if (invalidFiles.length > 0) {
    const names = invalidFiles.map(f => f.name).join(', ');
    updateStatus('Pronto');
    alert(`Formato não suportado. Utiliza uma imagem PNG.\nArquivos rejeitados: ${names}`);
    return;
  }
  
  // Obtém posição do drop relativa ao canvas
  const rect = app.canvas.getBoundingClientRect();
  const dropX = e.clientX - rect.left;
  const dropY = e.clientY - rect.top;
  
  // Importa usando o importador existente
  await app.imageImporter.handleDropImport(files, dropX, dropY);
  
  updateStatus(`${files.length} imagem(ns) importada(s)`);
}

/**
 * Keyboard shortcuts
 */
function onKeyDown(e) {
  // Ctrl/Cmd + S = Salvar
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveProject();
  }

  // Ctrl/Cmd + O = Abrir
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
    e.preventDefault();
    openProject();
  }

  // Ctrl/Cmd + N = Novo
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    newProject();
  }

  // Delete = Remover objeto selecionado
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const obj = app.selectionManager.getSelectedObject();
    if (obj && !obj.locked) {
      app.scene.removeObject(obj.id);
      app.selectionManager.clearSelection();
      updateLayersPanel();
      updateStatus(`Removido: ${obj.name}`);
    }
  }

  // Escape = Cancelar recorte ou limpar seleção
  if (e.key === 'Escape') {
    if (app.isCuttingMode) {
      e.preventDefault();
      exitCuttingMode();
    } else {
      app.selectionManager.clearSelection();
    }
  }

  // Enter = Confirmar recorte
  if (e.key === 'Enter') {
    if (app.isCuttingMode) {
      e.preventDefault();
      finishCutting();
    }
  }
}

/**
 * Novo projeto
 */
async function newProject() {
  if (app.scene.objects.length > 0) {
    if (!confirm('Deseja criar um novo projeto? As alterações não salvas serão perdidas.')) {
      return;
    }
  }

  projectStorage.createNewProject();
  app.scene.clear();
  app.scene.name = projectStorage.getCurrentProject().name;
  app.selectionManager.clearSelection();
  app.renderer.centerOnOrigin();
  app.renderer.setZoom(1);
  updateLayersPanel();
  updateStatus('Novo projeto criado');
}

/**
 * Abrir projeto
 */
async function openProject() {
  if (app.scene.objects.length > 0) {
    if (!confirm('Deseja abrir outro projeto? As alterações não salvas serão perdidas.')) {
      return;
    }
  }

  try {
    updateStatus('Abrindo projeto...');
    const project = await projectStorage.openFilePicker();

    if (project.cancelled) {
      updateStatus('Abertura cancelada');
      return;
    }

    if (project.error) {
      throw new Error(project.error);
    }

    // Carrega projeto na cena
    app.scene = Scene.fromJSON(project);
    projectStorage.setCurrentProject(project);
    app.scene.name = project.name;

    // Carrega imagens
    await app.scene.loadAllImages();

    // Atualiza UI
    app.selectionManager.clearSelection();
    app.renderer.fitToObjects(app.scene.getVisibleObjects());
    updateLayersPanel();
    updateStatus(`Projeto aberto: ${project.name}`);
  } catch (err) {
    console.error('Erro ao abrir projeto:', err);
    updateStatus(`Erro: ${err.message}`);
    alert(`Erro ao abrir projeto: ${err.message}`);
  }
}

/**
 * Salvar projeto
 */
async function saveProject() {
  try {
    updateStatus('Salvando projeto...');

    // Atualiza dados do projeto
    const projectData = app.scene.toJSON();
    projectData.name = app.scene.name;

    await projectStorage.saveAsFile(projectData);
    updateStatus('Projeto salvo com sucesso');
  } catch (err) {
    console.error('Erro ao salvar projeto:', err);
    updateStatus(`Erro ao salvar: ${err.message}`);
    alert(`Erro ao salvar projeto: ${err.message}`);
  }
}

/**
 * Prepara personagem - cria rig automático para objeto selecionado
 */
async function prepareCharacter() {
  const obj = app.selectionManager.getSelectedObject();
  
  if (!obj) {
    alert('Selecione primeiro uma imagem de personagem.');
    return;
  }
  
  if (obj.type !== 'image' || !obj.imageElement) {
    alert('O objeto selecionado deve ser uma imagem carregada.');
    return;
  }
  
  if (obj.hasRig && obj.rig) {
    if (!confirm('Este personagem já possui uma armadura. Deseja recriar?')) {
      // Entra no modo rigging com a armadura existente
      enterRiggingMode(obj);
      return;
    }
  }
  
  updateStatus('Analisando silhueta e criando armadura...');
  
  try {
    // Detecta melhor preset
    const presetKey = detectBestPreset(obj.imageElement);
    
    // Estima rig baseado na silhueta
    const rig = await estimateRigForImage(obj.imageElement, presetKey);
    
    // Atribui ao objeto
    obj.rig = rig;
    obj.hasRig = true;
    
    // Entra no modo rigging
    enterRiggingMode(obj);
    
    updateStatus(`Armadura criada (${RIG_PRESETS[presetKey].name})`);
  } catch (err) {
    console.error('Erro ao preparar personagem:', err);
    updateStatus(`Erro: ${err.message}`);
    alert(`Erro ao preparar personagem: ${err.message}`);
  }
}

/**
 * Entra no modo de edição de armadura
 */
function enterRiggingMode(characterObject) {
  app.isRiggingMode = true;
  app.currentCharacterObject = characterObject;
  
  // Configura rig editor
  app.rigEditor.setEnabled(true, characterObject.rig, characterObject);
  
  // Configura PartManager se houver peças
  if (characterObject.partManager) {
    characterObject.partManager.setReferences(app.renderer.rigRenderer, app.renderer);
    app.partManager = characterObject.partManager;
  }
  
  // Atualiza UI
  updateRiggingModeUI(true);
  updateStatus('Modo Editar Armadura ativo');
  
  // Mostra painel de rigging
  const riggingPanel = document.getElementById('rigging-panel');
  if (riggingPanel) riggingPanel.classList.remove('hidden');
  
  // Esconde painel de propriedades normal
  const propsForm = document.getElementById('properties-form');
  const noSel = document.getElementById('no-selection');
  if (propsForm) propsForm.classList.add('hidden');
  if (noSel) noSel.classList.remove('hidden');
}

/**
 * Sai do modo de edição de armadura
 */
function exitRiggingMode() {
  if (!app.isRiggingMode) return;
  
  // Se estiver em modo de recorte, cancela primeiro
  if (app.isCuttingMode) {
    exitCuttingMode();
  }
  
  app.isRiggingMode = false;
  app.currentCharacterObject = null;
  app.partManager = null;
  
  // Desabilita rig editor
  app.rigEditor.setEnabled(false);
  
  // Atualiza UI
  updateRiggingModeUI(false);
  updateStatus('Modo Editar Armadura desativado');
  
  // Esconde painel de rigging
  const riggingPanel = document.getElementById('rigging-panel');
  if (riggingPanel) riggingPanel.classList.add('hidden');
  
  // Restaura painel de propriedades se houver objeto selecionado
  const obj = app.selectionManager.getSelectedObject();
  if (obj) {
    const propsForm = document.getElementById('properties-form');
    const noSel = document.getElementById('no-selection');
    if (propsForm) propsForm.classList.remove('hidden');
    if (noSel) noSel.classList.add('hidden');
  }
}

/**
 * Atualiza UI do modo rigging
 */
function updateRiggingModeUI(enabled) {
  const prepareBtn = document.getElementById('btn-prepare-character');
  const exitBtn = document.getElementById('btn-exit-rigging');
  const cutBtn = document.getElementById('btn-cut-piece');
  const pieceMapBtn = document.getElementById('btn-piece-map');
  
  if (prepareBtn) {
    prepareBtn.style.display = enabled ? 'none' : 'inline-flex';
    prepareBtn.disabled = enabled;
  }
  if (exitBtn) {
    exitBtn.style.display = enabled ? 'inline-flex' : 'none';
  }
  // Botão "Recortar Peça" (antigo) - sempre oculto, substituído pelo Mapa de Peças
  if (cutBtn) {
    cutBtn.style.display = 'none';
  }
  // Botão "Mapa de Peças" aparece quando há armadura ativa
  if (pieceMapBtn) {
    pieceMapBtn.style.display = enabled ? 'inline-flex' : 'none';
  }
  
  // Atualiza título do painel de propriedades
  const propsTitle = document.querySelector('.panel-right .panel-header h2');
  if (propsTitle) {
    propsTitle.textContent = enabled ? 'ARMADURA' : 'PROPRIEDADES';
  }
}

/**
 * Entra no modo de recorte de peças
 */
function enterCuttingMode() {
  const obj = app.selectionManager.getSelectedObject();
  
  if (!obj || !obj.hasRig || !obj.rig) {
    alert('Selecione um personagem com armadura preparada.');
    return;
  }
  
  // Encontra o osso do antebraço esquerdo
  const forearmBone = findLeftForearmBone(obj.rig);
  if (!forearmBone) {
    alert('Não foi possível encontrar o osso do antebraço esquerdo na armadura.');
    return;
  }
  
  // Usa ou cria PartManager
  let partManager = obj.partManager;
  if (!partManager) {
    partManager = new PartManager(obj, obj.rig, app.renderer.rigRenderer, app.renderer);
    obj.partManager = partManager;
  } else {
    partManager.setReferences(app.renderer.rigRenderer, app.renderer);
  }
  app.partManager = partManager;
  
  // Mostra botão de recortar
  const cutBtn = document.getElementById('btn-cut-piece');
  if (cutBtn) {
    cutBtn.style.display = 'inline-flex';
  }
  
  // Entra no modo de recorte
  app.isCuttingMode = true;
  app.cuttingData = {
    boneId: forearmBone.id,
    maskType: 'rect', // Começa com retângulo
    startPoint: null,
    currentRect: null,
    polygonPoints: []
  };
  
  // Ativa modo de recorte no partManager
  partManager.startCuttingMode(forearmBone.id, 'rect');
  
  // Atualiza UI
  updateCuttingModeUI(true);
  updateStatus(`Modo Recorte: clique e arraste sobre o ${forearmBone.name} para definir a região de recorte`);
  app.canvas.style.cursor = 'crosshair';
  
  // Esconde painel de rigging, mostra painel de peças
  showPartsPanel();
}

/**
 * Encontra o osso do antebraço esquerdo
 */
function findLeftForearmBone(rig) {
  // Procura por osso com nome contendo "antebraço" e lado "left"
  for (const bone of rig.getAllBones()) {
    const name = bone.name.toLowerCase();
    if ((name.includes('antebraço') || name.includes('forearm') || name.includes('anteb')) && 
        (bone.side === 'left' || name.includes('esq') || name.includes('left'))) {
      return bone;
    }
  }
  // Fallback: procura por "left elbow" ou "cotovelo esquerdo"
  for (const bone of rig.getAllBones()) {
    const name = bone.name.toLowerCase();
    if ((name.includes('cotovelo') || name.includes('elbow')) && 
        (bone.side === 'left' || name.includes('esq') || name.includes('left'))) {
      return bone;
    }
  }
  // Fallback: primeiro osso do lado esquerdo que não seja ombro
  for (const bone of rig.getAllBones()) {
    if (bone.side === 'left' && !bone.name.toLowerCase().includes('ombro') && !bone.name.toLowerCase().includes('shoulder')) {
      return bone;
    }
  }
  return null;
}

/**
 * Atualiza estado do botão Confirmar Recorte
 */
function updateCuttingConfirmButton() {
  const confirmBtn = document.getElementById('btn-confirm-cut');
  if (!confirmBtn || !app.cuttingData) return;
  
  const hasValidRect = app.cuttingData.currentRect && 
                       app.cuttingData.currentRect.width > 5 && 
                       app.cuttingData.currentRect.height > 5;
  
  confirmBtn.disabled = !hasValidRect;
  confirmBtn.style.opacity = hasValidRect ? '1' : '0.5';
  confirmBtn.title = hasValidRect 
    ? 'Confirmar recorte (Enter)' 
    : 'Desenhe uma região válida primeiro';
}

/**
 * Atualiza UI do modo de recorte
 */
function updateCuttingModeUI(enabled) {
  const cutBtn = document.getElementById('btn-cut-piece');
  const prepareBtn = document.getElementById('btn-prepare-character');
  const exitBtn = document.getElementById('btn-exit-rigging');
  const cuttingActions = document.getElementById('cutting-actions');
  
  if (enabled) {
    // Modo de recorte ativo: esconde botões de rigging, mostra ações de recorte
    if (cutBtn) cutBtn.style.display = 'inline-flex';
    if (prepareBtn) prepareBtn.style.display = 'none';
    if (exitBtn) exitBtn.style.display = 'none';
    if (cuttingActions) cuttingActions.classList.remove('hidden');
    
    const propsTitle = document.querySelector('.panel-right .panel-header h2');
    if (propsTitle) propsTitle.textContent = 'RECORTAR PEÇA';
    
    // Atualiza botão de confirmar
    updateCuttingConfirmButton();
  } else {
    // Saiu do modo recorte: restaura UI de rigging (botão Recortar Peça permanece visível)
    if (cutBtn) cutBtn.style.display = 'inline-flex';
    if (prepareBtn) prepareBtn.style.display = 'none';
    if (exitBtn) exitBtn.style.display = 'inline-flex';
    if (cuttingActions) cuttingActions.classList.add('hidden');
    
    const propsTitle = document.querySelector('.panel-right .panel-header h2');
    if (propsTitle) propsTitle.textContent = 'ARMADURA';
  }
}

/**
 * Sai do modo de recorte
 */
function exitCuttingMode() {
  if (!app.isCuttingMode) return;
  
  app.isCuttingMode = false;
  app.cuttingData = null;
  app.partManager.cancelCutting();
  
  updateCuttingModeUI(false);
  updateStatus('Modo Recorte desativado');
  app.canvas.style.cursor = 'crosshair';
  
  // Restaura painel de rigging
  showRiggingPanel();
}

/**
 * Finaliza o recorte e cria a peça
 */
async function finishCutting() {
  if (!app.isCuttingMode || !app.cuttingData) return;
  
  try {
    const mask = await app.partManager.finishCutting();
    if (!mask) {
      alert('Área de recorte inválida. Tente novamente.');
      return;
    }
    
    // Cria a peça
    const part = await app.partManager.createPartFromRegion(
      app.partManager.characterObject,
      app.cuttingData.boneId,
      mask,
      'Antebraço Esquerdo'
    );
    
    if (part) {
      updateStatus(`Peça "${part.name}" criada com sucesso!`);
      exitCuttingMode();
      
      // Atualiza painel de peças
      updatePartsPanel();
    }
  } catch (err) {
    console.error('Erro ao finalizar recorte:', err);
    alert(`Erro ao criar peça: ${err.message}`);
  }
}

/**
 * Mostra painel de peças
 */
function showPartsPanel() {
  // Esconde painel de rigging
  const riggingPanel = document.getElementById('rigging-panel');
  if (riggingPanel) riggingPanel.classList.add('hidden');
  
  // Mostra painel de propriedades com lista de peças
  const propsForm = document.getElementById('properties-form');
  const noSel = document.getElementById('no-selection');
  if (propsForm) propsForm.classList.remove('hidden');
  if (noSel) noSel.classList.add('hidden');
  
  updatePartsPanel();
}

/**
 * Mostra painel de rigging
 */
function showRiggingPanel() {
  const riggingPanel = document.getElementById('rigging-panel');
  if (riggingPanel) riggingPanel.classList.remove('hidden');
}

/**
 * Alterna modo Mapa de Peças
 */
function togglePieceMapMode() {
  if (app.isPieceMapMode) {
    exitPieceMapMode();
  } else {
    enterPieceMapMode();
  }
}

/**
 * Entra no modo Mapa de Peças
 */
function enterPieceMapMode() {
  const obj = app.selectionManager.getSelectedObject();
  
  if (!obj || !obj.hasRig || !obj.rig) {
    alert('Selecione um personagem com armadura preparada.');
    return;
  }
  
  // Cria ou reutiliza PieceMap (persistido no objeto do personagem)
  if (!obj.pieceMap) {
    obj.pieceMap = new PieceMap(obj, obj.rig, app.renderer);
    obj.pieceMap.generateRegions();
  } else {
    obj.pieceMap.characterObject = obj;
    obj.pieceMap.rig = obj.rig;
    obj.pieceMap.renderer = app.renderer;
    // NÃO regenera regiões - preserva ajustes manuais
  }
  
  app.pieceMap = obj.pieceMap;
  
  // Configura callbacks
  app.pieceMap.onSelectionChange = onPieceMapSelectionChange;
  app.pieceMap.onRegionChange = onPieceMapRegionChange;
  
  // Ativa modo
  app.isPieceMapMode = true;
  
  // Atualiza UI
  updatePieceMapModeUI(true);
  updateStatus('Mapa de Peças: clique numa região para selecionar, arraste os pontos para ajustar');
  
  // Esconde painel de rigging
  const riggingPanel = document.getElementById('rigging-panel');
  if (riggingPanel) riggingPanel.classList.add('hidden');
  
  // Mostra painel de propriedades com lista de regiões
  showPartsPanel();
  
  // Atualiza painel lateral com regiões
  updatePieceMapPanel(null);
}

/**
 * Sai do modo Mapa de Peças
 */
function exitPieceMapMode() {
  if (!app.isPieceMapMode) return;
  
  app.isPieceMapMode = false;
  // NÃO destrói o PieceMap - fica persistido no characterObject
  app.pieceMap = null;
  
  updatePieceMapModeUI(false);
  updateStatus('Mapa de Peças desativado');
  
  // Restaura painel de rigging
  showRiggingPanel();
}

/**
 * Atualiza UI do modo Mapa de Peças
 */
function updatePieceMapModeUI(enabled) {
  const pieceMapBtn = document.getElementById('btn-piece-map');
  const prepareBtn = document.getElementById('btn-prepare-character');
  const exitBtn = document.getElementById('btn-exit-rigging');
  const cutBtn = document.getElementById('btn-cut-piece');
  const pieceMapActions = document.getElementById('piece-map-actions');
  
  if (enabled) {
    if (pieceMapBtn) pieceMapBtn.style.display = 'inline-flex';
    if (prepareBtn) prepareBtn.style.display = 'none';
    if (exitBtn) exitBtn.style.display = 'none';
    if (cutBtn) cutBtn.style.display = 'none';
    if (pieceMapActions) pieceMapActions.classList.remove('hidden');
    
    const propsTitle = document.querySelector('.panel-right .panel-header h2');
    if (propsTitle) propsTitle.textContent = 'MAPA DE PEÇAS';
  } else {
    if (pieceMapBtn) pieceMapBtn.style.display = 'none';
    if (prepareBtn) prepareBtn.style.display = 'inline-flex';
    if (exitBtn) exitBtn.style.display = 'inline-flex';
    if (cutBtn) cutBtn.style.display = 'inline-flex';
    if (pieceMapActions) pieceMapActions.classList.add('hidden');
    
    const propsTitle = document.querySelector('.panel-right .panel-header h2');
    if (propsTitle) propsTitle.textContent = 'ARMADURA';
  }
}

/**
 * Callback de seleção de região no Mapa de Peças
 */
function onPieceMapSelectionChange(region) {
  if (region) {
    updateStatus(`Região selecionada: ${region.name}`);
  } else {
    updateStatus('Nenhuma região selecionada');
  }
  
  // Atualiza painel lateral com info da região
  updatePieceMapPanel(region);
}

/**
 * Callback de mudança de região (pontos movidos)
 */
function onPieceMapRegionChange(region) {
  // Região foi modificada - pode atualizar preview se necessário
  console.log('Região modificada:', region.name);
}

/**
 * Atualiza painel lateral com lista de regiões do Mapa de Peças
 */
function updatePieceMapPanel(selectedRegion) {
  if (!app.pieceMap) return;
  
  const propsForm = document.getElementById('properties-form');
  const noSel = document.getElementById('no-selection');
  const boneForm = document.getElementById('bone-properties-form');
  
  if (!propsForm) return;
  
  // Esconde formulários de bone e propriedades normais
  if (boneForm) boneForm.classList.add('hidden');
  propsForm.classList.remove('hidden');
  if (noSel) noSel.classList.add('hidden');
  
  // Limpa o formulário de propriedades
  const existingPanel = document.getElementById('piece-map-panel');
  if (existingPanel) existingPanel.remove();
  
  // Cria painel do Mapa de Peças
  const panel = document.createElement('div');
  panel.id = 'piece-map-panel';
  panel.style.cssText = 'font-family: Segoe UI, sans-serif;';
  
  const regions = app.pieceMap.getAllRegions();
  const selectedId = selectedRegion ? selectedRegion.id : (app.pieceMap.selectedRegionId || null);
  
  panel.innerHTML = `
    <div style="margin-bottom: 16px;">
      <h3 style="margin: 0 0 12px; color: #fff; font-size: 14px;">Regiões do Mapa de Peças</h3>
      <p style="margin: 0 0 12px; color: #aaa; font-size: 12px;">
        Clique numa região para selecionar. Arraste os vértices para ajustar.
      </p>
      <div style="max-height: 300px; overflow-y: auto; border: 1px solid #333; border-radius: 4px; background: #1e1e1e;">
        ${regions.map(r => `
          <div class="region-list-item" data-region-id="${r.id}" 
               style="display: flex; align-items: center; padding: 8px 12px; cursor: pointer; 
                      border-bottom: 1px solid #333; transition: background 0.15s;
                      ${r.id === selectedId ? 'background: #2a4a6a;' : ''}"
               onmouseover="this.style.background='#2a3a4a'" 
               onmouseout="this.style.background='${r.id === selectedId ? '#2a4a6a' : 'transparent'}'">
            <div style="width: 14px; height: 14px; border-radius: 3px; margin-right: 10px; 
                        background: ${r.color}; border: 1px solid ${r.color.replace('0.4', '0.8')}; flex-shrink: 0;"></div>
            <div style="flex: 1; min-width: 0;">
              <div style="color: #fff; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${r.name}
              </div>
              <div style="color: #888; font-size: 11px;">${r.boneId} • ${r.points.length} vértices</div>
            </div>
            <button class="region-preview-btn" data-region-id="${r.id}" 
                    style="padding: 4px 10px; font-size: 11px; background: #3a5a7a; color: #fff; 
                           border: none; border-radius: 3px; cursor: pointer; flex-shrink: 0;
                           opacity: 0.8; transition: opacity 0.15s;"
                    onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">
              Pré-visualizar
            </button>
            <input type="checkbox" class="region-visibility" data-region-id="${r.id}" 
                   ${r.visible ? 'checked' : ''} 
                   style="margin-left: 8px; width: 16px; height: 16px; cursor: pointer;">
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  propsForm.appendChild(panel);
  
  // Event listeners para itens da lista
  panel.querySelectorAll('.region-list-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('region-preview-btn') || e.target.classList.contains('region-visibility')) return;
      const regionId = item.dataset.regionId;
      const region = app.pieceMap.getRegion(regionId);
      if (region) {
        app.pieceMap.selectRegion(regionId);
      }
    });
  });
  
  // Botões de pré-visualizar
  panel.querySelectorAll('.region-preview-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const regionId = btn.dataset.regionId;
      const region = app.pieceMap.getRegion(regionId);
      if (region) {
        previewPieceFromMap(region);
      }
    });
  });
  
  // Checkboxes de visibilidade
  panel.querySelectorAll('.region-visibility').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      const regionId = cb.dataset.regionId;
      const region = app.pieceMap.getRegion(regionId);
      if (region) {
        region.visible = cb.checked;
      }
    });
  });
  
  // Destaca item selecionado
  if (selectedId) {
    const selectedItem = panel.querySelector(`.region-list-item[data-region-id="${selectedId}"]`);
    if (selectedItem) {
      selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

/**
 * Gera peça real a partir da região selecionada no Mapa de Peças
 */
async function generatePieceFromMap() {
  if (!app.isPieceMapMode || !app.pieceMap) return;
  
  const region = app.pieceMap.getSelectedRegion();
  if (!region) {
    alert('Selecione uma região primeiro.');
    return;
  }
  
  // Verifica se é o antebraço esquerdo (para esta fase)
  if (region.boneId !== 'cotovelo_esquerdo') {
    const confirmMsg = `Esta fase só suporta o antebraço esquerdo (cotovelo_esquerdo).\nRegião selecionada: ${region.name}\n\nDeseja continuar mesmo assim?`;
    if (!confirm(confirmMsg)) return;
  }
  
  try {
    updateStatus(`Gerando peça "${region.name}"...`);
    
    // Gera máscara a partir da região
    const mask = app.pieceMap.generateMask(region.id);
    if (!mask) {
      alert('Não foi possível gerar máscara para esta região.');
      return;
    }
    
    // Calcula pivô na articulação do cotovelo
    const pivot = app.pieceMap.calculatePivot(region.id);
    
    // Garante que PartManager está configurado
    const obj = app.selectionManager.getSelectedObject();
    let partManager = obj.partManager;
    if (!partManager) {
      partManager = new PartManager(obj, obj.rig, app.renderer.rigRenderer, app.renderer);
      obj.partManager = partManager;
    } else {
      partManager.setReferences(app.renderer.rigRenderer, app.renderer);
    }
    app.partManager = partManager;
    
    // Cria a peça via PartManager
    const part = await partManager.createPartFromRegion(
      obj,
      region.boneId,
      mask,
      region.name
    );
    
    if (!part) {
      alert('Falha ao criar peça.');
      return;
    }
    
    // Ajusta pivô para a articulação do cotovelo
    part.pivot = pivot;
    // Atualiza a transformação local usando o método correto da classe Part
    part.updateLocalTransform();
    
    updateStatus(`Peça "${part.name}" gerada com sucesso! Pivô no cotovelo.`);
    
    // Oculta a região correspondente na imagem base (marca para ocultação futura)
    region.generated = true;
    region.visible = false; // Oculta a região colorida
    
    // Sai do modo mapa de peças
    exitPieceMapMode();
    
    // Entra no modo rigging para testar movimento
    enterRiggingMode(obj);
    
    // Atualiza painel
    updatePartsPanel();
    
  } catch (err) {
    console.error('Erro ao gerar peça:', err);
    alert(`Erro ao gerar peça: ${err.message}`);
  }
}

/**
 * Pré-visualiza a peça recortada de uma região específica
 */
async function previewPieceFromMap(region) {
  if (!app.isPieceMapMode || !app.pieceMap) return;
  
  if (!region) {
    region = app.pieceMap.getSelectedRegion();
  }
  
  if (!region) {
    alert('Selecione uma região primeiro.');
    return;
  }
  
  // Remove restrição de apenas antebraço esquerdo - agora funciona para qualquer região
  
  try {
    updateStatus(`Gerando pré-visualização de "${region.name}"...`);
    
    // Gera máscara a partir da região
    const mask = app.pieceMap.generateMask(region.id);
    if (!mask) {
      alert('Não foi possível gerar máscara para esta região.');
      return;
    }
    
    const obj = app.selectionManager.getSelectedObject();
    if (!obj || !obj.imageElement) {
      alert('Imagem do personagem não carregada.');
      return;
    }
    
    // Cria canvas para pré-visualização
    const previewCanvas = document.createElement('canvas');
    const previewCtx = previewCanvas.getContext('2d');
    
    // Calcula bounds da máscara em coordenadas da imagem original
    const bounds = mask.bounds;
    const margin = 4;
    const canvasWidth = bounds.width + margin * 2;
    const canvasHeight = bounds.height + margin * 2;
    
    previewCanvas.width = canvasWidth;
    previewCanvas.height = canvasHeight;
    
    // Desenha fundo quadriculado (transparência)
    const checkerSize = 8;
    for (let x = 0; x < canvasWidth; x += checkerSize) {
      for (let y = 0; y < canvasHeight; y += checkerSize) {
        const isEven = ((x / checkerSize) + (y / checkerSize)) % 2 === 0;
        previewCtx.fillStyle = isEven ? '#ccc' : '#fff';
        previewCtx.fillRect(x, y, checkerSize, checkerSize);
      }
    }
    
    // Recorta a região da imagem original usando a máscara poligonal
    previewCtx.save();
    
    // Ajusta pontos do polígono para o canvas de preview
    const adjustedPoints = mask.points.map(pt => ({
      x: pt.x - bounds.x + margin,
      y: pt.y - bounds.y + margin
    }));
    
    previewCtx.beginPath();
    previewCtx.moveTo(adjustedPoints[0].x, adjustedPoints[0].y);
    for (let i = 1; i < adjustedPoints.length; i++) {
      previewCtx.lineTo(adjustedPoints[i].x, adjustedPoints[i].y);
    }
    previewCtx.closePath();
    previewCtx.clip();
    
    // Desenha a região da imagem original
    previewCtx.drawImage(
      obj.imageElement,
      bounds.x - margin, bounds.y - margin, bounds.width + margin * 2, bounds.height + margin * 2,
      0, 0, canvasWidth, canvasHeight
    );
    
    previewCtx.restore();
    
    // Converte para Data URL
    const previewDataURL = previewCanvas.toDataURL('image/png');
    
    // Mostra modal com a pré-visualização
    showPreviewModal(previewDataURL, region.name);
    
    updateStatus(`Pré-visualização de "${region.name}" gerada`);
    
  } catch (err) {
    console.error('Erro ao gerar pré-visualização:', err);
    alert(`Erro ao gerar pré-visualização: ${err.message}`);
  }
}

/**
 * Mostra modal com a pré-visualização da peça
 */
function showPreviewModal(dataURL, title) {
  // Remove modal anterior se existir
  const existingModal = document.getElementById('preview-modal');
  if (existingModal) existingModal.remove();
  
  const modal = document.createElement('div');
  modal.id = 'preview-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    font-family: Segoe UI, sans-serif;
  `;
  
  modal.innerHTML = `
    <div style="background: #2a2a2a; padding: 20px; border-radius: 8px; max-width: 90%; max-height: 90%; display: flex; flex-direction: column; align-items: center;">
      <h3 style="color: #fff; margin: 0 0 16px;">Pré-visualização: ${title}</h3>
      <img src="${dataURL}" style="max-width: 100%; max-height: 70vh; border: 1px solid #444; border-radius: 4px; image-rendering: pixelated;">
      <div style="margin-top: 16px; display: flex; gap: 12px;">
        <button id="preview-close" class="btn btn-primary" style="padding: 8px 24px;">Fechar</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  document.getElementById('preview-close').addEventListener('click', () => {
    modal.remove();
  });
  
  // Fechar com ESC
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
  
  // Fechar clicando fora
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
      document.removeEventListener('keydown', handleEsc);
    }
  });
}

/**
 * Atualiza painel de peças
 */
function updatePartsPanel() {
  // TODO: Implementar lista de peças no painel lateral
  console.log('Peças:', app.partManager.getAllParts());
}

/**
 * Desenha preview do recorte durante o modo de recorte
 */
function drawCuttingPreview() {
  if (!app.cuttingData || !app.partManager || !app.partRenderer) return;
  
  const data = app.cuttingData;
  const characterObject = app.partManager.characterObject;
  
  if (!characterObject) return;
  
  const ctx = app.renderer.ctx;
  ctx.save();
  
  // Aplica transformação: viewport * characterTransform
  // O retângulo está em coordenadas locais do personagem (origem no centro da imagem)
  const charMatrix = characterObject.transform.m;
  const viewportMatrix = app.renderer.viewport.m;
  
  const combined = new Transform2D();
  combined.setMatrix(
    viewportMatrix[0] * charMatrix[0] + viewportMatrix[2] * charMatrix[1],
    viewportMatrix[1] * charMatrix[0] + viewportMatrix[3] * charMatrix[1],
    viewportMatrix[0] * charMatrix[2] + viewportMatrix[2] * charMatrix[3],
    viewportMatrix[1] * charMatrix[2] + viewportMatrix[3] * charMatrix[3],
    viewportMatrix[0] * charMatrix[4] + viewportMatrix[2] * charMatrix[5] + viewportMatrix[4],
    viewportMatrix[1] * charMatrix[4] + viewportMatrix[3] * charMatrix[5] + viewportMatrix[5]
  );
  
  ctx.transform(
    combined.m[0], combined.m[1],
    combined.m[2], combined.m[3],
    combined.m[4], combined.m[5]
  );
  
  // Desenha retângulo de recorte
  if (data.maskType === 'rect' && data.currentRect) {
    const r = data.currentRect;
    ctx.save();
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 2 / app.renderer.viewportScale;
    ctx.setLineDash([5 / app.renderer.viewportScale, 5 / app.renderer.viewportScale]);
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.width, r.height);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Preenchimento semi-transparente
    ctx.fillStyle = 'rgba(255, 204, 0, 0.15)';
    ctx.fill();
    ctx.restore();
  }
  
  // Desenha polígono de recorte
  if (data.maskType === 'polygon' && data.polygonPoints && data.polygonPoints.length > 0) {
    ctx.save();
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 2 / app.renderer.viewportScale;
    ctx.setLineDash([5 / app.renderer.viewportScale, 5 / app.renderer.viewportScale]);
    ctx.beginPath();
    ctx.moveTo(data.polygonPoints[0].x, data.polygonPoints[0].y);
    for (let i = 1; i < data.polygonPoints.length; i++) {
      ctx.lineTo(data.polygonPoints[i].x, data.polygonPoints[i].y);
    }
    if (data.polygonPoints.length > 2) {
      ctx.closePath();
    }
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Preenchimento
    if (data.polygonPoints.length > 2) {
      ctx.fillStyle = 'rgba(255, 204, 0, 0.15)';
      ctx.fill();
    }
    ctx.restore();
  }
  
  // Desenha pontos do polígono
  if (data.maskType === 'polygon' && data.polygonPoints) {
    ctx.save();
    ctx.fillStyle = '#ffcc00';
    for (const pt of data.polygonPoints) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4 / app.renderer.viewportScale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  
  ctx.restore();
}

/**
 * Atualiza mensagem de status
 */
function updateStatus(message) {
  const el = document.getElementById('status-message');
  if (el) el.textContent = message;
}

/**
 * Atualiza info do canvas (coordenadas do mouse)
 */
function updateCanvasInfo(screenX, screenY) {
  const world = app.renderer.screenToWorld(screenX, screenY);
  const el = document.getElementById('canvas-info');
  if (el) {
    el.textContent = `X: ${world.x.toFixed(1)}  Y: ${world.y.toFixed(1)}  Zoom: ${(app.renderer.viewportScale * 100).toFixed(0)}%`;
  }
}

// Inicializa quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}