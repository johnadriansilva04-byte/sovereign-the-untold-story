# SOVEREIGN: A História Que Não Te Contaram — documento interno

Documento de visão e controle do projeto. Serve para três coisas: (1) fixar o **objetivo do
jogo**, (2) registrar **o que já está construído** no front-end e (3) listar **o que ainda
falta**, em ordem de prioridade. Não é o design detalhado de cada sistema — isso está em
`docs/batalha.md`, `docs/cartas-e-arquitetura.md` e `docs/progressao-e-multiplayer.md`.

> Escopo desta fase: **somente o front-end**. Nenhum servidor próprio, nenhum back-end
> proprietário. O jogo roda inteiro no navegador; quando há Supabase configurado, ele é usado
> apenas para persistir progresso e lobbies PvP assíncronos (com RLS). Sem Supabase, tudo
> funciona offline com `localStorage`.

---

## 1. Objetivo do jogo

**SOVEREIGN** é um jogo de estratégia e campanha narrativa sobre **guerra híbrida**. O
jogador acompanha **Davi**, um brasileiro contemporâneo que não sabe que vive dentro de uma
guerra — não a guerra de tanques na fronteira, mas a que acontece por dados, energia, medo,
desinformação e captura de instituições.

A tese do jogo (apresentada como **ficção**, costurada com **fatos verificáveis**):

1. O Brasil lutou e venceu na Segunda Guerra com a **Força Expedicionária Brasileira (FEB)** —
   e, ao voltar, foi **apagado** da memória nacional.
2. Existe um **traço de elite** — a família Rockefeller como fio condutor — que liga dinheiro,
   filantropia, saúde, antropologia, energia e cidades ao longo de um século.
3. Nomes como **Nikola Tesla** (morto abandonado) e **Jane Jacobs** (que enfrentou o
   planejamento urbano de grande escala) aparecem como peças de uma história maior sobre quem
   controla infraestrutura, ciência e cidades.
4. Essa máquina, acumulada por décadas, chega ao presente como **guerra híbrida**: sem
   declaração, sem uniforme, sem fronteira.

O jogo **não entrega a conclusão pronta**. Ele **revela uma peça atrás da outra**: o jogador
luta uma batalha contemporânea **antes** de entender por que ela acontece, e só depois começa
a estudar — voltando à Segunda Guerra, à FEB, ao dinheiro, à ciência — para montar o quebra-cabeça.

**Mensagem central:** soberania não é só ter exército. É enxergar a guerra antes que ela chegue
à porta de casa.

---

## 2. Estrutura narrativa (implementada)

A campanha já tem **50 capítulos** organizados em **8 atos** (`src/game/campaign.ts`):

| Ato | Título | Tema |
|-----|--------|------|
| I | O Presente | O apagão, a desinformação, o inimigo sem rosto |
| II | A Descoberta | Davi encontra a FEB e a trilha do que foi apagado |
| III | A Trilha do Dinheiro | Rockefeller, filantropia, influência |
| IV | A Ciência da Influência | Antropologia, saúde, mídia, comportamento |
| V | Energia e Cidades | Tesla, Jane Jacobs, quem desenha as cidades |
| VI | A Máquina de Guerra | Indústria, logística, armamento |
| VII | A Guerra Híbrida | O presente como campo de batalha total |
| VIII | Soberano | A virada: o Brasil como sujeito, não objeto |

Cada capítulo tem: **narrativa** (diálogos com personagens), **missão** (objetivo + tipo de
batalha), **arquivos** históricos (`kind: "fato" | "documento" | "ficcao"`) e **decisões**
(escolhas com consequência de campanha, em `src/game/progress/decisions.ts`).

Regra de conteúdo: tudo marcado **fato** ou **documento** é verificável e citado; a **tese**
que conecta os fatos é marcada **ficção** — é a interpretação do jogo, admitidamente uma
leitura de mundo, embalada como obra de ficção.

---

## 3. O que já está construído (front-end)

