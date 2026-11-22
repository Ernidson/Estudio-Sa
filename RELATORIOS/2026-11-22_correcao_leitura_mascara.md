# Relatório: Correção da Leitura Real da Máscara — AnatomicalRecognizer.js

## Identificação
- **Data:** 2026-11-22
- **Hora:** ~17:30
- **Nome da atualização:** Correção da Leitura Real da Máscara — AnatomicalRecognizer.js
- **Fase do projeto:** Fase 2D.2 — Reconhecimento Anatómico (Correção de API e Pipeline)
- **Branch:** master
- **Commit base:** Alterações locais (não commitado)

---

## Objetivo
Corrigir três erros críticos na leitura da máscara devolvida pelo `segmentPeople()` do MediaPipe Selfie Segmentation, que causavam 0% de cobertura anatómica.

---

## Erros Identificados e Corrigidos

### ERRO 1 — Propriedade Errada: `person.segmentation` vs `person.mask`
**Local:** `AnatomicalRecognizer.js`, função `recognize()`, linha ~283 (anterior)

**Código incorreto:**
```javascript
if (!person.segmentation) continue;
const segMask = person.segmentation;
if (segMask && typeof segMask.mask?.toImageData === 'function') {
```

**Problema:** O `segmentPeople()` devolve um array de objetos `Person` com propriedade `mask` diretamente, não `segmentation.mask`.

**Correção:**
```javascript
if (!person.mask) {
  console.warn('[DIAG] Pessoa sem máscara, ignorando:', person);
  continue;
}
const segMask = person.mask;
if (typeof segMask.toImageData === 'function') {
  const imageData = await segMask.toImageData();
  // ...
}
```

---

### ERRO 2 — `toImageData()` Assíncrono
**Local:** `AnatomicalRecognizer.js`, função `_reprojectAndCombineMasks`, linha ~292

**Código incorreto:**
```javascript
const imageData = segMask.mask.toImageData(); // sem await
```

**Problema:** O método `toImageData()` do MediaPipe Mask é assíncrono e retorna uma Promise.

**Correção:**
```javascript
const imageData = await segMask.toImageData();
```

---

### ERRO 3 — Interpretação RGBA Incorreta
**Local:** `AnatomicalRecognizer.js`, função `_reprojectAndCombineMasks`, linha ~335

**Código incorreto:**
```javascript
if (silhouetteMask[silIdx] && segData[segIdx] > this.config.segmentationThreshold) {
```

**Problemas:**
1. `segData[segIdx]` lê o canal **vermelho** (índice 0 do RGBA), não o alfa
2. O threshold está em 0-1 (ex: 0.5), mas os valores da ImageData são 0-255

**Correção:**
```javascript
// A máscara ImageData tem 4 canais RGBA por píxel.
// O canal alfa (índice 3) contém a probabilidade de primeiro plano (0-255).
const alphaIdx = segIdx * 4 + 3;
const alpha = segData[alphaIdx];
const threshold255 = this.config.segmentationThreshold * 255;

if (silhouetteMask[silIdx] && alpha > threshold255) {
  personMask[silIdx] = 1;
}
```

---

## Validações Técnicas

```bash
✅ node --check src/segmentation/AnatomicalRecognizer.js
✅ node --check src/main.js
✅ npm test (30/30 PASSOU)
✅ npm run build
```

---

## Problemas Identificados para Próximas Etapas (Não Corrigidos Nesta Entrega)

### 1. Regiões do Tipo Polygon (ex: Tronco)
**Local:** `_createRegionMask()`, linha ~547
```javascript
if (!def.center && !def.start) return null;
```
**Problema:** Regiões do tipo `polygon` (ex: `peito`) não têm `center` nem `start`, então retornam `null` e não geram máscara.

**Ação:** Registado no relatório, será corrigido na próxima etapa.

### 2. Cálculo de Coordenadas em `_worldToSilhouetteSpace()`
**Risco:** Conversão de coordenadas mundo → tela → imagem → silhueta pode ter erros de arredondamento ou escala.

---

## Validação Técnica

```bash
✅ node --check src/segmentation/AnatomicalRecognizer.js
✅ node --check src/main.js
✅ npm test (30/30 PASSOU)
✅ npm run build
```

---

## Limitações Conhecidas (Não Corrigidas Nesta Entrega)

1. Modelo `MediaPipeSelfieSegmentation` retorna apenas máscara binária (pessoa/fundo), não 24 classes anatómicas nativas
2. Vectorização de máscara para polígono é aproximada
3. Chunk size warning no build (~1.2MB JS)
4. Regiões `polygon` (tronco) não geram máscaras — a corrigir na próxima etapa

---

## Próximos Passos Recomendados

1. Corrigir `_createRegionMask()` para suportar regiões `polygon` (tronco)
2. Testar inferência real com `Treinador_costas_01.png` no navegador
4. Verificar se máscaras anatómicas são geradas e cobertura > 0%

---

## Relatório Criado
📄 `RELATORIOS/2026-11-22_correcao_leitura_mascara.md`

---

## Relatório Criado
📄 `RELATORIOS/2026-11-22_correcao_leitura_mascara.md`

## Índice Atualizado
📄 `RELATORIOS/README.md` (atualizado)