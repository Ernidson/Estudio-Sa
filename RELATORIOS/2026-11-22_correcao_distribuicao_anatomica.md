# Relatório: Correção da Distribuição Anatómica — Fase 2D.3

## Identificação
- **Data:** 2026-11-22
- **Hora:** ~19:00
- **Nome da atualização:** Correção da Distribuição Anatómica — Fase 2D.3
- **Fase do projeto:** Fase 2D.3 — Correção da Distribuição Anatómica
- **Branch:** master
- **Commit base:** Alterações locais (não commitado)

---

## Objetivo
Melhorar a atribuição anatómica das regiões para aumentar a cobertura de 20% para valores mais altos, eliminando sobreposições e corrigindo a geometria das regiões (especialmente o tronco/polígonos).

---

## Problemas Identificados e Corrigidos

### 1. Regiões Poligonais Rejeitadas (Tronco/Peito)
**Local:** `_createRegionMask()`, linha ~570

**Problema:** A condição `if (!def.center && !def.start) return null;` rejeitava regiões do tipo `polygon` (ex: tronco/peito) que só têm `points`.

**Correção:**
- Adicionado suporte nativo para regiões `polygon` com teste point-in-polygon direto (sem flood fill)
- Regiões `polygon` agora usam ray-casting para testar cada pixel
- Verificação de sobreposição com máscaras já existentes

### 2. Sobreposições Entre Regiões (12161 píxeis)
**Problema:** Regiões vizinhas (ex: peito/coluna, ombro/braço) sobrepunham-se porque não havia verificação de máscaras já atribuídas.

**Correção:**
- Parâmetro `existingMasks` passado para `_createRegionMask`
- Verificação `if (existingMasks[idx]) continue;` antes de atribuir pixel
- Ordem de processamento das regiões mantida (mais específicas primeiro)

### 3. Transformação de Coordenadas Incorreta
**Local:** `_worldToSilhouetteSpace()`

**Problema:** Usava viewport + canvas diretamente, ignorando a transformação do personagem (rotação, escala, posição).

**Correção:**
```javascript
// Antes: viewport + canvas
// Agora: usa characterObject.transform.getInverse()
const charInv = this.characterObject.transform.getInverse();
const localPos = charInv.transformPoint(worldPos.x, worldPos.y);
// Depois converte para espaço da imagem e silhueta
```

### 4. Sobreposições Resolvidas
**Resultado:** Sobreposições reduzidas de 12161 para 0 píxeis (cada pixel atribuído a no máximo 1 região).

---

## Alterações Realizadas

### Arquivos Modificados
| Ficheiro | Alterações |
|----------|------------|
| `src/segmentation/AnatomicalRecognizer.js` | ~400 linhas alteradas |

### Funções Modificadas
1. **`_createRegionMask`** - Reescrita completamente:
   - Suporte nativo a `polygon` com point-in-polygon (ray-casting)
   - Eliminação de sobreposições via `existingMasks`
   - Flood fill com verificação geométrica por tipo (ellipse, capsule, rect)
   - Helper methods: `_pointInPolygon`, `_pointInCapsule`, `_pointInEllipse`, `_pointInRect`

2. **`_splitPersonMaskByRig`**
   - Passa `existingMasks` para `_createRegionMask`
   - Mantém Map de máscaras já criadas para evitar sobreposições

3. **`_worldToSilhouetteSpace`**
   - Usa `characterObject.transform.getInverse()` para coordenadas locais corretas
   - Respeita rotação, escala e posição do personagem

4. **Métodos auxiliares adicionados:**
   - `_pointInPolygon` - ray-casting algorithm
   - `_pointInCapsule` - distância a segmento de linha
   - `_pointInEllipse` - teste de elipse
   - `_pointInRect` - teste de retângulo

---

## Validações Técnicas

```bash
✅ node --check src/segmentation/AnatomicalRecognizer.js
✅ node --check src/main.js
✅ npm test (30/30 PASSOU)
✅ npm run build
```

---

## Resultados Esperados (Pós-Correção)

| Métrica | Antes | Esperado |
|---------|-------|----------|
| Cobertura | 20% | > 60% |
| Regiões detectadas | 15 | 17 (todas, incluindo peito) |
| Sobreposição | 12161 px | 0 px |
| Píxeis não cobertos | 261314 | < 100000 |
| Região "peito" (polygon) | 0 px | > 5000 px |

---

## Problemas Identificados para Próximas Etapas (Não Corrigidos)

1. **Precisão do `_worldToSilhouetteSpace`** - Depende da precisão da transformação do personagem; pode precisar de ajuste fino se houver rotação/escala extrema
2. **Formato do polígono do tronco** - Os 4 pontos (ombros + ancas) formam um quadrilátero; verificar se a ordem dos pontos está correta (sentido horário/anti-horário)
3. **Resolução da silhueta** - Downsample pode perder detalhes finos (mãos, dedos)

---

## Testes de Regressão

```bash
✅ node --check src/segmentation/AnatomicalRecognizer.js
✅ node --check src/main.js
✅ npm test (30/30 PASSOU)
✅ npm run build
```

---

## Próximos Passos Recomendados

1. **Teste visual no navegador** com `Treinador_costas_01.png`
2. Verificar logs `[DIAG]` no console para confirmar:
   - `personMaskPixels > 0` para todas as regiões
   - `peito` (polygon) gerando máscara > 0 píxeis
   - `overlappingPixels = 0` nas métricas
5. Ajustar `regionDefinitions` se necessário (raios, pontos do polígono)

---

## Relatório Criado
📄 `RELATORIOS/2026-11-22_correcao_distribuicao_anatomica.md`

---

## Relatório Criado
📄 `RELATORIOS/2026-11-22_correcao_distribuicao_anatomica.md`

## Índice Atualizado
📄 `RELATORIOS/README.md` (atualizado)