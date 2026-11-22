# Relatório: Calibrar Armadura — Fase 2C

## Identificação
- **Data:** 2026-11-21
- **Nome da atualização:** Calibrar Armadura — Fase 2C
- **Fase do projeto:** Fase 2C — Calibrar Armadura e Regiões Anatómicas
- **Branch:** master
- **Commit base:** Após correção de inicialização (4556ccb)

---

## Objetivo
Implementar modo visual "Calibrar Armadura" com duas ferramentas distintas:
- **A — Ajustar Articulações**: arrastar bones, preservar hierarquia, mostrar posições local/mundial, botão "Repor Esta Articulação"
- **B — Ajustar Regiões**: editar vértices, largura/altura, posição, rotação; botões "Repor Região" e "Confirmar Ajustes"

Preservar distinção entre ossos (hierarquia/movimento) e regiões (malha visual), persistir calibração em `.rigbystudio`.

---

## Alterações Realizadas

### Ficheiros Criados
| Ficheiro | Descrição |
|----------|-----------|
| `src/main.js` | Lógica completa do modo calibração (estado, UI, handlers mouse, render) |
| `index.html` | Botão "Calibrar Armadura", toolbar `calibration-toolbar`, painel `calibration-panel`, painel `recognition-panel` |
| `src/styles/main.css` | Estilos `.calibration-toolbar`, `.calibration-tool-selector`, `.calibration-panel`, `.recognition-panel`, classe `.calibration-mode-active` |

### Ficheiros Modificados
| Ficheiro | Alteração |
|----------|-----------|
| `src/main.js` | Estado `isCalibrationMode`, `calibrationTool`, `calibrationSelectedRegionId`; funções `toggleCalibrationMode`, `enterCalibrationMode`, `exitCalibrationMode`, `setCalibrationTool`, `updateCalibrationModeUI`, `showCalibrationPanel`, `updateCalibrationPanel`, callbacks `onCalibrationRegionSelectionChange`, `onCalibrationRegionChange`, `onCalibrationBoneSelectionChange`; integração no `renderLoop` e handlers de mouse |
| `index.html` | Botão `btn-calibrate-armor` na toolbar; `calibration-toolbar` com seletor Articulações/Regiões/Cobertura; `calibration-panel` dinâmico; `recognition-panel` para fase futura |
| `src/core/Scene.js` | Serialização `pieceMap` no `SceneObject.toJSON()` / `fromJSON()` |
| `src/parts/PieceMap.js` | Campo `originalPoints` na serialização (`toJSON`/`fromJSON`) para suportar "Repor Região" |

---

## Funcionalidades Implementadas

### Ferramenta Articulações (reutiliza `RigEditor`)
- Seleção e arraste de articulações no canvas
- Preservação de hierarquia pai-filho
- Painel lateral: nome, posição local X/Y, posição mundial X/Y (referência), lado, tipo, osso pai, botão "Repor Esta Articulação"

### Ferramenta Regiões (reutiliza `PieceMap`)
- Seleção de região por clique no canvas
- Edição de vértices por arraste (reutiliza `startDragPoint`/`dragPoint`/`endDragPoint`)
- Painel lateral com controles numéricos:
  - Largura / Altura (input + slider)
  - Posição centro X / Y
  - Rotação graus (input + slider)
- Botões: "Repor Região" (restaura `originalPoints`), "Confirmar Ajustes" (atualiza `originalPoints`)

### Persistência
- `pieceMap` serializado em `SceneObject.toJSON()` → guardado em `.rigbystudio`
- `originalPoints` preservado para permitir reverter ajustes manuais
- Compatibilidade com projetos antigos (campos opcionais)

---

## Testes

| Teste | Resultado |
|-------|-----------|
| `node --check` (todos ficheiros) | ✅ PASSOU |
| `npm test` (30 testes unitários) | ✅ 30/30 PASSOU |
| Servidor Vite inicia | ✅ Porta 56500 |
| Importação PNG | ✅ Funcional |
| Preparar Personagem (17 ossos) | ✅ Funcional |
| Modo Calibrar Armadura ativa | ✅ UI aparece, ferramentas alternam |
| Ferramenta Articulações | ✅ Seleciona/arrasta bones, painel atualiza |
| Ferramenta Regiões | ✅ Seleciona região, edita vértices, controles funcionam |
| Botão "Repor Região" | ✅ Restaura `originalPoints` |
| Botão "Confirmar Ajustes" | ✅ Atualiza `originalPoints` |
| Persistência `.rigbystudio` | ✅ Serializa/desserializa `pieceMap` |

---

## Estado Final

- ✅ Modo "Calibrar Armadura" independente (mutuamente exclusivo com rigging, piece-map, edit-parts, cutting)
- ✅ Alternância Articulações / Regiões funcional
- ✅ Edição visual de vértices + controles numéricos
- ✅ Distinção clara Osso vs Região preservada
- ✅ Persistência completa em `.rigbystudio`
- ✅ Compatibilidade com projetos antigos

---

## Próxima Etapa
Fase 2D.1 — Diagnóstico de Cobertura (SilhouetteAnalyzer)