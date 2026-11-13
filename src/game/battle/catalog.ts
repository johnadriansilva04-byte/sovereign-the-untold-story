// Catálogo de cartas, doutrinas, comandantes e arenas.
// A batalha é "data-driven": o motor lê estas tabelas, não regras espalhadas pelo código.
//
// Cada unidade militar tem um MODELO visual próprio (UnitModel) e uma ARMA própria
// (WeaponSpec). O motor usa a arma para gerar projéteis reais com trajetória, colisão
// e explosão — nada aqui é apenas decorativo.

import type {
  Arena,
  Card,
  Commander,
  Doctrine,
  DoctrineModifier,
  MilitaryCard,
  StructureSpec,
  SupportCard,
  Territory,
  UnitCategory,
} from "./types";
import { deepenY, spreadX } from "./world";

// ---------------------------------------------------------------------------
// Cartas militares — cada categoria tem identidade visual e balística própria
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GUIA DAS CARTAS — função e conduta de cada uma
// ---------------------------------------------------------------------------
//
// Este bloco é a referência de projeto: o que cada carta FAZ no motor (não só o que
// parece fazer na tela) e COMO a unidade se comporta em campo. A conduta é executada
// pelo motor (engine.ts: updateUnit/objectiveFor/selectTarget) e pela IA (ai.ts), e é
// verificada por teste (src/test/cards-audit.test.ts prova que toda carta causa efeito
// real; src/test/stall-regression.test.ts prova que nenhuma unidade empaca).
//
// COMO LER UMA CARTA NO MOTOR
// - Arma (`weapon`): define a balística. `tracer: true` = raio instantâneo com traçante
//   visual e dano no mesmo quadro (fuzil/automática). Sem tracer, o disparo gera um
//   PROJÉTIL real (kind em types.ts) com trajetória, colisão e explosão no impacto.
// - `projectileSpeed`: velocidade do projétil (0 = arma sem projétil, ex.: posto).
// - `splash`: raio de dano em área no impacto (0 = alvo único).
// - `arc`: trajetória balística (morteiro/obus) — o projétil sobe e cai por cima de
//   obstáculos; `homing`: persegue o alvo em movimento (ATGM, mísseis).
// - `priority` (na carta): categorias que a unidade escolhe primeiro (bônus no alvo).
// - `builder`: unidade de engenharia. Não atira em unidade, não conta como tropa de
//   combate e é quem captura território e constrói base avançada.
// - `squad`: quantas unidades a carta lança (cresce com o nível, com teto rígido).
//
// CONDUTA PADRÃO (vale para toda unidade de combate): marcha pelo objetivo; ao ter
// inimigo DENTRO DO ALCANCE, para, mira e dispara até ele morrer ou sair de alcance;
// depois RETOMA a marcha. Nunca fica parada sem motivo, nunca atira fora de alcance e
// nunca atravessa obstáculo bloqueante (contorna).
//
// --- 5.1/5.2/5.3 INFANTARIA ---
// FUZ   Fuzileiros ................. Pelotão barato de linha de frente. Arma `fuzil`
//       com traçante: dano rápido de alvo único, alcance curto (6). Conduta: avança,
//       captura e SEGURA posição (peso 1,2 na captura). É a tropa de ocupação — não a
//       de assalto. Fraco contra blindado, ótimo para saturar e tomar marcadores.
// ASSALTO Infantaria de Assalto ..... Infantaria pesada com arma `automatica`: cadência
//       altíssima (0,32 s), alcance curto (5,5), mais vida e mais lenta. Conduta: fecha
//       distância e domina o combate PRÓXIMO; derrete infantaria e estruturas leves.
// AT    Infantaria Antitanque ....... Equipe com ATGM `atgm`: foguete GUADO (homing),
//       lento, com explosão em área (splash 3) e dano altíssimo (95) — prioriza
//       BLINDADO. Conduta: fica atrás, dispara no veículo/estrutura e recarrega (2,6 s);
//       inútil contra infantaria dispersa. O foguete é projétil real, não animação.
// SNIP  Atiradores de Precisão ...... Tiro único de altíssimo dano (62) e alcance longo
//       (16) com traçante. Conduta: elimina infantaria e artilharia À DISTÂNCIA; frágil
//       e indefeso no corpo a corpo. Prioriza infantaria e artilharia.
// ENG   Engenheiros Militares ....... BUILDER. Não atira em unidade. Conduta: vai ao
//       marcador NEUTRO/inimigo, captura (peso 1,4, o maior) e ergue BASE AVANÇADA ali;
//       depois segue para reparar estrutura aliada danificada dentro do alcance. É a
//       carta que cria novas linhas de lançamento de tropas.
//
// --- 6 ARTILHARIA (peças, não soldados) ---
// MORT  Morteiro de Apoio .......... Arma `obus` com `arc`: bomba em PARÁBOLA por cima
//       de obstáculos, alcance médio (18), área (splash). Conduta: fica atrás da linha e
//       bombardeia alvos agrupados; lento para reposicionar.
// CANHÃO Canhão de Campanha ....... Peça de fogo DIRETO: projétil `shell` reto, alcance
//       24 (maior que infantaria), cadência menor (2,4 s). Conduta: gira, eleva, dispara
//       e SOFRE RECUO visual; dano alto em alvo único/área pequena.
// OBUS  Artilharia Pesada 155 mm ... Fogo indireto de LONGO alcance (38) com grande
//       explosão em área. Conduta: atira de trás do mapa sobre posições fixas; é a
//       resposta a bases avançadas e agrupamentos. Lenta e cara.
// LM    Lançador de Mísseis ........ Caminhão lançador: `missil` com homing, alcance 34,
//       explosão grande. Conduta: para, eleva o lançador, dispara o míssil (que voa de
//       verdade e explode no impacto) e recarrega. Atinge alvo atrás de obstáculo.
// LMF   Lançador Múltiplo de Foguetes SALVA de 5 foguetes (`lmf`): o dano TOTAL é
//       dividido entre eles e espalhado em leque. Conduta: saturação de ÁREA — cobre um
//       setor, não um ponto. Ótimo contra agrupamento; fraco contra alvo único.
//
// --- 8 BLINDADOS ---
// CT    Caça-Tanques ............... Blindado com canhão de alta penetração (110),
//       prioriza BLINDADO. Conduta: caça tanques e fortificações; sobrevive a tiro leve.
// CC    Carro de Combate .......... Torre giratória e canhão principal. Conduta: avança,
//       gira a torre para o alvo, dispara com recuo e explosão; prioriza alvos
//       estratégicos (estruturas/veículos). Vida alta, resiste a arma leve, mais lento
//       que a infantaria.
// VBTP  Veículo Blindado ......... Blindado leve e RÁPIDO com `automatica`. Conduta:
//       metralha infantaria e reconhecimento, escolta e ocupa terreno depressa.
//
// --- 9 AÉREAS (domínio "aereo": sobrevoam terreno e só são atingidas por AA) ---
// DRN-R Drone de Reconhecimento ... Voa, projeta sombra e enxerga 1,6× mais longe que
//       as tropas de terra (fog of war). Conduta: inteligência — circula, marca inimigos,
//       dano baixo (6), prioriza infantaria e artilharia.
// DRN-C Drone de Combate ......... Voa e ataca ALVOS TERRESTRES com arma própria.
//       Conduta: pairado ofensivo; imune a armas terrestres (só AA o abate).
//
// --- 4/5 DEFESA E APOIO ---
// AA    Defesa Antiaérea ......... Só atira em AÉREO (`targets: aereo`). Conduta: nega o
//       espaço aéreo a drones; NÃO atinge alvo terrestre — não desperdiça tiro em solo.
// FORT  Fortificação de Campanha . Estrutura estática que ancora posição: atira em
//       ambos, alcance curto; serve de âncora defensiva e cobertura aliada.
// SOC   Posto de Socorro ......... Não dispara (dmg 0). Conduta: CURA infantaria aliada
//       num raio por pulso. Alvo prioritário do inimigo, indefeso.
// CHC   Chanceler ................ Herói: anda sob comando direto, atira para se defender
//       e é a peça que decide a guerra — proteja-o e elimine o adversário.
//
// --- CARTAS DE APOIO (efeito instantâneo/zone, aplicadas por applySupport) ---
// AEREO  Ataque Aéreo ........... bombardeio em área, dano alto e imediato.
// GÁS    Bomba Lacrimogêneo ..... nuvem que DRENA a vida de toda unidade TERRESTRE na
//        área até a morte (não distingue aliado de inimigo).
// REFORÇO Reforços .............. desembarca na hora dois pelotões de fuzileiros.
// REPARO Reparação de Veículos .. restaura blindados/veículos num raio.
// BARR   Barricada .............. ergue obstáculo que BLOQUEIA o avanço (o motor o
//        respeita no caminho — a unidade contorna).
// EW     Interferência Eletrônica silencia drones (jammed: não atacam por um tempo).
// EVAC   Evacuação Aeromédica ... retira e cura uma unidade própria em risco.
// REC+   Reconhecimento Avançado  revela uma área inteira por tempo limitado.
// PQD    Paraquedistas .......... infiltração: lança pelotões ATRÁS das linhas inimigas.
// BOMB   Bombardeiro Tático ..... passagem longa com sequência de impactos (o mais caro).

