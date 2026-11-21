/**
 * Test Runner - Executa testes unitários
 * Node.js environment
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carrega módulos do projeto (precisamos simular browser APIs)
global.Image = class MockImage {
  constructor() {
    this.onload = null;
    this.onerror = null;
    this.src = '';
    this.width = 100;
    this.height = 100;
    // Simula carregamento assíncrono
    setTimeout(() => {
      if (this.onload) this.onload();
    }, 0);
  }
};

global.document = {
  createElement: (tag) => {
    if (tag === 'canvas') {
      return {
        getContext: () => ({
          clearRect: () => {},
          drawImage: () => {},
          save: () => {},
          restore: () => {},
          transform: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          stroke: () => {},
          fill: () => {},
          arc: () => {},
          closePath: () => {},
          rect: () => {},
          setLineDash: () => {}
        }),
        width: 800,
        height: 600,
        style: {},
        parentElement: {
          getBoundingClientRect: () => ({ width: 800, height: 600 })
        }
      };
    }
    if (tag === 'a') {
      return {
        href: '',
        download: '',
        click: () => {},
        appendChild: () => {},
        removeChild: () => {}
      };
    }
    return {
      addEventListener: () => {},
      removeEventListener: () => {},
      style: {},
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      innerHTML: '',
      textContent: '',
      value: '',
      dataset: {},
      getBoundingClientRect: () => ({ width: 800, height: 600 }),
      querySelector: () => null,
      querySelectorAll: () => []
    };
  },
  getElementById: () => null,
  body: {
    appendChild: () => {},
    removeChild: () => {}
  }
};

global.window = {
  devicePixelRatio: 1,
  URL: {
    createObjectURL: () => 'blob:mock',
    revokeObjectURL: () => {}
  },
  showSaveFilePicker: async () => ({ createWritable: async () => ({ write: async () => {}, close: async () => {} }) }),
  showOpenFilePicker: async () => [{ getFile: async () => new File([''], 'test.rigbystudio') }]
};

global.FileReader = class MockFileReader {
  constructor() {
    this.onload = null;
    this.onerror = null;
    this.result = '';
  }
  readAsText(file) {
    setTimeout(() => {
      if (this.onload) this.onload({ target: { result: this.result } });
    }, 0);
  }
  readAsDataURL(file) {
    setTimeout(() => {
      if (this.onload) this.onload({ target: { result: 'data:image/png;base64,mock' } });
    }, 0);
  }
};

global.File = class MockFile {
  constructor(parts, name, options = {}) {
    this.name = name;
    this.type = options.type || 'image/png';
    this.size = parts.reduce((sum, p) => sum + (p.length || 0), 0);
  }
};

global.Blob = class MockBlob {
  constructor(parts, options = {}) {
    this.type = options.type || '';
  }
};

// Importa módulos do projeto
import { Transform2D, createTransform } from '../src/core/Transform2D.js';
import { Scene, SceneObject } from '../src/core/Scene.js';
import { projectStorage } from '../src/core/ProjectStorage.js';
import { generateId, validatePNGFile, loadImageInfo, createSceneObjectFromFile } from '../src/editor/ImageImporter.js';

// Resultados dos testes
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Values not equal'}: expected ${expected}, got ${actual}`);
  }
}

function assertApprox(actual, expected, epsilon = 1e-6, message) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message || 'Values not approx equal'}: expected ~${expected}, got ${actual}`);
  }
}

async function runTest(name, fn) {
  console.log(`\n🧪 ${name}...`);
  try {
    await fn();
    testResults.passed++;
    testResults.tests.push({ name, passed: true });
    console.log(`  ✅ PASSOU`);
  } catch (err) {
    testResults.failed++;
    testResults.tests.push({ name, passed: false, error: err.message });
    console.log(`  ❌ FALHOU: ${err.message}`);
  }
}

// ===== TESTES =====

// 1. Transform2D - Básicos
await runTest('Transform2D: Identidade', () => {
  const t = new Transform2D();
  const d = t.decompose();
  assertApprox(d.x, 0);
  assertApprox(d.y, 0);
  assertApprox(d.rotation, 0);
  assertApprox(d.scaleX, 1);
  assertApprox(d.scaleY, 1);
});

await runTest('Transform2D: Translação', () => {
  const t = new Transform2D().translate(10, 20);
  const d = t.decompose();
  assertApprox(d.x, 10);
  assertApprox(d.y, 20);
});

await runTest('Transform2D: Rotação 90°', () => {
  const t = new Transform2D().rotate(90);
  const d = t.decompose();
  assertApprox(d.rotation, 90);
});

await runTest('Transform2D: Escala', () => {
  const t = new Transform2D().scale(2, 3);
  const d = t.decompose();
  assertApprox(d.scaleX, 2);
  assertApprox(d.scaleY, 3);
});

await runTest('Transform2D: Compose/Decompose round-trip', () => {
  const t1 = createTransform(10, 20, 45, 2, 0.5);
  const d = t1.decompose();
  const t2 = createTransform(d.x, d.y, d.rotation, d.scaleX, d.scaleY);

  assert(t1.equals(t2), 'Round-trip compose/decompose falhou');
});

await runTest('Transform2D: TransformPoint / InverseTransformPoint', () => {
  const t = createTransform(100, 50, 30, 2, 2);
  const world = t.transformPoint(10, 20);
  const local = t.inverseTransformPoint(world.x, world.y);
  assertApprox(local.x, 10);
  assertApprox(local.y, 20);
});

await runTest('Transform2D: Inversão de matriz', () => {
  const t = createTransform(10, 20, 45, 2, 3);
  const inv = t.getInverse();
  const result = t.clone().multiply(inv);
  const d = result.decompose();
  assertApprox(d.x, 0, 1e-5);
  assertApprox(d.y, 0, 1e-5);
  assertApprox(d.rotation, 0, 1e-5);
  assertApprox(d.scaleX, 1, 1e-5);
  assertApprox(d.scaleY, 1, 1e-5);
});

// 2. SceneObject
await runTest('SceneObject: Criação básica', () => {
  const obj = new SceneObject({
    name: 'Teste',
    imageWidth: 100,
    imageHeight: 50
  });
  assert(obj.id.startsWith('obj_'));
  assert(obj.name === 'Teste');
  assert(obj.imageWidth === 100);
  assert(obj.imageHeight === 50);
  assert(obj.visible === true);
  assert(obj.locked === false);
});

await runTest('SceneObject: ContainsPoint - sem rotação', () => {
  const obj = new SceneObject({
    imageWidth: 100,
    imageHeight: 100,
    transform: { matrix: [1, 0, 0, 1, 0, 0] }
  });
  // Centro
  assert(obj.containsPoint(0, 0) === true);
  // Dentro
  assert(obj.containsPoint(30, 30) === true);
  // Fora
  assert(obj.containsPoint(60, 60) === false);
  assert(obj.containsPoint(-60, -60) === false);
});

await runTest('SceneObject: ContainsPoint - com rotação 90°', () => {
  const obj = new SceneObject({
    imageWidth: 100,
    imageHeight: 50,
    transform: { matrix: [0, 1, -1, 0, 0, 0] } // 90° rotation
  });
  // No espaço local: x vai de -50 a 50, y vai de -25 a 25
  // Rotacionado 90°: local (x,y) -> world (-y, x)
  // Ponto (0,0) local -> (0,0) mundo
  assert(obj.containsPoint(0, 0) === true);
  // Ponto (30, 0) local -> (0, 30) mundo
  assert(obj.containsPoint(0, 30) === true);
  // Ponto (0, 20) local -> (-20, 0) mundo
  assert(obj.containsPoint(-20, 0) === true);
});

await runTest('SceneObject: getWorldBounds', () => {
  const obj = new SceneObject({
    imageWidth: 100,
    imageHeight: 100,
    transform: { matrix: [1, 0, 0, 1, 10, 20] }
  });
  const bounds = obj.getWorldBounds();
  assertApprox(bounds.x, -40); // 10 - 50
  assertApprox(bounds.y, -30); // 20 - 50
  assertApprox(bounds.width, 100);
  assertApprox(bounds.height, 100);
});

await runTest('SceneObject: getWorldBounds com rotação', () => {
  const obj = new SceneObject({
    imageWidth: 100,
    imageHeight: 50,
    transform: { matrix: [0, 1, -1, 0, 0, 0] } // 90°
  });
  const bounds = obj.getWorldBounds();
  // Após rotação 90°, width/height trocam
  assertApprox(bounds.width, 50, 1);
  assertApprox(bounds.height, 100, 1);
});

await runTest('SceneObject: Serialização JSON', () => {
  const obj = new SceneObject({
    name: 'Teste',
    imageWidth: 100,
    imageHeight: 50,
    transform: { matrix: [1, 0, 0, 1, 10, 20] }
  });
  const json = obj.toJSON();
  const obj2 = SceneObject.fromJSON(json);
  assert(obj2.name === 'Teste');
  assert(obj2.imageWidth === 100);
  assert(obj2.imageHeight === 50);
  assert(obj2.transform.equals(obj.transform));
});

// 3. Scene
await runTest('Scene: Add/Remove objetos', () => {
  const scene = new Scene();
  const obj1 = new SceneObject({ name: 'Obj1' });
  const obj2 = new SceneObject({ name: 'Obj2' });

  scene.addObject(obj1);
  scene.addObject(obj2);

  assert(scene.objects.length === 2);
  assert(scene.getObject(obj1.id) === obj1);

  scene.removeObject(obj1.id);
  assert(scene.objects.length === 1);
  assert(scene.getObject(obj1.id) === undefined);
});

await runTest('Scene: Ordem de camadas', () => {
  const scene = new Scene();
  const obj1 = new SceneObject({ name: 'Obj1' });
  const obj2 = new SceneObject({ name: 'Obj2' });
  const obj3 = new SceneObject({ name: 'Obj3' });

  scene.addObject(obj1); // layerOrder 0
  scene.addObject(obj2); // layerOrder 1
  scene.addObject(obj3); // layerOrder 2

  // Move obj1 para cima
  scene.moveObjectToLayerOrder(obj1.id, 2);
  assert(scene.objects[2].id === obj1.id);
});

await runTest('Scene: getObjectAt - seleção por clique', () => {
  const scene = new Scene();
  const obj1 = new SceneObject({ name: 'Obj1', imageWidth: 100, imageHeight: 100 });
  const obj2 = new SceneObject({ name: 'Obj2', imageWidth: 100, imageHeight: 100 });
  obj2.transform.translate(200, 0); // Longe do obj1

  scene.addObject(obj1);
  scene.addObject(obj2);

  // Clica no obj1
  const hit = scene.getObjectAt(0, 0);
  assert(hit === obj1);

  // Clica no obj2
  const hit2 = scene.getObjectAt(200, 0);
  assert(hit2 === obj2);

  // Clica no vazio
  const hit3 = scene.getObjectAt(500, 500);
  assert(hit3 === null);
});

await runTest('Scene: Serialização JSON completa', () => {
  const scene = new Scene();
  scene.name = 'Meu Projeto';
  const obj = new SceneObject({ name: 'Teste', imageWidth: 100, imageHeight: 100 });
  scene.addObject(obj);

  const json = scene.toJSON();
  const scene2 = Scene.fromJSON(json);

  assert(scene2.name === 'Meu Projeto');
  assert(scene2.objects.length === 1);
  assert(scene2.objects[0].name === 'Teste');
});

// 4. ProjectStorage
await runTest('ProjectStorage: Novo projeto', () => {
  const proj = projectStorage.createNewProject('Teste');
  assert(proj.name === 'Teste');
  assert(proj.version === '1.0.0');
  assert(proj.projectId);
  assert(Array.isArray(proj.objects));
});

await runTest('ProjectStorage: Serialização/Desserialização', () => {
  const proj = projectStorage.createNewProject('Teste');
  const obj = new SceneObject({ 
    name: 'Img', 
    imageWidth: 100, 
    imageHeight: 100,
    imageData: 'data:image/png;base64,mock'
  });
  proj.objects.push(obj.toJSON());
  proj.nextLayerOrder = 1;

  const json = projectStorage.serialize(proj);
  const proj2 = projectStorage.deserialize(json);

  assert(proj2.name === 'Teste');
  assert(proj2.objects.length === 1);
  assert(proj2.objects[0].name === 'Img');
});

await runTest('ProjectStorage: Validação de projeto', () => {
  const valid = projectStorage.validateProject({
    version: '1.0.0',
    projectId: 'test',
    name: 'Test',
    objects: [{
      id: 'obj1',
      imageData: 'data:image/png;base64,test',
      imageWidth: 100,
      imageHeight: 100,
      transform: { matrix: [1,0,0,1,0,0] }
    }]
  });
  assert(valid.valid === true);

  const invalid = projectStorage.validateProject({
    version: '1.0.0',
    projectId: 'test',
    name: 'Test',
    objects: [{
      id: 'obj1',
      // imageData faltando
      imageWidth: 100,
      imageHeight: 100,
      transform: { matrix: [1,0,0,1,0,0] }
    }]
  });
  assert(invalid.valid === false);
  assert(invalid.errors.length > 0);
});

// 5. ImageImporter
await runTest('ImageImporter: validatePNGFile', () => {
  const validFile = new File(['test'], 'test.png', { type: 'image/png' });
  const result = validatePNGFile(validFile);
  assert(result.valid === true);

  const invalidFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
  const result2 = validatePNGFile(invalidFile);
  assert(result2.valid === false);
});

await runTest('generateId: Unicidade', () => {
  const ids = new Set();
  for (let i = 0; i < 100; i++) {
    ids.add(generateId());
  }
  assert(ids.size === 100);
});

// 6. Teste de integração: Serialização completa com transformações
await runTest('Integração: Projeto com múltiplas imagens e transformações', () => {
  const scene = new Scene();

  // Objeto 1: no centro, rotacionado 90°
  const obj1 = new SceneObject({
    name: 'Imagem1',
    imageWidth: 200,
    imageHeight: 100,
    transform: { matrix: [0, 1, -1, 0, 0, 0] } // 90°
  });

  // Objeto 2: movido, escalado
  const obj2 = new SceneObject({
    name: 'Imagem2',
    imageWidth: 150,
    imageHeight: 150,
    transform: { matrix: [2, 0, 0, 2, 100, -50] } // escala 2x, pos (100, -50)
  });

  scene.addObject(obj1);
  scene.addObject(obj2);

  // Serializa
  const json = scene.toJSON();

  // Desserializa
  const scene2 = Scene.fromJSON(json);

  // Verifica obj1
  const o1 = scene2.getObject(obj1.id);
  assert(o1 !== undefined);
  const d1 = o1.transform.decompose();
  assertApprox(d1.rotation, 90, 0.1);
  assertApprox(d1.scaleX, 1);
  assertApprox(d1.scaleY, 1);

  // Verifica obj2
  const o2 = scene2.getObject(obj2.id);
  assert(o2 !== undefined);
  const d2 = o2.transform.decompose();
  assertApprox(d2.x, 100);
  assertApprox(d2.y, -50);
  assertApprox(d2.scaleX, 2);
  assertApprox(d2.scaleY, 2);
});

// 7. Teste de seleção com rotação
await runTest('Seleção: Objeto rotacionado 90° contém ponto corretamente', () => {
  const obj = new SceneObject({
    imageWidth: 100,
    imageHeight: 50,
    transform: { matrix: [0, 1, -1, 0, 0, 0] } // 90°
  });

  // No espaço local: retângulo de -50 a 50 em X, -25 a 25 em Y
  // Rotacionado 90°: mundo X = -localY, mundo Y = localX

  // Centro (0,0) local -> (0,0) mundo
  assert(obj.containsPoint(0, 0) === true);

  // Canto superior direito local (50, -25) -> mundo (25, 50)
  assert(obj.containsPoint(25, 50) === true);

  // Fora
  assert(obj.containsPoint(100, 100) === false);
});

// 8. Teste de bounds com rotação
await runTest('Bounds: Objeto rotacionado tem bounds corretos', () => {
  const obj = new SceneObject({
    imageWidth: 100,
    imageHeight: 50,
    transform: { matrix: [0, 1, -1, 0, 0, 0] } // 90°
  });

  const bounds = obj.getWorldBounds();
  // Após rotação 90°, width=50, height=100
  assertApprox(bounds.width, 50, 1);
  assertApprox(bounds.height, 100, 1);
});

// 9. Teste de integração: fluxo de importação (regressão do bug obj.transform.decompose is not a function)
await runTest('Integração: Fluxo de importação cria SceneObject válido com Transform2D', () => {
  const scene = new Scene();
  
  // Simula o que createSceneObjectFromFile retorna (objeto simples)
  const plainObject = {
    id: 'test-obj-1',
    name: 'TestImage',
    type: 'image',
    visible: true,
    locked: false,
    imageData: 'data:image/png;base64,mock',
    imageWidth: 100,
    imageHeight: 100,
    imageElement: null,
    transform: { matrix: [1, 0, 0, 1, 0, 0] },
    layerOrder: 0
  };
  
  // Simula o fluxo: addObject converte para SceneObject
  const sceneObject = scene.addObject(plainObject);
  
  // Verifica que o objeto retornado é uma instância de SceneObject
  assert(sceneObject instanceof SceneObject, 'addObject deve retornar SceneObject');
  
  // Verifica que transform é uma instância de Transform2D
  assert(sceneObject.transform instanceof Transform2D, 'transform deve ser Transform2D');
  
  // Verifica que os métodos de Transform2D existem
  assert(typeof sceneObject.transform.decompose === 'function', 'transform.decompose deve ser função');
  assert(typeof sceneObject.transform.transformPoint === 'function', 'transform.transformPoint deve ser função');
  assert(typeof sceneObject.transform.inverseTransformPoint === 'function', 'transform.inverseTransformPoint deve ser função');
  
  // Verifica que métodos de SceneObject existem
  assert(typeof sceneObject.getTransformedCorners === 'function', 'getTransformedCorners deve ser função');
  assert(typeof sceneObject.containsPoint === 'function', 'containsPoint deve ser função');
  assert(typeof sceneObject.getWorldBounds === 'function', 'getWorldBounds deve ser função');
  
  // Testa decompose (era aqui que falhava)
  const decomp = sceneObject.transform.decompose();
  assertApprox(decomp.x, 0);
  assertApprox(decomp.y, 0);
  assertApprox(decomp.rotation, 0);
  assertApprox(decomp.scaleX, 1);
  assertApprox(decomp.scaleY, 1);
  
  // Testa containsPoint
  assert(sceneObject.containsPoint(0, 0) === true);
  assert(sceneObject.containsPoint(60, 60) === false);
  
  // Testa getTransformedCorners
  const corners = sceneObject.getTransformedCorners();
  assert(corners.length === 4);
  assert(typeof corners[0].x === 'number');
  assert(typeof corners[0].y === 'number');
  
  // Testa getWorldBounds
  const bounds = sceneObject.getWorldBounds();
  assertApprox(bounds.width, 100);
  assertApprox(bounds.height, 100);
});

// 10. Teste de integração: seleção após importação
await runTest('Integração: Seleção após importação funciona corretamente', () => {
  const scene = new Scene();
  const renderer = {
    screenToWorld: (x, y) => ({ x, y }),
    worldToScreen: (x, y) => ({ x, y })
  };
  
  // Mock SelectionManager
  const selectionManager = {
    selectedObject: null,
    renderer: renderer,
    scene: scene,
    selectObject(obj) { this.selectedObject = obj; },
    getSelectedObject() { return this.selectedObject; },
    updateFromObject(obj) {
      if (!obj) return;
      // Simula o que TransformControls.updateFromObject faz
      const decomp = obj.transform.decompose();
      assert(typeof decomp.x === 'number');
      assert(typeof decomp.y === 'number');
      assert(typeof decomp.rotation === 'number');
      assert(typeof decomp.scaleX === 'number');
      assert(typeof decomp.scaleY === 'number');
    }
  };
  
  // Cria objeto simples (como createSceneObjectFromFile retorna)
  const plainObject = {
    id: 'test-obj-2',
    name: 'TestImage2',
    type: 'image',
    visible: true,
    locked: false,
    imageData: 'data:image/png;base64,mock',
    imageWidth: 200,
    imageHeight: 100,
    imageElement: null,
    transform: { matrix: [0, 1, -1, 0, 50, -25] }, // 90° rotacionado + translação
    layerOrder: 0
  };
  
  // Adiciona à cena (converte para SceneObject)
  const sceneObject = scene.addObject(plainObject);
  
  // Seleciona (simula selectionManager.selectObject)
  selectionManager.selectObject(sceneObject);
  
  // Atualiza UI (simula TransformControls.updateFromObject)
  selectionManager.updateFromObject(selectionManager.getSelectedObject());
  
  // Se chegou aqui sem erro, o teste passou
});

// 11. Teste de regressão: Drag & Drop - conversão de coordenadas tela -> mundo
await runTest('Regressão Drag&Drop: Conversão de coordenadas tela para mundo', () => {
  // Mock renderer com viewport conhecida
  const renderer = {
    viewportScale: 1,
    viewportOffsetX: 0,
    viewportOffsetY: 0,
    canvasWidth: 800,
    canvasHeight: 600,
    viewport: new Transform2D(),
    screenToWorld(screenX, screenY) {
      const centerX = this.canvasWidth / 2;
      const centerY = this.canvasHeight / 2;
      return {
        x: (screenX - centerX) / this.viewportScale - this.viewportOffsetX,
        y: (screenY - centerY) / this.viewportScale - this.viewportOffsetY
      };
    },
    worldToScreen(worldX, worldY) {
      const centerX = this.canvasWidth / 2;
      const centerY = this.canvasHeight / 2;
      return {
        x: (worldX + this.viewportOffsetX) * this.viewportScale + centerX,
        y: (worldY + this.viewportOffsetY) * this.viewportScale + centerY
      };
    }
  };
  
  // Centro do canvas (400, 300) deve mapear para origem (0, 0)
  const center = renderer.screenToWorld(400, 300);
  assertApprox(center.x, 0, 0.1, 'Centro do canvas deve ser origem');
  assertApprox(center.y, 0, 0.1, 'Centro do canvas deve ser origem');
  
  // Canto superior esquerdo (0, 0) -> (-400, -300)
  const topLeft = renderer.screenToWorld(0, 0);
  assertApprox(topLeft.x, -400, 0.1);
  assertApprox(topLeft.y, -300, 0.1);
  
  // Canto inferior direito (800, 600) -> (400, 300)
  const bottomRight = renderer.screenToWorld(800, 600);
  assertApprox(bottomRight.x, 400, 0.1);
  assertApprox(bottomRight.y, 300, 0.1);
  
  // Round-trip
  const world = { x: 100, y: -50 };
  const screen = renderer.worldToScreen(world.x, world.y);
  const back = renderer.screenToWorld(screen.x, screen.y);
  assertApprox(back.x, world.x, 0.1, 'Round-trip world->screen->world');
  assertApprox(back.y, world.y, 0.1, 'Round-trip world->screen->world');
  
  // Com zoom 2x
  renderer.viewportScale = 2;
  const zoomed = renderer.screenToWorld(500, 350); // 100px à direita do centro, 50px abaixo
  assertApprox(zoomed.x, 50, 0.1, 'Com zoom 2x');
  assertApprox(zoomed.y, 25, 0.1, 'Com zoom 2x');
  
  // Com pan
  renderer.viewportScale = 1;
  renderer.viewportOffsetX = 100;
  renderer.viewportOffsetY = -50;
  const panned = renderer.screenToWorld(400, 300); // Centro do canvas
  assertApprox(panned.x, -100, 0.1, 'Com pan X');
  assertApprox(panned.y, 50, 0.1, 'Com pan Y');
});

// 12. Teste de regressão: Drag & Drop - validação PNG
await runTest('Regressão Drag&Drop: Validação rejeita JPEG', () => {
  // validatePNGFile já importado no topo
  
  // Mock File JPEG
  const jpegFile = {
    name: 'test.jpg',
    type: 'image/jpeg',
    size: 1000
  };
  
  const result = validatePNGFile(jpegFile);
  assert(result.valid === false, 'JPEG deve ser rejeitado');
  assert(result.errors.some(e => e.includes('PNG')), 'Mensagem deve mencionar PNG');
  
  // Mock File PNG
  const pngFile = {
    name: 'test.png',
    type: 'image/png',
    size: 1000
  };
  
  const resultPng = validatePNGFile(pngFile);
  assert(resultPng.valid === true, 'PNG deve ser aceite');
  
  // Arquivo grande
  const largeFile = {
    name: 'large.png',
    type: 'image/png',
    size: 60 * 1024 * 1024 // 60MB
  };
  
  const resultLarge = validatePNGFile(largeFile);
  assert(resultLarge.valid === false, 'Arquivo > 50MB deve ser rejeitado');
  assert(resultLarge.errors.some(e => e.includes('grande')), 'Mensagem deve mencionar tamanho');
});

// 13. Teste de regressão: Drag & Drop - posicionamento no ponto de largada
await runTest('Regressão Drag&Drop: Posicionamento no ponto de largada', () => {
  const scene = new Scene();
  
  // Mock renderer
  const renderer = {
    canvasWidth: 800,
    canvasHeight: 600,
    viewportScale: 1,
    viewportOffsetX: 0,
    viewportOffsetY: 0,
    screenToWorld(screenX, screenY) {
      const centerX = this.canvasWidth / 2;
      const centerY = this.canvasHeight / 2;
      return {
        x: (screenX - centerX) / this.viewportScale - this.viewportOffsetX,
        y: (screenY - centerY) / this.viewportScale - this.viewportOffsetY
      };
    }
  };
  
  // Simula drop no centro do canvas (400, 300) -> mundo (0, 0)
  const dropScreenX = 400;
  const dropScreenY = 300;
  const worldPos = renderer.screenToWorld(dropScreenX, dropScreenY);
  
  // Cria objeto simples
  const plainObject = {
    id: 'drop-test',
    name: 'DropTest',
    type: 'image',
    visible: true,
    locked: false,
    imageData: 'data:image/png;base64,mock',
    imageWidth: 100,
    imageHeight: 100,
    imageElement: null,
    transform: { matrix: [1, 0, 0, 1, 0, 0] },
    layerOrder: 0
  };
  
  // Aplica posicionamento no ponto de largada (como handleDropImport faz)
  plainObject.transform.matrix[4] = worldPos.x;
  plainObject.transform.matrix[5] = worldPos.y;
  
  const sceneObject = scene.addObject(plainObject);
  
  // Verifica que a posição está correta
  const decomp = sceneObject.transform.decompose();
  assertApprox(decomp.x, 0, 0.1, 'Posição X deve ser 0 (centro)');
  assertApprox(decomp.y, 0, 0.1, 'Posição Y deve ser 0 (centro)');
  
  // Simula drop em (200, 150) -> mundo (-200, -150)
  const dropScreenX2 = 200;
  const dropScreenY2 = 150;
  const worldPos2 = renderer.screenToWorld(dropScreenX2, dropScreenY2);
  
  const plainObject2 = {
    ...plainObject,
    id: 'drop-test-2',
    transform: { matrix: [1, 0, 0, 1, worldPos2.x, worldPos2.y] }
  };
  
  const sceneObject2 = scene.addObject(plainObject2);
  const decomp2 = sceneObject2.transform.decompose();
  assertApprox(decomp2.x, -200, 0.1, 'Posição X no quadrante superior esquerdo');
  assertApprox(decomp2.y, -150, 0.1, 'Posição Y no quadrante superior esquerdo');
});

// Resumo
console.log('\n' + '='.repeat(50));
console.log('📊 RESUMO DOS TESTES');
console.log('='.repeat(50));
console.log(`✅ Passaram: ${testResults.passed}`);
console.log(`❌ Falharam: ${testResults.failed}`);
console.log(`📝 Total: ${testResults.passed + testResults.failed}`);

if (testResults.failed > 0) {
  console.log('\n❌ TESTES FALHARAM:');
  for (const test of testResults.tests) {
    if (!test.passed) {
      console.log(`  - ${test.name}: ${test.error}`);
    }
  }
  process.exit(1);
} else {
  console.log('\n🎉 TODOS OS TESTES PASSARAM!');
  process.exit(0);
}