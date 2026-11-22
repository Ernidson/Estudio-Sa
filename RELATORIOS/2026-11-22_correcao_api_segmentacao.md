# Relatório: Correção da API de Segmentação — segmentPeople()

## Identificação
- **Data:** 2026-11-22
- **Hora:** ~15:00
- **Nome da atualização:** Correção da API de Segmentação — segmentPeople()
- **Fase do projeto:** Fase 2D.2 — Reconhecimento Anatómico (Correção de API)
- **Branch:** master
- **Commit base:** Alterações locais (não commitado)

---

## Objetivo
Corrigir o erro real identificado durante teste no navegador:

`this.bodyPixModel.estimatePeopleSegments is not a function`

---

## Causa Identificada

O código em `src/segmentation/AnatomicalRecognizer.js` (linha 145) chamava:

```javascript
const segmentation = await this.bodyPixModel.estimatePeopleSegments(inputTensor, {...});
```

No entanto, o modelo `MediaPipeSelfieSegmentation` (carregado via `bodySegmentation.createSegmenter()`) expõe a API **`segmentPeople()`**, não `estimatePeopleSegments()`.

A função `estimatePeopleSegments()` existe apenas no modelo **BodyPix completo**, não no `MediaPipeSelfieSegmentation`.

---

## Correção Aplicada

### Ficheiro Modificado
| Ficheiro | Linha | Alteração |
|----------|-------|-----------|
| `src/segmentation/AnatomicalRecognizer.js` | 145 | `estimatePeopleSegments()` → `segmentPeople()` |

### Código Corrigido
```javascript
// Antes (incorreto)
const segmentation = await this.bodyPixModel.estimatePeopleSegments(inputTensor, {
  flipHorizontal: false,
  segmentationThreshold: this.config.segmentationThreshold,
});

// Depois (correto)
const segmentation = await this.bodyPixModel.segmentPeople(inputTensor, {
  flipHorizontal: false,
  segmentationThreshold: this.config.segmentationThreshold,
});
```

---

## Verificação da API

De acordo com a documentação oficial do `@tensorflow-models/body-segmentation`:

| Modelo | Método de Inferência |
|--------|---------------------|
| `MediaPipeSelfieSegmentation` | `segmentPeople()` |
| `BodyPix` | `estimatePeopleSegments()` |

O código usa `MediaPipeSelfieSegmentation` (config `modelType: 'MediaPipeSelfieSegmentation'`), portanto **`segmentPeople()`** é a API correta.

---

## Validações Técnicas

```bash
✅ node --check src/segmentation/AnatomicalRecognizer.js
✅ node --check src/main.js
✅ npm test (30/30 PASSOU)
✅ npm run build
✅ npm run dev (Vite ready in 257ms na porta 56500)
✅ HTML carrega com AnatomicalRecognizer corrigido
```

---

## Limitações Conhecidas (Não Corrigidas Nesta Tarefa)

1. **Modelo apenas binário:** `MediaPipeSelfieSegmentation` retorna apenas máscara pessoa/fundo (2 classes), não 24 classes anatómicas.
   - A divisão em 17 regiões anatómicas continua a ser feita por heurísticas baseadas na armadura (flood fill a partir dos ossos).
   - Para 24 classes nativas, seria necessário usar o modelo **BodyPix completo** (~20MB).

2. **Vectorização aproximada:** A conversão de máscara binária para polígonos usa amostragem angular + ordenação + simplificação angular.
   - Pode gerar polígonos com menos vértices que o contorno real.

3. **Chunk size warning:** Bundle ~1.2MB (TensorFlow.js incluído). Recomenda-se dynamic import para produção.

---

## Próximos Passos Recomendados

1. **Validação visual** no navegador (http://localhost:56500)
2. Testar com `Treinador_costas_01.png` — verificar se inferência roda sem erro
3. Verificar se máscara binária é combinada corretamente com silhueta do PNG
4. Verificar se estatísticas são calculadas e painel "Resultados" aparece
5. Considerar upgrade para **BodyPix completo** se necessário 24 classes nativas

---

## Documentação

- 📄 `RELATORIOS/2026-11-22_correcao_api_segmentacao.md`
- 📄 `RELATORIOS/README.md` (atualizado)

---

**Aguardando validação visual no navegador.** Não farei commit até confirmação.