### 3.1 Telas e rotas
- `/` — abertura e entrada no jogo
- `/campanha` — mapa de campanha, capítulos, narrativa (`StoryBook`), decisões
- `/batalha` — teatro de operações em **tela cheia**, com HUD sobreposto
- `/mapa` — camada geopolítica (nação, territórios, expansão)
- `/nacao`, `/eventos`, `/dossie`, `/colecao`, `/ia` — gestão de país, eventos, arquivos, cartas
  e comandante IA
- `/multiplayer` — lobbies PvP assíncronos
- `/perfil`, `/configuracoes`, `/creditos` — conta, ajustes e créditos

### 3.2 Batalha tática (o núcleo)
- **Campo deitado (esquerda→direita) em qualquer tela**: o eixo de progressão (azul→vermelho)
  corre da ESQUERDA para a DIREITA — base aliada à esquerda, inimiga à direita — no desktop e no
  celular. No desktop a mesa tem uma leve diagonal + inclinação 60° (leitura isométrica); no
  celular em pé o campo fica **RETO** (giro 0) com inclinação 20°, então o campo não "torta" nem
  sobra faixa morta. Implementado como **matriz `matrix3d` única** aplicada ao próprio `<svg>`
  (`cameraMatrix3d`), invertida analiticamente para o toque (`stageToWorld`). Sem
  `perspective()`/`rotateX` do CSS (esse caminho era frágil).
- **Tela cheia com HUD sobreposto**: o teatro ocupa a tela inteira; relógio, energia e recursos
  flutuam por cima em painéis translúcidos; o dock traz só as cartas e as ordens.
- **Bases principais nas pontas**: base aliada à **esquerda** e inimiga à **direita**
  (em todas as telas), cada uma na sua ponta do campo.
- **Motor determinístico** (`src/game/battle/engine.ts`): bases, torres, territórios de Voronoi,
  bases avançadas, armas com projéteis reais, captura, suprimento, heróis, prêmios.
- **1 chanceler por batalha, em dois modos** (`chancellorModeFor`): cada confronto tem **um
  único chanceler decisivo** em campo — o **nosso** (modo `defender`, proteger) ou o do
  **adversário** (modo `capturar`, prender/eliminar). A missão declara o modo quando quer
  (`MissionDef.chancellor`); sem declaração, ele **alterna por índice**. O modo define a
  condição de fim: no `defender`, perder o nosso chanceler é derrota imediata; no `capturar`,
  neutralizar o adversário é vitória imediata. O posto de comando nasce **recuado, atrás da
  própria base**, e a IA o mantém ali (não o leva ao front).
- **Teto de exército = 33 unidades por lado** (`MAX_UNITS_PER_SIDE`), contando só quem está em
  campo (prisioneiros, chanceler e heróis não ocupam vaga).
- **IA tática local** (`src/game/battle/ai.ts`) com personalidades de comandante (Metódico,
  Agressivo, Econômico, Cauteloso, Oportunista) e pesos treináveis.

### 3.3 Cartas, progressão e persistência
- Catálogo de cartas militares e de apoio, doutrinas, comandantes e arenas por terreno.
- Progressão local-first: nível de conta, XP, inventário, baralhos, desbloqueios.
- Sincronização opcional com Supabase (perfil, campanha, inventário, decks, registros de
  batalha e lobbies PvP), sempre **silenciosa** — falha de rede nunca interrompe uma batalha.

### 3.4 PvP em tempo real (núcleo construído)
- **Lockstep determinístico** (`src/game/pvp/live.ts`): os dois clientes rodam a MESMA
  simulação com a MESMA semente e trocam apenas os COMANDOS. O motor é determinístico (RNG
  semeado, sem `Math.random`/relógio dentro de `stepBattle`), então o estado só diverge se os
  comandos divergirem — e `stateHash` detecta a divergência.
- **Janela de entrada** (`INPUT_DELAY_TICKS = 4`, ~400 ms): cada jogador pode avançar alguns
  ticks à frente do adversário, dando tempo de o comando atravessar a rede.
- **`LiveSim`**: fila de comandos ordenada por (tick, seat, seq), `hash()`, `snapshot()`,
  `noteRemoteProgress` e `applySnapshot` (o host é a autoridade e ressincroniza).
