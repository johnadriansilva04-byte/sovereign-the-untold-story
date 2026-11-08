# Batalha tática — desenho de jogo

Documento de design da camada de batalha do SOVEREIGN. A batalha não é um minigame
desconectado: o que o país constrói, pesquisa e negocia na camada geopolítica define o que
o jogador consegue levar para o teatro — e o resultado volta para o mapa.

Implementação atual: `src/game/battle/` (motor + catálogo + IA + ponte geopolítica) e
`src/components/battle/` (interface). A partida roda inteira no front-end, com adversário
controlado localmente e dados simulados.

---

## 0. Motor implementado — bases, territórios, armas reais

O motor é um sistema fechado e determinístico (`src/game/battle/engine.ts`). Tudo o que
aparece na tela é simulado: nenhum botão decorativo, nenhum disparo só visual.

- **Bases principais fixas** (`base-principal`): uma por lado, nas pontas opostas do campo.
  Destruir a base principal adversária é vitória imediata. A base também dispara sozinha
  contra unidades no seu alcance.
- **Torres defensivas automáticas** (`torre`): duas por lado, simétricas, entre a base e o
  centro. Atacam automaticamente qualquer unidade inimiga dentro do alcance.
- **Territórios de expansão** (`territory`): círculos brancos luminosos no chão. São
  conquistados por presença de unidades (a presença inimiga disputa e interrompe a captura).
  Cada território pertence a um único lado.
- **Bases avançadas** (`base-avancada`): um engenheiro militar posicionado sobre um território
  conquistado inicia a obra; a construção é progressiva (barra + animação) e pode ser atacada e
  destruída em obra. Ao concluir, a base vira nova posição defensiva e **amplia a área de
  posicionamento** do lado — novas tropas podem nascer ali.
- **Sistema universal de armas**: cada unidade tem uma arma com tipo, cadência, dano, alcance,
  velocidade de projétil, dispersão e efeitos. Fuzis usam traçante instantâneo; canhões, obuses,
  mísseis e lançadores múltiplos geram **projéteis reais** com trajetória (arco quando balístico),
  perseguição (quando guiado), colisão com o mundo, explosão e dano em área.
- **Destruição progressiva**: estruturas e unidades têm vida própria, barra visível e estados de
  dano (fumaça/fogo conforme a vida cai). O dano é calculado pelo motor.

Regra estratégica central: uma base avançada protege o caminho. Para chegar à base principal, o
adversário precisa enfrentar e destruir as bases avançadas que estiverem na frente.

---

## 1. Como funciona uma partida

Arena vista de cima, dois exércitos em lados opostos, uma região de combate entre eles com
estradas, pontes, construções, vegetação, elevações e pontos estratégicos. Cada jogador tem um
baralho de cartas de composição militar.

Durante a batalha:

1. O jogador escolhe uma unidade na mão.
2. Seleciona a carta (ou arrasta).
3. Posiciona a unidade na área permitida.
4. A unidade entra em campo.
5. Ela age conforme sua função e suas ordens.
6. A Energia continua regenerando.
7. O jogador decide quando atacar, defender, reforçar ou mudar de estratégia.

O adversário faz o mesmo. Cada unidade tem comportamento próprio: um tanque não age como
infantaria; uma artilharia não avança como um blindado; reconhecimento não é tropa de assalto.

## 2. O baralho militar

Seis categorias de cartas:

| Categoria      | Exemplos                                  | Função                              |
| -------------- | ----------------------------------------- | ----------------------------------- |
| Infantaria     | Fuzileiros, assalto, antitanque           | Capturar, combater e deter veículos |
| Blindados      | Veículo blindado (VBTP), carro de combate | Romper defesas e avançar            |
| Artilharia     | Canhão de campanha, obus 155 mm, mísseis  | Apoio de fogo à distância           |
| Defesa         | Antiaérea, fortificações                  | Proteger posições e unidades        |
| Reconhecimento | Drones de reconhecimento e de combate     | Revelar e atacar do ar              |
| Apoio          | Engenheiros militares, posto de socorro   | Construir, reparar e sustentar      |

Cada unidade tem **modelo próprio** (`UnitModel`) — silhueta, proporção e arma distintas. O
jogador identifica à distância: soldado de fuzil, soldado de assalto, soldado antitanque,
engenheiro, canhão, artilharia pesada, lançador múltiplo, carro de combate, veículo blindado,
lançador de mísseis, drone de reconhecimento e drone de combate.

