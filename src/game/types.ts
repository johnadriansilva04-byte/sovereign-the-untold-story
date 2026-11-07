// Contratos de dados do SOVEREIGN. Hoje alimentados por dados locais (src/game/data.ts);
// no futuro, cada tipo corresponde a uma tabela/endpoint do back-end.

export type Controller = "humano" | "ia" | "neutro";
export type Personality =
  | "Expansionista"
  | "Defensivo"
  | "Militarista"
  | "Diplomático"
  | "Comercial"
  | "Tecnológico"
  | "Isolacionista";

export interface Province {
  id: string;
  name: string;
  x: number;
  y: number;
  resources: string[];
  infrastructure: number; // 0-100
  strategic: "baixa" | "média" | "alta" | "crítica";
  troops: number;
  controlledBy: string; // country id
}

export interface Country {
  id: string;
  name: string;
  flag: string;
  capital: string;
  government: string;
  controller: Controller;
  player?: string;
  personality?: Personality;
  population: number; // milhões
  gdp: number; // bi
  tech: number;
  military: number;
  stability: number;
  resources: string[];
  path: string; // SVG path no viewBox 1000x520
  label: [number, number];
  provinces: Province[];
}

export type Relation = "aliança" | "tratado" | "comércio" | "neutro" | "tensão" | "guerra";

export interface Room {
  id: string;
  name: string;
  host: string;
  players: number;
  maxPlayers: number;
  mode: "Equilibrado" | "Aleatório" | "Histórico";
  status: "Em preparação" | "Em andamento" | "Encerrada";
  privacy: "Pública" | "Privada" | "Convite";
  aiSlots: number;
  neutral: number;
  scheduled?: string;
}

export type EvidenceKind = "fato" | "documento" | "ficcao";

export interface ArchiveEntry {
  id: string;
  kind: EvidenceKind;
  title: string;
  date: string;
  text: string;
  source?: string;
}

export interface DialogueLine {
  speaker: string;
  text: string;
  kind?: EvidenceKind;
}

export interface Chapter {
  id: string;
  number: number;
  act: string;
  title: string;
  era: string;
  place: string;
  summary: string;
  mission: { title: string; objective: string; battle?: string };
  dialogue: DialogueLine[];
  archives: string[]; // ids de ArchiveEntry
}

export interface UnitType {
  id: string;
  name: string;
  short: string;
  cost: number;
  hp: number;
  dmg: number;
  speed: number;
  range: number;
  role: string;
}

export interface GameEvent {
  id: string;
  turn: number;
  kind: "guerra" | "aliança" | "tratado" | "conquista" | "militar" | "economia" | "ia" | "batalha";
  text: string;
  actors: string[];
}