- **`LiveMatch`** (`match.ts`): relógio com tempo INJETADO (`advance(elapsedMs)` — o `rAF` do
  hook passa o tempo; nos testes o laço é determinístico e não usa `setInterval`). Emite
  heartbeats de progresso (200 ms) e de hash (1,5 s); compara o hash do adversário no MESMO
  tick (janela ±3) e pede snapshot ao host em caso de divergência.
- **Transporte** (`transport.ts`): abstração `LiveTransport` sobre o Realtime do Supabase em
  modo BROADCAST (efêmero, sem gravar no banco, sem migração). Sem Supabase, cai num transporte
  vazio (no-op) e o jogo continua offline. Nos testes, `createFakeTransportPair` liga dois peers
  em memória.
- **Lobby** (`lobby.ts`): matchmaking determinístico/testável via presence, com código de sala
  compartilhável (`makeRoomCode`, alfabeto sem caracteres ambíguos).
- **Lado do jogador parametrizado** (`localSide`): a interface toda (arena, HUD, topo, herói,
  mão de cartas, economia) passou a derivar do lado local — host joga **azul**, convidado joga
  **vermelho**. Antes a arena era fixa no azul; o padrão continua `blue`, então campanha/treino
  não mudam.
- **Chanceler no PvP**: `buildLiveConfig` aplica a MESMA regra de 1 chanceler por batalha,
  alternando `defender`/`capturar` pela paridade da semente (os dois clientes chegam ao mesmo
  resultado).
- **Ações novas no motor** (`lote` e `dirigir`): expostas como `BattleAction` para o lockstep
  aplicar o mesmo lote de envio e o mesmo vetor do chanceler nos dois clientes.
- **Interface da partida** (`useLivePvp.ts` + `OnlineBattle.tsx`, CONSTRUÍDA 13/11): a
  `BattleView` (extraída de `BattleScreen.tsx`) é a MESMA tela para batalha local e online — ela
  recebe uma "fonte" (`BattleSource`) que, no online, publica cada comando no lockstep em vez de
  rodar a IA. `useLivePvp` cria o `LiveMatch` uma única vez, dirige o relógio pelo `rAF` e expõe
  a API idêntica à da batalha local (`sendBatch`, `issueOrder`, `moveSelected`, `capture`,
  `driveUnit`, `costOf`).
- **Fluxo de sala** (`OnlineBattle.tsx`): menu "criar sala / entrar por código", tela de espera
  com o código compartilhável e a partida. O código é **determinístico** (`encodeRoom`/
  `decodeRoom`): empacota semente + terreno, então o convidado reconstrói a MESMA config só com o
  código — sem canal extra de anúncio. Botão de acesso: **"Sala online · tempo real"** no lobby
  de `MultiplayerScreen`.

---

## 4. O que falta desenvolver (prioridades)