Cartas especiais de apoio: ataque aéreo, fumaça, reforços, reparação de veículos, barricada,
interferência eletrônica, evacuação aeromédica e reconhecimento avançado.

Cartas não nascem todas disponíveis: são desbloqueadas conforme o país desenvolve indústria,
logística e tecnologia na campanha.

Baralho de **8 cartas**: **4 na mão** e **4 na fila de reposição**. Ao usar uma carta, a próxima
da fila entra na mão. O jogador precisa pensar não só no que joga agora, mas no que estará
disponível nas próximas jogadas.

## 3. O recurso: Energia

O Sovereign é a moeda da economia mundial; misturá-la à velocidade das decisões táticas
confundiria economia macroeconômica com comando de campo. Por isso a batalha tem um recurso
próprio: a **Energia**, com regeneração contínua.

| Unidade                  | Custo |
| ------------------------ | ----- |
| Fuzileiros               | 3     |
| Infantaria de assalto    | 4     |
| Infantaria antitanque    | 4     |
| Engenheiros militares    | 3     |
| Canhão de campanha       | 4     |
| Artilharia pesada 155 mm | 6     |
| Lançador de mísseis      | 5     |
| Lançador múltiplo (LMF)  | 7     |
| Veículo blindado         | 4     |
| Carro de combate         | 6     |
| Drone de reconhecimento  | 2     |
| Drone de combate         | 4     |
| Defesa antiaérea         | 4     |

O desempenho econômico do país influencia os parâmetros iniciais (reserva máxima, taxa de
regeneração, bônus de custo), mas não permite comprar vitória: os limites são apertados e o
adversário joga com as mesmas regras.

Decisões que o recurso força: gastar pouco para manter pressão constante; economizar para uma
unidade pesada; investir em defesa enquanto o adversário gasta; esperar o erro para contra-atacar.

## 4. O campo de batalha

A arena tem **três setores** (norte, central, sul) com **pontos de controle**, estruturas
estratégicas, rotas de deslocamento, obstáculos e terreno. O jogador envia tropas por caminhos
diferentes, mas não controla cada soldado: as unidades têm comportamento automatizado e recebem
ordens gerais.

Ordens gerais disponíveis: avançar, defender, manter posição, recuar e priorizar objetivo.

### Como vencer

Quatro possibilidades de vitória:

- **Destruição da base principal**: derrubar a base principal adversária vence imediatamente.
  As torres e as bases avançadas protegem o caminho — é preciso rompê-las antes.
- **Superioridade territorial**: controlar a maioria dos pontos estratégicos.
- **Superioridade militar**: eliminar ou neutralizar a capacidade de combate adversária.
- **Objetivo operacional**: cumprir uma missão específica (proteger uma instalação, impedir
  uma travessia, sobreviver sob pressão).

Duração de 4 a 6 minutos, com **fase final de pressão** em que a Energia regenera
mais rápido — a virada dramática, sem copiar o "elixir dobrado".

## 5. A arena conversa com o mapa geopolítico

A batalha não acontece numa arena genérica. O terreno muda rotas, obstáculos e o que funciona:

| Terreno                | Característica                                           |
| ---------------------- | -------------------------------------------------------- |
| Amazônia / floresta    | Vegetação, mobilidade limitada e reconhecimento decisivo |
| Deserto / campo aberto | Longas distâncias, exposição e logística                 |
| Área urbana            | Construções, ruas, posições defensivas e obstáculos      |
| Montanha               | Passagens, elevações e rotas restritas                   |
| Travessia de rio       | Pontes como gargalos e pontos de controle                |
| Região fortificada     | Defesas preparadas e avanço custoso                      |

Consequência de design: o jogador escolhe o baralho considerando onde vai lutar. Um baralho
urbano pode não servir para floresta.

## 6. A preparação para a batalha

Antes de começar, cada jogador escolhe: baralho de 8 cartas, composição de forças, doutrina
militar, comandante, bônus tecnológicos desbloqueados e estratégia inicial.

Regra essencial: **não se leva qualquer exército para qualquer batalha**. A disponibilidade de
unidades depende da situação do país. Sem indústria, não há veículo avançado em quantidade. Sem
logística, unidades pesadas ficam difíceis de sustentar. Sem tecnologia, equipamentos avançados
não aparecem no baralho.

