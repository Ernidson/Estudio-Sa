import { refreshTextures } from './parts/RasterPieces.js';
import { encodeRegion, paintRegion, rasterPath } from './segmentation/RasterRegion.js';
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
import { SilhouetteAnalyzer, createSilhouetteAnalyzer } from './segmentation/SilhouetteAnalyzer.js';
import { AnatomicalRecognizer, createAnatomicalRecognizer } from './segmentation/AnatomicalRecognizer.js';
import { Transform2D } from './core/Transform2D.js';

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
  isPieceMapMode: false,
  
  // Editor de Peças (Fase 2B.3)
  isEditPartsMode: false,
  editPartsSelectedPartId: null,
  editPartsTool: 'select',
  
  // Calibrar Armadura (Fase 2C)
  isCalibrationMode: false,
  calibrationTool: 'joints', // 'joints' ou 'regions'
  calibrationSelectedRegionId: null,
  
  // Silhouette Analyzer (Fase 2D)
  silhouetteAnalyzer: null,
  showCoverageVisualization: false,
  coverageVisualizationCanvas: null,
  
  // Anatomical Recognizer (Fase 2D.2)
  anatomicalRecognizer: null,
  isRecognizing: false,
  recognitionResult: null,
  recognitionVisualizationCanvas: null,
  previousPieceMapState: null // Para permitir reverter
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
  
  // Callback quando uma peça é criada
  app.partManager.onPartCreated = function(part) {
    updatePartsPanel();
    updatePieceCountDisplay();
  };
  
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
  for (const obj of app.scene.getVisibleObjects()) {
    if (obj.partManager) app.partRenderer.drawParts(obj.partManager, obj);
  }
  
  // Render preview de recorte se no modo de recorte
  if (app.isCuttingMode && app.cuttingData && app.partManager && app.partRenderer) {
    drawCuttingPreview();
  }
  
  // Render Mapa de Peças
  if (app.isPieceMapMode && app.pieceMap) {
    app.pieceMap.draw(app.renderer.ctx, app.renderer.viewport);
  }
  
  // Render Calibrar Armadura (mostra regiões e articulações)
  if (app.isCalibrationMode && app.calibrationTool === 'regions' && app.pieceMap) {
    app.pieceMap.draw(app.renderer.ctx, app.renderer.viewport);
  }
  
  // Render Cobertura Anatómica (Fase 2D)
  if (app.isCalibrationMode && app.calibrationTool === 'coverage' && app.coverageVisualizationCanvas) {
    drawCoverageVisualization();
  }
  
  // Render Reconhecimento Anatómico (Fase 2D.2)
  if (app.isCalibrationMode && app.calibrationTool === 'recognize' && app.recognitionVisualizationCanvas) {
    drawRecognitionVisualization();
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
  document.getElementById('btn-preview-piece').addEventListener('click', () => previewPieceFromMap());
  
  // Editor de Peças (Fase 2B.3)
  document.getElementById('btn-edit-parts').addEventListener('click', toggleEditPartsMode);
  for (const tool of ['scale','rotate']) document.getElementById('btn-'+tool+'-part').onclick=()=>setEditPartsTool(tool);
  document.getElementById('btn-select-part').addEventListener('click', () => setEditPartsTool('select'));
  document.getElementById('btn-move-part').addEventListener('click', () => setEditPartsTool('move'));
  document.getElementById('btn-edit-pivot').addEventListener('click', () => setEditPartsTool('pivot'));
  document.getElementById('btn-exit-edit-parts').addEventListener('click', exitEditPartsMode);

  // Calibrar Armadura (Fase 2C)
  document.getElementById('btn-calibrate-armor').addEventListener('click', toggleCalibrationMode);
  document.getElementById('btn-exit-calibration').addEventListener('click', exitCalibrationMode);
  document.getElementById('calib-tool-joints').addEventListener('click', () => setCalibrationTool('joints'));
  document.getElementById('calib-tool-regions').addEventListener('click', () => setCalibrationTool('regions'));
  document.getElementById('calib-tool-coverage').addEventListener('click', () => setCalibrationTool('coverage'));
  document.getElementById('calib-tool-recognize').addEventListener('click', () => setCalibrationTool('recognize'));

  // Reconhecimento Anatómico controls
  const btnCancelRecognition = document.getElementById('btn-cancel-recognition');
  if (btnCancelRecognition) {
    btnCancelRecognition.addEventListener('click', cancelRecognition);
  }
  const btnApplyRecognition = document.getElementById('btn-apply-recognition');
  if (btnApplyRecognition) {
    btnApplyRecognition.addEventListener('click', applyRecognition);
  }
  const btnCancelRecognitionResult = document.getElementById('btn-cancel-recognition-result');
  if (btnCancelRecognitionResult) {
    btnCancelRecognitionResult.addEventListener('click', cancelRecognitionResult);
  }
  const btnStartRecognition = document.getElementById('btn-start-recognition');
  if (btnStartRecognition) {
    btnStartRecognition.addEventListener('click', startRecognition);
  }

  // Cobertura Anatómica controls
  const coverageAlphaThreshold = document.getElementById('coverage-alpha-threshold');
  if (coverageAlphaThreshold) {
    coverageAlphaThreshold.addEventListener('input', onCoverageAlphaThresholdChange);
  }
  const coverageShowUncovered = document.getElementById('coverage-show-uncovered');
  if (coverageShowUncovered) {
    coverageShowUncovered.addEventListener('change', updateCoverageVisualization);
  }
  const coverageShowOverlapping = document.getElementById('coverage-show-overlapping');
  if (coverageShowOverlapping) {
    coverageShowOverlapping.addEventListener('change', updateCoverageVisualization);
  }
  const coverageShowOutside = document.getElementById('coverage-show-outside');
  if (coverageShowOutside) {
    coverageShowOutside.addEventListener('change', updateCoverageVisualization);
  }
  const coverageShowRegions = document.getElementById('coverage-show-regions');
  if (coverageShowRegions) {
    coverageShowRegions.addEventListener('change', updateCoverageVisualization);
  }

  // Testar Movimento controls
  const testMovementSlider = document.getElementById('test-movement-slider');
  if (testMovementSlider) {
    testMovementSlider.addEventListener('input', onTestMovementChange);
    testMovementSlider.addEventListener('change', onTestMovementChange);
  }
  const btnResetTestMovement = document.getElementById('btn-reset-test-movement');
  if (btnResetTestMovement) {
    btnResetTestMovement.addEventListener('click', resetTestMovement);
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', onKeyDown);
}

/**
 * Redimensionamento da janela
 */
function onResize() {
  app.renderer.resize();
}

function brushRegion(event, x, y) {
  const map = app.pieceMap;
  if (!app.isCalibrationMode || app.calibrationTool !== 'regions' || !(event.shiftKey || event.altKey || map?.brushMode)) return false;
  const region = app.pieceMap.getSelectedRegion();
  if (!region?.raster || !app.silhouetteAnalyzer) return false;
  const obj = app.currentCharacterObject;
  const point = app.pieceMap.screenToCharacterLocal(x, y);
  paintRegion(app.pieceMap.getAllRegions(), event.altKey || (!event.shiftKey && map.brushMode === "erase") ? null : region,
    Math.floor(point.x + obj.imageWidth / 2), Math.floor(point.y + obj.imageHeight / 2),
    map.brushRadius || 8, app.silhouetteAnalyzer.getAlphaData(), obj.imageWidth, obj.imageHeight);
  map.brushDirty = true;
  return true;
}

/**
 * Mouse down
 */
function onMouseDown(e) {
  if (e.button === 1) {
    app.panOrigin = {x:e.clientX, y:e.clientY};
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return; // Apenas botão esquerdo

  const rect = app.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  app.lastMousePos = { x, y };
  app.isMouseDown = true;
  app.dragPartStart = null;
  if (brushRegion(e, x, y)) return;

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

  // Modo Editar Peças: seleção e arraste de peças
  if (app.isEditPartsMode && app.partManager) {
    // Tenta selecionar peça
    const selected = app.partManager.getSelectedPart();
    const hitPart = (selected && app.editPartsTool === "rotate" && app.partRenderer.hitsRotationHandle(selected,app.currentCharacterObject,x,y) && selected) || app.partRenderer.hitTestPart(app.partManager, app.currentCharacterObject, x, y);
    if (hitPart) {
      app.dragPartStart = { x, y, rotation:hitPart.localRotation, scale:{...hitPart.localScale}, position: { ...hitPart.localPosition } };
      app.editPartsSelectedPartId = hitPart.id;
      app.partManager.selectPart(hitPart.id);
      updateEditPartsPanel(hitPart);
      updatePartPropertiesPanel(hitPart);
      e.preventDefault();
      return;
    }
  }

  // Modo Calibrar Armadura
  if (app.isCalibrationMode && app.pieceMap && app.currentCharacterObject) {
    if (app.calibrationTool === 'regions') {
      // Tenta iniciar arraste de ponto de controlo
      if (app.pieceMap.startDragPoint(x, y)) {
        e.preventDefault();
        return;
      }
      
      // Tenta selecionar região
      const hitRegion = app.pieceMap.hitTestRegion(x, y);
      if (hitRegion) {
        app.pieceMap.selectRegion(hitRegion);
        app.calibrationSelectedRegionId = hitRegion;
        updateCalibrationPanel();
        e.preventDefault();
        return;
      }
    } else if (app.calibrationTool === 'joints') {
      // Delega para rig editor para seleção e arraste de articulações
      const handled = app.rigEditor.handleMouseDown(x, y);
      if (handled) {
        e.preventDefault();
        return;
      }
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
  if (app.panOrigin) {
    app.renderer.pan(e.clientX - app.panOrigin.x, e.clientY - app.panOrigin.y);
    app.panOrigin = { x: e.clientX, y: e.clientY };
    return;
  }
  const rect = app.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (app.isMouseDown && brushRegion(e, x, y)) return;

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

  // Modo Editar Peças: arraste de peça
  if (app.isEditPartsMode && app.partManager && app.isMouseDown && app.editPartsSelectedPartId) {
    const part = app.partManager.getPart(app.editPartsSelectedPartId);
    if (part && app.dragPartStart) {
      const bone = app.partManager.rig.getBone(part.boneId);
      const inverse = app.renderer.viewport.clone().multiply(app.currentCharacterObject.transform)
        .multiply(bone.worldTransform).getInverse();
      const start = app.dragPartStart;
      const from = inverse.transformPoint(start.x, start.y);
      const to = inverse.transformPoint(x, y);
      const dx=to.x-part.localPosition.x, dy=to.y-part.localPosition.y;
      const fx=from.x-start.position.x, fy=from.y-start.position.y;
      if (app.editPartsTool==='move') part.setLocalPosition(start.position.x + to.x-from.x,start.position.y + to.y-from.y);
      if (app.editPartsTool==='rotate') part.setLocalRotation(start.rotation+(Math.atan2(dy,dx)-Math.atan2(fy,fx))*180/Math.PI);
      if (app.editPartsTool==='scale') {
        const ratio=Math.hypot(dx,dy)/Math.max(1,Math.hypot(fx,fy));
        const locked=document.getElementById('lock-scale').checked;
        part.setLocalScale(Math.max(.01,start.scale.x*(locked?ratio:Math.abs(dx/(fx||1)))),Math.max(.01,start.scale.y*(locked?ratio:Math.abs(dy/(fy||1)))));
      }
      if (app.editPartsTool==='pivot') {
        const pt=part.localTransform.inverseTransformPoint(to.x,to.y);
        part.pivot.x+=pt.x/part.imageWidth; part.pivot.y+=pt.y/part.imageHeight;
        part.setLocalPosition(to.x,to.y);
      }
      updatePartPropertiesPanel(part);
    }
    updateCanvasInfo(x, y);
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

  // Modo Calibrar Armadura
  if (app.isCalibrationMode && app.pieceMap && app.currentCharacterObject) {
    if (app.calibrationTool === 'regions') {
      if (app.pieceMap.isEditing) {
        app.pieceMap.dragPoint(x, y);
      } else {
        app.pieceMap.updateHover(x, y);
      }
      updateCanvasInfo(x, y);
      return;
    } else if (app.calibrationTool === 'joints') {
      const handled = app.rigEditor.handleMouseMove(x, y);
      if (handled) {
        updateCanvasInfo(x, y);
        return;
      }
    }
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
  if (app.pieceMap?.brushDirty) { refreshTextures(app.currentCharacterObject); app.pieceMap.brushDirty = false; }
  app.panOrigin = null;
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

  // Modo Editar Peças: finaliza arraste de peça
  if (app.isEditPartsMode) {
    app.isMouseDown = false;
    app.canvas.style.cursor = 'default';
    return;
  }

  // Modo Calibrar Armadura
  if (app.isCalibrationMode && app.pieceMap) {
    if (app.calibrationTool === 'regions' && app.pieceMap.isEditing) {
      app.pieceMap.endDragPoint();
    }
    app.isMouseDown = false;
    app.canvas.style.cursor = 'crosshair';
    return;
  } else if (app.isCalibrationMode && app.calibrationTool === 'joints' && app.rigEditor) {
    const handled = app.rigEditor.handleMouseUp(x, y);
    if (handled) {
      app.isMouseDown = false;
      app.canvas.style.cursor = 'crosshair';
      return;
    }
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
  app.dragPartStart = null;
  if (brushRegion(e, x, y)) return;

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
    const scene = Scene.fromJSON(project);
    await scene.loadAllImages();
    if (app.isCalibrationMode) exitCalibrationMode();
    if (app.isEditPartsMode) exitEditPartsMode();
    if (app.isPieceMapMode) exitPieceMapMode();
    if (app.isRiggingMode) exitRiggingMode();
    app.scene = scene;
    app.imageImporter.scene = scene;
    app.selectionManager.scene = scene;
    app.rigEditor.scene = scene;
    projectStorage.setCurrentProject(project);
    app.scene.name = project.name;



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

    const saved = await projectStorage.saveAsFile(projectData);
    updateStatus(saved?.cancelled ? 'Gravação cancelada' : 'Projeto guardado com sucesso');
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
    
    // Callback quando uma peça é criada
    characterObject.partManager.onPartCreated = function(part) {
      updatePartsPanel();
      updatePieceCountDisplay();
    };
    
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
  
  // Garante que Mapa de Peças também está desativado
  if (app.isPieceMapMode) {
    exitPieceMapMode();
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
  const calibBtn = document.getElementById('btn-calibrate-armor');
  const pieceMapToolbar = document.getElementById('piece-map-toolbar');
  const testMovementControls = document.getElementById('test-movement-controls');
  
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
  // Botão "Calibrar Armadura" aparece quando há armadura ativa
  if (calibBtn) {
    calibBtn.style.display = enabled ? 'inline-flex' : 'none';
  }
  // Esconde toolbar do Mapa de Peças no modo rigging
  if (pieceMapToolbar) pieceMapToolbar.classList.add('hidden');
  if (testMovementControls) testMovementControls.classList.add('hidden');
  
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
  
  // Garante que modo Mapa de Peças está desativado
  if (app.isPieceMapMode) {
    exitPieceMapMode();
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
  
  // Callback quando uma peça é criada
  partManager.onPartCreated = function(part) {
    updatePartsPanel();
    updatePieceCountDisplay();
  };
  
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
  const pieceMapToolbar = document.getElementById('piece-map-toolbar');
  const testMovementControls = document.getElementById('test-movement-controls');
  
  if (enabled) {
    // Modo de recorte ativo: esconde botões de rigging, mostra ações de recorte
    if (cutBtn) cutBtn.style.display = 'inline-flex';
    if (prepareBtn) prepareBtn.style.display = 'none';
    if (exitBtn) exitBtn.style.display = 'none';
    if (cuttingActions) cuttingActions.classList.remove('hidden');
    // Esconde toolbar do Mapa de Peças no modo recorte
    if (pieceMapToolbar) pieceMapToolbar.classList.add('hidden');
    if (testMovementControls) testMovementControls.classList.add('hidden');
    
    const propsTitle = document.querySelector('.panel-right .panel-header h2');
    if (propsTitle) propsTitle.textContent = 'RECORTAR PEÇA';
    
    // Atualiza botão de confirmar
    updateCuttingConfirmButton();
  } else {
    // Saiu do modo recorte: restaura UI de rigging
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
  
  // Garante que Mapa de Peças também está desativado
  if (app.isPieceMapMode) {
    exitPieceMapMode();
  }
  
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
  
  // Garante que modo de recorte antigo está desativado
  if (app.isCuttingMode) {
    exitCuttingMode();
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
  app.currentCharacterObject = obj;
  app.partManager = obj.partManager;
  
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
  onPieceMapSelectionChange(app.pieceMap.getSelectedRegion());
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
  const pieceMapToolbar = document.getElementById('piece-map-toolbar');
  const testMovementControls = document.getElementById('test-movement-controls');
  const propsTitle = document.querySelector('.panel-right .panel-header h2');
  
  if (enabled) {
    if (pieceMapBtn) pieceMapBtn.style.display = 'inline-flex';
    if (prepareBtn) prepareBtn.style.display = 'none';
    if (exitBtn) exitBtn.style.display = 'none';
    if (cutBtn) cutBtn.style.display = 'none';
    if (pieceMapToolbar) pieceMapToolbar.classList.remove('hidden');
    // Test movement controls start hidden, shown when pieces exist
    if (testMovementControls) testMovementControls.classList.add('hidden');
    
    if (propsTitle) propsTitle.textContent = 'MAPA DE PEÇAS';
  } else {
    if (pieceMapBtn) pieceMapBtn.style.display = 'none';
    if (prepareBtn) prepareBtn.style.display = 'inline-flex';
    if (exitBtn) exitBtn.style.display = 'inline-flex';
    if (cutBtn) cutBtn.style.display = 'inline-flex';
    if (pieceMapToolbar) pieceMapToolbar.classList.add('hidden');
    if (testMovementControls) testMovementControls.classList.add('hidden');
    
    if (propsTitle) propsTitle.textContent = 'ARMADURA';
  }
}

/**
 * Alterna modo Calibrar Armadura
 */
function toggleCalibrationMode() {
  if (app.isCalibrationMode) {
    exitCalibrationMode();
  } else {
    enterCalibrationMode();
  }
}

/**
 * Entra no modo Calibrar Armadura
 */
function enterCalibrationMode() {
  const obj = app.selectionManager.getSelectedObject();
  
  if (!obj || !obj.hasRig || !obj.rig) {
    alert('Selecione um personagem com armadura preparada.');
    return;
  }
  
  // Garante que outros modos estão desativados
  if (app.isPieceMapMode) {
    exitPieceMapMode();
  }
  if (app.isCuttingMode) {
    exitCuttingMode();
  }
  if (app.isEditPartsMode) {
    exitEditPartsMode();
  }
  if (app.isRiggingMode) {
    exitRiggingMode();
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
  app.currentCharacterObject = obj;
  
  // Configura callbacks
  app.pieceMap.onSelectionChange = onCalibrationRegionSelectionChange;
  app.pieceMap.onRegionChange = onCalibrationRegionChange;
  
  // Configura rig editor para o modo de articulações
  app.rigEditor.setEnabled(true, obj.rig, obj);
  app.rigEditor.onSelectionChange = onCalibrationBoneSelectionChange;
  
  // Ativa modo
  app.isCalibrationMode = true;
  if (obj.pieceMap.getAllRegions().some(region => region.raster)) initializeSilhouetteAnalyzer();
  app.calibrationTool = 'joints'; // Começa com Articulações
  app.calibrationSelectedRegionId = null;
  
  // Atualiza UI
  updateCalibrationModeUI(true);
  updateStatus('Calibrar Armadura: selecione uma articulação ou região para ajustar');
  
  // Esconde painel de rigging
  const riggingPanel = document.getElementById('rigging-panel');
  if (riggingPanel) riggingPanel.classList.add('hidden');
  
  // Mostra painel de calibração
  showCalibrationPanel();
  
  // Atualiza painel lateral
  updateCalibrationPanel();
}

/**
 * Sai do modo Calibrar Armadura
 */
function exitCalibrationMode() {
  if (!app.isCalibrationMode) return;
  
  app.isCalibrationMode = false;
  app.calibrationSelectedRegionId = null;
  app.calibrationTool = 'joints';
  // NÃO destrói o PieceMap - fica persistido no characterObject
  app.pieceMap = null;
  app.currentCharacterObject = null;
  // Limpa estado de cobertura
  app.coverageVisualizationCanvas = null;
  if (app._coverageUpdateTimeout) {
    clearTimeout(app._coverageUpdateTimeout);
  }
  // Limpa estado de reconhecimento
  app.recognitionVisualizationCanvas = null;
  app.recognitionResult = null;
  app.previousPieceMapState = null;
  if (app.anatomicalRecognizer) {
    app.anatomicalRecognizer.cancel();
    if (!app.anatomicalRecognizer.isProcessing) app.anatomicalRecognizer.dispose();
    app.anatomicalRecognizer = null;
  }
  
  // Desabilita rig editor
  app.rigEditor.setEnabled(false);
  app.rigEditor.onSelectionChange = onRigBoneSelectionChange; // Restaura callback original
  
  updateCalibrationModeUI(false);
  updateStatus('Calibrar Armadura desativado');
  
  // Esconde toolbar e painel de calibração
  const calibrationToolbar = document.getElementById('calibration-toolbar');
  if (calibrationToolbar) calibrationToolbar.classList.add('hidden');
  const calibrationPanel = document.getElementById('calibration-panel');
  if (calibrationPanel) calibrationPanel.classList.add('hidden');
  const coveragePanel = document.getElementById('coverage-panel');
  if (coveragePanel) coveragePanel.classList.add('hidden');
  const recognitionPanel = document.getElementById('recognition-panel');
  if (recognitionPanel) recognitionPanel.classList.add('hidden');
  
  // Restaura painel de rigging
  showRiggingPanel();
}

/**
 * Define a ferramenta ativa no modo Calibrar Armadura
 */
function setCalibrationTool(tool) {
  if (!app.isCalibrationMode) return;
  
  app.calibrationTool = tool;
  
  const jointsBtn = document.getElementById('calib-tool-joints');
  const regionsBtn = document.getElementById('calib-tool-regions');
  const coverageBtn = document.getElementById('calib-tool-coverage');
  const recognizeBtn = document.getElementById('calib-tool-recognize');
  const coveragePanel = document.getElementById('coverage-panel');
  const recognitionPanel = document.getElementById('recognition-panel');
  
  if (jointsBtn) jointsBtn.classList.toggle('active', tool === 'joints');
  if (regionsBtn) regionsBtn.classList.toggle('active', tool === 'regions');
  if (coverageBtn) coverageBtn.classList.toggle('active', tool === 'coverage');
  if (recognizeBtn) recognizeBtn.classList.toggle('active', tool === 'recognize');
  
  // Mostra/esconde painéis
  if (coveragePanel) {
    coveragePanel.classList.toggle('hidden', tool !== 'coverage');
  }
  if (recognitionPanel) {
    recognitionPanel.classList.toggle('hidden', tool !== 'recognize');
  }
  
  // Atualiza painel lateral
  updateCalibrationPanel();
  
  const statusEl = document.getElementById('calibration-status');
  if (statusEl) {
    if (tool === 'joints') {
      statusEl.textContent = 'Clique numa articulação para selecionar e arrastar';
    } else if (tool === 'regions') {
      statusEl.textContent = 'Clique numa região para selecionar, arraste os vértices para ajustar';
    } else if (tool === 'coverage') {
      statusEl.textContent = 'Visualizando cobertura anatómica — ajuste o limiar alfa se necessário';
      initializeSilhouetteAnalyzer();
    } else if (tool === 'recognize') {
      statusEl.textContent = 'Reconhecimento anatómico automático — clique em Reconhecer Corpo para iniciar';
      initializeSilhouetteAnalyzer();
      showRecognitionPanel();
    }
  }
}

/**
 * Atualiza UI do modo Calibrar Armadura
 */
function updateCalibrationModeUI(enabled) {
  const calibBtn = document.getElementById('btn-calibrate-armor');
  const prepareBtn = document.getElementById('btn-prepare-character');
  const exitBtn = document.getElementById('btn-exit-rigging');
  const cutBtn = document.getElementById('btn-cut-piece');
  const pieceMapBtn = document.getElementById('btn-piece-map');
  const editPartsBtn = document.getElementById('btn-edit-parts');
  const calibrationToolbar = document.getElementById('calibration-toolbar');
  const pieceMapToolbar = document.getElementById('piece-map-toolbar');
  const editPartsToolbar = document.getElementById('edit-parts-toolbar');
  const testMovementControls = document.getElementById('test-movement-controls');
  const propsTitle = document.querySelector('.panel-right .panel-header h2');
  const appContainer = document.querySelector('.app-container');
  
  if (enabled) {
    if (calibBtn) calibBtn.style.display = 'inline-flex';
    if (prepareBtn) prepareBtn.style.display = 'none';
    if (exitBtn) exitBtn.style.display = 'none';
    if (cutBtn) cutBtn.style.display = 'none';
    if (pieceMapBtn) pieceMapBtn.style.display = 'none';
    if (editPartsBtn) editPartsBtn.style.display = 'none';
    if (calibrationToolbar) calibrationToolbar.classList.remove('hidden');
    if (pieceMapToolbar) pieceMapToolbar.classList.add('hidden');
    if (editPartsToolbar) editPartsToolbar.classList.add('hidden');
    if (testMovementControls) testMovementControls.classList.add('hidden');
    
    // Add calibration mode active class for CSS panel management
    if (appContainer) appContainer.classList.add('calibration-mode-active');
    
    // Reset tool buttons
    const jointsBtn = document.getElementById('calib-tool-joints');
    const regionsBtn = document.getElementById('calib-tool-regions');
    const coverageBtn = document.getElementById('calib-tool-coverage');
    const recognizeBtn = document.getElementById('calib-tool-recognize');
    if (jointsBtn) jointsBtn.classList.add('active');
    if (regionsBtn) regionsBtn.classList.remove('active');
    if (coverageBtn) coverageBtn.classList.remove('active');
    if (recognizeBtn) recognizeBtn.classList.remove('active');
    
    if (propsTitle) propsTitle.textContent = 'CALIBRAR ARMADURA';
  } else {
    if (calibBtn) calibBtn.style.display = 'none';
    if (prepareBtn) prepareBtn.style.display = 'inline-flex';
    if (exitBtn) exitBtn.style.display = 'inline-flex';
    if (cutBtn) cutBtn.style.display = 'none';
    if (pieceMapBtn) pieceMapBtn.style.display = 'inline-flex';
    if (editPartsBtn) editPartsBtn.style.display = 'inline-flex';
    if (calibrationToolbar) calibrationToolbar.classList.add('hidden');
    if (pieceMapToolbar) pieceMapToolbar.classList.add('hidden');
    if (editPartsToolbar) editPartsToolbar.classList.add('hidden');
    if (testMovementControls) testMovementControls.classList.add('hidden');
    
    // Remove calibration mode active class
    if (appContainer) appContainer.classList.remove('calibration-mode-active');
    
    if (propsTitle) propsTitle.textContent = 'ARMADURA';
  }
}

/**
 * Mostra painel de calibração
 */
function showCalibrationPanel() {
  const calibrationPanel = document.getElementById('calibration-panel');
  if (calibrationPanel) calibrationPanel.classList.remove('hidden');
}

/**
 * Callback de seleção de região no modo Calibrar Armadura
 */
function onCalibrationRegionSelectionChange(region) {
  if (region) {
    updateStatus(`Região selecionada: ${region.name}`);
    app.calibrationSelectedRegionId = region.id;
  } else {
    updateStatus('Nenhuma região selecionada');
    app.calibrationSelectedRegionId = null;
  }
  
  // Atualiza painel lateral com info da região
  updateCalibrationPanel();
}

/**
 * Callback de mudança de região (pontos movidos) no modo Calibrar Armadura
 */
function onCalibrationRegionChange(region) {
  console.log('Região modificada na calibração:', region.name);
  updateCalibrationPanel();
}

/**
 * Callback de seleção de bone no modo Calibrar Armadura
 */
function onCalibrationBoneSelectionChange(bone) {
  if (bone) {
    updateStatus(`Articulação selecionada: ${bone.name}`);
    // Atualiza painel de propriedades do bone (reutiliza rigging panel)
    if (app.rigEditor && app.rigEditor._updatePropertiesPanel) {
      app.rigEditor._updatePropertiesPanel();
    }
  } else {
    updateStatus('Nenhuma articulação selecionada');
  }
}

/**
 * Atualiza painel lateral no modo Calibrar Armadura
 */
function updateCalibrationPanel() {
  if (!app.pieceMap) return;
  
  const calibrationPanel = document.getElementById('calibration-panel');
  if (!calibrationPanel) return;
  
  if (app.calibrationTool === 'joints') {
    // Mostra painel de propriedades do bone (reutiliza rigging panel)
    const riggingPanel = document.getElementById('rigging-panel');
    if (riggingPanel) {
      // Copia o conteúdo do rigging panel para o calibration panel
      calibrationPanel.replaceChildren();
      calibrationPanel.classList.add('hidden');
      riggingPanel.classList.remove('hidden');
    }
    return;
  }
  
  document.getElementById('rigging-panel')?.classList.add('hidden');
  // Ferramenta Regiões - painel personalizado
  const region = app.calibrationSelectedRegionId ? app.pieceMap.getRegion(app.calibrationSelectedRegionId) : null;
  
  if (app.calibrationTool === 'regions' && app.pieceMap.getAllRegions().some(r => r.raster)) {
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Região a corrigir');
    select.add(new Option('Escolher região', ''));
    for (const item of app.pieceMap.getAllRegions()) select.add(new Option(item.name, item.id));
    select.value = region?.id || '';
    select.onchange = () => {
      app.calibrationSelectedRegionId = select.value;
      app.pieceMap.selectRegion(select.value);
      updateCalibrationPanel();
    };
    calibrationPanel.replaceChildren(select);
    for (const [mode,caption] of [['','Selecionar'],['paint','Pintar'],['erase','Apagar']]) {
      const button = document.createElement('button');
      button.className = 'btn';
      button.textContent = caption;
      button.onclick = () => { app.pieceMap.brushMode = mode; updateCalibrationPanel(); };
      button.classList.toggle('active',(app.pieceMap.brushMode || '') === mode);
      calibrationPanel.append(button);
    }
    for (const [name,key,min,max,value] of [['Pincel','brushRadius',1,64,8],['Opacidade','overlayPercent',0,100,100]]) {
      const label = document.createElement('label'), input = document.createElement('input');
      input.type='range'; input.min=min; input.max=max; input.value=app.pieceMap[key] ?? value;
      input.oninput=()=>{app.pieceMap[key]=Number(input.value)};
      label.append(name,input); calibrationPanel.append(label);
    }
    const isolated=document.createElement('label'), checkbox=document.createElement('input');
    checkbox.type='checkbox'; checkbox.checked=Boolean(app.pieceMap.isolated);
    checkbox.onchange=()=>{app.pieceMap.isolated=checkbox.checked};
    isolated.append(checkbox,'Só a máscara selecionada'); calibrationPanel.append(isolated);
    calibrationPanel.classList.remove('hidden');
    return;
  }
  if (!region) {
    calibrationPanel.textContent = app.calibrationTool === 'regions' ? 'Selecione uma região no canvas para ajustar.' : '';
    return;
  }
  // Calcula bounding box da região para largura/altura
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of region.points) {
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x);
    maxY = Math.max(maxY, pt.y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  
  calibrationPanel.innerHTML = `
    <div style="padding: 16px; font-family: Segoe UI, sans-serif;">
      <h3 style="margin: 0 0 16px; color: #fff; font-size: 14px;">${region.name}</h3>
      <div style="color: #888; font-size: 12px; margin-bottom: 16px;">Osso associado: ${region.boneId}</div>
      
      <div class="form-group">
        <label>Largura</label>
        <div class="form-row" style="align-items: center; gap: 8px;">
          <input type="number" id="calib-region-width" step="0.1" value="${width.toFixed(1)}" style="width: 80px;">
          <input type="range" id="calib-region-width-slider" min="10" max="200" value="${width}" step="1" style="flex: 1;">
        </div>
      </div>
      
      <div class="form-group">
        <label>Altura</label>
        <div class="form-row" style="align-items: center; gap: 8px;">
          <input type="number" id="calib-region-height" step="0.1" value="${height.toFixed(1)}" style="width: 80px;">
          <input type="range" id="calib-region-height-slider" min="10" max="300" value="${height}" step="1" style="flex: 1;">
        </div>
      </div>
      
      <div class="form-group">
        <label>Posição X (centro)</label>
        <input type="number" id="calib-region-center-x" step="0.1" value="${centerX.toFixed(1)}">
      </div>
      
      <div class="form-group">
        <label>Posição Y (centro)</label>
        <input type="number" id="calib-region-center-y" step="0.1" value="${centerY.toFixed(1)}">
      </div>
      
      <div class="form-group">
        <label>Rotação (graus)</label>
        <div class="form-row" style="align-items: center; gap: 8px;">
          <input type="number" id="calib-region-rotation" step="1" min="-180" max="180" value="0" style="width: 80px;">
          <input type="range" id="calib-region-rotation-slider" min="-180" max="180" value="0" step="1" style="flex: 1;">
        </div>
      </div>
      
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #333;">
        <p style="color: #888; font-size: 12px; margin: 0 0 12px;">${region.points.length} vértices editáveis</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button id="btn-reset-region" class="btn btn-secondary" style="flex: 1; min-width: 120px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
              <path d="M3 3v5h5"></path>
            </svg>
            Repor Região
          </button>
          <button id="btn-confirm-region" class="btn btn-primary" style="flex: 1; min-width: 120px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Confirmar Ajustes
          </button>
        </div>
      </div>
    `;
    
    calibrationPanel.classList.remove('hidden');
    
    // Event listeners para os controles
    const widthInput = document.getElementById('calib-region-width');
    const widthSlider = document.getElementById('calib-region-width-slider');
    const heightInput = document.getElementById('calib-region-height');
    const heightSlider = document.getElementById('calib-region-height-slider');
    const centerXInput = document.getElementById('calib-region-center-x');
    const centerYInput = document.getElementById('calib-region-center-y');
    const rotationInput = document.getElementById('calib-region-rotation');
    const rotationSlider = document.getElementById('calib-region-rotation-slider');
    const btnReset = document.getElementById('btn-reset-region');
    const btnConfirm = document.getElementById('btn-confirm-region');
    
    const updateRegionGeometry = () => {
      const newWidth = parseFloat(widthInput.value) || width;
      const newHeight = parseFloat(heightInput.value) || height;
      const newCenterX = parseFloat(centerXInput.value) || centerX;
      const newCenterY = parseFloat(centerYInput.value) || centerY;
      const newRotation = parseFloat(rotationInput.value) || 0;
      
      // Recalcula pontos mantendo forma relativa
      const halfW = newWidth / 2;
      const halfH = newHeight / 2;
      const cosR = Math.cos(newRotation * Math.PI / 180);
      const sinR = Math.sin(newRotation * Math.PI / 180);
      
      // Define novos pontos como retângulo rotacionado (base) ou mantém forma original escalada
      const originalPoints = region.originalPoints || region.points;
      const origCenterX = originalPoints.reduce((sum, p) => sum + p.x, 0) / originalPoints.length;
      const origCenterY = originalPoints.reduce((sum, p) => sum + p.y, 0) / originalPoints.length;
      const origWidth = Math.max(...originalPoints.map(p => p.x)) - Math.min(...originalPoints.map(p => p.x));
      const origHeight = Math.max(...originalPoints.map(p => p.y)) - Math.min(...originalPoints.map(p => p.y));
      
      const scaleX = origWidth > 0 ? newWidth / origWidth : 1;
      const scaleY = origHeight > 0 ? newHeight / origHeight : 1;
      
      const newPoints = originalPoints.map(p => {
        // Translada para origem, escala, rotaciona, translada para nova posição
        let dx = p.x - origCenterX;
        let dy = p.y - origCenterY;
        
        // Escala
        dx *= scaleX;
        dy *= scaleY;
        
        // Rotaciona
        const rx = dx * cosR - dy * sinR;
        const ry = dx * sinR + dy * cosR;
        
        return { x: newCenterX + rx, y: newCenterY + ry };
      });
      
      region.points = newPoints;
      
      if (app.pieceMap.onRegionChange) {
        app.pieceMap.onRegionChange(region);
      }
      app.renderer.render(app.scene);
    };
    
    // Sincroniza inputs e sliders
    const syncWidth = (val) => {
      widthInput.value = val;
      widthSlider.value = val;
      updateRegionGeometry();
    };
    const syncHeight = (val) => {
      heightInput.value = val;
      heightSlider.value = val;
      updateRegionGeometry();
    };
    const syncRotation = (val) => {
      rotationInput.value = val;
      rotationSlider.value = val;
      updateRegionGeometry();
    };
    
    widthInput.addEventListener('change', () => syncWidth(widthInput.value));
    widthSlider.addEventListener('input', () => syncWidth(widthSlider.value));
    heightInput.addEventListener('change', () => syncHeight(heightInput.value));
    heightSlider.addEventListener('input', () => syncHeight(heightSlider.value));
    centerXInput.addEventListener('change', updateRegionGeometry);
    centerYInput.addEventListener('change', updateRegionGeometry);
    rotationInput.addEventListener('change', () => syncRotation(rotationInput.value));
    rotationSlider.addEventListener('input', () => syncRotation(rotationSlider.value));
    
    btnReset.addEventListener('click', () => {
      // Restaura pontos originais
      if (region.originalPoints) {
        region.points = region.originalPoints.map(p => ({ x: p.x, y: p.y }));
      } else {
        // Regenera região baseada no osso
        const bone = app.rig.getBone(region.boneId);
        if (bone && bone.worldTransform) {
          // Força regeneração
          const charInv = app.currentCharacterObject.transform.getInverse();
          // Usar generateRegions não é ideal aqui, apenas resetamos os pontos
        }
      }
      if (app.pieceMap.onRegionChange) {
        app.pieceMap.onRegionChange(region);
      }
      updateCalibrationPanel();
      app.renderer.render(app.scene);
    });
    
    btnConfirm.addEventListener('click', () => {
      // Confirma ajustes - salva originalPoints como pontos atuais
      region.originalPoints = region.points.map(p => ({ x: p.x, y: p.y }));
      updateStatus(`Região "${region.name}" confirmada`);
      updateCalibrationPanel();
    });
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
  
  // Habilita/desabilita botão Gerar Peça
  const generateBtn = document.getElementById('btn-generate-piece');
  if (generateBtn) {
    const reason = !region ? 'Selecione uma região.' : !app.pieceMap.generateMask(region.id) ? 'A máscara está vazia.' :
      app.currentCharacterObject?.partManager?.getAllParts().some(p=>p.regionId===region.id) ? 'Esta região já tem uma peça.' : '';
    generateBtn.disabled = Boolean(reason);
    document.getElementById('piece-map-status').textContent = reason || region.name;
    if (!region) {
      generateBtn.title = 'Selecione uma região primeiro';
    } else {
      generateBtn.title = 'Gerar Peça Real';
    }
  }
  
  // Habilita/desabilita botão Pré-visualizar
  const previewBtn = document.getElementById('btn-preview-piece');
  if (previewBtn) {
    previewBtn.disabled = !region;
  }
}

/**
 * Callback de mudança de região (pontos movidos)
 */
function onPieceMapRegionChange(region) {
  // Região foi modificada - pode atualizar preview se necessário
  console.log('Região modificada:', region.name);
}

/**
 * Handler para mudança do slider de Testar Movimento
 */
function onTestMovementChange() {
  const slider = document.getElementById('test-movement-slider');
  const valueEl = document.getElementById('test-movement-value');
  if (!slider || !valueEl) return;
  
  const angle = parseInt(slider.value, 10);
  valueEl.textContent = `${angle}°`;
  
  // Aplica rotação ao cotovelo_esquerdo se existir
  if (app.currentCharacterObject && app.currentCharacterObject.rig) {
    const bone = app.currentCharacterObject.rig.getBone(app.currentCharacterObject.pieceMap?.getSelectedRegion()?.boneId || 'l_elbow');
    if (bone) {
      bone.setLocalRotation(angle);
      app.currentCharacterObject.rig.computeWorldTransforms();
      app.renderer.render(app.scene);
    }
  }
}

/**
 * Repor rotação do teste de movimento para 0°
 */
function resetTestMovement() {
  const slider = document.getElementById('test-movement-slider');
  const valueEl = document.getElementById('test-movement-value');
  if (slider) slider.value = '0';
  if (valueEl) valueEl.textContent = '0°';
  
  if (app.currentCharacterObject && app.currentCharacterObject.rig) {
    const bone = app.currentCharacterObject.rig.getBone(app.currentCharacterObject.pieceMap?.getSelectedRegion()?.boneId || 'l_elbow');
    if (bone) {
      bone.setLocalRotation(0);
      app.currentCharacterObject.rig.computeWorldTransforms();
      app.renderer.render(app.scene);
    }
  }
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
  
  document.querySelector('.panel-left .panel-content').appendChild(panel);
  
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
        // Seleciona a região antes de pré-visualizar
        app.pieceMap.selectRegion(regionId);
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
 * Alterna modo Editar Peças
 */
function toggleEditPartsMode() {
  if (app.isEditPartsMode) {
    exitEditPartsMode();
  } else {
    enterEditPartsMode();
  }
}

/**
 * Entra no modo Editar Peças
 */
function enterEditPartsMode() {
  const obj = app.selectionManager.getSelectedObject();
  
  if (!obj || !obj.partManager || obj.partManager.getAllParts().length === 0) {
    alert('Não há peças para editar. Crie uma peça primeiro.');
    return;
  }
  
  // Garante que outros modos estão desativados
  if (app.isPieceMapMode) {
    exitPieceMapMode();
  }
  if (app.isCuttingMode) {
    exitCuttingMode();
  }
  if (app.isRiggingMode) {
    exitRiggingMode();
  }
  
  app.currentCharacterObject = obj;
  app.isEditPartsMode = true;
  app.partManager = obj.partManager;
  
  // Configura o PartRenderer para o PartManager atual
  app.partManager.setReferences(app.renderer.rigRenderer, app.renderer);
  
  // Atualiza UI
  updateEditPartsModeUI(true);
  updateStatus('Editar Peças: selecione uma peça para ajustar');
  
  // Esconde painel de rigging
  const riggingPanel = document.getElementById('rigging-panel');
  if (riggingPanel) riggingPanel.classList.add('hidden');
  
  // Mostra painel de propriedades com lista de peças
  showPartsPanel();
  
  // Atualiza lista de peças
  updateEditPartsPanel();
}

/**
 * Sai do modo Editar Peças
 */
function exitEditPartsMode() {
  if (!app.isEditPartsMode) return;
  
  app.isEditPartsMode = false;
  app.editPartsSelectedPartId = null;
  app.editPartsTool = 'select';
  
  updateEditPartsModeUI(false);
  updateStatus('Editar Peças desativado');
  
  // Restaura painel de rigging
  showRiggingPanel();
}

/**
 * Atualiza UI do modo Editar Peças
 */
function updateEditPartsModeUI(enabled) {
  const editPartsBtn = document.getElementById('btn-edit-parts');
  const prepareBtn = document.getElementById('btn-prepare-character');
  const exitBtn = document.getElementById('btn-exit-rigging');
  const cutBtn = document.getElementById('btn-cut-piece');
  const pieceMapBtn = document.getElementById('btn-piece-map');
  const editPartsToolbar = document.getElementById('edit-parts-toolbar');
  const editPartsPanel = document.getElementById('edit-parts-panel');
  const testMovementControls = document.getElementById('test-movement-controls');
  const pieceMapToolbar = document.getElementById('piece-map-toolbar');
  const propsTitle = document.querySelector('.panel-right .panel-header h2');
  
  if (enabled) {
    if (editPartsBtn) editPartsBtn.style.display = 'inline-flex';
    if (prepareBtn) prepareBtn.style.display = 'none';
    if (exitBtn) exitBtn.style.display = 'none';
    if (cutBtn) cutBtn.style.display = 'none';
    if (pieceMapBtn) pieceMapBtn.style.display = 'none';
    if (editPartsToolbar) editPartsToolbar.classList.remove('hidden');
    if (editPartsPanel) editPartsPanel.classList.remove('hidden');
    // Test movement controls start hidden, shown when piece selected
    if (testMovementControls) testMovementControls.classList.add('hidden');
    if (pieceMapToolbar) pieceMapToolbar.classList.add('hidden');
    if (testMovementControls) testMovementControls.classList.add('hidden');
    
    if (propsTitle) propsTitle.textContent = 'EDITAR PEÇAS';
  } else {
    if (editPartsBtn) editPartsBtn.style.display = 'none';
    if (prepareBtn) prepareBtn.style.display = 'inline-flex';
    if (exitBtn) exitBtn.style.display = 'inline-flex';
    if (cutBtn) cutBtn.style.display = 'inline-flex';
    if (pieceMapBtn) pieceMapBtn.style.display = 'inline-flex';
    if (editPartsToolbar) editPartsToolbar.classList.add('hidden');
    if (editPartsPanel) editPartsPanel.classList.add('hidden');
    if (testMovementControls) testMovementControls.classList.add('hidden');
    
    if (propsTitle) propsTitle.textContent = 'ARMADURA';
  }
}

/**
 * Define a ferramenta ativa no modo Editar Peças
 */
function setEditPartsTool(tool) {
  app.editPartsTool = tool;
  
  const selectBtn = document.getElementById('btn-select-part');
  const moveBtn = document.getElementById('btn-move-part');
  const pivotBtn = document.getElementById('btn-edit-pivot');
  
  // Atualiza estado visual dos botões
  [selectBtn, moveBtn, pivotBtn].forEach(btn => {
    if (btn) btn.classList.remove('active');
  });
  
  if (tool === 'select' && selectBtn) selectBtn.classList.add('active');
  if (tool === 'move' && moveBtn) moveBtn.classList.add('active');
  if (tool === 'pivot' && pivotBtn) pivotBtn.classList.add('active');
  
  // Habilita/desabilita botões de ação baseados na seleção
  const moveBtnEl = document.getElementById('btn-move-part');
  const pivotBtnEl = document.getElementById('btn-edit-pivot');
  const hasSelection = !!app.editPartsSelectedPartId;
  
  if (moveBtnEl) moveBtnEl.disabled = !hasSelection;
  if (pivotBtnEl) pivotBtnEl.disabled = !hasSelection;
}

/**
 * Atualiza painel do Editor de Peças
 */
function updateEditPartsPanel(selectedPart) {
  setEditPartsTool(app.editPartsTool);
  if (!app.partManager) return;
  
  const propsForm = document.getElementById('properties-form');
  const noSel = document.getElementById('no-selection');
  const boneForm = document.getElementById('bone-properties-form');
  const partForm = document.getElementById('part-properties-form');
  
  if (!propsForm) return;
  
  // Esconde formulários de bone e propriedades normais
  if (boneForm) boneForm.classList.add('hidden');
  if (propsForm) propsForm.classList.remove('hidden');
  if (noSel) noSel.classList.add('hidden');
  
  // Limpa o formulário de propriedades
  const existingPanel = document.getElementById('edit-parts-panel');
  if (existingPanel) existingPanel.remove();
  
  // Cria painel do Editor de Peças
  const panel = document.createElement('div');
  panel.id = 'edit-parts-panel';
  panel.style.cssText = 'font-family: Segoe UI, sans-serif;';
  
  const parts = app.partManager.getAllParts();
  const selectedId = selectedPart ? selectedPart.id : (app.editPartsSelectedPartId || null);
  
  panel.innerHTML = `
    <div class="edit-parts-header">
      <h3 style="margin: 0 0 12px; color: #fff; font-size: 14px;">Peças Recortadas</h3>
      <span style="font-size: 12px; color: #888;">${parts.length} peça${parts.length !== 1 ? 's' : ''}</span>
    </div>
    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #333; border-radius: 4px; background: #1e1e1e;">
      ${parts.map(p => `
        <div class="part-list-item" data-part-id="${p.id}" 
             style="display: flex; align-items: center; padding: 8px 12px; cursor: pointer; 
                    border-bottom: 1px solid #333; transition: background 0.15s;
                    ${p.id === selectedId ? 'background: #2a4a6a;' : ''}"
             onmouseover="this.style.background='#2a3a4a'" 
             onmouseout="this.style.background='${p.id === selectedId ? '#2a4a6a' : 'transparent'}'">
          <div style="width: 14px; height: 14px; border-radius: 3px; margin-right: 10px; 
                      background: ${app.currentCharacterObject?.pieceMap?.getRegion(p.boneId)?.color || '#6898b8'}; border: 1px solid #8396a4; flex-shrink: 0;"></div>
          <div style="flex: 1; min-width: 0;">
            <div style="color: #fff; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${p.name}
            </div>
            <div style="color: #888; font-size: 11px;">${p.boneId} • ${p.imageWidth}x${p.imageHeight}</div>
          </div>
          <button class="part-delete-btn" data-part-id="${p.id}" 
                  style="padding: 4px 10px; font-size: 11px; background: #3a3a3a; color: #ff4444; 
                         border: 1px solid #ff4444; border-radius: 3px; cursor: pointer; flex-shrink: 0;
                         opacity: 0.8; transition: opacity 0.15s;"
                  onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">
            Eliminar
          </button>
        </div>
      `).join('')}
    </div>
  `;
  
  document.querySelector('.panel-left .panel-content').appendChild(panel);
  
  // Event listeners para itens da lista
  panel.querySelectorAll('.part-list-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('part-delete-btn')) return;
      const partId = item.dataset.partId;
      const part = app.partManager.getPart(partId);
      if (part) {
        app.editPartsSelectedPartId = partId;
        app.partManager.selectPart(partId);
        updateEditPartsPanel(part);
        updatePartPropertiesPanel(part);
      }
    });
  });
  
  // Botões de eliminar
  panel.querySelectorAll('.part-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const partId = btn.dataset.partId;
      deletePart(partId);
    });
  });
  
  // Destaca item selecionado
  if (selectedId) {
    const selectedItem = panel.querySelector(`.part-list-item[data-part-id="${selectedId}"]`);
    if (selectedItem) {
      selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

/**
 * Atualiza painel de propriedades da peça selecionada
 */
function updatePartPropertiesPanel(part) {
  if (!part) {
    const partForm = document.getElementById('part-properties-form');
    const noSel = document.getElementById('no-selection');
    if (partForm) partForm.classList.add('hidden');
    if (noSel) noSel.classList.remove('hidden');
    return;
  }
  
  const propsForm = document.getElementById('properties-form');
  const noSel = document.getElementById('no-selection');
  const boneForm = document.getElementById('bone-properties-form');
  const partForm = document.getElementById('part-properties-form');
  
  if (!propsForm) return;
  
  // Esconde formulários de bone e propriedades normais
  if (boneForm) boneForm.classList.add('hidden');
  if (propsForm) propsForm.classList.remove('hidden');
  if (noSel) noSel.classList.add('hidden');
  
  // Limpa o formulário de propriedades
  const existingPanel = document.getElementById('part-properties-panel');
  if (existingPanel) existingPanel.remove();
  
  // Cria painel de propriedades da peça
  const panel = document.createElement('div');
  panel.id = 'part-properties-panel';
  panel.style.cssText = 'font-family: Segoe UI, sans-serif;';
  
  panel.innerHTML = `
    <div style="margin-bottom: 16px;">
      <h3 style="margin: 0 0 12px; color: #fff; font-size: 14px;">Propriedades da Peça</h3>
    </div>
    <div class="form-group">
      <label for="part-prop-name">Nome</label>
      <input type="text" id="part-prop-name" value="${part.name}" readonly>
    </div>
    <div class="form-group">
      <label for="part-prop-bone">Osso</label>
      <input type="text" id="part-prop-bone" value="${part.boneId}" readonly>
    </div>
    <div class="form-group">
      <label for="part-prop-pivot">Pivô</label>
      <div class="form-row" style="align-items: center; gap: 8px;">
        <input type="number" id="part-prop-pivot-x" step="0.01" min="0" max="1" value="${part.pivot.x.toFixed(2)}" style="width: 80px;">
        <input type="number" id="part-prop-pivot-y" step="0.01" min="0" max="1" value="${part.pivot.y.toFixed(2)}" style="width: 80px;">
      </div>
    </div>
    <div class="form-group">
      <label for="part-prop-visible">Visível</label>
      <input type="checkbox" id="part-prop-visible" ${part.visible ? 'checked' : ''}>
    </div>
    
    <div class="form-group">
      <label>Posição Local</label>
      <div class="form-row">
        <div class="form-group">
          <label for="part-prop-x">X</label>
          <input type="number" id="part-prop-x" step="0.1" value="${part.localPosition.x.toFixed(1)}">
        </div>
        <div class="form-group">
          <label for="part-prop-y">Y</label>
          <input type="number" id="part-prop-y" step="0.1" value="${part.localPosition.y.toFixed(1)}">
        </div>
      </div>
    </div>
    <div class="form-group">
      <label for="part-prop-rotation">Rotação Local (graus)</label>
      <div class="form-row" style="align-items: center; gap: 8px;">
        <input type="number" id="part-prop-rotation" step="1" min="-180" max="180" value="${part.localRotation}" style="width: 80px;">
        <input type="range" id="part-prop-rotation-slider" min="-180" max="180" value="${part.localRotation}" style="flex: 1;">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label for="part-prop-scale-x">Escala X</label>
        <input type="number" id="part-prop-scale-x" step="0.01" min="0.01" value="${part.localScale.x.toFixed(2)}" style="width: 80px;">
      </div>
      <div class="form-group">
        <label for="part-prop-scale-y">Escala Y</label>
        <input type="number" id="part-prop-scale-y" step="0.01" min="0.01" value="${part.localScale.y.toFixed(2)}" style="width: 80px;">
      </div>
    </div>
    <div class="form-group">
      <button id="btn-reset-part-adjustments" class="btn btn-secondary" title="Repor Ajustes">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
        </svg>
        Repor Ajustes
      </button>
      <button id="btn-delete-part" class="btn btn-danger" title="Eliminar Peça">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
        Eliminar Peça
      </button>
    </div>
  `;
  
  propsForm.appendChild(panel);
  
  // Event listeners
  const pivotXInput = document.getElementById('part-prop-pivot-x');
  const pivotYInput = document.getElementById('part-prop-pivot-y');
  const xInput = document.getElementById('part-prop-x');
  const yInput = document.getElementById('part-prop-y');
  const rotationInput = document.getElementById('part-prop-rotation');
  const rotationSlider = document.getElementById('part-prop-rotation-slider');
  const scaleXInput = document.getElementById('part-prop-scale-x');
  const scaleYInput = document.getElementById('part-prop-scale-y');
  const visibleInput = document.getElementById('part-prop-visible');
  const jointBtn=document.createElement('button');
  jointBtn.textContent='Pivô na articulação'; jointBtn.className='btn';
  jointBtn.onclick=()=>{
    const target=part.localTransform.inverseTransformPoint(0,0);
    part.pivot.x+=target.x/part.imageWidth;
    part.pivot.y+=target.y/part.imageHeight;
    part.setLocalPosition(0,0);
    updatePartPropertiesPanel(part);
  };
  panel.append(jointBtn);
  const resetBtn = document.getElementById('btn-reset-part-adjustments');
  const deleteBtn = document.getElementById('btn-delete-part');
  
  if (pivotXInput) {
    pivotXInput.addEventListener('change', () => {
      part.pivot.x = Math.max(0, Math.min(1, parseFloat(pivotXInput.value)));
      part.updateLocalTransform();
      app.renderer.render(app.scene);
    });
  }
  if (pivotYInput) {
    pivotYInput.addEventListener('change', () => {
      part.pivot.y = Math.max(0, Math.min(1, parseFloat(pivotYInput.value)));
      part.updateLocalTransform();
      app.renderer.render(app.scene);
    });
  }
  if (xInput) {
    xInput.addEventListener('change', () => {
      part.setLocalPosition(parseFloat(xInput.value), part.localPosition.y);
      app.renderer.render(app.scene);
    });
  }
  if (yInput) {
    yInput.addEventListener('change', () => {
      part.setLocalPosition(part.localPosition.x, parseFloat(yInput.value));
      app.renderer.render(app.scene);
    });
  }
  if (rotationInput && rotationSlider) {
    const updateRotation = () => {
      const angle = parseFloat(rotationInput.value);
      rotationSlider.value = angle;
      part.setLocalRotation(angle);
      app.renderer.render(app.scene);
    };
    rotationInput.addEventListener('input', updateRotation);
    rotationSlider.addEventListener('input', () => {
      rotationInput.value = rotationSlider.value;
      updateRotation();
    });
  }
  if (scaleXInput) {
    scaleXInput.addEventListener('change', () => {
      const value=Number(scaleXInput.value);
      if (value>0) part.setLocalScale(value,document.getElementById('lock-scale').checked ? part.localScale.y*value/part.localScale.x : part.localScale.y);
      scaleYInput.value=part.localScale.y;
      app.renderer.render(app.scene);
    });
  }
  if (scaleYInput) {
    scaleYInput.addEventListener('change', () => {
      const value=Number(scaleYInput.value);
      if (value>0) part.setLocalScale(document.getElementById('lock-scale').checked ? part.localScale.x*value/part.localScale.y : part.localScale.x,value);
      scaleXInput.value=part.localScale.x;
      app.renderer.render(app.scene);
    });
  }
  if (visibleInput) {
    visibleInput.addEventListener('change', () => {
      part.visible = visibleInput.checked;
      app.renderer.render(app.scene);
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      part.setLocalPosition(0, 0);
      part.setLocalRotation(0);
      part.setLocalScale(1, 1);
      part.pivot = app.currentCharacterObject.pieceMap?.calculatePivot(part.regionId) || {x:0.5,y:0.5};
      updatePartPropertiesPanel(part);
      app.renderer.render(app.scene);
    });
  }
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (confirm(`Eliminar a peça "${part.name}"?`)) {
        deletePart(part.id);
      }
    });
  }
}

/**
 * Elimina uma peça
 */
function deletePart(partId) {
  if (!app.partManager) return;
  
  const part = app.partManager.getPart(partId);
  if (!part) return;
  
  if (confirm(`Eliminar a peça "${part.name}"?`)) {
    app.partManager.removePart(partId);
    
    // Se a peça eliminada era a selecionada, limpa seleção
    if (app.editPartsSelectedPartId === partId) {
      app.editPartsSelectedPartId = null;
    }
    
    updateEditPartsPanel();
    updatePieceCountDisplay();
    app.renderer.render(app.scene);
  }
}

/**
 * Repor ajustes da peça selecionada
 */
function resetPartAdjustments() {
  if (!app.partManager || !app.editPartsSelectedPartId) return;
  
  const part = app.partManager.getPart(app.editPartsSelectedPartId);
  if (!part) return;
  
  part.setLocalPosition(0, 0);
  part.setLocalRotation(0);
  part.setLocalScale(1, 1);
  part.pivot = app.currentCharacterObject.pieceMap?.calculatePivot(part.regionId) || {x:0.5,y:0.5};
  
  updatePartPropertiesPanel(part);
  app.renderer.render(app.scene);
}

/**
 * Elimina a peça selecionada
 */
function deleteSelectedPart() {
  if (!app.editPartsSelectedPartId) return;
  deletePart(app.editPartsSelectedPartId);
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
    
    // Callback quando uma peça é criada
    partManager.onPartCreated = function(part) {
      updatePartsPanel();
      updatePieceCountDisplay();
    };
    
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
    part.regionId = region.id;
    if (part.mask.type === "raster") part.mask.rows = structuredClone(part.mask.rows);
    part.pivot = pivot;
    // Atualiza a transformação local usando o método correto da classe Part
    part.updateLocalTransform();
    
    updateStatus(`Peça "${part.name}" gerada com sucesso! Pivô na articulação.`);
    
    // Oculta a região correspondente na imagem base (marca para ocultação futura)
    region.generated = true;
    region.visible = false; // Oculta a região colorida
    
    // Sai do modo mapa de peças
    exitPieceMapMode();
    
    // Garante que botão de recorte antigo fica oculto antes de entrar no rigging
    const cutBtn = document.getElementById('btn-cut-piece');
    if (cutBtn) cutBtn.style.display = 'none';
    
    // Entra no modo rigging para testar movimento
    enterRiggingMode(obj);
    
    // Atualiza painel
    updatePartsPanel();
    
    // Atualiza contagem de peças
    updatePieceCountDisplay();
    
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
  
  // Proteção contra chamada direta via event handler (MouseEvent)
  if (region && typeof region === 'object' && 'target' in region && 'type' in region) {
    region = null;
  }
  
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
    
    previewCtx.save();
    previewCtx.translate(margin - bounds.x, margin - bounds.y);
    if (mask.type === 'raster') previewCtx.clip(rasterPath(mask));
    else {
      previewCtx.beginPath();
      mask.points.forEach((point, i) => i ? previewCtx.lineTo(point.x, point.y) : previewCtx.moveTo(point.x, point.y));
      previewCtx.closePath();
      previewCtx.clip();
    }
    previewCtx.drawImage(obj.imageElement, 0, 0);
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
  updatePieceCountDisplay();
}

/**
 * Atualiza exibição do contador de peças criadas
 */
function updatePieceCountDisplay() {
  const pieceCountEl = document.getElementById('piece-count');
  const pieceStatusEl = document.getElementById('piece-map-status');
  
  if (!pieceCountEl) return;
  
  // Conta peças criadas no PartManager
  let count = 0;
  if (app.partManager) {
    count = app.partManager.getAllParts().length;
  }
  
  pieceCountEl.textContent = `${count} peça${count !== 1 ? 's' : ''}`;
  
  if (pieceStatusEl) {
    if (count === 0) {
      pieceStatusEl.textContent = 'Nenhuma peça criada';
    } else {
      pieceStatusEl.textContent = `${count} peça${count !== 1 ? 's' : ''} criada${count !== 1 ? 's' : ''} — Testar Movimento disponível`;
      // Mostra controlo Testar Movimento
      const testControls = document.getElementById('test-movement-controls');
      if (testControls) testControls.classList.remove('hidden');
    }
  }
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

/**
 * Inicializa o analisador de silhueta para o personagem atual
 */
async function initializeSilhouetteAnalyzer() {
  if (!app.currentCharacterObject || !app.currentCharacterObject.imageElement) return;
  
  if (app.silhouetteAnalyzer?.imageElement !== app.currentCharacterObject.imageElement) {
    try {
      app.silhouetteAnalyzer = await createSilhouetteAnalyzer(app.currentCharacterObject, {
        alphaThreshold: 128,
        downsample: 1 // Usar resolução original para precisão
      });
      updateStatus('Silhueta analisada');
    } catch (err) {
      console.error('Erro ao analisar silhueta:', err);
      updateStatus(`Erro na análise de silhueta: ${err.message}`);
    }
  }
  
  // Atualiza visualização de cobertura
  updateCoverageVisualization();
}

/**
 * Atualiza a visualização de cobertura anatómica
 */
function updateCoverageVisualization() {
  if (!app.isCalibrationMode || app.calibrationTool !== 'coverage') return;
  if (!app.silhouetteAnalyzer || !app.pieceMap || !app.currentCharacterObject) return;
  
  const alphaThresholdEl = document.getElementById('coverage-alpha-threshold');
  const alphaValueEl = document.getElementById('coverage-alpha-value');
  const coverageBadgeEl = document.getElementById('coverage-badge');
  const statCoveredEl = document.getElementById('stat-covered');
  const statCoveredPxEl = document.getElementById('stat-covered-px');
  const statUncoveredEl = document.getElementById('stat-uncovered');
  const statOverlappingEl = document.getElementById('stat-overlapping');
  const statOutsideEl = document.getElementById('stat-outside');
  const statTotalEl = document.getElementById('stat-total');
  
  const alphaThreshold = alphaThresholdEl ? parseInt(alphaThresholdEl.value, 10) : 128;
  if (alphaValueEl) alphaValueEl.textContent = alphaThreshold;
  
  // Atualiza limiar no analisador
  app.silhouetteAnalyzer.alphaThreshold = alphaThreshold;
  app.silhouetteAnalyzer._silhouetteMask = null; // Força recálculo
  app.silhouetteAnalyzer._silhouettePixelCount = null;
  app.silhouetteAnalyzer._contours = null;
  app.silhouetteAnalyzer._coverageStats = null;
  
  // Opções de visualização
  const showUncovered = document.getElementById('coverage-show-uncovered')?.checked ?? true;
  const showOverlapping = document.getElementById('coverage-show-overlapping')?.checked ?? true;
  const showOutside = document.getElementById('coverage-show-outside')?.checked ?? true;
  const showRegions = document.getElementById('coverage-show-regions')?.checked ?? true;
  
  try {
    const result = app.silhouetteAnalyzer.generateCoverageVisualization(
      app.pieceMap,
      app.currentCharacterObject,
      app.renderer,
      {
        showSilhouette: true,
        showRegions,
        showUncovered,
        showOverlapping,
        showOutside
      }
    );
    
    app.coverageVisualizationCanvas = result.canvas;
    
    // Atualiza estatísticas nos novos elementos
    const stats = result.stats;
    if (coverageBadgeEl) {
      coverageBadgeEl.textContent = `${stats.coverage.toFixed(1)}%`;
    }
    if (statCoveredEl) {
      statCoveredEl.textContent = `${stats.coverage.toFixed(1)}%`;
    }
    if (statCoveredPxEl) {
      statCoveredPxEl.textContent = stats.coveredPixels.toLocaleString();
    }
    if (statUncoveredEl) {
      statUncoveredEl.textContent = stats.uncoveredPixels.toLocaleString();
    }
    if (statOverlappingEl) {
      statOverlappingEl.textContent = stats.overlappingPixels.toLocaleString();
    }
    if (statOutsideEl) {
      statOutsideEl.textContent = stats.outsidePixels.toLocaleString();
    }
    if (statTotalEl) {
      statTotalEl.textContent = stats.totalSilhouettePixels.toLocaleString();
    }
    
    app.renderer.render(app.scene);
  } catch (err) {
    console.error('Erro ao gerar visualização de cobertura:', err);
    const badgeEl = document.getElementById('coverage-badge');
    if (badgeEl) badgeEl.textContent = 'Erro';
  }
}

/**
 * Handler para mudança do limiar alfa
 */
function onCoverageAlphaThresholdChange() {
  const alphaValueEl = document.getElementById('coverage-alpha-value');
  const slider = document.getElementById('coverage-alpha-threshold');
  if (alphaValueEl && slider) {
    alphaValueEl.textContent = slider.value;
  }
  // Debounce a atualização
  clearTimeout(app._coverageUpdateTimeout);
  app._coverageUpdateTimeout = setTimeout(updateCoverageVisualization, 150);
}

/**
 * Desenha a visualização de cobertura no canvas principal
 */
function drawCoverageVisualization() {
  if (!app.coverageVisualizationCanvas || !app.currentCharacterObject) return;
  
  const ctx = app.renderer.ctx;
  const canvas = app.coverageVisualizationCanvas;
  
  // Transforma para espaço do personagem
  ctx.save();
  
  const charMatrix = app.currentCharacterObject.transform.m;
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
  
  // Escala para compensar downsample do analisador
  const scaleX = app.currentCharacterObject.imageWidth / canvas.width;
  const scaleY = app.currentCharacterObject.imageHeight / canvas.height;
  ctx.scale(scaleX, scaleY);
  
  // Desenha a visualização centrada na origem do personagem
  ctx.drawImage(
    canvas,
    -app.currentCharacterObject.imageWidth / 2,
    -app.currentCharacterObject.imageHeight / 2,
    app.currentCharacterObject.imageWidth,
    app.currentCharacterObject.imageHeight
  );
  
  ctx.restore();
}

/**
 * Mostra painel de reconhecimento
 */
function showRecognitionPanel() {
  const recognitionPanel = document.getElementById('recognition-panel');
  if (recognitionPanel) recognitionPanel.classList.remove('hidden');
  
  // Reset UI state
  const readyEl = document.getElementById('recognition-ready');
  const progressEl = document.getElementById('recognition-progress');
  const resultsEl = document.getElementById('recognition-results');
  const errorEl = document.getElementById('recognition-error');
  const badgeEl = document.getElementById('recognition-status-badge');
  
  if (readyEl) readyEl.classList.remove('hidden');
  if (progressEl) progressEl.classList.add('hidden');
  if (resultsEl) resultsEl.classList.add('hidden');
  if (errorEl) errorEl.classList.add('hidden');
  if (badgeEl) {
    badgeEl.textContent = 'Pronto';
    badgeEl.style.background = '#666';
  }
}

/**
 * Inicia reconhecimento anatómico automático
 */
async function startRecognition() {
  if (app.isRecognizing) return;
  if (!app.currentCharacterObject || !app.silhouetteAnalyzer || !app.pieceMap) return;
  
  app.isRecognizing = true;
  app.previousPieceMapState = null; // Será salvo antes de aplicar
  
  const readyEl = document.getElementById('recognition-ready');
  const progressEl = document.getElementById('recognition-progress');
  const resultsEl = document.getElementById('recognition-results');
  const errorEl = document.getElementById('recognition-error');
  const badgeEl = document.getElementById('recognition-status-badge');
  const progressBarEl = document.getElementById('recognition-progress-bar');
  const progressTextEl = document.getElementById('recognition-progress-text');
  const progressMessageEl = document.getElementById('recognition-progress-message');
  
  if (readyEl) readyEl.classList.add('hidden');
  if (progressEl) progressEl.classList.remove('hidden');
  if (resultsEl) resultsEl.classList.add('hidden');
  if (errorEl) errorEl.classList.add('hidden');
  if (badgeEl) {
    badgeEl.textContent = 'A processar...';
    badgeEl.style.background = '#007acc';
  }
  
  let recognizer;
  try {
    // Cria reconhecedor se não existir
    if (app.anatomicalRecognizer?.characterObject !== app.currentCharacterObject) {
      app.anatomicalRecognizer = await createAnatomicalRecognizer(
        app.currentCharacterObject,
        app.silhouetteAnalyzer,
        app.currentCharacterObject.rig,
        app.renderer
      );
    }
    
    // Executa reconhecimento
    recognizer = app.anatomicalRecognizer;
    const result = await recognizer.recognize({
      method: document.getElementById('recognition-method').value,
      onProgress: (percent, message) => {
        if (progressBarEl) progressBarEl.style.width = `${percent}%`;
        if (progressTextEl) progressTextEl.textContent = `${Math.round(percent)}%`;
        if (progressMessageEl) progressMessageEl.textContent = message;
      }
    });
    
    if (recognizer !== app.anatomicalRecognizer) return;
    app.recognitionResult = result;
    
    // Gera visualização
    app.recognitionVisualizationCanvas = result.masks ? 
      app.anatomicalRecognizer.generateVisualization().canvas : null;
    
    // Atualiza UI com resultados
    if (progressEl) progressEl.classList.add('hidden');
    if (resultsEl) resultsEl.classList.remove('hidden');
    if (badgeEl) {
      badgeEl.textContent = 'Concluído';
      badgeEl.style.background = '#28a745';
    }
    
    // Mostra resumo de qualidade
    const qualityEl = document.getElementById('recognition-quality-summary');
    if (qualityEl && result.quality) {
      const q = result.quality;
      qualityEl.innerHTML = `
        Cobertura: <strong>${q.coverage.toFixed(1)}%</strong> | 
        Píxeis da silhueta: ${q.totalSilhouettePixels} | 
        Cobertos: ${q.coveredPixels} | 
        Não cobertos: <span style="color: #ff6666;">${q.uncoveredPixels}</span> | 
        Sobreposição: <span style="color: #ff66ff;">${q.overlappingPixels}</span> | 
        Fora: <span style="color: #ffff66;">${q.outsidePixels}</span>
        <br>Atribuição correta: por validar. Regiões sem máscara: ${app.pieceMap.getAllRegions().filter(r => !result.masks.has(r.id)).map(r => r.name).join(', ') || 'nenhuma'}.
        <br>Regiões detectadas: ${Object.keys(q.regions).length}
      `;
    }
    
    // Renderiza visualização
    app.renderer.render(app.scene);
    
  } catch (err) {
    if (recognizer && (recognizer.cancelRequested || recognizer !== app.anatomicalRecognizer)) return;
    console.error('Erro no reconhecimento:', err);
    const readyEl = document.getElementById('recognition-ready');
    if (progressEl) progressEl.classList.add('hidden');
    if (app.anatomicalRecognizer?.cancelRequested) return;
    if (readyEl) readyEl.classList.remove('hidden');
    if (errorEl) {
      errorEl.textContent = `Erro: ${err.message}`;
      errorEl.classList.remove('hidden');
    }
    if (badgeEl) {
      badgeEl.textContent = 'Erro';
      badgeEl.style.background = '#dc3545';
    }
  } finally {
    if (recognizer && recognizer !== app.anatomicalRecognizer) recognizer.dispose();
    app.isRecognizing = false;
  }
}

/**
 * Cancela reconhecimento em andamento
 */
function cancelRecognition() {
  if (app.anatomicalRecognizer) {
    app.anatomicalRecognizer.cancel();
  }
  
  const readyEl = document.getElementById('recognition-ready');
  const progressEl = document.getElementById('recognition-progress');
  const badgeEl = document.getElementById('recognition-status-badge');
  
  if (readyEl) readyEl.classList.remove('hidden');
  if (progressEl) progressEl.classList.add('hidden');
  if (badgeEl) {
    badgeEl.textContent = 'Cancelado';
    badgeEl.style.background = '#666';
  }
  
  updateStatus('Reconhecimento cancelado');
}

/**
 * Aplica o reconhecimento ao PieceMap
 */
function applyRecognition() {
  if (!app.recognitionResult || !app.anatomicalRecognizer || !app.pieceMap) return;
  
  // Salva estado anterior do PieceMap para permitir reverter
  app.previousPieceMapState = JSON.parse(JSON.stringify(app.pieceMap.toJSON()));
  
  // Converte máscaras anatómicas para regiões do PieceMap
  const masks = app.anatomicalRecognizer.anatomicalMasks;
  const silW = app.silhouetteAnalyzer._alphaWidth;
  const silH = app.silhouetteAnalyzer._alphaHeight;
  
  const regions = app.pieceMap.getAllRegions();
  for (const region of regions) {
    const mask = masks.get(region.id);
    region.raster = mask ? encodeRegion(mask, silW, silH) : { type: 'raster', rows: {} };
  }

  // Notifica mudança
  if (app.pieceMap.onRegionChange) {
    for (const region of regions) {
      app.pieceMap.onRegionChange(region);
    }
  }
  
  // Atualiza UI
  updateCalibrationPanel();
  app.renderer.render(app.scene);
  
  // Esconde painel de resultados
  const resultsEl = document.getElementById('recognition-results');
  if (resultsEl) resultsEl.classList.add('hidden');
  
  const badgeEl = document.getElementById('recognition-status-badge');
  if (badgeEl) {
    badgeEl.textContent = 'Aplicado';
    badgeEl.style.background = '#28a745';
  }
  
  updateStatus('Reconhecimento anatómico aplicado às regiões');
}

/**
 * Cancela resultado do reconhecimento (reverte para estado anterior)
 */
function cancelRecognitionResult() {
  // Restaura PieceMap anterior se existir
  if (app.previousPieceMapState && app.currentCharacterObject) {
    app.currentCharacterObject.pieceMap = PieceMap.fromJSON(
      app.previousPieceMapState,
      app.currentCharacterObject,
      app.currentCharacterObject.rig,
      app.renderer
    );
    app.pieceMap = app.currentCharacterObject.pieceMap;
    app.pieceMap.onSelectionChange = onCalibrationRegionSelectionChange;
    app.pieceMap.onRegionChange = onCalibrationRegionChange;
    updateCalibrationPanel();
    app.renderer.render(app.scene);
  }
  
  const resultsEl = document.getElementById('recognition-results');
  if (resultsEl) resultsEl.classList.add('hidden');
  
  const badgeEl = document.getElementById('recognition-status-badge');
  if (badgeEl) {
    badgeEl.textContent = 'Revertido';
    badgeEl.style.background = '#666';
  }
  
  app.recognitionResult = null;
  app.recognitionVisualizationCanvas = null;
  app.previousPieceMapState = null;
  
  updateStatus('Reconhecimento revertido');
}

/**
 * Desenha a visualização de reconhecimento no canvas principal
 */
function drawRecognitionVisualization() {
  if (!app.recognitionVisualizationCanvas || !app.currentCharacterObject) return;
  
  const ctx = app.renderer.ctx;
  const canvas = app.recognitionVisualizationCanvas;
  
  ctx.save();
  
  const charMatrix = app.currentCharacterObject.transform.m;
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
  
  const scaleX = app.currentCharacterObject.imageWidth / canvas.width;
  const scaleY = app.currentCharacterObject.imageHeight / canvas.height;
  ctx.scale(scaleX, scaleY);
  
  ctx.drawImage(
    canvas,
    -app.currentCharacterObject.imageWidth / 2,
    -app.currentCharacterObject.imageHeight / 2,
    app.currentCharacterObject.imageWidth,
    app.currentCharacterObject.imageHeight
  );
  
  ctx.restore();
}

// Inicializa quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}