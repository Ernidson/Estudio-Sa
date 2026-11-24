# Geração e edição de peças

## Identificação

Fase 2D.5, branch work/rigby-correcao-completa.

## Objetivo

Separar os píxeis da imagem base e editar a peça independentemente.

## Alterações realizadas

RasterPieces.js, Renderer.js, Part.js, PieceMap.js, PartRenderer.js e main.js. O identificador da região liga o recorte às correções posteriores. A peça dispõe de movimento, rotação, escala e edição de pivô. O editor de regiões inclui pincel, borracha, raio, opacidade e seleção isolada.

## Erros e correções

A imagem base era desenhada inteira por baixo das peças. Uma cópia em canvas subtrai as máscaras raster das peças extraídas. Durante a calibração apresenta-se o original para corrigir a classificação.

## Testes

No treinador original, a textura foi comparada com o PNG e a máscara. Um teste de renderização verificou transparência na base no ponto extraído e conteúdo no tronco. A comparação de estado após exportação incluiu os dados das texturas.

## Estado final

A subtração da base aplica-se às peças raster. Projetos antigos continuam a aceitar peças poligonais.
