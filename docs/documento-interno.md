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
- **Campo em diagonal**: a mesa de guerra é vista de cima e inclinada — a linha azul→vermelha
  desce na diagonal e o front entra em profundidade. Implementado como **matriz `matrix3d`
  única** aplicada ao próprio `<svg>` (`cameraMatrix3d`), invertida analiticamente para o toque
  (`stageToWorld`). Sem `perspective()`/`rotateX` do CSS (esse caminho era frágil).
- **Tela cheia com HUD sobreposto**: o teatro ocupa a tela inteira; relógio, energia e recursos
  flutuam por cima em painéis translúcidos; o dock traz só as cartas e as ordens.
- **Bases principais nas pontas**: base aliada na ponta **inferior** e inimiga na **superior**
  (em paisagem, à esquerda e à direita), cada uma no seu canto do losango projetado.
- **Motor determinístico** (`src/game/battle/engine.ts`): bases, torres, territórios de Voronoi,
  bases avançadas, armas com projéteis reais, captura, suprimento, heróis, prêmios.
- **Teto de exército = 33 unidades por lado** (`MAX_UNITS_PER_SIDE`), contando só quem está em
  campo (prisioneiros, chanceler e heróis não ocupam vaga).
- **IA tática local** (`src/game/battle/ai.ts`) com personalidades de comandante (Metódico,
  Agressivo, Econômico, Cauteloso, Oportunista) e pesos treináveis.

### 3.3 Cartas, progressão e persistência
- Catálogo de cartas militares e de apoio, doutrinas, comandantes e arenas por terreno.
- Progressão local-first: nível de conta, XP, inventário, baralhos, desbloqueios.
- Sincronização opcional com Supabase (perfil, campanha, inventário, decks, registros de
  batalha e lobbies PvP), sempre **silenciosa** — falha de rede nunca interrompe uma batalha.

---

## 4. O que falta desenvolver (prioridades)

### P0 — fechar o núcleo de batalha
- [ ] **IA atingir o teto de 33 com inteligência**: hoje a IA fica em ~20 de 33 em vários
      confrontos e entesoura Sov. Investigado a fundo (13/11); a causa NÃO é dificuldade nem
      nível de carta, é a ECONOMIA assimétrica entre atacante e defensor.
      - **Medições.** A varredura roda a campanha inteira (50 caps., 5 tentativas cada, ≥1
        vitória) com `cardLevels` e `aiDifficulty` reais de `enemyScalingForChapter`:
        - Baseline (IA original, sem reforço): **0 falhas** — a campanha está calibrada.
        - Com reforço (gastar o Sov excedente): **8–13 falhas**, dependendo do desenho.
        - Neutralizando a dificuldade (interval/command/reserve = 1): **ainda 11 falhas**.
        - Igualando o nível das cartas (vermelho = azul = nível 1): **ainda 10 falhas**.
        - Ou seja: nem dificuldade nem nível explicam o desequilíbrio.
      - **Causa raiz.** O lado que DEFENDE (vermelho) entesoura Sov, mantém o exército no
        teto (33) e vence por atrito. O lado que ATACA (azul) gasta Sov cruzando o fogo das
        torres/base e sangra até ~20 unidades. O reforço premia quem entesoura — por isso
        empurra o vermelho para 33 e quebra os caps. de atrito (18–20, 25–32, 41–48).
        O gargalo do azul é a MORTALIDADE no ataque, não a falta de Sov (o azul costuma
        terminar com Sov sobrando). Medir "uso do teto" sem essa assimetria engana.
      - **Próximo passo (balanceamento, não bug de IA).** Antes de ligar reforço: (a) dar
        sustentação ao atacante (renda extra por território conquistado, ou menor atrito na
        aproximação) OU (b) tornar o Sov regenerativo e reduzir a mortalidade; e então
        re-medir os 50 caps. Enquanto isso, a IA original fica como está (verde).
      - **Nota de medição:** o harness de espelho `war-sim.test.ts` NÃO modela nível de carta
        nem dificuldade (usa um config próprio) — por isso o espelho parece simétrico (~20/20)
        enquanto a campanha real diverge. Para medir o teto de verdade, usar o caminho de
        `buildBattleConfig` com `cardLevels`/`aiDifficulty`.
- [ ] **Duelo espelhado (carta × carta) simétrico**: no espelho exato, o resultado ainda diverge
      (ex.: `bld-tanque` e `bld-vbld` espelhados dão resultados diferentes por lado). Investigar
      a ordem de atualização/implantação para garantir simetria real.
      - Medição (13/11, 8× mesma carta dos dois lados, Sov infinito): a maioria dos espelhos é
        quase simétrica (picos iguais, baixas iguais ±1). As divergências maiores aparecem com
        `def-aa`, `bld-vbld` e `rec-drone` (picos 22/22, 20/19 e 16/21). Com economia REAL a
        assimetria cresce (ex.: `bld-vbld` pico 16/23, `bld-tanque` 19/20) — o lado que captura
        território primeiro regenera Sov e sustenta mais tropas.
- [ ] **Composições misturadas equilibradas**: hoje "fogo vs blindado" vence fácil demais em um
      sentido; falta calibrar custo/alcance/dano para que a pedra-papel-tesoura seja estável.
      - Medição (13/11, Sov infinito): "fogo vs blindado" perde no sentido testado (18/23) e
        "infantaria vs fogo" perde (18/33); "blindado vs infantaria" e "blindado vs blindado"
        vencem com folga (28/22 e 33/22). Falta simetria na matriz de contramedida.

### P1 — narrativa e campanha
- [ ] Revisar os 50 capítulos quanto a ritmo, tamanho de texto e ganchos entre atos.
- [ ] Arte/ilustração de cena para as passagens de narrativa (hoje o texto carrega a cena).
- [ ] Amarrar cada decisão de campanha a um efeito visível na batalha seguinte.

### P2 — multiplayer e banco
- [ ] PvP **em tempo real** (hoje é assíncrono por lobby). Exige servidor de salas — fora do
      escopo do front-end atual; planejar como fase futura.
- [ ] **Corrigir o seed de novos usuários no Supabase** (feito via Lovable, não à mão): a função
      `handle_new_user` semeia 5 ids de carta que **não existem** no catálogo. Os ids corretos do
      baralho inicial são: `inf-fuzileiros`, `inf-assalto`, `inf-antitanque`, `inf-engenheiro`,
      `art-canhao`, `bld-vbld`, `rec-drone`, `sup-gas`.
- [ ] Expor a chave pública do Supabase (`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`)
      para ligar a sincronização — sem ela o jogo roda 100% offline.

### P3 — acabamento
- [ ] Acessibilidade (foco, contraste, navegação por teclado) e legendas.
- [ ] Trilha sonora e efeitos (hoje há áudio básico de batalha).
- [ ] Rodapé com o crédito **Variant** (homenagem à FEB), discreto, conforme pedido.

---

## 5. Estado atual verificado (13/11/2026)

- Suíte de testes: **255 passando / 4 pulados** (`npx vitest run`).
- `tsc --noEmit`: limpo.
- Batalha em tela cheia e campo em diagonal verificados no navegador.
- Banco Supabase: esquema íntegro (7 tabelas, RLS em todas); **1 bug de seed** descrito no P2.

---

## 6. Créditos

Desenvolvido por **Variant** — em homenagem à Força Expedicionária Brasileira. A cobra fumou.
