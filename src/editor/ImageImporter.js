/**
 * ImageImporter - Importação de imagens PNG
 */

let idCounter = 0;

/**
 * Gera ID único simples
 */
export function generateId() {
  return `obj_${Date.now()}_${++idCounter}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Converte arquivo para Data URL
 */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

/**
 * Valida arquivo PNG
 */
export function validatePNGFile(file) {
  const errors = [];

  if (!file) {
    errors.push('Nenhum arquivo selecionado');
    return { valid: false, errors };
  }

  if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
    errors.push('O arquivo deve ser um PNG');
  }

  if (file.size > 50 * 1024 * 1024) { // 50MB
    errors.push('Arquivo muito grande (máx. 50MB)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Carrega imagem e obtém dimensões
 */
export function loadImageInfo(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.width,
        height: img.height,
        dataURL: dataURL,
        element: img
      });
    };
    img.onerror = () => reject(new Error('Falha ao carregar imagem'));
    img.src = dataURL;
  });
}

/**
 * Cria objeto de cena a partir de arquivo PNG
 */
export async function createSceneObjectFromFile(file, scene) {
  // Valida
  const validation = validatePNGFile(file);
  if (!validation.valid) {
    throw new Error(validation.errors.join(', '));
  }

  // Converte para Data URL
  const dataURL = await fileToDataURL(file);

  // Carrega info da imagem
  const info = await loadImageInfo(dataURL);

  // Cria objeto
  const obj = {
    id: generateId(),
    name: file.name.replace(/\.png$/i, ''),
    type: 'image',
    visible: true,
    locked: false,
    imageData: dataURL,
    imageWidth: info.width,
    imageHeight: info.height,
    imageElement: info.element,
    transform: {
      matrix: [1, 0, 0, 1, 0, 0] // Identidade (centro da cena)
    },
    layerOrder: scene ? scene.nextLayerOrder : 0
  };

  return obj;
}

/**
 * Importa múltiplos arquivos
 */
export async function importMultipleFiles(files, scene) {
  const results = [];

  for (const file of files) {
    try {
      const obj = await createSceneObjectFromFile(file, scene);
      results.push({ success: true, object: obj, file });
    } catch (err) {
      results.push({ success: false, error: err.message, file });
    }
  }

  return results;
}

/**
 * Classe para gerenciar importação na UI
 */
export class ImageImporterUI {
  constructor(scene, selectionManager, renderer) {
    this.scene = scene;
    this.selectionManager = selectionManager;
    this.renderer = renderer;
    this.inputElement = null;
  }

  /**
   * Inicializa com elemento input
   */
  bindInput(inputElement) {
    this.inputElement = inputElement;
    this.inputElement.addEventListener('change', (e) => this.handleFileSelect(e));
  }

  /**
   * Manipula seleção de arquivos
   */
  async handleFileSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    // Limpa input para permitir re-seleção do mesmo arquivo
    event.target.value = '';

    const statusEl = document.getElementById('status-message');

    for (const file of files) {
      try {
        if (statusEl) statusEl.textContent = `Importando ${file.name}...`;

        const obj = await createSceneObjectFromFile(file, this.scene);
        const sceneObject = this.scene.addObject(obj);

        // Seleciona o último importado (usa o SceneObject retornado, não o objeto simples)
        this.selectionManager.selectObject(sceneObject);

        if (statusEl) statusEl.textContent = `Importado: ${file.name}`;
      } catch (err) {
        console.error('Erro ao importar:', err);
        if (statusEl) statusEl.textContent = `Erro: ${err.message}`;
        alert(`Erro ao importar ${file.name}: ${err.message}`);
      }
    }

    // Carrega imagens
    await this.scene.loadAllImages();

    // Ajusta viewport para mostrar tudo
    this.renderer.fitToObjects(this.scene.getVisibleObjects());
  }

  /**
   * Abre seletor de arquivos programaticamente
   */
  openFilePicker() {
    if (this.inputElement) {
      this.inputElement.click();
    }
  }

  /**
   * Importa arquivos via Drag & Drop com posição específica
   * @param {FileList|File[]} files - Arquivos a importar
   * @param {number} dropX - Coordenada X da tela onde foi largado
   * @param {number} dropY - Coordenada Y da tela onde foi largado
   */
  async handleDropImport(files, dropX, dropY) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const statusEl = document.getElementById('status-message');

    // Converte coordenadas da tela para mundo
    const worldPos = this.renderer.screenToWorld(dropX, dropY);

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      try {
        if (statusEl) statusEl.textContent = `Importando ${file.name}...`;

        const obj = await createSceneObjectFromFile(file, this.scene);
        
        // Posiciona no ponto de largada (com offset para múltiplos arquivos)
        const offsetX = (i * 50) % 200; // Pequeno offset para não sobrepor completamente
        const offsetY = Math.floor(i / 4) * 50;
        obj.transform.matrix[4] = worldPos.x + offsetX;
        obj.transform.matrix[5] = worldPos.y + offsetY;

        const sceneObject = this.scene.addObject(obj);

        // Seleciona o último importado
        this.selectionManager.selectObject(sceneObject);

        if (statusEl) statusEl.textContent = `Importado: ${file.name}`;
      } catch (err) {
        console.error('Erro ao importar:', err);
        if (statusEl) statusEl.textContent = `Erro: ${err.message}`;
        alert(`Erro ao importar ${file.name}: ${err.message}`);
      }
    }

    // Carrega imagens
    await this.scene.loadAllImages();

    // Ajusta viewport para mostrar tudo (opcional - comentado para manter zoom/pan atual)
    // this.renderer.fitToObjects(this.scene.getVisibleObjects());
  }
}