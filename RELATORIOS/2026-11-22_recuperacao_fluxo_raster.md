# Recuperação do fluxo de rigging

## Identificação

Branch de trabalho criada a partir de `911914a3117a115ddc932c440db8bfeaa3086d13`. Validação com o PNG original de 1024 × 1536.

## Objetivo

Recuperar o arranque do editor e preservar cada píxel da máscara desde o reconhecimento até à reabertura do projeto.

## Alterações realizadas

| Área | Ficheiros principais | Resultado |
|---|---|---|
| Reconhecimento | AnatomicalRecognizer.js, refineLabels.js, public/models/bodypix | Modelo MobileNetV1 0.75, stride 16, quantização de 2 bytes. Grafo e pesos oficiais distribuídos com a aplicação. |
| Máscaras | RasterRegion.js, PieceMap.js, main.js | Intervalos por linha guardam o contorno e os espaços transparentes. Shift pinta e Alt apaga na região selecionada. |
| Editor | index.html, main.css, Bone.js, RigEditor.js, RigRenderer.js | Criação de 17 ossos, calibração no canvas e conversão entre câmara, personagem e articulação. |
| Peças e projeto | PartManager.js, PartCutter.js, PartRenderer.js, Scene.js | Recorte pelo raster, seleção por alfa, arraste local, rotação e recuperação das texturas ao reabrir. |

## Erros e correções

A classe de reconhecimento tinha processamento fora de um método, parâmetros duplicados e uma atribuição a uma constante no fluxo MediaPipe. No BodyPix, a API instalada fornece o índice da parte no vermelho e a presença no alfa da mesma máscara RGBA. A projeção agora desfaz o padding antes de cruzar a previsão com o alfa do PNG. A aplicação usava IDs de ossos de dois presets e convertia a máscara num polígono aproximado ao aplicar. O editor também procurava o osso pelo ID da peça durante o arraste.

## Testes

`npm run build` e `npm test` passaram, com 30 testes existentes e três regressões adicionais. O teste Playwright em Chromium abriu o build de produção e bloqueou pedidos externos. Importou o treinador, calibrou uma articulação, testou zoom e deslocação da câmara, executou BodyPix, apagou uma zona da máscara, gerou o antebraço, conferiu o alfa da textura, selecionou e moveu a peça, rodou a peça e o osso e repôs a rotação do osso. Comparou o estado serializado antes e depois de abrir o ficheiro exportado e confirmou a recuperação da textura.

O teste visual, o CSV de referência e as capturas estão incluídos no checkpoint privado. Para repetir com Python Playwright e Chromium disponíveis, executar `python tests/treinador_workflow.py /caminho/Treinador_costas_01.png --chromium /caminho/chromium` após o build.

## Estado final

No checkpoint recuperado, 345 866 de 346 673 píxeis com alfa positivo receberam uma região. Ficaram 807 por classificar, com zero sobreposições e zero píxeis exteriores. Os 26 pontos de referência coincidiram. Na amostra de 80 pontos da silhueta, 72 permitiram atribuição visual e 68 coincidiram. Três divergências situavam-se na bacia e uma junto ao tornozelo. A amostra foi usada no desenvolvimento. A exatidão de todos os píxeis exige uma anotação integral independente.

O corpo produziu 15 máscaras. Cabelo e cabeça partilham uma região. O tronco tem uma única máscara e o pescoço oculto carece de fronteira visível. A bacia é estimada a partir das previsões e da armadura. A validação de inferência com a imagem real cobre o BodyPix. O MediaPipe opcional depende dos pesos externos.

As três capturas do treinador documentam a previsão inicial, a correção manual e a peça editada.
