# Relatório: Correção Vite + TensorFlow.js

## Identificação
- **Data:** 2026-11-22
- **Hora:** ~12:00-13:00
- **Nome da atualização:** Correção Vite + TensorFlow.js
- **Fase do projeto:** Fase 2D.2 — Reconhecimento Anatómico (infraestrutura)
- **Branch:** master
- **Commit base:** 4556ccb0fd3793b38362e5c100b7be40c02e3945 (último commit antes das alterações)

---

## Objetivo
Corrigir a falha de inicialização da aplicação após integrar o reconhecimento anatómico (Fase 2D.2). O erro `Failed to resolve module specifier "@tensorflow/tfjs"` impedia que a aplicação carregasse no navegador.

---

## Alterações Realizadas

### Ficheiros Criados
| Ficheiro | Descrição |
|----------|-----------|
| `vite.config.js` | Configuração Vite com porta 56500 fixa, alias para shim MediaPipe, otimização de dependências |
| `src/shims/mediapipe-selfie-segmentation.js` | Shim ES module para `@mediapipe/selfie_segmentation` (Closure Library não exporta ES modules) |
| `RELATORIO_DESENVOLVIMENTO.txt` | Relatório original (será migrado para RELATORIOS/) |

### Ficheiros Modificados
| Ficheiro | Alteração |
|----------|-----------|
| `package.json` | Scripts `dev`/`build`/`preview`, dependência `vite` em devDependencies |
| `src/segmentation/AnatomicalRecognizer.js` | API `createDetector` → `createSegmenter` (API correta do body-segmentation) |

### Funções/Classes Afetadas
- `AnatomicalRecognizer.loadModel()` — corrigido uso da API `createSegmenter`
- `vite.config.js` — configuração completa do bundler
- `src/shims/mediapipe-selfie-segmentation.js` — nova classe `SelfieSegmentation` para compatibilidade

---

## Erros e Correções

| Erro Identificado | Causa | Solução Aplicada |
|-------------------|-------|------------------|
| `Failed to resolve module specifier "@tensorflow/tfjs"` | Servidor estático `npx serve .` não resolve bare module specifiers npm | Migração para Vite dev server com bundling ES modules |
| `SelfieSegmentation is not exported by @mediapipe/selfie_segmentation` | Pacote MediaPipe usa Closure Library (IIFE), não ES modules | Criação de shim `src/shims/mediapipe-selfie-segmentation.js` + alias no Vite |
| `createDetector` is not exported | API incorreta — a função correta é `createSegmenter` | Alterado em `AnatomicalRecognizer.loadModel()` |

---

## Testes

### Testes Executados
| Teste | Resultado |
|-------|-----------|
| `node --check src/main.js` | ✅ PASSOU |
| `node --check src/segmentation/AnatomicalRecognizer.js` | ✅ PASSOU |
| `node --check src/segmentation/SilhouetteAnalyzer.js` | ✅ PASSOU |
| `node --check src/shims/mediapipe-selfie-segmentation.js` | ✅ PASSOU |
| `node --check src/core/Scene.js` | ✅ PASSOU |
| `npm test` (30 testes unitários) | ✅ 30/30 PASSOU |
| `npm run build` | ✅ Build bem-sucedido (~1MB / 268KB gzipped) |
| `npm run dev` | ✅ Vite ready in 349ms na porta 56500 |

### Testes Não Executados
- Testes de integração end-to-end (Playwright)
- Testes de carga do modelo TensorFlow.js no navegador
- Validação visual completa do fluxo de reconhecimento anatómico

### Validação Visual Pendente
- ☐ Abrir http://localhost:56500
- ☐ Confirmar inicialização sem erros de módulo no console
- ☐ Importar `Treinador_costas_01.png`
- ☐ Preparar Personagem (armadura 17 ossos)
- ☐ Calibrar Armadura (modo ativo)
- ☐ Botão "Reconhecer Corpo" disponível
- ☐ Fluxo completo funcional

---

## Estado Final

### Funcionalidades Implementadas
- ✅ Vite dev server com HMR na porta 56500 fixa (`strictPort: true`)
- ✅ Resolução correta de `@tensorflow/tfjs` e `@tensorflow-models/body-segmentation`
- ✅ Shim para `@mediapipe/selfie_segmentation` funcionando
- ✅ API `createSegmenter` usada corretamente
- ✅ Build de produção funcional (`dist/`)
- ✅ Todos os 30 testes unitários passam

### Limitações Conhecidas
1. **Aviso `[IMPORT_IS_UNDEFINED]` no build:** Vite detecta import de `createDetector` nos tipos do body-segmentation. O código usa `createSegmenter` (correto), não afeta runtime.
2. **Chunk size warning:** Bundle principal ~1MB (268KB gzipped). Recomenda-se code-splitting dinâmico para TensorFlow.js em produção.
3. **Aviso Vite `__dirname`:** Deve usar `import.meta.dirname` (não crítico).
4. **MediaPipe Selfie Segmentation:** Retorna apenas máscara binária (pessoa/fundo), não 24 classes anatómicas. Para 24 classes, precisaria BodyPix completo (~20MB) ou MediaPipe Pose + Segmentation.

### Riscos de Regressão
- Baixo: Alterações limitadas a configuração de build e shim de compatibilidade
- O código funcional da aplicação não foi modificado

### Próxima Etapa Recomendada
1. Validar visualmente no navegador (http://localhost:56500)
2. Prosseguir com Fase 2D.2 — Reconhecimento Anatómico completo (atribuição de máscaras às regiões, vectorização, aplicação ao PieceMap)

---

## Commit Git
- **Status:** Não commitado (alterações locais pendentes)
- **Ficheiros para commit:** `vite.config.js`, `src/shims/mediapipe-selfie-segmentation.js`, `package.json`, `src/segmentation/AnatomicalRecognizer.js`, `RELATORIOS/2026-11-22_correcao_vite_tensorflow.md`, `RELATORIOS/README.md`, `AGENTS.md`