### Doutrinas militares

| Doutrina             | Característica                               |
| -------------------- | -------------------------------------------- |
| Mobilidade           | Maior flexibilidade de deslocamento          |
| Defesa territorial   | Melhor aproveitamento de posições defensivas |
| Poder de fogo        | Ênfase em unidades de apoio                  |
| Infantaria           | Maior eficiência em operações de captura     |
| Mecanizada           | Ênfase em mobilidade e veículos              |
| Operações combinadas | Bônus por combinar categorias diferentes     |

A doutrina é escolha estratégica anterior à partida, não um botão que resolve tudo.

## 7. O que acontece dentro da partida

O jogador vê o campo e a mão de cartas. Seleciona infantaria, posiciona na zona de
desdobramento, a tropa entra, identifica o objetivo mais próximo e age. O adversário envia um
blindado; o jogador percebe a desvantagem e responde reforçando, usando unidade especializada,
recuando, contornando ou disputando outro objetivo — enquanto o comando regenera. Tudo rápido:
nada de abrir vinte janelas para dar uma ordem.

### Inteligência das unidades — três níveis

- **Nível 1 — Comportamento automático**: move-se, identifica ameaças e cumpre a função.
- **Nível 2 — Ordens gerais**: avançar, defender, recuar, manter posição, priorizar objetivo.
- **Nível 3 — Habilidades especiais**: algumas unidades têm habilidade própria, com recarga ou
  custo de comando.

## 8. Os países controlados por LLM jogam assim

O agente de IA não recebe uma descrição e devolve texto: ele **joga**. Recebe o estado da
partida (unidades disponíveis, comando, posições conhecidas, objetivos, terreno, unidades
identificadas do inimigo, histórico recente) e decide qual unidade usar, onde posicionar, qual
objetivo priorizar, quando reforçar, recuar, economizar e contra-atacar. O motor executa.

Comandantes têm personalidades diferentes: cauteloso, agressivo, oportunista, metódico,
econômico. Mas a IA respeita as mesmas regras dos humanos — sem recursos infinitos, sem visão de
mapa indevida, sem unidades não desbloqueadas. Isso mantém a disputa justa.

Implementação atual: a IA local (`src/game/battle/ai.ts`) usa as mesmas funções do motor e só
enxerga o que o seu reconhecimento alcança. A camada de LLM substituirá a decisão mantendo a
mesma interface de ações.

## 9. A batalha gera consequências na guerra

Ao terminar, o resultado volta para o mapa: controle territorial, baixas militares, equipamentos
perdidos, recursos consumidos, moral das tropas, influência diplomática e situação logística. Uma
vitória abre caminho para novas operações; uma derrota obriga a reorganizar as forças. Algumas
batalhas podem ser decididas por eventos estratégicos, negociações ou condições de rendição, sem
obrigar todo conflito a terminar na destruição de um exército.

## 10. Interface durante a partida

| Região da tela    | Função                                   |
| ----------------- | ---------------------------------------- |
| Superior esquerda | Nome dos países e bandeiras              |
| Superior central  | Cronômetro e objetivo da batalha         |
| Superior direita  | Pontuação e situação dos objetivos       |
| Centro            | Campo de batalha                         |
| Inferior esquerda | Energia                                  |
| Inferior central  | Quatro cartas disponíveis                |
| Inferior direita  | Próximas cartas e informações da unidade |
| Laterais          | Comandos contextuais e minimapa          |

Ao selecionar uma unidade aparecem só as informações necessárias: vida, tipo, custo, alcance,
velocidade, função e habilidade especial. O design prioriza leitura rápida.

## 11. Exemplo de partida completa

Brasil x Forças Irregulares — 5 minutos.

- **00:00 — Mobilização**: os dois lados começam com comando e posicionam as primeiras unidades.
- **00:45 — Primeiro contato**: reconhecimento identifica movimentações no setor central.
- **01:30 — Disputa territorial**: os dois lados tentam controlar os objetivos; um economiza
  recursos e prepara reforços.
- **02:30 — Contra-ataque**: uma composição rompe a defesa adversária; o outro decide entre
  reforçar a posição ou defender o segundo objetivo.
- **03:30 — Pressão final**: a regeneração aumenta e as implantações ficam mais frequentes.
- **04:30 — Resultado**: o sistema verifica objetivos, controle territorial e condições de vitória.

