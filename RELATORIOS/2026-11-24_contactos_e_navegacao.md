# Contactos desenhados e navegação permanente

## Identificação
2026-11-24 · work/rigby-correcao-completa · sequência do diagnóstico b433dc6.

## Objetivo
Corrigir a perda de fixação ao sair de Editar Peças e permitir comparar a pega matemática com a textura, preservando os dados existentes.

## Alterações Realizadas
- main.js: aplica as restrições a todas as personagens fixadas na cena, independentemente do painel aberto. Navegação explícita entre cinco modos, com saída ordenada dos modos anteriores e requisitos visíveis. Preparar reutiliza a armadura existente.
- Diagnostics.js: mede ombro, cotovelo, punho, alvo e contacto raster pela cadeia completa personagem × osso × peça. Sobreposição ativável com coordenadas de cena e flexão em graus.
- Station.js / ArmIK.js: contacto UV ajustável clicando na pré-visualização da mão. Os projetos anteriores conservam o ponto histórico (0.5, 0.45). Guarda o ajuste dentro de pullup.contacts, já serializado pelo formato existente.
- index.html / main.css: cinco modos sempre acessíveis. Mensagem explícita quando falta estrutura e identificação da fixação. Painéis mantêm scroll independente.
- tests/structural-workflow.py: integração Chromium com 15 transições, três resoluções, subida em modos distintos, ajuste do contacto, guardar/reabrir.

## Erros e Correções
A restrição condicionada a isEditPartsMode deixava as mãos acompanhar o tronco ao sair do editor. O cálculo passou a pertencer à cena. O ponto raster antes fixo não correspondia necessariamente à pega visual; agora o utilizador pode calibrá-lo. A indicação do erro usa a posição desenhada, não apenas a distância devolvida pelo solver.

## Testes
- npm test: 30 testes base + 7 regressões passaram.
- npm run build: passou, com avisos preexistentes de tamanho de bundles e import dinâmico de Rig.
- Python Playwright / Chromium headless 153, produção dist roteada sem iniciar servidor. Projeto privado do treinador com 15 peças e 17 ossos.
- structural-workflow.py: 1366×768, 1680×930, 1920×1080; 15 transições; 15 peças/17 ossos preservados; erro máximo do contacto em diferentes modos 1.71e-13 px; reabertura conserva UV; zero pageerrors.
- pullup-playback.py: 24 FPS, 119 instantes, 4.950 s, 58.4 callbacks/s; 30 FPS, 151 instantes, 4.966 s, 60.2 callbacks/s. Pico 310 px. Comprimentos, ausência de inversões e retorno à pose passaram. Erro final <1e-8. Medição no ambiente de teste, não benchmark Windows.
- Capturas privadas inspecionadas: navegação acessível; marcador coincide com o ponto escolhido na mão na suspensão. Capturas não publicadas no repositório.

## Estado Final
Checkpoint estrutural, não aprovação estética. A textura de punho fechado não representa por si só uma pega real; o ponto pode ser calibrado, mas não gera dedos à frente/atrás do travessão. Ombros, mangas e cotovelos continuam a necessitar da comparação visual localizada da etapa C. A calibração da armadura com fixação ligada fica sujeita ao IK: desligar Fixar as duas mãos antes de alterar a anatomia de repouso. O diagnóstico mede o contacto escolhido; não classifica automaticamente os píxeis do travessão nem garante naturalidade anatómica.