### P0 — fechar o núcleo de batalha
- [x] **IA atingir o teto de 33 com inteligência** (RESOLVIDO 13/11). A causa não era
      dificuldade nem nível de carta: era a ECONOMIA. A correção veio de duas mudanças
      combinadas:
      - **Economia de 500 Sov** (`engine/SOV_START`, era 1000): menos Sov entesourado e um
        teto de gasto mais baixo. Sozinha, já levava a campanha de 10 falhas para 1.
      - **Reforço com paridade** (`ai/reinforceTuning`): com Sov acima da reserva, a IA
        implanta cartas prontas até ALCANÇAR o inimigo visível (folga `slack=1`), no máximo
        `maxExtra=2` cartas extras por ciclo. A paridade evita bola de neve; o limite por
        ciclo preserva o foco de fogo.
      - **Medição final** (varredura dos 50 caps., 5 tentativas cada, ≥1 vitória):
        **0 falhas**. Curva de dificuldade monotônica: recruta 0.90, veterano 0.85,
        elite 0.80, soberano 0.35. O exército azul chega às **33** nas batalhas de atrito
        (5 das 50), com pico máximo 33/33.
      - **Re-calibração dos presets** (`progress/catalog.difficulties`): com a economia de
        500, os presets antigos achatavam a curva (soberano ~0.90). Novos valores:
        recruta 1.45/0.95, veterano 1.15/1.10, elite 0.85/1.22, soberano 0.6/1.30. A
        campanha usa `AI_ANCHORS` (curva própria), então não foi afetada.
      - **Histórico da investigação.** Antes da economia de 500, o reforço com Sov=1000
        quebrava a campanha (8–13 falhas): o lado que DEFENDE (vermelho) entesourava Sov,
        mantinha o exército no teto e vencia por atrito, enquanto o azul sangrava no ataque.
        Neutralizar a dificuldade (ainda 11 falhas) e igualar os níveis (ainda 10 falhas)
        NÃO resolviam — confirmando que o problema era econômico, não de calibração de IA.
      - **Nota de medição:** o harness de espelho `war-sim.test.ts` NÃO modela nível de carta
        nem dificuldade (usa um config próprio) — para medir o teto de verdade, usar o
        caminho de `buildBattleConfig` com `cardLevels`/`aiDifficulty`.
- [x] **Duelo espelhado (carta × carta) — assimetria ERA DO HARNESS, não do motor** (esclarecido
      13/11). A causa de "um lado sempre vence" era o teste: `buildBattleConfig` põe o AZUL
      como o JOGADOR (bônus de economia `economyBonus` 0.072 vs 0.03, comandante e doutrina
      próprios). O harness "espelhado" herdava isso, então o azul lutava com vantagem — não era
      o motor. Com espelho DE VERDADE (mesma economia, comandante e doutrina) e vários seeds,
      o duelo fica ~50/50 (medição: 9 azul / 7 vermelho em 16 partidas, com viradas). O motor
      já alterna a ordem de atualização a cada tick para dividir a iniciativa.
      - **Lição:** ao medir simetria, iguale `economyBonus`, `regen`, `commandMax`, comandante e
        doutrina dos dois lados — senão você mede o balanceamento do jogador, não o do motor.
- [x] **Composição variada com limite por carta** (esclarecido 13/11). O jogo JÁ impede "33 do
      mesmo boneco": o baralho tem 8 espaços e cada carta entra no máximo UMA vez
      (`deck.includes(id)` em CampaignScreen/BattlePrep). Não há regra de cópias duplicadas.
      Com baralho de 8 cartas distintas e ambos os lados cheios (33), os duelos ficam variados
      e simétricos. Medição no harness (`war-sim`, bloco "33×33 VARIADO", limite de 3–5 por
      carta): resultados mistos entre os lados, sem "um sempre vence".
- [x] **1 chanceler por batalha (defender/capturar)** (RESOLVIDO 13/11). Cada batalha tem um
      único chanceler decisivo, e o modo define o objetivo:
      - `defender` — o **nosso** chanceler em campo; perdê-lo é derrota imediata.
      - `capturar` — o chanceler **adversário** em campo; neutralizá-lo é vitória imediata.
      - **Alternância:** `chancellorModeFor(mission)` usa `MissionDef.chancellor` quando a
        missão declara; senão alterna por índice (ímpar = `capturar`).
      - **Posto recuado:** o chanceler nasce **atrás da própria base** (não no front); a IA o
        mantém no posto e só reage a ameaça real (`HERO_THREAT_RADIUS`), em vez de segui-lo.
      - **Motor:** `heroOutOfAction()`/`resolveChancellorOutcome()` decidem a partida pelo modo;
        `heroDied()` encerra na hora; a entrega do carro-prisão também resolve pelo modo.
      - **HUD:** `HeroObjective` e `HeroAlert` mostram **um** chanceler (o do modo), com estado
        e alerta coerentes.
      - **Cenários de refém** (prisão inicial, resgate/extração) continuam existindo no motor,
        mas **nenhuma missão da campanha os usa** hoje; os testes que os cobrem montam o
        `heroSetup` à mão.