const INF = "infantaria";
const BLD = "blindado";
const ART = "artilharia";
const DEF = "defesa";
const REC = "reconhecimento";

export const militaryCards: MilitaryCard[] = [
  // --- 5.1 Soldados de fuzil ---
  {
    id: "inf-fuzileiros",
    kind: "militar",
    name: "Fuzileiros",
    short: "FUZ",
    category: INF,
    cost: 20,
    hp: 190,
    dmg: 16,
    speed: 4.4,
    range: 6,
    cooldown: 0.9,
    targets: "ambos",
    domain: "terra",
    radius: 2.2,
    model: "soldado-fuzil",
    weapon: {
      kind: "fuzil",
      projectileSpeed: 120,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 1.6,
      tracer: true,
    },
    // A carta representa um PELOTÃO: ~9 soldados no nível 1, teto de 16.
    squad: { base: 9, perLevel: 0.5, max: 16, spacing: 2.6 },
    role: "Linha de frente barata. Avança, captura e segura posições.",
  },
  {
    id: "inf-assalto",
    kind: "militar",
    name: "Infantaria de Assalto",
    short: "ASSALTO",
    category: INF,
    cost: 26,
    hp: 320,
    dmg: 14,
    speed: 3.6,
    range: 5.5,
    cooldown: 0.32,
    targets: "ambos",
    domain: "terra",
    radius: 2.4,
    model: "soldado-assalto",
    weapon: {
      kind: "automatica",
      projectileSpeed: 130,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 1.6,
      tracer: true,
    },
    // Grupo de assalto: 5 soldados pesados no nível 1, teto de 10.
    squad: { base: 5, perLevel: 0.34, max: 10, spacing: 3.0 },
    role: "Equipamento pesado e arma automática. Resistente no combate próximo.",
    unlocksTech: ["t3"],
  },
  {
    id: "inf-antitanque",
    kind: "militar",
    name: "Infantaria Antitanque",
    short: "AT",
    category: INF,
    cost: 26,
    hp: 200,
    dmg: 95,
    speed: 3.8,
    range: 15,
    cooldown: 2.6,
    targets: "ambos",
    domain: "terra",
    radius: 2.2,
    model: "soldado-antitanque",
    weapon: {
      kind: "atgm",
      projectileSpeed: 34,
      splash: 3,
      arc: false,
      homing: true,
      muzzle: 1.8,
    },
    priority: [BLD],
    // Equipe antitanque: 3 operadores no nível 1, teto de 6.
    squad: { base: 3, perLevel: 0.22, max: 6, spacing: 3.4 },
    role: "Foguete portátil guiado. Devastador contra blindados e estruturas.",
  },
  {
    id: "inf-engenheiro",
    kind: "militar",
    name: "Engenheiros Militares",
    short: "ENG",
    category: "apoio",
    cost: 20,
    hp: 200,
    dmg: 10,
    speed: 3.4,
    range: 4.5,
    cooldown: 1.2,
    targets: "terra",
    domain: "terra",
    radius: 2.2,
    model: "engenheiro",
    weapon: {
      kind: "fuzil",
      projectileSpeed: 100,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 1.4,
      tracer: true,
    },
    builder: true,
    // Equipe de engenharia: 3 no nível 1, teto de 6 (trabalham juntos na mesma obra).
    squad: { base: 3, perLevel: 0.2, max: 6, spacing: 2.8 },
    role: "Captura territórios e constrói bases avançadas. Repara estruturas aliadas.",
  },

  // --- 5.5 Sniper: infantaria de precisão, alcance longo, tiro lento e forte ---
  {
    id: "inf-sniper",
    kind: "militar",
    name: "Atiradores de Precisão",
    short: "SNIP",
    category: INF,
    cost: 26,
    hp: 150,
    dmg: 62,
    speed: 3.6,
    range: 16,
    cooldown: 2.4,
    targets: "ambos",
    domain: "terra",
    radius: 2.1,
    model: "sniper",
    weapon: {
      kind: "fuzil",
      projectileSpeed: 200,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 2,
      tracer: true,
    },
    priority: [INF, ART],
    // Dupla de atiradores: 2 no nível 1, até 4.
    squad: { base: 2, perLevel: 0.16, max: 4, spacing: 3.2 },
    role: "Elimina infantaria e artilharia de longe. Frágil no corpo a corpo.",
  },

  // --- 5.6 Morteiro: infantaria de apoio com tiro em arco e área ---
  {
    id: "art-morteiro",
    kind: "militar",
    name: "Morteiro de Apoio",
    short: "MORT",
    category: ART,
    cost: 20,
    hp: 220,
    dmg: 70,
    speed: 2.4,
    range: 18,
    cooldown: 3.2,
    targets: "ambos",
    domain: "terra",
    radius: 2.3,
    model: "morteiro",
    weapon: {
      kind: "obus",
      projectileSpeed: 32,
      splash: 5,
      arc: true,
      homing: false,
      muzzle: 1.6,
    },
    // Seção de morteiro: 2 no nível 1, até 3.
    squad: { base: 2, perLevel: 0.1, max: 3, spacing: 3 },
    role: "Bombardeia em arco, por cima de obstáculos. Dano de área em alvos agrupados.",
    unlocksTech: ["t2"],
  },

  // --- 8.2 Caça-tanques: veículo blindado especializado ---
  {
    id: "bld-caca-tanques",
    kind: "militar",
    name: "Caça-Tanques",
    short: "CT",
    category: BLD,
    cost: 34,
    hp: 820,
    dmg: 110,
    speed: 2.9,
    range: 13,
    cooldown: 1.8,
    targets: "ambos",
    domain: "terra",
    radius: 3.2,
    model: "caca-tanques",
    weapon: {
      kind: "canhao",
      projectileSpeed: 55,
      splash: 1.4,
      arc: false,
      homing: false,
      muzzle: 2.6,
    },
    priority: [BLD, DEF],
    role: "Blindado com canhão de alta penetração. Prioriza tanques e fortificações.",
    unlocksTech: ["t4"],
  },

  // --- 6 Artilharia — canhões como peças independentes ---
  {
    id: "art-canhao",
    kind: "militar",
    name: "Canhão de Campanha",
    short: "CANHÃO",
    category: ART,
    cost: 26,
    hp: 260,
    dmg: 70,
    speed: 1.9,
    range: 24,
    cooldown: 2.4,
    targets: "ambos",
    domain: "terra",
    radius: 2.8,
    model: "canhao",
    weapon: {
      kind: "canhao",
      projectileSpeed: 46,
      splash: 4.5,
      arc: true,
      homing: false,
      muzzle: 2.6,
    },
    // Bateria de campanha: 1 peça no nível 1, até 3 em níveis altos.
    squad: { base: 1, perLevel: 0.12, max: 3, spacing: 4.5 },
    role: "Peça de fogo direto. Alcance maior que a infantaria, cadência menor.",
  },
  {
    id: "art-obus",
    kind: "militar",
    name: "Artilharia Pesada 155 mm",
    short: "OBUS",
    category: ART,
    cost: 46,
    hp: 230,
    dmg: 130,
    speed: 1.3,
    range: 38,
    cooldown: 3.6,
    targets: "ambos",
    domain: "terra",
    radius: 3.0,
    model: "artilharia-pesada",
    weapon: {
      kind: "obus",
      projectileSpeed: 34,
      splash: 7,
      arc: true,
      homing: false,
      muzzle: 3.2,
    },
    // Bateria pesada: 1 obus no nível 1, até 3.
    squad: { base: 1, perLevel: 0.12, max: 3, spacing: 5.0 },
    role: "Fogo indireto de longo alcance com grande explosão em área.",
    unlocksTech: ["t4"],
  },

  // --- 7 Lançadores de mísseis ---
  {
    id: "mss-lancador",
    kind: "militar",
    name: "Lançador de Mísseis",
    short: "LM",
    category: ART,
    cost: 34,
    hp: 300,
    dmg: 120,
    speed: 1.8,
    range: 34,
    cooldown: 3.2,
    targets: "ambos",
    domain: "terra",
    radius: 3.0,
    model: "lancador-missil",
    weapon: {
      kind: "missil",
      projectileSpeed: 40,
      splash: 5,
      arc: true,
      homing: true,
      muzzle: 3.0,
    },
    squad: { base: 1, perLevel: 0.1, max: 2, spacing: 5.5 },
    role: "Caminhão lançador. Míssil guiado com trajetória e explosão no impacto.",
    unlocksTech: ["t7"],
  },
  {
    id: "mss-lmf",
    kind: "militar",
    name: "Lançador Múltiplo de Foguetes",
    short: "LMF",
    category: ART,
    cost: 46,
    hp: 260,
    dmg: 60,
    speed: 1.4,
    range: 36,
    cooldown: 3.8,
    targets: "ambos",
    domain: "terra",
    radius: 3.4,
    model: "lmf",
    weapon: {
      kind: "lmf",
      projectileSpeed: 36,
      splash: 4,
      arc: true,
      homing: false,
      muzzle: 3.0,
    },
    squad: { base: 1, perLevel: 0.1, max: 2, spacing: 6.0 },
    role: "Saturação de área: dispara uma salva de foguetes de uma só vez.",
    unlocksTech: ["t7"],
  },

  // --- 8 Tanques e blindados ---
  {
    id: "bld-tanque",
    kind: "militar",
    name: "Carro de Combate",
    short: "CC",
    category: BLD,
    cost: 40,
    hp: 1050,
    dmg: 60,
    speed: 2.6,
    range: 9,
    cooldown: 1.6,
    targets: "ambos",
    domain: "terra",
    radius: 3.4,
    model: "tanque",
    weapon: {
      kind: "canhao",
      projectileSpeed: 50,
      splash: 2.5,
      arc: false,
      homing: false,
      muzzle: 3.4,
    },
    priority: [BLD, ART],
    // Seção blindada: 1 carro no nível 1, até 3 (veículos são muito poderosos).
    squad: { base: 1, perLevel: 0.14, max: 3, spacing: 5.0 },
    role: "Torre giratória e canhão principal. Prioriza alvos estratégicos.",
    unlocksTech: ["t6"],
  },
  {
    id: "bld-vbld",
    kind: "militar",
    name: "Veículo Blindado",
    short: "VBTP",
    category: BLD,
    cost: 26,
    hp: 640,
    dmg: 30,
    speed: 3.4,
    range: 8,
    cooldown: 1.1,
    targets: "ambos",
    domain: "terra",
    radius: 3.0,
    model: "vbld",
    weapon: {
      kind: "automatica",
      projectileSpeed: 90,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 2.4,
      tracer: true,
    },
    priority: [INF],
    // Pelotão mecanizado: 2 VBTP no nível 1, até 4.
    squad: { base: 2, perLevel: 0.16, max: 4, spacing: 4.4 },
    role: "Blindado leve rápido. Metralhadora contra infantaria e reconhecimento.",
    unlocksTech: ["t2"],
  },

  // --- 9 Drones ---
  {
    id: "rec-drone",
    kind: "militar",
    name: "Drone de Reconhecimento",
    short: "DRN-R",
    category: REC,
    cost: 14,
    hp: 90,
    dmg: 6,
    speed: 8.0,
    range: 13,
    cooldown: 1.4,
    targets: "terra",
    domain: "aereo",
    radius: 1.9,
    model: "drone-recon",
    weapon: {
      kind: "drone",
      projectileSpeed: 80,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 1.0,
      tracer: true,
    },
    // Esquadrilha de reconhecimento: 2 drones no nível 1, até 5.
    squad: { base: 2, perLevel: 0.2, max: 5, spacing: 3.6 },
    role: "Voa sobre obstáculos e revela uma área ampla. Inteligência aérea.",
    unlocksTech: ["t8"],
  },
  {
    id: "rec-drone-combate",
    kind: "militar",
    name: "Drone de Combate",
    short: "DRN-C",
    category: REC,
    cost: 26,
    hp: 150,
    dmg: 55,
    speed: 7.0,
    range: 10,
    cooldown: 1.5,
    targets: "terra",
    domain: "aereo",
    radius: 2.0,
    model: "drone-combate",
    weapon: {
      kind: "drone",
      projectileSpeed: 40,
      splash: 2.5,
      arc: false,
      homing: true,
      muzzle: 1.2,
    },
    priority: [INF, ART],
    // Esquadrilha de combate: 2 drones no nível 1, até 4.
    squad: { base: 2, perLevel: 0.16, max: 4, spacing: 3.6 },
    role: "Drone armado. Ataca unidades terrestres e não pode ser tocado por armas de terra.",
    unlocksTech: ["t8"],
  },

  // --- Defesa estática ---
  {
    id: "def-aa",
    kind: "militar",
    name: "Defesa Antiaérea",
    short: "AA",
    category: DEF,
    cost: 26,
    hp: 320,
    dmg: 55,
    speed: 2.0,
    range: 20,
    cooldown: 1.0,
    targets: "aereo",
    domain: "terra",
    radius: 2.8,
    model: "aa",
    weapon: {
      kind: "antiaereo",
      projectileSpeed: 70,
      splash: 0,
      arc: false,
      homing: true,
      muzzle: 1.8,
    },
    role: "Nega apoio aéreo e drones inimigos. Não atinge alvos terrestres.",
  },
  {
    id: "def-fortificacao",
    kind: "militar",
    name: "Fortificação de Campanha",
    short: "FORT",
    category: DEF,
    cost: 34,
    hp: 900,
    dmg: 22,
    speed: 0,
    range: 9,
    cooldown: 1.6,
    targets: "ambos",
    domain: "terra",
    radius: 3.6,
    model: "fortificacao",
    weapon: {
      kind: "canhao",
      projectileSpeed: 40,
      splash: 1.5,
      arc: false,
      homing: false,
      muzzle: 2.2,
    },
    role: "Estrutura estática. Ancora uma posição e concede cobertura aliada.",
  },
  {
    id: "apo-posto",
    kind: "militar",
    name: "Posto de Socorro",
    short: "SOC",
    category: "apoio",
    cost: 26,
    hp: 260,
    dmg: 0,
    speed: 2.6,
    range: 4,
    cooldown: 2.0,
    targets: "terra",
    domain: "terra",
    radius: 2.6,
    model: "posto",
    weapon: {
      kind: "fuzil",
      projectileSpeed: 100,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 1.4,
      tracer: true,
    },
    role: "Cura infantaria aliada num raio. Não dispara.",
  },
  // --- Chanceler (herói) ---
  {
    id: "hero-chanceler",
    kind: "militar",
    name: "Chanceler",
    short: "CHC",
    category: INF,
    cost: 0,
    hp: 1400,
    dmg: 34,
    speed: 5.2,
    range: 7,
    cooldown: 0.7,
    targets: "ambos",
    domain: "terra",
    radius: 2.4,
    model: "chanceler",
    weapon: {
      kind: "fuzil",
      projectileSpeed: 130,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 1.6,
      tracer: true,
    },
    hero: true,
    priority: ["infantaria", "artilharia"],
    role: "Chefe de Estado. Anda pelo mapa sob seu comando, atira para se defender e é a peça que decide a guerra: proteja-o e elimine o chanceler adversário.",
  },
];

