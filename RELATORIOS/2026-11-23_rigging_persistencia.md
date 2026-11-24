# Validação do rigging e da persistência

## Identificação

Fase 2D.5, build de produção em Chromium desktop, com o PNG original do treinador.

## Objetivo

Verificar o percurso da personagem completa até às peças editadas e reabertas.

## Alterações realizadas

O projeto guarda a região de origem da peça, além da máscara, textura, osso e transformação. A atualização da textura compensa a mudança dos limites do recorte no cálculo do pivô. Os projetos anteriores podem abrir sem o novo identificador. A atualização automática a partir da região requer que a peça tenha essa ligação.

## Erros e correções

O destaque da seleção dependia de uma flag que o gestor não atualizava. A peça selecionada agora determina o destaque e o teste da alça. O editor transforma o gesto do rato para o espaço local do osso antes de mover ou rodar a peça.

## Testes

Passaram os 33 testes de npm test, o build e o teste de layout em Chromium. No percurso de ponta a ponta, o treinador produziu 17 ossos e 15 máscaras. O BodyPix manteve 99,77% de cobertura e zero sobreposições e píxeis exteriores.

O teste privado arrastou uma articulação, ajustou zoom e deslocação, aplicou o reconhecimento e apagou parte da máscara. Gerou o antebraço esquerdo e comparou o alfa de toda a textura com o alfa original dentro do recorte. Selecionou a peça no canvas, moveu-a, rodou-a pela alça, redimensionou-a e ajustou o pivô por arraste. Voltou à máscara pelo editor e confirmou que a textura mudou e os ajustes de posição, rotação e escala persistiram.

Também gerou peças do braço superior esquerdo, bacia, coxa esquerda, perna inferior esquerda e pé esquerdo. Verificou a ligação de cada peça ao osso e a rotação por meio do controlo de movimento. O projeto foi exportado, reimportado e comparado integralmente com o estado anterior. O navegador terminou sem erros de página nem pedidos externos.

## Estado final

A validação cobre este treinador e as resoluções de desktop indicadas. O teste integral foi executado com o mecanismo de download e abertura de ficheiro do navegador. O comportamento do seletor nativo de ficheiros do Windows e o desempenho no computador do utilizador continuam por confirmar.