- [x] **Movimento das unidades sem contramarcha** (RESOLVIDO 13/11). Duas causas no motor:
      `u.aim` desatualizado na marcha do engenheiro (a separação removia a componente errada
      do empurrão) e o contorno de obstáculo que esquecia o lado escolhido (invertia o desvio
      a cada progresso). Detalhamento na seção 5. Rede de regressão:
      `src/test/movement-regression.test.ts`.

### P1 — narrativa e campanha
- [ ] Revisar os 50 capítulos quanto a ritmo, tamanho de texto e ganchos entre atos.
- [ ] Arte/ilustração de cena para as passagens de narrativa (hoje o texto carrega a cena).
- [ ] Amarrar cada decisão de campanha a um efeito visível na batalha seguinte.

### P2 — multiplayer e banco
- [x] **PvP em tempo real** (núcleo CONSTRUÍDO 13/11, `src/game/pvp/`): lockstep determinístico
      + transporte efêmero (Realtime BROADCAST do Supabase, sem migração) + lobby por código de
      sala + ressincronização por hash/snapshot. Ver a seção 3.4. O modo assíncrono por lobby
      (tabela `pvp_matches`) continua existindo para partidas "por correspondência".
- [x] **UI do PvP online** (CONCLUÍDA 13/11): botão "Sala online · tempo real" no lobby de
      `MultiplayerScreen`, menu criar/entrar, tela de espera e a batalha pela `BattleView`
      compartilhada. O PvP assíncrono local (`game/progress/pvp.ts`) continua disponível.
- [x] **Teste do lobby e da sala** (`src/test/pvp-room.test.ts`, CONCLUÍDO 13/11): pareamento
      (`pairUp`/`roleForMe`/`pairingCode`), barramento em memória e ida-e-volta do código de sala.
- [ ] **Corrigir o seed de novos usuários no Supabase** (feito via Lovable, não à mão): a função
      `handle_new_user` semeia 8 ids, mas **5 não existem** no catálogo (`inf-mecanizada`,
      `bld-leve`, `def-engenharia`, `rec-patrulha`, `sup-fumaca`). Trocar pelo `startingDeck`
      válido do catálogo: `inf-fuzileiros`, `inf-assalto`, `inf-antitanque`, `inf-engenheiro`,
      `art-canhao`, `bld-vbld`, `rec-drone`, `sup-gas`.
- [ ] Expor a chave pública do Supabase (`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`)
      para ligar a sincronização e o Realtime do PvP — sem ela o jogo roda 100% offline.

### P3 — acabamento
- [ ] Acessibilidade (foco, contraste, navegação por teclado) e legendas.
- [ ] Trilha sonora e efeitos (hoje há áudio básico de batalha).
- [ ] Rodapé com o crédito **Variant** (homenagem à FEB), discreto, conforme pedido.

---

## 5. Estado atual verificado (13/11/2026)

### Atualização 24/11/2026 — campo de batalha, personagem e entrada da campanha

- **Arena legível**: preenchimento/traço das regiões reduzidos (0,11/0,07 e 0,45/0,28),
  nomes de território sobre a área de manobra com halo escuro e recorte dentro do campo,
  posto de controle com nome ao lado do marcador e setor repetido só quando não há base
  neutra no mesmo ponto.
- **Obstáculos desenhados** (`ObstacleGlyph`) em vez de círculos chapados: construção com
  telhado/cumeeira, vegetação com copas, elevação e barricada — todos com sombra deslocada;
  o rio mantém margem e água.
- **Unidades com contraste**: `--ally-unit`/`--enemy-unit` clareados (0,60/0,55) sem perder
  o matiz; as manchas de sangue ficaram mais discretas (croma 0,12, alfa 0,5).
- **Preparação e campanha com atmosfera**: `BattlePrep` e a visão geral da campanha usam a
  arte `hero-sovereign.jpg` sob vinheta; a visão geral ganhou o **dossiê da operação**
  (terreno, janela, adversário, doutrina, objetivo, citação e frente de operações por ato)
  e o briefing do baralho ganhou **objetivo**, **composição da força** e o cartão
  "como funciona" na primeira operação.