// ---------------------------------------------------------------------------
// Cartas de apoio (habilidades)
// ---------------------------------------------------------------------------

export const supportCards: SupportCard[] = [
  {
    id: "sup-aereo",
    kind: "apoio",
    name: "Ataque Aéreo",
    short: "AEREO",
    category: "apoio",
    cost: 46,
    ability: "ataque_aereo",
    magnitude: 160,
    radius: 9,
    role: "Bombardeio em área. Devastador, porém lento de recarregar.",
  },
  {
    id: "sup-gas",
    kind: "apoio",
    name: "Bomba de Gás Lacrimogêneo",
    short: "GÁS",
    category: "apoio",
    cost: 26,
    ability: "gas",
    duration: 10,
    magnitude: 28,
    radius: 8,
    role: "Nuvem tóxica: drena a vida de TODA unidade terrestre na área até a morte. Não distingue aliados.",
  },
  {
    id: "sup-reforcos",
    kind: "apoio",
    name: "Reforços",
    short: "REFORÇO",
    category: "apoio",
    cost: 34,
    ability: "reforcos",
    magnitude: 2,
    radius: 5,
    role: "Desembarca imediatamente dois pelotões de fuzileiros.",
  },
  {
    id: "sup-reparo",
    kind: "apoio",
    name: "Reparação de Veículos",
    short: "REPARO",
    category: "apoio",
    cost: 20,
    ability: "reparacao",
    magnitude: 220,
    radius: 6,
    role: "Restaura blindados e veículos num raio.",
  },
  {
    id: "sup-barricada",
    kind: "apoio",
    name: "Barricada",
    short: "BARR",
    category: "apoio",
    cost: 20,
    ability: "barricada",
    duration: 30,
    magnitude: 600,
    radius: 4,
    role: "Ergue obstáculo defensivo que bloqueia o avanço.",
  },
  {
    id: "sup-interferencia",
    kind: "apoio",
    name: "Interferência Eletrônica",
    short: "EW",
    category: "apoio",
    cost: 34,
    ability: "interferencia",
    duration: 6,
    radius: 11,
    role: "Silencia drones, artilharia e comunicações inimigas.",
    unlocksTech: ["t9"],
  },
  {
    id: "sup-evacuacao",
    kind: "apoio",
    name: "Evacuação Aeromédica",
    short: "EVAC",
    category: "apoio",
    cost: 26,
    ability: "evacuacao",
    magnitude: 160,
    radius: 6,
    role: "Retira e cura uma unidade própria em risco.",
  },
  {
    id: "sup-recon-avancado",
    kind: "apoio",
    name: "Reconhecimento Avançado",
    short: "REC+",
    category: "apoio",
    cost: 20,
    ability: "reconhecimento",
    duration: 12,
    radius: 16,
    role: "Revela uma área inteira da arena por tempo limitado.",
  },
  {
    id: "sup-paraquedistas",
    kind: "apoio",
    name: "Paraquedistas",
    short: "PQD",
    category: "apoio",
    cost: 40,
    ability: "paraquedistas",
    magnitude: 2,
    radius: 5,
    role: "Infiltração: lança pelotões paraquedistas atrás das linhas inimigas.",
    unlocksTech: ["t7"],
  },
  {
    id: "sup-bombardeiro",
    kind: "apoio",
    name: "Bombardeiro Tático",
    short: "BOMB",
    category: "apoio",
    cost: 54,
    ability: "bombardeiro",
    magnitude: 200,
    radius: 11,
    role: "Operação aérea de maior custo: passagem longa com sequência de impactos.",
    unlocksTech: ["t10"],
  },
];

