import { beforeEach, describe, expect, it } from "vitest";

import {
  inviteLink,
  listRooms,
  markGuestJoined,
  removeRoom,
  roomAge,
  saveRoom,
} from "@/game/pvp/rooms";

const room = (code: string, createdAt = Date.now()) => ({
  code,
  terrain: "Cidade",
  createdAt,
  guestJoined: false,
  seed: 1234,
});

describe("registro de salas do PvP", () => {
  beforeEach(() => localStorage.clear());

  it("a sala criada aparece na lista, mais nova primeiro", () => {
    saveRoom(room("AAAA", 1000));
    saveRoom(room("BBBB", 2000));

    expect(listRooms().map((r) => r.code)).toEqual(["BBBB", "AAAA"]);
  });

  it("criar de novo com o mesmo código substitui em vez de duplicar", () => {
    saveRoom(room("AAAA", 1000));
    saveRoom(room("AAAA", 5000));

    expect(listRooms()).toHaveLength(1);
    expect(listRooms()[0]!.createdAt).toBe(5000);
  });

  it("marca quando o convidado entrou", () => {
    saveRoom(room("AAAA"));
    expect(markGuestJoined("AAAA")[0]!.guestJoined).toBe(true);
  });

  it("excluir tira a sala da lista", () => {
    saveRoom(room("AAAA"));
    expect(removeRoom("AAAA")).toHaveLength(0);
  });

  it("o convite aponta para o multiplayer com o código", () => {
    expect(inviteLink("7K2M")).toContain("/multiplayer?sala=7K2M");
  });

  it("a idade da sala é legível", () => {
    const now = Date.now();
    expect(roomAge(now, now)).toBe("agora");
    expect(roomAge(now - 5 * 60_000, now)).toBe("há 5 min");
    expect(roomAge(now - 3 * 3_600_000, now)).toBe("há 3 h");
  });
});
