// REGISTRO DE SALAS — a lista que o jogador vê.
//
// O jogo é front-end puro: não existe servidor de lobby para descobrir salas de outras
// pessoas. O que existe é o que este navegador abriu, guardado em localStorage. Por isso
// a lista é honesta: mostra as salas CRIADAS AQUI (com código, terreno, assentos e quando
// foram abertas) e serve para reabrir, convidar e limpar — não finge ser um servidor.

export interface RoomRecord {
  code: string;
  terrain: string;
  /** ms desde epoch da criação. */
  createdAt: number;
  /** Quem já entrou: o host sempre; o convidado quando a partida começou. */
  guestJoined: boolean;
  /** Seed da partida, para reabrir com o mesmo campo. */
  seed: number;
}

const KEY = "sovereign.pvp.rooms.v1";
const MAX_ROOMS = 12;

function read(): RoomRecord[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is RoomRecord =>
        !!r && typeof r === "object" && typeof (r as RoomRecord).code === "string",
    );
  } catch {
    return [];
  }
}

function write(rooms: RoomRecord[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(rooms.slice(0, MAX_ROOMS)));
  } catch {
    // Sem espaço ou storage bloqueado: a lista é conveniência, não requisito.
  }
}

export function listRooms(): RoomRecord[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function saveRoom(room: RoomRecord): RoomRecord[] {
  const rooms = read().filter((r) => r.code !== room.code);
  rooms.unshift(room);
  write(rooms);
  return listRooms();
}

export function markGuestJoined(code: string): RoomRecord[] {
  const rooms = read().map((r) => (r.code === code ? { ...r, guestJoined: true } : r));
  write(rooms);
  return listRooms();
}

export function removeRoom(code: string): RoomRecord[] {
  write(read().filter((r) => r.code !== code));
  return listRooms();
}

/** Link de convite: abre o PvP já com o código preenchido. */
export function inviteLink(code: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/multiplayer?sala=${code}`;
}

/** "há 3 min" — a lista precisa dizer se a sala ainda é de agora. */
export function roomAge(createdAt: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - createdAt) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} d`;
}