// ---------------------------------------------------------------------------
// CICLO DE CONTRAPESOS (pedra-papel-tesoura militar)
// ---------------------------------------------------------------------------
// Multiplicadores de dano por CATEGORIA do alvo. Ninguém é imbatível: cada força
// tem uma fraqueza que a neutraliza. Aplicado no motor (damageUnit) via unit.dmgVs.
//
//   Fuzileiro:  derruba infantaria leve/antitanque, arranha blindado.
//   Assalto:    tritura infantaria no corpo a corpo, sofre contra blindado/artilharia.
//   Antitanque: mata blindado e estrutura, mas cai fácil para infantaria.
//   Blindado:   esmaga infantaria, apanha do antitanque.
//   Artilharia: arrasa infantaria/estruturas em área, frágil contra tudo que a alcança.
//   Drone combate: caça infantaria/artilharia, vulnerável a antiaérea.
//   Defesa AA:  abate aéreo, quase inútil contra terra.
//   Sniper:     elimina infantaria de longe, inútil contra veículos.
const COUNTERS: Record<string, Partial<Record<UnitCategory, number>>> = {
  "inf-fuzileiros": { infantaria: 1.0, blindado: 0.35, artilharia: 1.0, reconhecimento: 1.2 },
  "inf-assalto": { infantaria: 1.6, blindado: 0.4, artilharia: 1.2, apoio: 1.5 },
  "inf-antitanque": { blindado: 2.4, defesa: 1.6, artilharia: 1.5, infantaria: 0.55 },
  "inf-sniper": { infantaria: 1.9, blindado: 0.25, artilharia: 0.9, apoio: 1.4 },
  "art-morteiro": { infantaria: 1.7, blindado: 0.7, defesa: 1.5, artilharia: 1.2 },
  "art-canhao": { infantaria: 1.5, blindado: 1.1, defesa: 1.8, artilharia: 1.2 },
  "art-obus": { infantaria: 1.8, blindado: 1.0, defesa: 2.0, artilharia: 1.2 },
  "bld-tanque": { infantaria: 1.8, blindado: 1.1, artilharia: 1.6, defesa: 1.4 },
  "bld-vbld": { infantaria: 1.5, blindado: 1.0, artilharia: 1.4, defesa: 1.2 },
  "bld-caca-tanques": { blindado: 2.2, infantaria: 0.6, defesa: 1.3 },
  "mss-lancador": { blindado: 1.6, defesa: 2.2, artilharia: 1.6, infantaria: 0.9 },
  "mss-lmf": { infantaria: 1.9, artilharia: 1.8, blindado: 0.8 },
  "rec-drone-combate": { infantaria: 1.5, artilharia: 1.5, blindado: 0.7, reconhecimento: 1.5 },
  "def-aa": { reconhecimento: 2.4, infantaria: 0.5, blindado: 0.4 },
  "def-fortificacao": { infantaria: 1.3, blindado: 0.8 },
};

for (const card of militaryCards) {
  const c = COUNTERS[card.id];
  if (c) card.dmgVs = c;
}

