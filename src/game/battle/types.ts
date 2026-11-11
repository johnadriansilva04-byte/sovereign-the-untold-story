// Modelo de dados da batalha tática de SOVEREIGN.
// A batalha é um sistema fechado: recebe um BattleConfig (montado a partir da camada
// geopolítica) e devolve um BattleResult que volta para o mapa. Nada aqui depende de rede.

export type Side = "blue" | "red";

export type UnitCategory =
  "infantaria" | "blindado" | "artilharia" | "defesa" | "reconhecimento" | "apoio";

export type TargetProfile = "terra" | "aereo" | "ambos";

export type Domain = "terra" | "aereo";

export type Order = "avancar" | "defender" | "manter" | "recuar";

export type Doctrine =
  | "Mobilidade"
  | "Defesa territorial"
  | "Poder de fogo"
  | "Infantaria"
  | "Mecanizada"
  | "Operações combinadas";

export type TerrainKind =
  "Campo aberto" | "Floresta" | "Montanha" | "Cidade" | "Travessia de rio" | "Região fortificada";

export type ObjectiveKind = "territorial" | "militar" | "operacional";

export type BattlePhase = "preparacao" | "mobilizacao" | "combate" | "pressao" | "resultado";

export type BattleOutcome = "vitoria" | "derrota" | "empate";

// Silhuetas distintas por unidade — o renderizador desenha cada modelo de forma própria.
export type UnitModel =
  | "soldado-fuzil"
  | "soldado-assalto"
  | "soldado-antitanque"
  | "engenheiro"
  | "canhao"
  | "artilharia-pesada"
  | "lmf"
  | "tanque"
  | "vbld"
  | "lancador-missil"
  | "drone-recon"
  | "drone-combate"
  | "aa"
  | "fortificacao"
  | "posto"
  | "paraquedista"
  | "sniper"
  | "morteiro"
  | "caca-tanques";

// ---------------------------------------------------------------------------
// Armas e projéteis
// ---------------------------------------------------------------------------

export type WeaponKind =
  | "fuzil" // raycast rápido com traçante
  | "automatica" // rajada rápida
  | "atgm" // foguete guiado antitanque
  | "canhao" // projétil direto com recuo
  | "obus" // tiro em arco, explosão em área
  | "lmf" // saturação de foguetes
  | "missil" // míssil guiado de longo alcance
  | "antiaereo" // tiro rápido guiado contra alvos aéreos
  | "drone"; // armamento leve de drone

export interface WeaponSpec {
  kind: WeaponKind;
  projectileSpeed: number; // unidades de mundo por segundo
  splash: number; // raio de dano em área (0 = alvo único)
  arc: boolean; // trajetória balística (morteiro/obus)
  homing: boolean; // persegue o alvo em movimento
  muzzle: number; // deslocamento do ponto de origem do disparo
  tracer?: boolean; // raio instantâneo (fuzil/automática)
}

// Uma carta militar representa uma FORÇA, não um único personagem. O tamanho da força
// cresce com o nível da carta, dentro de limites rígidos de equilíbrio.
export interface SquadSpec {
  base: number; // unidades no nível 1
  perLevel: number; // unidades adicionais por nível acima de 1
  max: number; // teto de unidades (protege desempenho e equilíbrio)
  spacing: number; // espaçamento da formação visual (unidades de mundo)
}

export interface MilitaryCard {
  id: string;
  kind: "militar";
  name: string;
  short: string;
  category: UnitCategory;
  cost: number; // Energia
  hp: number;
  dmg: number;
  speed: number; // unidades de mundo por segundo
  range: number; // unidades de mundo
  cooldown: number; // segundos entre ataques
  targets: TargetProfile;
  domain: Domain; // como a própria unidade é atingida
  radius: number; // raio de colisão / captura
  model: UnitModel;
  weapon: WeaponSpec;
  // engenharia: constrói/repara bases avançadas
  builder?: boolean;
  // alvos preferenciais (IA) — ex.: antitanque prioriza blindados
  priority?: UnitCategory[];
  ability?: string;
  role: string;
  unlocksTech?: string[]; // ids de tecnologia necessária (ponte com a campanha)
  // composição da força gerada por esta carta (1 = unidade única, ex.: tanque)
  squad?: SquadSpec;
}

export interface SupportCard {
  id: string;
  kind: "apoio";
  name: string;
  short: string;
  category: "apoio";
  cost: number;
  ability: SupportAbility;
  duration?: number; // segundos de efeito
  magnitude?: number; // dano / cura / alcance
  radius?: number;
  role: string;
  unlocksTech?: string[];
}

