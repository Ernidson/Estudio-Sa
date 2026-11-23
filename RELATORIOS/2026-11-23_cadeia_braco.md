# Editor de peças e cadeia do braço

O editor só alterava a transformação local da textura. A hierarquia existente já ligava peito, ombro, cotovelo e pulso. O seletor do editor permite agora rodar o osso por arrasto ou por ângulo. A primeira rotação guarda o ângulo de referência do osso no projeto. Repor pose recupera esses ângulos e conserva os ajustes das peças.

A barra passou a usar uma grelha com quebra de linha. A seleção alimenta a lista, a contagem e a etiqueta da barra. A mira do pivô é desenhada depois das texturas, em coordenadas do canvas e com tamanho fixo. O botão alinha a origem local da peça com a origem do osso. Se já coincidirem, a textura e a mira ficam no mesmo lugar. O arrasto e os campos do pivô compensam a posição da textura.

## Validação

O teste tests/arm-workflow.py recebe o PNG local e um diretório privado para capturas. Após o build, o Chromium importou o treinador original, executou BodyPix, aplicou as máscaras e gerou três texturas. O teste verificou as matrizes de desenho antes e depois de cada rotação de 35 graus.

| Região | Osso | Pai | Peças afetadas |
|---|---|---|---|
| Braço superior esquerdo | ombro_esquerdo | peito | Braço superior, antebraço e mão |
| Antebraço esquerdo | cotovelo_esquerdo | ombro_esquerdo | Antebraço e mão |
| Mão esquerda | pulso_esquerdo | cotovelo_esquerdo | Mão |

Cada reposição recuperou as matrizes iniciais. O antebraço manteve a posição visual ao realinhar o pivô após deslocação, rotação e escala. Com o punho a 17 graus, o projeto guardado e reaberto preservou os dados da personagem e as três texturas. Foi possível recuperar a rotação de referência após reabrir.

Em 1366×768, 1680×930 e 1920×1080, o centro de cada controlo da grelha ficou acessível e a seleção conservou as dimensões do canvas. O fluxo terminou sem exceções de página ou pedidos externos. O build e os 35 testes automáticos passaram. A validação de rotação no navegador utilizou o campo numérico. A execução foi em Chromium Linux.