// O CHANCELER é uma carta-herói: existe para o motor montar a unidade, mas não entra
// no baralho nem na coleção, então fica FORA de `allCards` (a coleção não o oferece).
export const heroCards: MilitaryCard[] = militaryCards.filter((c) => c.hero);
// CARTAS ESPECIAIS: não entram no baralho nem na coleção — só o motor as instancia em
// cena (ex.: o COMBOIO que traz a carta nova da operação, alvo de captura).
export const specialCards: MilitaryCard[] = [
  {
    id: "prize-carrier",
    kind: "militar",
    name: "Comboio da Carta",
    short: "CMB",
    category: BLD,
    cost: 0,
    hp: 720,
    dmg: 20,
    speed: 3.0,
    range: 8,
    cooldown: 1.4,
    targets: "ambos",
    domain: "terra",
    radius: 3,
    model: "comboio",
    weapon: {
      kind: "fuzil",
      projectileSpeed: 90,
      splash: 0,
      arc: false,
      homing: false,
      muzzle: 1.8,
      tracer: true,
    },
    role: "Porta a carta nova da operação. Capture-o e conduza à base para tomar a carta.",
  },
];

export const allCards: Card[] = [...militaryCards.filter((c) => !c.hero), ...supportCards];
export const cardById = (id: string): Card => {
  const c =
    allCards.find((x) => x.id === id) ??
    heroCards.find((x) => x.id === id) ??
    specialCards.find((x) => x.id === id);
  if (!c) throw new Error(`Carta desconhecida: ${id}`);
  return c;
};
export const militaryById = (id: string): MilitaryCard => cardById(id) as MilitaryCard;

// Ícone próprio por carta: identidade instantânea no HUD (emoji por TIPO de unidade,
// não por categoria — senão todas as infantarias ficam iguais). O fallback usa a
// categoria, garantindo que nenhuma carta fique sem ícone.
export const CARD_ICON: Record<string, string> = {
  "inf-fuzileiros": "🪖",
  "inf-assalto": "🔫",
  "inf-antitanque": "🚀",
  "inf-engenheiro": "👷",
  "art-canhao": "💥",
  "art-obus": "🎯",
  "mss-lancador": "🚀",
  "mss-lmf": "🧨",
  "bld-tanque": "🛡️",
  "bld-vbld": "🚙",
  "rec-drone": "🛰️",
  "rec-drone-combate": "🛸",
  "def-aa": "📡",
  "def-fortificacao": "🧱",
  "apo-posto": "⛑️",
  "sup-aereo": "✈️",
  "inf-sniper": "🎯",
  "art-morteiro": "💣",
  "bld-caca-tanques": "🚜",
  "sup-gas": "☠️",
  "sup-reforcos": "🎖️",
  "sup-reparo": "🔧",
  "sup-barricada": "🚧",
  "sup-interferencia": "📶",
  "sup-evacuacao": "🚁",
  "sup-recon-avancado": "🔭",
  "sup-paraquedistas": "🪂",
  "sup-bombardeiro": "🛩️",
};

export const CATEGORY_ICON: Record<string, string> = {
  infantaria: "🪖",
  blindado: "🛡️",
  artilharia: "🎯",
  defesa: "🏰",
  reconhecimento: "🛰️",
  apoio: "✈️",
};

export function cardIcon(card: Card): string {
  return CARD_ICON[card.id] ?? CATEGORY_ICON[card.category] ?? "★";
}

// Baralho inicial desbloqueado (sem exigência de tecnologia).
export const startingDeck: string[] = [
  "inf-fuzileiros",
  "inf-assalto",
  "inf-antitanque",
  "inf-engenheiro",
  "art-canhao",
  "bld-vbld",
  "rec-drone",
  "sup-gas",
];

export const isUnlocked = (card: Card, techs: string[]): boolean =>
  !card.unlocksTech || card.unlocksTech.every((t) => techs.includes(t));

// ---------------------------------------------------------------------------
// Nível de carta — escalonamento de vida/dano/cura
// ---------------------------------------------------------------------------

export const CARD_MAX_LEVEL = 50;
export const MAX_CARD_LEVEL = CARD_MAX_LEVEL;

// Cada nível melhora TUDO um pouco: vida, dano, velocidade e resistência. A curva é
// geométrica (~2%/nível) para que 50 níveis signifiquem um exército visivelmente mais
// forte, sem virar um salto absurdo de uma vez. O nível 50 é o teto "veterano".
const LEVEL_GROWTH = 0.02;

/** Multiplicador geral de vida/dano/cura: ~1 + 2% por nível. */
export function cardLevelMultiplier(level: number): number {
  const lvl = Math.max(1, Math.min(CARD_MAX_LEVEL, Math.round(level)));
  return 1 + LEVEL_GROWTH * (lvl - 1);
}

/** Velocidade: cresce mais devagar que a vida/dano (marchar 2× mais rápido seria bizarro). */
export function cardSpeedMultiplier(level: number): number {
  const lvl = Math.max(1, Math.min(CARD_MAX_LEVEL, Math.round(level)));
  return 1 + LEVEL_GROWTH * 0.5 * (lvl - 1);
}

/**
 * Resistência: fração do dano recebido que a unidade ignora, por nível. Sobe até ~30%
 * no nível 50 — um veterano aguenta mais porrada. É APLICADA no motor (damageUnit),
 * não só exibida.
 */
export function cardArmorFraction(level: number): number {
  const lvl = Math.max(1, Math.min(CARD_MAX_LEVEL, Math.round(level)));
  return Math.min(0.3, LEVEL_GROWTH * 0.3 * (lvl - 1));
}

// Teto rígido de unidades por esquadrão. Mesmo que uma carta defina um valor maior,
// o motor nunca passa deste limite — protege o desempenho e o equilíbrio.
export const SQUAD_HARD_CAP = 20;

/**
 * Quantas unidades UMA carta militar lança, conforme o nível. É o marco de evolução:
 * a carta comum lança 1 unidade; ao chegar ao nível máximo (50), lança 2. Vale para
 * TODAS as cartas militares (um pelotão de elite no topo da progressão). O motor usa
 * esta função como fonte única — nenhum outro lugar decide "quantas unidades".
 */
export function unitsPerDeploy(level: number): number {
  const lvl = Math.max(1, Math.min(CARD_MAX_LEVEL, Math.round(level)));
  return lvl >= CARD_MAX_LEVEL ? 2 : 1;
}

/**
 * Tamanho da força (esquadrão) que uma carta militar gera em um dado nível.
 * É a ÚNICA fonte de verdade para "quantas unidades esta carta envia": a progressão
 * de quantidade fica centralizada aqui, nunca espalhada pelo código.
 */
export function squadCount(card: MilitaryCard, level: number): number {
  const spec = card.squad;
  if (!spec) return 1;
  const lvl = Math.max(1, Math.min(CARD_MAX_LEVEL, Math.round(level)));
  const n = spec.base + spec.perLevel * (lvl - 1);
  return Math.max(1, Math.min(SQUAD_HARD_CAP, Math.min(spec.max, Math.round(n))));
}

/**
 * O balanceamento histórico do catálogo foi calibrado assumindo UMA unidade por
 * carta. Ao transformar a carta em esquadrão, reduzimos os atributos de cada
 * membro para manter o poder TOTAL controlado: o poder total cresce apenas como
 * a raiz quarta do tamanho do esquadrão (n^0,25), o que dá aos enxames uma leve
 * vantagem — compensada por armas de área (artilharia, bombardeiro, drones).
 */
export function squadPowerScale(count: number): number {
  if (count <= 1) return 1;
  return 1 / Math.pow(count, 0.75);
}

