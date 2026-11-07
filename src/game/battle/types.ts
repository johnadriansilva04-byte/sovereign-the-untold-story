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

// ---------------------------------------------------------------------------
// Cartas
// ---------------------------------------------------------------------------

export interface MilitaryCard {
  id: string;
  kind: "militar";
  name: string;
  short: string;
  category: UnitCategory;
  cost: number; // Pontos de Comando
  hp: number;
  dmg: number;
  speed: number; // unidades de mundo por segundo
  range: number; // unidades de mundo
  cooldown: number; // segundos entre ataques
  targets: TargetProfile;
  domain: Domain; // como a própria unidade é atingida
  radius: number; // raio de colisão / captura
  ability?: string;
  role: string;
  unlocksTech?: string[]; // ids de tecnologia necessária (ponte com a campanha)
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
  | "reforcos"
  | "reparacao"
  | "barricada"
  | "interferencia"
  | "evacuacao"
  | "reconhecimento";

export type Card = MilitaryCard | SupportCard;

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------

export interface ControlPoint {
  id: string;
  name: string;
  sector: "norte" | "central" | "sul";
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

export interface Arena {
  id: string;
  name: string;
  terrain: TerrainKind;
  description: string;
  controlPoints: ControlPoint[];
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
  alive: boolean;
  engaged: boolean;
  // efeitos temporários
  smoke: number; // segundos restantes de ocultação
  jammed: number; // segundos restantes de interferência (não ataca)
  revealed: number; // segundos de revelação forçada
  seen: Record<Side, boolean>; // visibilidade calculada por lado (fog of war)
}

export interface EffectZone {
  id: string;
  kind: "fumaca" | "barricada" | "reparacao" | "reconhecimento";
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
  mods?: SideModifiers | undefined; // bônus de acessórios equipados
  deck: DeckState;
  units: BattleUnit[];
  kills: number;
  losses: number;
  deployed: number;
  score: number;
}

export interface BattleLogEntry {
  t: number;
  side: Side | "sistema";
  kind: "deploy" | "apoio" | "captura" | "baixa" | "ordem" | "evento" | "ia";
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
  kills: Record<Side, number>;
  losses: Record<Side, number>;
  remainingCommand: Record<Side, number>;
  pointsHeld: { id: string; name: string; sector: string; owner: Side | "neutro" }[];
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

export interface DeployAction {
  type: "deploy";
  side: Side;
  cardId: string;
  x: number;
  y: number;
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

export type BattleAction = DeployAction | SupportAction | OrderAction;
