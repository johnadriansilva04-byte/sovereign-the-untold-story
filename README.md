# Sovereign: The Untold Story

cria o jogo o nome é SOVEREIGN  A historia que nao te contaram. 

Se ligou? Eu quero que você faça só o front-end. Introduza bem certinho cada coisa, principalmente a história da campanha. Você faz um documento lá dentro explicando tudo isso, o que vai ser desenvolvido, o que precisa ser desenvolvido e qual é o objetivo do jogo. Primeiro, na campanha, a gente tem a história da Força Expedicionária Brasileira, o cara que está na época contemporânea, ele simplesmente não sabe que está em guerra híbrida, aqui no momento. E começa a estudar e descobre a Força Expedicionária Brasileira, daí monta todo um traço da elite do Rockefeller. Coloca a família Rockefeller lá. Ele descobre e vem vindo, chega até num ponto aqui. Toda essa história. Procure lá a Jane Jacobs, o Tesla, que morreu abandonado. Procure essas histórias e coloque lá. É baseado em fatos reais, digamos assim. Coloca as coisas reais. É uma tese, uma interpretação de mundo diferente, mas vamos enquadrar como ficção. Mas com fatos reais, você se ligou? Daí você vai fazendo, a Força Expedicionária sendo apagada quando voltou pra cá depois de ganhar a guerra. Você cria todo um roteiro pra campanha, como que vai ser avançado, as batalhas que começam. A primeira batalha contemporânea, daí vai vindo de trás. Ele luta a primeira batalha dele contemporânea, daí que ele percebe que tem uma batalha a ser lutada. Daí ele começa a estudar e encontra a guerra lá na Segunda Guerra Mundial e vem traçando essa trilha que eu te falei. Tesla, Jane Jacobs, as manipulações na antropologia, na saúde, nessas coisas. Você busca tudo na internet, o que traz até aqui. Como que eles tomaram o Brasil e daí monta um roteiro pra colocar lá pra chegar na guerra contemporânea, que nós lutamos a primeira batalha antes de estudar tudo isso. Vai revelando uma coisa atrás da outra. Entendeu, mano? É assim que funciona. Faça aí. Vamos ver o que será.

Ah, e também coloca que esse jogo foi desenvolvido pela Variant, entendeu? Pela empresa que visa homenagear a Força Expedicionária Brasileira, mas isso você coloca num rodapé, em alguma coisa assim, entendeu? Não deixa escancarado. Foca no jogo, foca na jogabilidade, deixar uma UX bem bonita, porque é só isso que você vai fazer, só o front-end, entendeu? E deixar esse documento relatando tudo isso, o que vai se tornar o jogo.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/51868c81-db28-455a-87e8-cb4775782cf1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Como jogar (solo, offline)

O SOVEREIGN roda inteiro no front-end. Você pode jogar a campanha hoje, sem servidor e sem
rede:

```sh
npm i
npm run dev
```

Depois abra `/campanha`:

1. **Capítulo 1 — Operação Apagão**: briefing, dossiê e "Entrar no teatro".
2. **Preparação**: escolha missão, baralho (8 cartas do seu inventário), comandante, doutrina e
   dificuldade (Recruta → Soberano → Comandante IA/LLM).
3. **Batalha**: selecione cartas na mão, posicione na sua zona, dê ordens e dispute os pontos de
   controle. Partidas de 4–6 min, com fase final de comando acelerado.
4. **Recompensa**: vencer concede cartas, acessórios, pesquisa e Sovereigns, e desbloqueia o
   próximo capítulo.

Outras telas: `/mapa` (mapa-múndi interativo e dossiês de país), `/eventos` (feed da guerra e
histórico de batalhas), `/ia` (comandantes e níveis de ameaça), `/multiplayer` (PvP com apostas
de cartas), `/colecao` (cartas, acessórios, baralhos), `/nacao` (árvore tecnológica), `/perfil`
(progresso e sincronização), `/configuracoes` (preferências locais) e `/creditos` (autoria e
fontes históricas).

**Sincronização (opcional).** Crie um `.env` com as chaves públicas do Supabase para ativar o
login anônimo e o salvamento em nuvem. Sem elas, o jogo é 100% local (localStorage).

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

**Comandante LLM (opcional).** A dificuldade "Comandante IA (LLM)" usa um modelo quando estas
variáveis existem no servidor; sem elas, cai automaticamente para a IA tática local.

```
SOVEREIGN_LLM_BASE_URL=...
SOVEREIGN_LLM_API_KEY=...
SOVEREIGN_LLM_MODEL=...
```

Documentos de design: `docs/batalha.md` e `docs/progressao-e-multiplayer.md`.