/** Cópias necessárias para ir do nível n ao n+1. Curva crescente até o nível 50. */
export const LEVEL_UP_COPIES = (() => {
  const table: number[] = [];
  for (let lvl = 1; lvl < CARD_MAX_LEVEL; lvl++) {
    // crescimento suave e determinístico: ~1 + lvl/2 cópias por degrau
    table.push(Math.max(1, Math.round(1 + lvl * 0.6)));
  }
  return table;
})();

export function copiesToLevel(level: number): number {
  return LEVEL_UP_COPIES[Math.max(0, Math.min(LEVEL_UP_COPIES.length - 1, level - 1))] ?? 0;
}

/** Nível alcançado a partir de um total de cópias, do nível 1 ao teto. */
export function levelFromCopies(copies: number): number {
  let level = 1;
  let remaining = Math.max(0, Math.floor(copies));
  while (level < CARD_MAX_LEVEL && remaining >= copiesToLevel(level)) {
    remaining -= copiesToLevel(level);
    level += 1;
  }
  return level;
}

// ---------------------------------------------------------------------------
// Doutrinas
// ---------------------------------------------------------------------------

export const doctrines: Record<Doctrine, DoctrineModifier> = {
  Mobilidade: {
    id: "Mobilidade",
    summary: "Unidades deslocam-se mais rápido; flanquear é mais fácil.",
    costMultiplier: {},
    speedMultiplier: { reconhecimento: 1.2, infantaria: 1.12, blindado: 1.08 },
    dmgMultiplier: {},
    hpMultiplier: {},
    captureMultiplier: 1.0,
    combinedArmsBonus: 0.05,
  },
  "Defesa territorial": {
    id: "Defesa territorial",
    summary: "Fortificações mais duras e captura mais lenta para o inimigo.",
    costMultiplier: { defesa: 0.85 },
    speedMultiplier: {},
    dmgMultiplier: { defesa: 1.2 },
    hpMultiplier: { defesa: 1.3, infantaria: 1.1 },
    captureMultiplier: 1.15,
    combinedArmsBonus: 0.03,
  },
  "Poder de fogo": {
    id: "Poder de fogo",
    summary: "Artilharia e apoio com dano e alcance superiores.",
    costMultiplier: { artilharia: 0.9 },
    speedMultiplier: {},
    dmgMultiplier: { artilharia: 1.35, apoio: 1.2 },
    hpMultiplier: {},
    captureMultiplier: 0.9,
    combinedArmsBonus: 0.04,
  },
  Infantaria: {
    id: "Infantaria",
    summary: "Infantaria barata e eficiente em captura.",
    costMultiplier: { infantaria: 0.8 },
    speedMultiplier: { infantaria: 1.1 },
    dmgMultiplier: { infantaria: 1.2 },
    hpMultiplier: { infantaria: 1.15 },
    captureMultiplier: 1.3,
    combinedArmsBonus: 0.05,
  },
  Mecanizada: {
    id: "Mecanizada",
    summary: "Blindados e veículos com custo e mobilidade melhores.",
    costMultiplier: { blindado: 0.92, reconhecimento: 0.95 },
    speedMultiplier: { blindado: 1.08 },
    dmgMultiplier: { blindado: 1.05 },
    hpMultiplier: { blindado: 1.05 },
    captureMultiplier: 1.0,
    combinedArmsBonus: 0.08,
  },
  "Operações combinadas": {
    id: "Operações combinadas",
    summary: "Bônus crescente por combinar categorias diferentes na mesma área.",
    costMultiplier: {},
    speedMultiplier: {},
    dmgMultiplier: {},
    hpMultiplier: {},
    captureMultiplier: 1.05,
    combinedArmsBonus: 0.14,
  },
};

export const allDoctrines = Object.keys(doctrines) as Doctrine[];
export const doctrineList = allDoctrines;

// ---------------------------------------------------------------------------
// Comandantes
// ---------------------------------------------------------------------------

export const commanders: Commander[] = [
  {
    id: "cmd-varela",
    name: "Cel. Varela",
    personality: "Metódico",
    doctrine: "Operações combinadas",
    note: "Avança por setores, nunca sozinho. Espera a composição fechar.",
  },
  {
    id: "cmd-sarmiento",
    name: "Cmdt. Sarmiento",
    personality: "Agressivo",
    doctrine: "Mecanizada",
    note: "Empurra blindados cedo e disputa o setor central.",
  },
  {
    id: "cmd-orlov",
    name: "Gen. Orlov",
    personality: "Econômico",
    doctrine: "Poder de fogo",
    note: "Acumula comando e castiga com artilharia em massa.",
  },
  {
    id: "cmd-lima",
    name: "Maj. Lima",
    personality: "Cauteloso",
    doctrine: "Defesa territorial",
    note: "Prioriza segurar objetivos e sangrar o atacante.",
  },
  {
    id: "cmd-duarte",
    name: "Cap. Duarte",
    personality: "Oportunista",
    doctrine: "Mobilidade",
    note: "Reage ao erro do adversário e toma o objetivo abandonado.",
  },
];

export const commanderById = (id: string): Commander =>
  commanders.find((c) => c.id === id) ?? commanders[0]!;

// ---------------------------------------------------------------------------
// Arenas
// ---------------------------------------------------------------------------

const cp = (
  id: string,
  name: string,
  sector: "norte" | "central" | "sul",
  x: number,
  y: number,
  value: number,
): Arena["controlPoints"][number] => ({
  id,
  name,
  sector,
  x,
  y,
  radius: 7,
  value,
  owner: "neutro",
  progress: { blue: 0, red: 0 },
});

const terr = (
  id: string,
  name: string,
  x: number,
  y: number,
  radius = 5,
  base = false,
): Territory => ({
  id,
  name,
  x,
  y,
  radius,
  owner: "neutro",
  progress: { blue: 0, red: 0 },
  ...(base ? { base: true } : {}),
});

// Bases principais + duas torres defensivas por lado. O azul defende o OESTE, o
// vermelho o LESTE; os territórios neutros ficam entre eles, ao longo do front.
// As demais posições defensivas NÃO nascem construídas: são conquistadas no campo
// (territórios) e transformadas em bases avançadas pelos engenheiros durante a partida.
function standardStructures(): StructureSpec[] {
  return [
    {
      id: "base-blue",
      kind: "base-principal",
      side: "blue",
      name: "Base Principal Aliada",
      x: 8,
      y: 23,
      radius: 9,
      hp: 4000,
      dmg: 45,
      range: 15,
      cooldown: 1.4,
      targets: "ambos",
    },
    {
      id: "torre-blue-w",
      kind: "torre",
      side: "blue",
      name: "Bunker Norte",
      x: 26,
      y: 12,
      radius: 5,
      hp: 1700,
      dmg: 60,
      range: 18,
      cooldown: 0.9,
      targets: "ambos",
    },
    {
      id: "torre-blue-e",
      kind: "torre",
      side: "blue",
      name: "Bunker Sul",
      x: 26,
      y: 34,
      radius: 5,
      hp: 1700,
      dmg: 60,
      range: 18,
      cooldown: 0.9,
      targets: "ambos",
    },
    {
      id: "base-red",
      kind: "base-principal",
      side: "red",
      name: "Base Principal Inimiga",
      x: 92,
      y: 23,
      radius: 9,
      hp: 4000,
      dmg: 45,
      range: 15,
      cooldown: 1.4,
      targets: "ambos",
    },
    {
      id: "torre-red-w",
      kind: "torre",
      side: "red",
      name: "Bunker Norte",
      x: 74,
      y: 12,
      radius: 5,
      hp: 1700,
      dmg: 60,
      range: 18,
      cooldown: 0.9,
      targets: "ambos",
    },
    {
      id: "torre-red-e",
      kind: "torre",
      side: "red",
      name: "Bunker Sul",
      x: 74,
      y: 34,
      radius: 5,
      hp: 1700,
      dmg: 60,
      range: 18,
      cooldown: 0.9,
      targets: "ambos",
    },
  ];
}