## 12. Progressão: o jogador constrói o próprio exército

Árvore tecnológica militar ligada à administração nacional:

- **Tecnologia terrestre**: infantaria avançada, blindagem, veículos mecanizados, artilharia,
  logística militar.
- **Tecnologia aérea**: reconhecimento aéreo, defesa antiaérea, aviação de apoio, comunicações.
- **Tecnologia de suporte**: engenharia, comunicações, medicina militar, manutenção.

A pesquisa não aumenta só dano e vida: ela desbloqueia possibilidades. Reconhecimento revela mais
informação da arena; engenharia permite construir estruturas defensivas; logística amplia a
capacidade de sustentar operações.

## 13. Modos de batalha

- **Campanha histórica**: batalhas ligadas à narrativa, com objetivos e limitações próprias.
- **Confronto competitivo**: partidas rápidas 1x1 equilibradas.
- **Guerra entre países**: batalhas dentro das salas geopolíticas, em que o resultado afeta a
  guerra.
- **Treinamento e simulação**: enfrentar comandantes de IA e experimentar composições.

## 14. O que manter do Clash Royale e o que mudar

| Elemento    | Clash Royale      | SOVEREIGN                          |
| ----------- | ----------------- | ---------------------------------- |
| Partidas    | Curtas            | Curtas, 4–6 minutos                |
| Cartas      | Tropas e feitiços | Unidades e apoio militar           |
| Recurso     | Elixir            | Energia                            |
| Arena       | Pistas e torres   | Terreno e objetivos militares      |
| Progressão  | Cartas e níveis   | Pesquisa, doutrina e indústria     |
| Estratégia  | Ataque e defesa   | Território, composição e operações |
| Adversários | Jogadores e bots  | Jogadores e agentes LLM            |
| Resultado   | Vitória na arena  | Consequência na guerra             |

Não se copia arena, cartas, personagens ou identidade visual: aproveita-se a estrutura de
decisões rápidas e cria-se identidade militar própria.

## 15. Parâmetros iniciais (protótipo)

Configuração adotada no protótipo: **visão superior 2D**, **três setores**, **partidas de 5
minutos**, vitória por **objetivos territoriais combinada com superioridade militar**, 1x1 com
adversário local. O desenvolvimento começa pelo protótipo jogável da arena — cartas, mão, barra
de comando, posicionamento, movimentação, objetivos e resultado — e depois conecta IA de LLM,
multiplayer e economia real.

---

## Status da implementação

Feito:

- Motor determinístico com comando, cartas, captura, visão, terreno e vitória.
- **Bases principais + torres defensivas automáticas** por lado; destruir a base principal é
  vitória imediata.
- **Territórios de expansão** conquistados por presença e **bases avançadas** construídas por
  engenheiros, que ampliam a zona de posicionamento e protegem o caminho até a base.
- **Armas reais**: fuzis com traçante, canhões/obuses com projétil em arco, mísseis guiados e
  lançador múltiplo em salva — todos com colisão, explosão e dano calculado pelo motor.
- Catálogo de cartas, doutrinas, comandantes e arenas por terreno.
- Comandante de IA local com personalidades, jogando sob as mesmas regras.
- Dificuldade em cinco níveis (Recruta → Comandante IA/LLM) que altera o ritmo de decisão,
  a economia e a reserva da IA.
- Comandante LLM opcional: `src/game/battle/commanderFn.ts` (server function) consulta um
  modelo compatível com OpenAI via variáveis de ambiente e, sem configuração ou em falha,
  cai automaticamente para a IA tática local — a batalha nunca trava por causa de rede.
- Ponte geopolítica: estado da nação, missões da campanha e consequências da batalha.
- Acessórios equipados que aplicam modificadores reais (comando, dano, vida, velocidade, visão).
- Interface: preparação, arena ao vivo, HUD, mão de cartas, painéis e tela de resultado.
- Testes do motor, da interface, da progressão e do PvP.

Ver também: `docs/progressao-e-multiplayer.md` (campanha, inventário, PvP e persistência) e
`docs/cartas-e-arquitetura.md` (**lista completa de todas as cartas, unidades, arenas e da
arquitetura do motor**).

Próximo:

- Ligar a batalha ao mapa geopolítico (aplicar consequências de volta ao mapa interativo).
- Multiplayer em rede (o PvP atual é contra adversários locais / por aposta offline).
