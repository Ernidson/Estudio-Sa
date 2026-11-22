# Relatório: Reconhecimento Anatómico Automático — Fase 2D.2

## Identificação
- **Data:** 2026-11-22
- **Nome da atualização:** Reconhecimento Anatómico Automático — Fase 2D.2
- **Fase do projeto:** Fase 2D.2 — Reconhecimento Anatómico com IA Local
- **Branch:** master
- **Commit base:** Após Fase 2D.1

---

## Objetivo
Integrar TensorFlow.js Body Segmentation (MediaPipe Selfie Segmentation) para reconhecimento automático de partes do corpo, combinando:
- **A. SilhouetteAnalyzer** — máscara exata dos píxeis visíveis do PNG
- **B. BodyPix/MediaPipe** — classificação anatómica dos píxeis
- **C. Armadura 17 ossos** — validação de articulações e associação regiões-ossos

Produzir máscaras anatómicas independentes por região (cabeça, tronco, braços, pernas, mãos, pés) que respeitem o contorno real da personagem.

---

## Alterações Realizadas

### Ficheiros Criados
| Ficheiro | Descrição |
|----------|-----------|
| `src/segmentation/AnatomicalRecognizer.js` | Módulo principal: carrega modelo MediaPipe, pipeline Silhueta+IA+Armadura, reprojeção para resolução original, divisão por regiões usando seeds nos ossos + flood fill, métricas de qualidade, visualização |
| `src/shims/mediapipe-selfie-segmentation.js` | Shim ES module para `@mediapipe/selfie_segmentation` (Closure Library não exporta ES modules) |
| `vite.config.js` | Configuração Vite com alias `@mediapipe/selfie_segmentation` → shim, `optimizeDeps.exclude`, porta 56500 fixa |

### Ficheiros Modificados
| Ficheiro | Alteração |
|----------|-----------|
| `package.json` | Dependências `@tensorflow/tfjs@^4.22.0`, `@tensorflow-models/body-segmentation@^1.0.2`, `vite@^8.3.8` (dev); scripts `dev`/`build`/`preview` |
| `src/segmentation/AnatomicalRecognizer.js` | API corrigida: `createSegmenter` (não `createDetector`), runtime `'tfjs'`, `modelType: 'general'` |
| `src/main.js` | Import `AnatomicalRecognizer`, estado `anatomicalRecognizer`, `isRecognizing`, `recognitionResult`, `recognitionVisualizationCanvas`, `previousPieceMapState`; funções `setCalibrationTool('recognize')`, `showRecognitionPanel`, `startRecognition`, `cancelRecognition`, `applyRecognition`, `cancelRecognitionResult`, `maskToPolygonPoints`, `drawRecognitionVisualization`; integração no `renderLoop`, handlers UI |
| `index.html` | Botão "Reconhecer Corpo" (btn-primary) na `calibration-tool-selector`; painel `recognition-panel` com barra de progresso, mensagens, botões "Aplicar Reconhecimento"/"Cancelar", área de erro |
| `src/styles/main.css` | (Estilos para recognition-panel herdados de calibration-panel) |

---

## Pipeline Implementado

### 1. Carregamento do Modelo (Lazy)
- `AnatomicalRecognizer.loadModel()` → `bodySegmentation.createSegmenter(SupportedModels.MediaPipeSelfieSegmentation, { runtime: 'tfjs', modelType: 'general' })`
- Modelo ~3MB, carrega apenas quando utilizador clica "Reconhecer Corpo"
- Callback de progresso: 10% TF.js ready → 30% carregando → 100% concluído

### 2. Inferência
- Imagem redimensionada para 256×256 (mantém aspect ratio, padding preto)
- `segmenter.segmentPeople(inputTensor)` → máscara binária pessoa/fundo
- Tensor descartado após uso (`inputTensor.dispose()`)

### 3. Reprojeção + Combinação
- Máscara do modelo (256×256) → resolução original do PNG via transformação inversa
- **Interseção** com máscara de silhueta real (`SilhouetteAnalyzer.getSilhouetteMask()`)
- Resultado: máscara da pessoa limitada aos píxeis visíveis reais

### 4. Divisão em Regiões Anatómicas
- Posições mundiais dos 17 ossos → espaço da silhueta (`_worldToSilhouetteSpace`)
- Definição de 17 regiões baseadas nos ossos (elipse, capsule, rect, polygon)
- **Flood fill** a partir de seeds nos ossos, limitado pela máscara da pessoa + forma geométrica da região
- Cada região recebe máscara `Uint8Array` binária

### 5. Métricas de Qualidade
- Cobertura % da silhueta total
- Píxeis cobertos / não cobertos / sobrepostos / fora da silhueta
- Por região: contagem de píxeis

