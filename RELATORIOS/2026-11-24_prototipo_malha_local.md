# Protótipo localizado e comparação visual

## Identificação
2026-11-24 · branch work/rigby-correcao-completa · depois do checkpoint ba73713.

## Objetivo
Testar a reutilização do conceito de campo de rotação do Auto-Rig v0.4, sem importar a sua malha fixa nem substituir o Canvas 2D, e comparar ombro/cotovelo esquerdos nas mesmas poses.

## Alterações Realizadas
- LocalJointMesh.js: duas pequenas malhas (10×10 células cada), com raio limitado a 64 px e ao tamanho do segmento. Pose de ligação obtida da pose inicial existente. Pesos radiais e interpolação angular local; nenhuma deformação do sprite completo do tronco.
- Textura recomposta exclusivamente das peças raster existentes de cada ligação. Mudança de imagem recortada invalida o cache, respeitando a edição de máscaras. Ajustes locais diferentes da pose inicial suspendem o preenchimento dessa ligação para não encobrir a edição do utilizador.
- PartRenderer: desenha o protótipo por baixo das peças. Opção persistente em pullup.localMesh, desligada por defeito. Controlo em Correções por pose.
- Diagnostics / Station: nomes portugueses e linha independente do travessão, estimada pela faixa opaca central do PNG. É uma referência visual, não uma classificação semântica automática da barra.
- Testes local-mesh-workflow.py e opção --local-mesh em pullup-playback.py.

## Erros e Correções
A primeira interpolação linear de posições produziu 34 triângulos invertidos no topo. Foi substituída por interpolação de rotação com pesos radiais: zero inversões nas 101 alturas testadas. Não se copiou a topologia fixa do projeto antigo.

## Testes
- Build passou; 30 testes base + 7 regressões passaram.
- Chromium: cinco alturas (0, 80, 160, 240, 310 px), com/sem malha. Pose inicial idêntica píxel a píxel. 400 triângulos nos estados ativos.
- Varredura de 101 alturas: zero inversões. Ajuste local de 5 px na peça do antebraço suspende o preenchimento correspondente.
- Guardar/reabrir verifica preservação do sinalizador do protótipo.
- structural-workflow.py repetido com importação PNG real, 15 transições, três resoluções e roundtrip do contacto: passou, sem pageerrors.
- Reprodução com protótipo ativo: 24 FPS, 120 instantes, 4.950 s, 57.6 callbacks/s; 30 FPS, 151 instantes, 4.966 s, 58.4 callbacks/s; contacto e pose final sem desvio mensurável a seis casas decimais.
- Capturas privadas inspecionadas; não incluídas no Git público.

## Estado Final
O preenchimento reduz parte do vazio junto ao cotovelo esquerdo. No topo, o preenchimento também pode criar uma saliência arredondada no cotovelo, pelo que não foi aprovado como acabamento final. A manga/axila continua a apresentar uma fronteira rígida; a T-shirt pode parecer separada do braço em poses intermédias. A versão inicial de mistura linear foi rejeitada. A versão radial permanece um protótipo desligado por defeito, não uma solução estética aprovada. Não foi expandida ao braço direito.

A correção estrutural da fixação e da navegação está pronta para teste no Windows. A naturalidade visual completa continua pendente: exige uma fronteira de deformação partilhada entre manga e tronco e alinhamento de texturas corretivas por pose, em vez de apenas preencher por baixo de recortes rígidos. Os punhos fechados continuam a limitar a representação da pega. Não foi repetido o reconhecimento BodyPix: testes usam máscaras já guardadas, sem alterar o reconhecedor.