- **Correção de hidratação** no `AuthGate` (`src/routes/__root.tsx`): o portão decide só
  depois do primeiro efeito, então SSR e cliente concordam antes de usar a sessão local.
- **Entrada sem atrito**: a tela `/entrar` ganhou o botão **"Jogar agora, sem conta"**
  (`startGuestSession` em `src/lib/auth.ts` + `playAsGuest` no `PlayerProfile`); o convidado
  tem progresso local no dispositivo e pode criar conta depois sem perder o que jogou. A tela
  de entrada também recebeu a arte de fundo (`hero-sovereign.jpg` + vinheta + scanlines).
- **Título da aba**: `DocumentTitle` no `__root` segue a rota resolvida — na navegação do
  cliente o título ficava preso na primeira página aberta. Lê o `meta` já resolvido e, quando
  não existe, chama o `head()` da própria rota (mesma fonte do SSR, sem duplicar títulos).
- **Verificação**: `tsc --noEmit` limpo, `eslint` sem erros/avisos nos arquivos tocados,
  suíte **329 passando / 7 pulados** e `npm run build` concluído.


- Suíte de testes: **277 passando / 7 pulados** (`npx vitest run`).
- `tsc --noEmit`: limpo. `eslint`: sem erros (só avisos de dependências de hooks já existentes).
- **Geometria do campo conferida por cálculo** (`cameraFor`/`worldToStage`):
  - **Desktop (diagonal)**: o campo vai de (3%,57%) a (97%,43%) — a faixa azul→vermelha cruza a
    tela na diagonal e ocupa a tela inteira. Base aliada projeta em **26%,68%** e a inimiga em
    **74%,32%** (cantos inferior-esquerdo e superior-direito do losango).
  - **Celular em pé (RETO, esquerda→direita) — CORRIGIDO 13/11**: o campo agora fica **reto e
    horizontal**. Antes o retrato usava giro −68°/inclinação 20° (saía torto, na diagonal) e depois
    −90° com as bases empilhadas (vertical). A versão final é **giro 0 + inclinação 20°**
    (`ROTATE_DEG_PORTRAIT=0`, `TILT_DEG_PORTRAIT=20`). Resultado (palco 390×613): campo de 367×213
    px, base aliada **à esquerda** (52,307) e inimiga **à direita** (338,307), no MESMO nível.
- **Guerra medida** (`war-sim.test.ts`, `SIM=1`): duelos 33×33 por carta, espelhados e misturados.
  Canhão de campanha × canhão de campanha: **vitória azul, 177 s, picos 33/33, base inimiga 34%**.
  No variado (8 cartas, limite por carta) os dois lados enchem os **33** e o resultado alterna.
- **PvP online conferido no navegador** (13/11): o botão abre o menu de sala, "Criar e aguardar"
  gera o código (ex.: `92U3R`) e mostra a tela de espera; sem as chaves do Supabase a conexão
  falha de forma limpa ("Falha na conexão"), como esperado — o restante do jogo segue offline.
  A batalha LOCAL (campanha) foi reaberta após a extração da `BattleView` e continua funcionando.
- **Banco Supabase**: esquema íntegro — 7 tabelas (`profiles`, `nation_state`,
  `campaign_progress`, `inventory`, `decks`, `battle_records`, `pvp_matches`), **RLS em todas**,
  triggers de `updated_at`, e todas as tabelas que o front usa existem no schema. **O seed NÃO
  está atualizado**: conferido em 13/11 contra o catálogo, `handle_new_user` semeia 8 ids e só
  **3 existem** (`inf-fuzileiros`, `art-morteiro`, `def-aa`); faltam `inf-mecanizada`, `bld-leve`,
  `def-engenharia`, `rec-patrulha`, `sup-fumaca`. O baralho inicial correto é o `startingDeck` do
  catálogo: `inf-fuzileiros`, `inf-assalto`, `inf-antitanque`, `inf-engenheiro`, `art-canhao`,
  `bld-vbld`, `rec-drone`, `sup-gas` (esse sim 100% válido). Correção vai pela Lovable (não à mão).