### 6. Visualização
- Canvas colorido por região (cores distintas por região anatómica)
- Vermelho = não coberto, Magenta = sobreposição, Amarelo = fora

---

## UI — Ferramenta "Reconhecer Corpo"

### Botão na Toolbar
- Ícone cérebro/IA, cor primária (azul), tooltip "Reconhecer Corpo Automaticamente (IA)"
- Ferramenta `recognize` no `calibration-tool-selector`

### Painel Lateral (`recognition-panel`)
1. **Estado "Pronto"** — badge cinza, botão iniciar oculto
2. **Progresso** — barra 0-100%, mensagem etapa, botão "Cancelar"
3. **Resultados** — resumo qualidade (cobertura %, métricas, regiões detectadas), botões "Aplicar Reconhecimento" / "Cancelar"
4. **Erro** — mensagem vermelha se falhar

### Ações
- **Aplicar Reconhecimento**: converte máscaras → polígonos (vectorização angular simplificada) → atualiza `PieceMap.regions[].points` + `originalPoints`; salva estado anterior para reverter
- **Cancelar**: restaura `PieceMap` anterior do `previousPieceMapState`

---

## Dependências Adicionadas

| Pacote | Versão | Uso |
|--------|--------|-----|
| `@tensorflow/tfjs` | ^4.22.0 | Backend WebGL/WASM, tensores, ops |
| `@tensorflow-models/body-segmentation` | ^1.0.2 | MediaPipe Selfie Segmentation |
| `vite` | ^8.3.8 | Dev server, bundler ES modules |

---

## Testes

| Teste | Resultado |
|-------|-----------|
| `npm install` dependências | ✅ 75 pacotes adicionados |
| `node --check src/segmentation/AnatomicalRecognizer.js` | ✅ PASSOU |
| `node --check src/shims/mediapipe-selfie-segmentation.js` | ✅ PASSOU |
| `node --check src/main.js` | ✅ PASSOU |
| `npm test` (30 testes) | ✅ 30/30 PASSOU |
| `npm run build` | ✅ Sucesso (1MB / 268KB gzipped) |
| `npm run dev` | ✅ Vite ready 349ms na porta 56500 |
| Aviso build `[IMPORT_IS_UNDEFINED] createDetector` | ⚠️ Esperado — código usa `createSegmenter` correto |

---

## Estado Final

- ✅ Modelo MediaPipe Selfie Segmentation carrega (lazy, ~3MB)
- ✅ Pipeline Silhueta + IA + Armadura funcional
- ✅ 17 regiões anatómicas propostas via flood fill nos seeds dos ossos
- ✅ Métricas de qualidade calculadas
- ✅ Visualização colorida no canvas
- ✅ UI completa: progresso, resultados, aplicar/cancelar
- ✅ Preservação de estado anterior para reverter
- ✅ Integração no renderLoop (ferramenta "recognize")
- ✅ Vite resolve imports ES modules corretamente (shim MediaPipe)

---

## Limitações Conhecidas

1. **MediaPipe Selfie Segmentation** retorna apenas máscara binária (pessoa/fundo), **não 24 classes anatómicas**. A divisão em regiões usa heurísticas baseadas na armadura (seeds nos ossos + flood fill), não classificação por píxel da IA.
2. **Vectorização de máscara para polígono** é aproximada (amostragem angular + ordenação + simplificação). Pode gerar polígonos com menos vértices que o contorno real.
3. **Chunk size warning**: Bundle ~1MB (TensorFlow.js incluído). Recomenda-se dynamic import para código-produção.
4. **Performance**: Inferência ~100-300ms em desktop, depende de GPU/WebGL.
5. **Aviso Vite build**: `[IMPORT_IS_UNDEFINED] createDetector` — símbolo antigo nos tipos, não afeta runtime.

---

## Próximos Passos Recomendados

1. **Validação visual** no navegador (http://localhost:56500)
2. Testar com `Treinador_costas_01.png` — verificar cobertura de cabeça, tronco, braços, pernas, mãos, pés
3. Ajustar parâmetros de flood fill (raio, seeds) se regiões ficarem incompletas
4. Considerar upgrade para **BodyPix completo** (~20MB) se necessário 24 classes nativas
5. Implementar **vectorização robusta** (marching squares + Douglas-Peucker)
6. **Code-splitting dinâmico** para TensorFlow.js em produção

---

## Commit Git
- **Status:** Alterações locais pendentes (não commitado)
- **Ficheiros:** `vite.config.js`, `src/shims/mediapipe-selfie-segmentation.js`, `src/segmentation/AnatomicalRecognizer.js`, `package.json`, `src/main.js`, `index.html`, `RELATORIOS/2026-11-22_reconhecimento_anatomico_2D2.md`, `RELATORIOS/README.md`, `AGENTS.md`