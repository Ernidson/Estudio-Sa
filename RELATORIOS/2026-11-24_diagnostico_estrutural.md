# Diagnóstico estrutural e comparação das arquiteturas

## Identificação

Checkpoint examinado 6b45d3d7f849eb080b028a70d9cf7314624fff5d. Repositório anterior Ernidson/ridby examinado em d9e47d45bde78574dd30dc89fc37c8e3a2bb9ac7. Código privado Auto-Rig v0.4 recuperado do ZIP original. Gravação Windows de 4,5 s inspecionada.

## Objetivo

Distinguir restrição matemática, contacto raster e desenho antes de alterar a cinemática.

## Arquiteturas

| Sistema | Pose e IK | Desenho | Reutilização |
|---|---|---|---|
| Rigby2D pose.js | Estado local animado separado de applied; restrições ordenadas antes do cálculo final; alvos mundiais, reflexão e limites | worldVertices combina pesos por osso e offsets de deformação | Separar avaliação de pose e restrições; testar a transformação completa do contacto |
| Rigby2D Pixi | Recebe a pose e gera geometria, com caminho Work Auto-Rig opcional | MeshGeometry, UVs, textura/slot e inversão Y no contentor | Convenção explícita de espaços e desenho de triângulos. A troca para Pixi não corrige uma associação ausente |
| viewer/viewer.html | Carrega e instancia o runtime; enquadra atores e gere reprodução | Pixi, imagens de atlas | Não contém um solver autónomo a transplantar |
| Auto-Rig v0.4 rig.js | Pose calculada a partir da suspensão, comprimentos de referência, alvos fixos e limitação da subida ao alcance | skin.js, rotation-field.js, shoulders.js | Campo de rotação local e critérios de área dos triângulos, adaptados às máscaras atuais |
| Studio atual | PoseClip interpola matrizes locais; ArmIK altera ossos no loop principal | viewport × personagem × osso × peça, imagem deslocada pelo pivô | Preservar recortes, timeline e formato. Unificar o caminho de restrições e de contacto |

A v0.4 usa uma malha de ombro calibrada de 285 vértices por lado, bancos de posições e projeção de áreas. O relatório RELEASE-v0.4 regista concavidades nas mangas mesmo sem inversões. A sua calibração e as suas texturas não são reutilizáveis diretamente no novo mapa raster. O runtime Pixi usa Y para cima; Studio e os PNGs usam Y para baixo.

## Causas verificadas

1. O loop atual chama constrainArms apenas quando isEditPartsMode é verdadeiro. No Chromium, sair de Editar Peças e deslocar a raiz 100 px deslocou o punho os mesmos 100 px embora pullup.fixed continuasse verdadeiro.
2. A saída do modo voltou a mostrar Recortar Peça e escondeu Editar Peças e Calibrar. As funções de entrada e saída escrevem diretamente nos mesmos controlos, com estados contraditórios.
3. O contacto é definido pelos fatores 0,5 e 0,45 do retângulo da textura. Esse ponto coincide com o alvo por construção, mas não identifica uma prega/dedo escolhido pelo utilizador. O erro do solver mede alcance em coordenadas do pai, não a discrepância visual em coordenadas do canvas.
4. As pegas são guardadas no referencial da barra, mas o modelo da superfície do travessão não é persistido. A interface esconde a fixação se a estrutura associada não for encontrada, sem explicar o motivo.
5. O ciclo gerado altera apenas Y da raiz. O tronco, coluna e ombros mantêm a pose relativa de suspensão. Os sprites rígidos deixam espaços nas interfaces e a mistura radial de texturas não corrige a correspondência geométrica das pregas.

## Comparação com a gravação

Os cinco instantes observados mostram mãos deslocadas e braços quase estendidos. A gravação mostra Animação como primeiro painel e conserva eixos/moldura de seleção. No checkpoint atual, Barra fixa e Correções por pose precedem Animação; o exercício associado oculta os eixos e a moldura. Isto sugere frontend anterior ou recursos desatualizados. Não se pode determinar o SHA executado a partir do vídeo. A falha de associação/modo acima é reproduzível independentemente dessa hipótese.

## Testes e estado final

Build do checkpoint e reprodução no Chromium concluídos. Inspeção dos três projetos e da gravação realizada. Este checkpoint publica apenas o diagnóstico. A implementação seguinte deverá fornecer marcadores independentes para alvo, punho, contacto raster, ombro, cotovelo e travessão, aplicar as restrições da personagem independentemente da navegação e permitir calibrar o contacto na textura. A deformação começa num protótipo local esquerdo com avaliação visual antes de expansão.