export type SupportAbility =
  | "ataque_aereo"
  | "fumaca"
  | "gas"
  | "reforcos"
  | "reparacao"
  | "barricada"
  | "interferencia"
  | "evacuacao"
  | "reconhecimento"
  | "paraquedistas"
  | "bombardeiro";

export type Card = MilitaryCard | SupportCard;

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------

export interface ControlPoint {
  id: string;
  name: string;
  sector: "norte" | "central" | "sul" | "oeste" | "leste";
  x: number; // 0-100
  y: number; // 0-100
  radius: number;
  value: number; // peso na pontuação territorial
  owner: Side | "neutro";
  progress: Record<Side, number>; // 0-100
}

export interface Obstacle {
  id: string;
  kind: "rio" | "construcao" | "vegetacao" | "elevacao" | "barricada";
  x: number;
  y: number;
  radius: number;
  blocksGround: boolean;
  slow: number; // multiplicador de velocidade (1 = normal)
  cover: number; // redução de dano recebido (0-1)
  side?: Side; // barricadas pertencem a um lado
}

// Ponto de expansão territorial: círculo branco luminoso que pode ser conquistado
// e, em seguida, receber uma base avançada construída por engenheiros.
// Quando `base` é true, o ponto é uma BASE NEUTRA já erguida no meio do mapa: além
// do marcador de captura, desenha uma instalação militar neutra a ser tomada.
export interface Territory {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  owner: Side | "neutro";
  progress: Record<Side, number>; // 0-100
  base?: boolean;
}

// Estrutura fixa do motor (base principal, torre defensiva ou base avançada).
export type StructureKind = "base-principal" | "torre" | "base-avancada";

export interface StructureSpec {
  id: string;
  kind: StructureKind;
  side: Side;
  x: number;
  y: number;
  radius: number;
  hp: number;
  dmg: number; // dano por disparo (0 = estrutura passiva)
  range: number;
  cooldown: number;
  targets: TargetProfile;
  name: string;
  // tempo de construção de uma base avançada (segundos). 0 = já construída.
  buildTime?: number;
}

export interface Structure {
  id: string;
  kind: StructureKind;
  side: Side;
  name: string;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  dmg: number;
  range: number;
  cooldown: number;
  readyIn: number;
  targets: TargetProfile;
  alive: boolean;
  // construção progressiva de bases avançadas
  underConstruction: boolean;
  buildTime: number;
  buildProgress: number; // 0-100
  territoryId?: string;
  aim: number; // ângulo da torre/canhão (radianos)
  recoil: number; // recuo visual restante
}