- **Banco de cartas (catálogo) conferido** (13/11): **28 cartas** em `allCards` (18 militares sem
  herói + 10 de apoio), **sem ids duplicados**, com `cardById` resolvendo todas as 8 do
  `startingDeck`. `CARD_MAX_LEVEL`=50, `unitsPerDeploy` 1→2 no nível máximo.
- **Bateria de guerra completa** (`war-sim.test.ts`, `SIM=1`, relatório em
  `.agent_tmp/war-report.txt`), com **ambos os lados cheios em 33/33**:
  - **Canhão de campanha × canhão de campanha** (o duelo pedido): vitória azul, 177 s, picos
    **33/33**, base inimiga em 34%, territórios 10–3.
  - **Cada carta contra ela mesma** (14 cartas militares, 33×33): todas enchem **33/33**; a
    maioria dá vitória (artilharia/blindado decidem rápido: obus 165 s, tanque 120 s, VBTP 119 s,
    lançador 94 s; reconhecimento de combate 56 s), com derrotas pontuais por assimetria do mapa
    (antitanque, sniper, AA) — o motor alterna a iniciativa a cada tick.
  - **Misturado** (composições variadas, 33×33): `blindado vs blindado` 32/24 picos, `fogo vs
    fogo` empata no atrito, `blindado vs infantaria` 105 s — resultados alternam entre os lados,
    sem "um sempre vence".
  - **IA usa o teto de 33**: em todas as medições `picoAz`/`picoVm` chegam a **33/33** (o
    `reinforceTuning` com paridade enche o exército). A IA concentra fogo (lança em ondas, não
    espalha) e mantém a economia (Sov finito, 500).
- **Movimento das unidades — CORRIGIDO** (13/11): o usuário relatou "rodear sem rumo". A
  medição por traço de posição (passo REAL, 0,1 s) apontou **~497 reversões de sentido** numa
  missão-tipo, **401 delas dos ENGENHEIROS** (tortuosidade 1,92: percorriam ~2× o necessário).
  Rastreando um engenheiro quadro a quadro, duas causas reais foram encontradas e corrigidas no
  motor (`engine.ts`):
  1. **`u.aim` desatualizado na marcha do engenheiro.** As duas chamadas de `moveToward` do
     construtor (ir até a obra, ir até o canteiro) não atualizavam `u.aim`, ao contrário de
     todas as outras. Como a separação usa `u.aim` para **cancelar o empurrão anti-traseira**,
     a unidade recebia o empurrão na componente errada e era arremessada para trás (passos de
     **1–2 unidades/quadro**, contra 0,34 da velocidade própria). Correção: definir `u.aim`
     antes de marchar. **Reduziu as reversões de 497 → 100**.
  2. **Contorno de obstáculo esquecia o lado.** O `stallSign` era apagado a cada progresso, então
     quem arranhava a borda de um obstáculo invertia o sentido do desvio a cada ciclo e ficava
     **oscilando em torno da borda** (ex.: `m-5g`, 485 reversões). Correção: o lado persiste até
     o próximo episódio de travamento (que o troca de propósito). **Reduziu de 100 → ~15**.
  Soma das duas, nas 50 missões (seed 9001): **2979 → 1485 reversões**; o pior caso caiu de
  **659 (m-5g) para 131**. As reversões restantes são ruído de combate distribuído (troca de
  alvo no corpo-a-corpo), não contramarcha. Balanceamento **intacto**: canhão×canhão segue
  177 s, 33/33, base inimiga em 34%; suíte de travamento passa em 5 sementes.
  - **Rede de regressão**: `src/test/movement-regression.test.ts` mede as reversões de
    engenheiro nas 50 missões e falha se voltarem ao patamar antigo (teto 180/missão).
  - Os "congelamentos" curtos de engenheiro em obra são legítimos (`buildTerritoryId` desliga o
    detector de travamento).

---

## 6. Créditos

Desenvolvido por **Variant** — em homenagem à Força Expedicionária Brasileira. A cobra fumou.
