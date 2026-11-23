# Interface e acessibilidade das ferramentas

## Identificação

Fase 2D.5, branch work/rigby-correcao-completa.

## Objetivo

Manter o canvas estável e as ações acessíveis durante a seleção.

## Alterações realizadas

index.html, main.css e main.js. A área de edição passou a ter três colunas e uma linha limitada à altura disponível. Os painéis laterais têm scroll próprio. As listas de peças e regiões ficam à esquerda e as propriedades são recolhíveis.

## Erros e correções

Fechos HTML excedentes deixavam formulários fora do contentor de scroll. A lista de regiões também era inserida no formulário geral.

## Testes

O teste de regressão tests/editor-layout.cjs cria uma imagem provisória no navegador e verifica a geometria do canvas, a altura da página e o elemento efetivamente acessível sob o botão Gerar Peça. Passou a 1366×768, 1680×930 e 1920×1080. O percurso privado repetiu as três verificações com o treinador.

## Estado final

Validado em Chromium desktop. A interface móvel não recebeu validação visual.