// Pontos de expansão do mapa padrão. Malha ENXUTA (posições e contagem) para manter o
// campo legível sem poluir: 5 pontos por lado + 3 no centro, todos espelhados
// (x → 100 − x) para que os dois lados nasçam com as mesmas oportunidades.
function standardTerritories(): Territory[] {
  // MAPA LIMPO: cinco territórios por lado, bem espaçados. Menos marcadores significa
  // menos "quebras" no terreno e áreas de captura maiores — dá para ler o campo de
  // relance. As posições são as ORIGINAIS (nada de reposicionar o que já era lido): só
  // a QUANTIDADE caiu pela metade. A malha cobre o lado inteiro — um ponto colado na
  // base (renda garantida), um ao norte, um central, um ao sul e um avançado.
  const blue: [string, string, number, number, number][] = [
    ["t-w1", "Ancoradouro", 16, 21, 4],
    ["t-nw", "Colina Noroeste", 20, 7, 4],
    ["t-w2", "Encruzilhada Oeste", 30, 24, 4.2],
    ["t-sw", "Vau Sudoeste", 19, 38, 4],
    ["t-w3", "Fronteira Oeste", 43, 24, 4],
  ];
  const redNames: Record<string, [string, string]> = {
    "t-w1": ["t-e1", "Depósito Leste"],
    "t-nw": ["t-ne", "Colina Nordeste"],
    "t-w2": ["t-e2", "Encruzilhada Leste"],
    "t-sw": ["t-se", "Cume Sudeste"],
    "t-w3": ["t-e3", "Fronteira Leste"],
  };
  const list: Territory[] = [
    // BASES NEUTRAS no meio do mapa: instalações militares já erguidas, de ninguém.
    // São o prêmio central da partida — quem as toma ganha posição no centro, sem
    // precisar construir. Ladeiam o nó central.
    terr("bn-n", "Base Neutra Norte", 50, 12, 6, true),
    terr("bn-s", "Base Neutra Sul", 50, 34, 6, true),
    // Nó central: ponto de expansão clássico (marcador de captura sem base erguida).
    terr("t-c", "Nó Central", 50, 23, 4.6),
  ];
  for (const [id, name, x, y, r] of blue) {
    list.push(terr(id, name, x, y, r));
    const [rid, rname] = redNames[id]!;
    list.push(terr(rid, rname, 100 - x, y, r));
  }
  return list;
}

// Corredores de avanço: ligam a base principal aos territórios e desenham o CAMINHO
// no terreno. Servem de leitura estratégica e de trilha de marcha.
function standardRoutes(): { from: [number, number]; to: [number, number] }[] {
  const seg = (x1: number, y1: number, x2: number, y2: number) => ({
    from: [x1, y1] as [number, number],
    to: [x2, y2] as [number, number],
  });
  return [
    // corredor norte
    seg(8, 23, 20, 7),
    seg(20, 7, 36, 8),
    seg(36, 8, 45, 14),
    seg(45, 14, 50, 12),
    seg(50, 12, 55, 14),
    seg(55, 14, 64, 8),
    seg(64, 8, 80, 7),
    seg(80, 7, 92, 23),
    // corredor central
    seg(8, 23, 30, 24),
    seg(30, 24, 43, 24),
    seg(43, 24, 50, 23),
    seg(50, 23, 57, 24),
    seg(57, 24, 70, 24),
    seg(70, 24, 92, 23),
    // corredor sul
    seg(8, 23, 19, 38),
    seg(19, 38, 35, 39),
    seg(35, 39, 45, 33),
    seg(45, 33, 50, 34),
    seg(50, 34, 55, 33),
    seg(55, 33, 65, 39),
    seg(65, 39, 81, 38),
    seg(81, 38, 92, 23),
  ];
}

// FRONTEIRAS: traço perpendicular no ponto médio de cada par de territórios PRÓXIMOS
// (≤ MIN_FRONTIER_GAP). Pares distantes não geram linha — a fronteira nº 2 não toca a
// nº 6. É a "linha de mapa-múndi" que separa um território do vizinho imediato.
function standardFrontiers(t: Territory[]): { from: [number, number]; to: [number, number] }[] {
  const MIN_FRONTIER_GAP = 14;
  const segs: { from: [number, number]; to: [number, number] }[] = [];
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length; j++) {
      const a = t[i]!;
      const b = t[j]!;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > MIN_FRONTIER_GAP || d < 0.1) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const px = -(b.y - a.y) / d;
      const py = (b.x - a.x) / d;
      const len = Math.min(20, d * 0.9);
      segs.push({
        from: [mx - px * (len / 2), my - py * (len / 2)],
        to: [mx + px * (len / 2), my + py * (len / 2)],
      });
    }
  }
  return segs;
}

// Geometria padrão do teatro: oeste = azul, leste = vermelho. Cada arena troca
// terreno, pontos de controle e obstáculos, mantendo a MESMA estrutura espacial.
const BLUE_ZONE = { x: 2, y: 2, w: 22, h: 42 };
const RED_ZONE = { x: 76, y: 2, w: 22, h: 42 };

