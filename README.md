# Rigby Studio 2D

Editor visual 2D mínimo para animação - Fase 1

## Visão Geral

Rigby Studio 2D é uma aplicação web independente para edição visual 2D, construída com tecnologias nativas (HTML5, CSS3, JavaScript ES Modules, Canvas 2D).

Esta é a **Fase 1**: Editor Visual Mínimo com funcionalidades básicas de importação, transformação e persistência de projetos.

## Funcionalidades

- ✅ Importar imagens PNG (múltiplas, independentes)
- ✅ Visualizar no canvas com grelha e eixos
- ✅ Selecionar objetos por clique
- ✅ Arrastar para mover (posição)
- ✅ Controlos numéricos: Posição X/Y, Rotação (graus), Escala X/Y
- ✅ Botão "Repor Transformação"
- ✅ Contorno de seleção que acompanha rotação e escala
- ✅ Guardar projeto (formato `.rigbystudio` - JSON com Data URLs)
- ✅ Abrir projeto
- ✅ Novo projeto
- ✅ Painel de camadas (lista de objetos)
- ✅ Interface em português de Portugal, tema escuro

## Estrutura do Projeto

```
rigby-studio-2d/
├── index.html           # Página principal
├── package.json         # Configuração npm
├── README.md            # Este arquivo
├── src/
│   ├── main.js          # Ponto de entrada
│   ├── core/
│   │   ├── Renderer.js      # Renderização Canvas 2D
│   │   ├── Scene.js         # Gerenciamento de cena e objetos
│   │   ├── Transform2D.js   # Matriz afim 2D (posição, rotação, escala)
│   │   └── ProjectStorage.js # Salvamento/carregamento de projetos
│   ├── editor/
│   │   ├── Selection.js     # Sistema de seleção e interação
│   │   └── ImageImporter.js # Importação de PNG
│   └── styles/
│       └── main.css     # Estilos (tema escuro)
└── tests/
    ├── run-tests.js     # Testes unitários (Node.js)
    └── visual-test.html # Testes visuais (navegador)
```

## Sistema de Coordenadas

- **Origem da cena**: Centro do canvas (0, 0)
- **Eixo X**: Positivo para a direita
- **Eixo Y**: Positivo para baixo
- **Rotação**: Graus (interface), radianos (interno)
- **Escala**: 1 = 100%
- **Transformações**: Matrizes afins 3x3 (2D)

## Como Executar

### Pré-requisitos
- Node.js 18+ (para servidor de desenvolvimento)
- Navegador moderno (Chrome, Firefox, Edge, Safari)

### Instalação
```bash
cd rigby-studio-2d
npm install
```

### Desenvolvimento
```bash
npm run dev
```
Isto inicia um servidor local em `http://localhost:3000` (ou porta disponível).

### Testes Unitários
```bash
npm test
```
Executa testes em Node.js (transformações, cena, serialização, etc.).

### Testes Visuais
Abra `tests/visual-test.html` no navegador para testes interativos.

## Formato de Projeto (.rigbystudio)

JSON contendo:
```json
{
  "version": "1.0.0",
  "projectId": "uuid",
  "name": "Nome do Projeto",
  "createdAt": "ISO timestamp",
  "modifiedAt": "ISO timestamp",
  "objects": [
    {
      "id": "obj_xxx",
      "name": "Imagem",
      "type": "image",
      "visible": true,
      "locked": false,
      "imageData": "data:image/png;base64,...",
      "imageWidth": 1920,
      "imageHeight": 1080,
      "transform": { "matrix": [1,0,0,1,0,0] },
      "layerOrder": 0
    }
  ],
  "nextLayerOrder": 1
}
```

## Atalhos de Teclado

| Tecla | Ação |
|-------|------|
| `Ctrl+N` | Novo projeto |
| `Ctrl+O` | Abrir projeto |
| `Ctrl+S` | Guardar projeto |
| `Delete` / `Backspace` | Remover objeto selecionado |
| `Escape` | Limpar seleção |
| `Scroll` | Zoom (centrado no cursor) |
| `Arrastar (vazio)` | Pan da viewport |

## Arquitetura

### Módulos Core
- **Transform2D**: Matriz afim imutável com decomposição (pos/rot/scale)
- **Scene/SceneObject**: Grafo de cena plano com ordem de camadas
- **Renderer**: Canvas 2D com viewport (zoom/pan), grelha, eixos, seleção
- **ProjectStorage**: Serialização JSON, File System Access API + fallback

### Módulos Editor
- **SelectionManager**: Clique, arraste, hover, callbacks de mudança
- **TransformControls**: Liga inputs numéricos à transformação do objeto
- **ImageImporterUI**: Input file, validação PNG, Data URL, criação de objetos

## Limitações Conhecidas (Fase 1)

- Não há hierarquia de objetos (parent/child)
- Não há rigging (esqueleto, IK, malhas)
- Não há timeline/animação
- Não há substituição de imagens por pose
- Imagens armazenadas como Data URLs (base64) - projetos grandes podem ficar pesados
- File System Access API só funciona em HTTPS ou localhost
- Undo/Redo não implementado

## Próximas Fases (Planeadas)

- **Fase 2**: Hierarquia (parent/child), ossos, IK básico
- **Fase 3**: Timeline, keyframes, animação
- **Fase 4**: Malhas (mesh), deformação
- **Fase 5**: Substituição de sprites por pose, onion skinning

## Licença

Projeto privado - Rigby Studio 2D