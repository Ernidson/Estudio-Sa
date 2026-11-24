# Bacia, tornozelos e preservação do recorte

## Identificação

Revisão do checkpoint publicado `06f08685f76ce3b79afe834b9643380d939bc06c`, com o PNG original e a armadura calibrada durante o teste.

## Objetivo

Corrigir a atribuição da faixa das calças junto ao cós e reduzir as trocas entre pernas e ténis visíveis de costas.

## Alterações realizadas

Em `src/segmentation/AnatomicalRecognizer.js`, a pós-classificação calcula cores de referência a partir das previsões do próprio PNG. Perto da linha das ancas, uma previsão de tronco pode passar para bacia quando a cor coincide claramente com as calças. Perto da articulação do tornozelo, o mesmo critério distingue a bainha e o ténis. O teste de proximidade entre os membros usa uma margem mais estreita nas pernas para as situações em que os tornozelos quase se tocam.

## Erros e correções

Na amostra aleatória de desenvolvimento, o checkpoint anterior tinha três atribuições erradas na bacia e uma junto ao tornozelo. A correção reatribui píxeis já classificados. A região estimada da bacia passou de 28 344 para 35 873 píxeis.

## Testes

| Medida no treinador | Checkpoint | Após correção |
|---|---:|---:|
| Píxeis cobertos / visíveis | 345 866 / 346 673 | 345 866 / 346 673 |
| Sem classificação | 807 | 807 |
| Sobrepostos / exteriores | 0 / 0 | 0 / 0 |
| Regiões com máscara | 15 | 15 |
| Pontos de referência corretos | 26 / 26 | 26 / 26 |
| Pontos aleatórios interpretáveis corretos | 68 / 72 | 72 / 72 |

A amostra contém 80 pontos sorteados na silhueta, com oito pontos de interpretação ambígua. Os pontos usados na depuração medem a correção neste treinador. A precisão integral e a generalização a outras personagens continuam por medir.

`npm test` passou nos 33 testes. `npm run build` gerou o build de produção. O Chromium executou o fluxo completo com os pedidos externos bloqueados e sem erros de página. O teste verificou a transparência do recorte píxel a píxel, a rotação do osso e a reposição, o movimento e a rotação local da peça e a igualdade do estado da personagem antes e depois de reabrir o projeto.

## Estado final

O reconhecimento BodyPix e a edição de máscaras raster funcionaram no treinador fornecido. A linha inferior da bacia depende da calibração das ancas e a separação entre a bainha e os ténis depende do contraste local. As zonas de baixo contraste podem precisar de correção manual. Os pesos opcionais de MediaPipe não foram validados neste teste.