export const arenas: Arena[] = [
  {
    id: "arena-cidade",
    name: "Perímetro Urbano",
    terrain: "Cidade",
    description:
      "Ruas estreitas, prédios como cobertura e posições defensivas. Blindados sofrem, infantaria domina.",
    controlPoints: [
      cp("cp-n", "Praça Norte", "norte", 28, 10, 1),
      cp("cp-c", "Estação Central", "central", 50, 23, 2),
      cp("cp-s", "Terminal Sul", "sul", 72, 36, 1),
    ],
    territories: standardTerritories(),
    structures: standardStructures(),
    obstacles: [
      {
        id: "o1",
        kind: "construcao",
        x: 34,
        y: 11,
        radius: 7,
        blocksGround: false,
        slow: 0.8,
        cover: 0.3,
      },
      {
        id: "o2",
        kind: "construcao",
        x: 34,
        y: 35,
        radius: 7,
        blocksGround: false,
        slow: 0.8,
        cover: 0.3,
      },
      {
        id: "o3",
        kind: "construcao",
        x: 66,
        y: 11,
        radius: 7,
        blocksGround: false,
        slow: 0.8,
        cover: 0.3,
      },
      {
        id: "o4",
        kind: "construcao",
        x: 66,
        y: 35,
        radius: 7,
        blocksGround: false,
        slow: 0.8,
        cover: 0.3,
      },
    ],
    routes: standardRoutes(),
    frontiers: standardFrontiers(standardTerritories()),
    deployZone: { blue: { ...BLUE_ZONE }, red: { ...RED_ZONE } },
  },
  {
    id: "arena-floresta",
    name: "Corredor Amazônico",
    terrain: "Floresta",
    description:
      "Vegetação densa, rios e mobilidade limitada. Reconhecimento vale mais que blindagem.",
    controlPoints: [
      cp("cp-n", "Clareira Norte", "norte", 46, 10, 1),
      cp("cp-c", "Porto Fluvial", "central", 50, 23, 2),
      cp("cp-s", "Trilha Sul", "sul", 54, 36, 1),
    ],
    territories: standardTerritories(),
    structures: standardStructures(),
    obstacles: [
      {
        id: "o1",
        kind: "rio",
        x: 50,
        y: 10,
        radius: 12,
        blocksGround: false,
        slow: 0.55,
        cover: 0,
      },
      {
        id: "o2",
        kind: "vegetacao",
        x: 30,
        y: 23,
        radius: 8,
        blocksGround: false,
        slow: 0.7,
        cover: 0.25,
      },
      {
        id: "o3",
        kind: "vegetacao",
        x: 70,
        y: 23,
        radius: 8,
        blocksGround: false,
        slow: 0.7,
        cover: 0.25,
      },
      {
        id: "o4",
        kind: "vegetacao",
        x: 50,
        y: 36,
        radius: 7,
        blocksGround: false,
        slow: 0.75,
        cover: 0.2,
      },
    ],
    routes: standardRoutes(),
    frontiers: standardFrontiers(standardTerritories()),
    deployZone: { blue: { ...BLUE_ZONE }, red: { ...RED_ZONE } },
  },
  {
    id: "arena-deserto",
    name: "Vazio do Saara",
    terrain: "Campo aberto",
    description:
      "Longas distâncias, exposição total e logística decisiva. Artilharia e mobilidade mandam.",
    controlPoints: [
      cp("cp-n", "Poço Norte", "norte", 28, 9, 1),
      cp("cp-c", "Oásis Central", "central", 50, 23, 2),
      cp("cp-s", "Acampamento Sul", "sul", 72, 37, 1),
    ],
    territories: standardTerritories(),
    structures: standardStructures(),
    obstacles: [
      {
        id: "o1",
        kind: "elevacao",
        x: 34,
        y: 23,
        radius: 8,
        blocksGround: false,
        slow: 0.85,
        cover: 0.15,
      },
      {
        id: "o2",
        kind: "elevacao",
        x: 66,
        y: 23,
        radius: 8,
        blocksGround: false,
        slow: 0.85,
        cover: 0.15,
      },
    ],
    routes: standardRoutes(),
    frontiers: standardFrontiers(standardTerritories()),
    deployZone: { blue: { ...BLUE_ZONE }, red: { ...RED_ZONE } },
  },
  {
    id: "arena-montanha",
    name: "Passos dos Apeninos",
    terrain: "Montanha",
    description:
      "Passagens estreitas, elevações e rotas restritas. Quem domina o cume domina a batalha.",
    controlPoints: [
      cp("cp-n", "Cume Norte", "norte", 28, 9, 2),
      cp("cp-c", "Desfiladeiro", "central", 50, 23, 2),
      cp("cp-s", "Base Sul", "sul", 72, 37, 1),
    ],
    territories: standardTerritories(),
    structures: standardStructures(),
    obstacles: [
      {
        id: "o1",
        kind: "elevacao",
        x: 40,
        y: 10,
        radius: 10,
        blocksGround: true,
        slow: 0.6,
        cover: 0.3,
      },
      {
        id: "o2",
        kind: "elevacao",
        x: 40,
        y: 36,
        radius: 10,
        blocksGround: true,
        slow: 0.6,
        cover: 0.3,
      },
      {
        id: "o3",
        kind: "elevacao",
        x: 60,
        y: 10,
        radius: 10,
        blocksGround: true,
        slow: 0.6,
        cover: 0.3,
      },
      {
        id: "o4",
        kind: "elevacao",
        x: 60,
        y: 36,
        radius: 10,
        blocksGround: true,
        slow: 0.6,
        cover: 0.3,
      },
    ],
    routes: standardRoutes(),
    frontiers: standardFrontiers(standardTerritories()),
    deployZone: { blue: { ...BLUE_ZONE }, red: { ...RED_ZONE } },
  },
  {
    id: "arena-rio",
    name: "Travessia do Paraná",
    terrain: "Travessia de rio",
    description:
      "O rio corta a arena ao meio. Pontes são gargalos: quem as segura controla o fluxo.",
    controlPoints: [
      cp("cp-n", "Margem Norte", "norte", 28, 10, 1),
      cp("cp-c", "Ponte Central", "central", 50, 23, 2),
      cp("cp-s", "Margem Sul", "sul", 72, 36, 1),
    ],
    territories: standardTerritories(),
    structures: standardStructures(),
    obstacles: [
      { id: "o1", kind: "rio", x: 50, y: 23, radius: 22, blocksGround: true, slow: 0.5, cover: 0 },
      {
        id: "o2",
        kind: "vegetacao",
        x: 30,
        y: 8,
        radius: 7,
        blocksGround: false,
        slow: 0.8,
        cover: 0.2,
      },
      {
        id: "o3",
        kind: "vegetacao",
        x: 70,
        y: 38,
        radius: 7,
        blocksGround: false,
        slow: 0.8,
        cover: 0.2,
      },
    ],
    routes: standardRoutes(),
    frontiers: standardFrontiers(standardTerritories()),
    deployZone: { blue: { ...BLUE_ZONE }, red: { ...RED_ZONE } },
  },
  {
    id: "arena-fortificada",
    name: "Linha Fortificada",
    terrain: "Região fortificada",
    description: "Casamatas e arame farpado. Engenharia abre caminho; artilharia castiga de longe.",
    controlPoints: [
      cp("cp-n", "Reduto Norte", "norte", 28, 10, 1),
      cp("cp-c", "Reduto Central", "central", 50, 23, 2),
      cp("cp-s", "Reduto Sul", "sul", 72, 36, 1),
    ],
    territories: standardTerritories(),
    structures: standardStructures(),
    obstacles: [
      {
        id: "o1",
        kind: "construcao",
        x: 42,
        y: 23,
        radius: 8,
        blocksGround: true,
        slow: 0.7,
        cover: 0.35,
      },
      {
        id: "o2",
        kind: "construcao",
        x: 58,
        y: 23,
        radius: 8,
        blocksGround: true,
        slow: 0.7,
        cover: 0.35,
      },
      {
        id: "o3",
        kind: "construcao",
        x: 50,
        y: 11,
        radius: 6,
        blocksGround: false,
        slow: 0.85,
        cover: 0.25,
      },
    ],
    routes: standardRoutes(),
    frontiers: standardFrontiers(standardTerritories()),
    deployZone: { blue: { ...BLUE_ZONE }, red: { ...RED_ZONE } },
  },
];

// As arenas são autorais num espaço de projeto de 100×46. `toWorldArena` reescala
// X (spreadX) e Y (deepenY) para o mundo atual (`WORLD_W`/`WORLD_H`), deixando o campo
// mais LARGO e mais FUNDO sem reescrever à mão cada coordenada. Os RAIOS NÃO mudam:
// estruturas e territórios seguem círculos (nunca elipses).
function toWorldArena(a: Arena): Arena {
  const sx = spreadX;
  const dy = deepenY;
  return {
    ...a,
    controlPoints: a.controlPoints.map((p) => ({ ...p, x: sx(p.x), y: dy(p.y) })),
    territories: a.territories.map((t) => ({ ...t, x: sx(t.x), y: dy(t.y) })),
    structures: a.structures.map((s) => ({ ...s, x: sx(s.x), y: dy(s.y) })),
    obstacles: a.obstacles.map((o) => ({ ...o, x: sx(o.x), y: dy(o.y) })),
    routes: a.routes.map((r) => ({
      from: [sx(r.from[0]), dy(r.from[1])] as [number, number],
      to: [sx(r.to[0]), dy(r.to[1])] as [number, number],
    })),
    frontiers: (a.frontiers ?? []).map((f) => ({
      from: [sx(f.from[0]), dy(f.from[1])] as [number, number],
      to: [sx(f.to[0]), dy(f.to[1])] as [number, number],
    })),
    deployZone: {
      blue: {
        x: sx(a.deployZone.blue.x),
        y: dy(a.deployZone.blue.y),
        w: sx(a.deployZone.blue.w),
        h: dy(a.deployZone.blue.h),
      },
      red: {
        x: sx(a.deployZone.red.x),
        y: dy(a.deployZone.red.y),
        w: sx(a.deployZone.red.w),
        h: dy(a.deployZone.red.h),
      },
    },
  };
}

export const arenaByTerrain = (terrain: string): Arena =>
  toWorldArena(arenas.find((a) => a.terrain === terrain) ?? arenas[0]!);
export const arenaById = (id: string): Arena =>
  toWorldArena(arenas.find((a) => a.id === id) ?? arenas[0]!);
