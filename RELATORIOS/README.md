# Índice de Relatórios — RIGBY STUDIO 2D

> Última atualização: 2026-11-22 19:30  
> Organizado por data (mais recentes primeiro)

---

## Tabela de Relatórios

| Data | Atualização | Resumo | Estado | Relatório | Commit |
|------|-------------|--------|--------|-----------|--------|
| 2026-11-23 | Interface do editor | Fase 2D.5 | Testado em Chromium | [Relatório](2026-11-23_interface_editor.md) | PR #1 |
| 2026-11-23 | Edição de peças raster | Fase 2D.5 | Testado em Chromium | [Relatório](2026-11-23_edicao_pecas_raster.md) | PR #1 |
| 2026-11-23 | Rigging e persistência | Fase 2D.5 | Testado em Chromium | [Relatório](2026-11-23_rigging_persistencia.md) | PR #1 |
| 2026-11-22 | Bacia e tornozelos | 72/72 pontos interpretáveis após revisão no treinador | Testado | [Relatório](2026-11-22_bacia_tornozelos_bodypix.md) | PR #1 |
| 2026-11-22 | Recuperação do fluxo raster | BodyPix local, calibração, recorte e reabertura | Testado | [Relatório](2026-11-22_recuperacao_fluxo_raster.md) | 06f0868 |
| 2026-11-22 | Correção Distribuição Anatómica 2D.3 | Polígonos (tronco), eliminação sobreposições, transformações corretas | 🧪 Em teste | [2026-11-22_correcao_distribuicao_anatomica.md](./2026-11-22_correcao_distribuicao_anatomica.md) | — |
| 2026-11-22 | Correção Leitura Real da Máscara | Correção de 3 erros: person.mask vs segmentation, toImageData() assíncrono, leitura canal alfa RGBA | 🧪 Em teste | [2026-11-22_correcao_leitura_mascara.md](./2026-11-22_correcao_leitura_mascara.md) | — |
| 2026-11-22 | Correção API Segmentação — segmentPeople() | estimatePeopleSegments() → segmentPeople() no MediaPipeSelfieSegmentation | 🧪 Em teste | [2026-11-22_correcao_api_segmentacao.md](./2026-11-22_correcao_api_segmentacao.md) | — |
| 2026-11-22 | Correção Botão Início Reconhecimento IA | Botão "Iniciar Reconhecimento Automático", fluxo Pronto→Progresso→Resultados, listener btn-start-recognition | 🧪 Em teste | [2026-11-22_correcao_inicio_reconhecimento_ia.md](./2026-11-22_correcao_inicio_reconhecimento_ia.md) | — |
| 2026-11-22 | Correção Interface Calibrar Armadura | Redesenho toolbar 2×2, painéis Cobertura/Reconhecer IA, CSS calibration-mode-active | 🧪 Em teste | [2026-11-22_correcao_interface_calibracao.md](./2026-11-22_correcao_interface_calibracao.md) | — |
| 2026-11-22 | Correção Vite + TensorFlow.js | Migração de servidor estático para Vite, correção de imports ES modules, shim MediaPipe | ✅ Implementado | [2026-11-22_correcao_vite_tensorflow.md](./2026-11-22_correcao_vite_tensorflow.md) | — |
| 2026-11-22 | Reconhecimento Anatómico 2D.2 | Integração BodyPix/TensorFlow.js, pipeline Silhueta+IA+Armadura, botão "Reconhecer Corpo" | 🧪 Em teste | [2026-11-22_reconhecimento_anatomico_2D2.md](./2026-11-22_reconhecimento_anatomico_2D2.md) | — |
| 2026-11-21 | Calibrar Armadura 2C | Modo Calibrar Armadura, ferramentas Articulações/Regiões, painel de controles, persistência | ✅ Aprovado | [2026-11-21_calibracao_armadura_2C.md](./2026-11-21_calibracao_armadura_2C.md) | — |
| 2026-11-21 | Diagnóstico Cobertura 2D.1 | SilhouetteAnalyzer, visualização de cobertura, métricas de qualidade | ✅ Aprovado | [2026-11-21_diagnostico_cobertura_2D1.md](./2026-11-21_diagnostico_cobertura_2D1.md) | — |
| 2026-11-21 | Correção Inicialização (Checkpoint 4556ccb) | Correção syntax errors main.js, PieceMap.js, PartManager.js, RigEditor.js, Bone.js | ✅ Aprovado | [2026-11-21_correcao_inicializacao.md](./2026-11-21_correcao_inicializacao.md) | 4556ccb |

---

## Legenda de Estados

| Ícone | Significado |
|-------|-------------|
| ✅ Implementado | Funcionalidade completa, testada e validada |
| 🧪 Em teste | Implementada, aguardando validação visual/manual |
| ✅ Aprovado | Validada manualmente, pronta para produção |
| ⚠️ Com problemas | Implementada mas com questões conhecidas |
| 📋 Planejado | Ainda não iniciada |

---

## Notas

- Relatórios mais antigos podem ter menos detalhes (formato anterior à padronização).
- Commits indicados referem-se ao hash do commit base antes das alterações da tarefa.
- Para atualizações sem commit, o estado reflete alterações locais pendentes.
- [Editor de peças, pivô e cadeia do braço](2026-11-23_cadeia_braco.md)