export interface Arena {
  id: string;
  name: string;
  terrain: TerrainKind;
  description: string;
  controlPoints: ControlPoint[];
  territories: Territory[];
  structures: StructureSpec[];
  obstacles: Obstacle[];
  // rotas sugeridas (linhas de deslocamento) — usadas só para desenho e IA
  routes: { from: [number, number]; to: [number, number] }[];
  deployZone: { blue: Rect; red: Rect };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------
// Comandantes e doutrina
// ---------------------------------------------------------------------------

export type CommanderPersonality =
  "Cauteloso" | "Agressivo" | "Econômico" | "Oportunista" | "Metódico";

export interface Commander {
  id: string;
  name: string;
  personality: CommanderPersonality;
  doctrine: Doctrine;
  note: string;
}

export interface DoctrineModifier {
  id: Doctrine;
  summary: string;
  costMultiplier: Partial<Record<UnitCategory, number>>;
  speedMultiplier: Partial<Record<UnitCategory, number>>;
  dmgMultiplier: Partial<Record<UnitCategory, number>>;
  hpMultiplier: Partial<Record<UnitCategory, number>>;
  captureMultiplier: number;
  combinedArmsBonus: number; // bônus de dano quando 3+ categorias atuam juntas
}

// ---------------------------------------------------------------------------
// Estado da batalha
// ---------------------------------------------------------------------------

export interface BattleUnit {
  id: string;
  side: Side;
  cardId: string;
  name: string;
  short: string;
  category: UnitCategory;
  model: UnitModel;
  weapon: WeaponSpec;
  builder: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dmg: number;
  speed: number;
  range: number;
  cooldown: number;
  readyIn: number;
  radius: number;
  targets: TargetProfile;
  domain: Domain;
  order: Order;
  objectiveId?: string;
  targetId?: string; // alvo atual (unidade)
  targetStructureId?: string; // alvo atual (estrutura)
  buildTerritoryId?: string; // território onde o engenheiro constrói
  // esquadrão: todas as unidades de uma mesma carta/ordem compartilham o grupo.
  groupId: string;
  // destino explícito definido pelo jogador (clique no mapa). Tem prioridade sobre
  // o objetivo automático enquanto a força não chega nem encontra combate.
  goalX?: number;
  goalY?: number;
  // estrutura/território que o grupo deve atacar (ordem sobre um alvo do mapa)
  attackStructureId?: string;
  attackTerritoryId?: string;
  // quando true, ao chegar no destino a força assume posição defensiva (segura o
  // local) em vez de retomar o avanço automático. Ordens do jogador marcam true.
  holdAtGoal?: boolean;
  aim: number; // ângulo de mira (radianos)
  recoil: number; // recuo visual após disparo
  alive: boolean;
  engaged: boolean;
  // efeitos temporários
  smoke: number; // segundos restantes de ocultação
  jammed: number; // segundos restantes de interferência (não ataca)
  revealed: number; // segundos de revelação forçada
  seen: Record<Side, boolean>; // visibilidade calculada por lado (fog of war)
  // suporte: cura por pulso (0 = unidade de combate comum)
  heal: number;
  // nível da carta que originou a unidade (1-15)
  level: number;
  // fração do dano recebido que a unidade IGNORA por ser veterana (0-0,3). Aplicada
  // no motor (damageUnit), não é só um número de ficha.
  armor: number;
  // segundos restantes de "levou dano": a barra de vida só aparece nesse instante (ou
  // quando a unidade está selecionada). O campo limpa a poluição visual permanente.
  hitFlash: number;
  // Desgaste (atrito de campanha): a unidade perde vida continuamente em campo e um
  // pouco mais enquanto se desloca. O campo é grande; mandar tropa sem plano custa
  // caro — quem cruza o mapa inteiro chega debilitado, e quem fica parado também
  // definha. `wear` acumula os segundos de atrito para o motor escalar o dano.
  wear: number;
}

export type ProjectileKind = "tracer" | "shell" | "rocket" | "missile";

export interface Projectile {
  id: string;
  side: Side;
  kind: ProjectileKind;
  x: number;
  y: number;
  startX: number;
  startY: number;
  vx: number;
  vy: number;
  speed: number;
  dmg: number;
  splash: number;
  arc: boolean;
  homing: boolean;
  targetId?: string;
  targetKind?: "unit" | "structure";
  targetX: number;
  targetY: number;
  travelled: number; // para progresso visual do arco
  totalDistance: number;
  remaining: number; // tempo de vida restante
  alive: boolean;
}

export type EffectKind =
  "muzzle" | "tracer" | "impact" | "explosion" | "smoke" | "gas" | "fire" | "spark" | "build";

export interface VisualEffect {
  id: string;
  kind: EffectKind;
  x: number;
  y: number;
  x2?: number; // traçante
  y2?: number;
  radius: number;
  remaining: number;
  ttl: number;
  side?: Side;
}

export interface EffectZone {
  id: string;
  kind: "fumaca" | "gas" | "barricada" | "reparacao" | "reconhecimento";
  side: Side;
  x: number;
  y: number;
  radius: number;
  remaining: number;
  magnitude: number;
}

export interface HandCard {
  cardId: string;
  ready: boolean;
  /** Segundos até a carta voltar a ficar disponível (recarga pós-uso). */
  readyIn?: number;
}

export interface DeckState {
  hand: HandCard[]; // 4 na mão
  queue: string[]; // 4 na fila
  cycle: number;
}

export interface SideState {
  side: Side;
  countryId: string;
  countryName: string;
  flag: string;
  commander: Commander;
  doctrine: Doctrine;
  command: number;
  commandMax: number;
  regen: number; // por segundo
  // Moeda da partida: renda das bases avançadas + recompensa por combate. Serve de
  // placar econômico e é convertida em prêmio ao fim da operação.
  coins: number;
  // Renda passiva atual (Sov/s vinda das bases avançadas), para exibir no HUD.
  income: number;
  // Acumulador do pagamento por lote das bases avançadas (a cada 45 s).
  incomeTimer: number;
  // Bônus econômico da nação: aumenta o VALOR do lote de Sov (nunca a frequência).
  economyBonus: number;
  mods?: SideModifiers | undefined; // bônus de acessórios equipados
  cardLevels: Record<string, number>; // nível por carta (1-15)
  deck: DeckState;
  units: BattleUnit[];
  kills: number;
  losses: number;
  structuresDestroyed: number;
  deployed: number;
  score: number;
}

export interface BattleLogEntry {
  t: number;
  side: Side | "sistema";
  kind:
    | "deploy"
    | "apoio"
    | "captura"
    | "baixa"
    | "ordem"
    | "evento"
    | "ia"
    | "construcao"
    | "destruicao";
  text: string;
}

export interface BattleConfig {
  id: string;
  missionName: string;
  objectiveKind: ObjectiveKind;
  objectiveText: string;
  duration: number; // segundos
  arena: Arena;
  blue: SideConfig;
  red: SideConfig;
  seed: number;
  // parâmetros operacionais (missões)
  militaryThreshold?: number; // % de perda que decide a partida
  operationalTarget?: { controlPointId: string; seconds: number };
  // ajuste do comandante adversário (dificuldade)
  aiDifficulty?: AiDifficulty;
}

export interface AiDifficulty {
  intervalMult: number; // <1 decide mais rápido
  commandMult: number; // multiplica teto/regeneração da IA
  reserveBonus: number; // soma à reserva que a IA guarda
  isLlm?: boolean | undefined;
}

export interface SideConfig {
  countryId: string;
  countryName: string;
  flag: string;
  commander: Commander;
  doctrine: Doctrine;
  deck: string[]; // 8 cartas
  commandMax: number;
  regen: number;
  // ajustes econômicos vindos da campanha (não permitem "comprar vitória")
  economyBonus: number; // ex.: 0.05 => +5% de regeneração
  // acessórios equipados (bônus de unidade)
  mods?: SideModifiers;
  // nível de cada carta no baralho (1-15). Vida/dano/cura escalam por nível.
  cardLevels?: Record<string, number>;
}

export interface SideModifiers {
  commandMax?: number;
  dmg?: Partial<Record<UnitCategory, number>>;
  hp?: Partial<Record<UnitCategory, number>>;
  speed?: Partial<Record<UnitCategory, number>>;
  capture?: number;
  sight?: number;
}

export interface BattleState {
  config: BattleConfig;
  t: number;
  phase: BattlePhase;
  running: boolean;
  blue: SideState;
  red: SideState;
  zones: EffectZone[];
  structures: Structure[];
  territories: Territory[];
  projectiles: Projectile[];
  effects: VisualEffect[];
  log: BattleLogEntry[];
  outcome: BattleOutcome | null;
  reason: string;
  nextId: number;
  aiTimer: number;
  rng: number; // estado do gerador determinístico (mulberry32)
  holds: Record<string, number>; // tempo de manutenção por condição (vitória)
}

export interface BattleResult {
  configId: string;
  missionName: string;
  outcome: BattleOutcome;
  reason: string;
  duration: number;
  territorialScore: Record<Side, number>;
  controlPoints: Record<Side, number>;
  territories: Record<Side, number>;
  structuresDestroyed: Record<Side, number>;
  kills: Record<Side, number>;
  losses: Record<Side, number>;
  remainingCommand: Record<Side, number>;
  coins: Record<Side, number>;
  income: Record<Side, number>;
  pointsHeld: { id: string; name: string; sector: string; owner: Side | "neutro" }[];
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

export interface DeployAction {
  type: "deploy";
  side: Side;
  cardId: string;
  x: number; // destino da ordem (ponto de clique), NÃO ponto de nascimento
  y: number;
  /** Alvo explícito do clique (unidade/estrutura/território do mapa). */
  targetUnitId?: string;
  targetStructureId?: string;
  targetTerritoryId?: string;
}

// Alvo explícito de uma ordem: o que o jogador clicou no teatro. A força marcha
// até lá e ataca aquilo (unidade, estrutura ou território) em vez de escolher sozinha.
export interface DeployTarget {
  unitId?: string | undefined;
  structureId?: string | undefined;
  territoryId?: string | undefined;
}

export interface SupportAction {
  type: "apoio";
  side: Side;
  cardId: string;
  x: number;
  y: number;
}

export interface OrderAction {
  type: "ordem";
  side: Side;
  unitId?: string;
  order: Order;
  objectiveId?: string;
}

// Reposicionamento de uma força que JÁ está no campo: o jogador seleciona o
// esquadrão e indica um novo destino/alvo. É o que transforma o jogo em tabuleiro.
export interface RepositionAction {
  type: "reposicionar";
  side: Side;
  groupId?: string;
  unitId?: string;
  x: number;
  y: number;
  targetUnitId?: string;
  targetStructureId?: string;
  targetTerritoryId?: string;
  /** Ao chegar, para (padrão) ou volta a caçar o inimigo? */
  holdAtArrival?: boolean;
}

export type BattleAction = DeployAction | SupportAction | OrderAction | RepositionAction;
