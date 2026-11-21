/**
 * ProjectStorage - Gerenciamento de salvamento e carregamento de projetos
 * Formato: .rigbystudio (JSON com Data URLs)
 */

const FILE_VERSION = '1.0.0';
const FILE_EXTENSION = '.rigbystudio';
const MIME_TYPE = 'application/json';

export class ProjectStorage {
  constructor() {
    this.currentProject = null;
    this.currentFileHandle = null; // Para File System Access API
  }

  /**
   * Cria um novo projeto vazio
   */
  createNewProject(name = 'Projeto Sem Título') {
    this.currentProject = {
      version: FILE_VERSION,
      projectId: this.generateId(),
      name: name,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      objects: [],
      nextLayerOrder: 0
    };
    this.currentFileHandle = null;
    return this.currentProject;
  }

  /**
   * Gera ID único
   */
  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Serializa projeto para JSON string
   */
  serialize(project = this.currentProject) {
    if (!project) {
      throw new Error('Nenhum projeto para serializar');
    }

    // Atualiza timestamp
    project.modifiedAt = new Date().toISOString();

    const json = JSON.stringify(project, null, 2);
    return json;
  }

  /**
   * Desserializa JSON string para projeto
   */
  deserialize(jsonString) {
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      throw new Error('Arquivo de projeto inválido: JSON malformado');
    }

    // Validação básica
    if (!data.version) {
      throw new Error('Arquivo de projeto inválido: versão ausente');
    }

    if (!data.projectId) {
      throw new Error('Arquivo de projeto inválido: ID do projeto ausente');
    }

    if (!Array.isArray(data.objects)) {
      throw new Error('Arquivo de projeto inválido: lista de objetos ausente');
    }

    // Valida cada objeto
    for (let i = 0; i < data.objects.length; i++) {
      const obj = data.objects[i];
      if (!obj.id) {
        throw new Error(`Objeto ${i}: ID ausente`);
      }
      if (!obj.imageData) {
        throw new Error(`Objeto ${obj.id}: dados da imagem ausentes`);
      }
      if (typeof obj.imageWidth !== 'number' || typeof obj.imageHeight !== 'number') {
        throw new Error(`Objeto ${obj.id}: dimensões da imagem inválidas`);
      }
      if (!obj.transform || !obj.transform.matrix) {
        throw new Error(`Objeto ${obj.id}: transformação inválida`);
      }
    }

    // Migração de versões futuras pode ser adicionada aqui
    this.currentProject = data;
    this.currentFileHandle = null;
    return data;
  }

  /**
   * Salva projeto como arquivo (download)
   */
  async saveToFile(project = this.currentProject, suggestedName = null) {
    const json = this.serialize(project);
    const blob = new Blob([json], { type: MIME_TYPE });

    const name = suggestedName || project.name || 'projeto';
    const filename = name.endsWith(FILE_EXTENSION) ? name : name + FILE_EXTENSION;

    // Tenta usar File System Access API se disponível
    if (this.currentFileHandle && 'showSaveFilePicker' in window) {
      try {
        const handle = await this.currentFileHandle.createWritable();
        await handle.write(json);
        await handle.close();
        return { success: true, filename };
      } catch (e) {
        // Fallback para download
        console.warn('File System Access API falhou, usando download:', e);
      }
    }

    // Fallback: download tradicional
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, filename };
  }

  /**
   * Abre seletor de arquivo para salvar (File System Access API)
   */
  async saveAsFile(project = this.currentProject) {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: (project.name || 'projeto') + FILE_EXTENSION,
          types: [{
            description: 'Rigby Studio 2D Project',
            accept: { [MIME_TYPE]: [FILE_EXTENSION] }
          }]
        });

        this.currentFileHandle = handle;
        await this.saveToFile(project);
        return { success: true };
      } catch (e) {
        if (e.name === 'AbortError') {
          return { success: false, cancelled: true };
        }
        throw e;
      }
    } else {
      // Fallback para download
      return this.saveToFile(project);
    }
  }

  /**
   * Carrega projeto de arquivo
   */
  async loadFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const project = this.deserialize(e.target.result);
          resolve(project);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
      reader.readAsText(file);
    });
  }

  /**
   * Abre seletor de arquivo para carregar
   */
  async openFilePicker() {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'Rigby Studio 2D Project',
            accept: { [MIME_TYPE]: [FILE_EXTENSION] }
          }]
        });

        const file = await handle.getFile();
        this.currentFileHandle = handle;
        return await this.loadFromFile(file);
      } catch (e) {
        if (e.name === 'AbortError') {
          return { cancelled: true };
        }
        throw e;
      }
    } else {
      // Fallback: input file tradicional
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = FILE_EXTENSION;
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (file) {
            try {
              const project = await this.loadFromFile(file);
              resolve(project);
            } catch (err) {
              resolve({ error: err.message });
            }
          } else {
            resolve({ cancelled: true });
          }
        };
        input.click();
      });
    }
  }

  /**
   * Exporta projeto como JSON string (para copiar/colar)
   */
  exportJSON(project = this.currentProject) {
    return this.serialize(project);
  }

  /**
   * Importa projeto de JSON string
   */
  importJSON(jsonString) {
    return this.deserialize(jsonString);
  }

  /**
   * Valida estrutura do projeto
   */
  validateProject(project) {
    const errors = [];

    if (!project) {
      errors.push('Projeto nulo ou indefinido');
      return { valid: false, errors };
    }

    if (!project.version) {
      errors.push('Versão do formato ausente');
    }

    if (!project.projectId) {
      errors.push('ID do projeto ausente');
    }

    if (!Array.isArray(project.objects)) {
      errors.push('Lista de objetos ausente ou inválida');
    } else {
      for (let i = 0; i < project.objects.length; i++) {
        const obj = project.objects[i];
        if (!obj.id) errors.push(`Objeto ${i}: ID ausente`);
        if (!obj.imageData) errors.push(`Objeto ${i}: dados da imagem ausentes`);
        if (typeof obj.imageWidth !== 'number') errors.push(`Objeto ${i}: largura inválida`);
        if (typeof obj.imageHeight !== 'number') errors.push(`Objeto ${i}: altura inválida`);
        if (!obj.transform || !Array.isArray(obj.transform.matrix)) {
          errors.push(`Objeto ${i}: transformação inválida`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Obtém projeto atual
   */
  getCurrentProject() {
    return this.currentProject;
  }

  /**
   * Define projeto atual
   */
  setCurrentProject(project) {
    this.currentProject = project;
    this.currentFileHandle = null;
  }
}

// Instância singleton
export const projectStorage = new ProjectStorage();