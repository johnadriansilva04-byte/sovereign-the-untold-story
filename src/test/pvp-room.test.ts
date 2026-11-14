import { describe, expect, it } from "vitest";

import { decodeRoom, encodeRoom, PVP_TERRAINS, randomSeed } from "@/game/pvp/live";
import { createFakeLobbyBus, pairUp, pairingCode, roleForMe, type Waiter } from "@/game/pvp/lobby";

describe("código de sala determinístico", () => {
  it("reconstrói semente e terreno a partir do código", () => {
    for (const terrain of PVP_TERRAINS) {
      for (const seed of [0, 1, 42, 999, 1000000, 0xffffffff]) {
        const code = encodeRoom(seed, terrain);
        const back = decodeRoom(code);
        expect(back).not.toBeNull();
        expect(back!.terrain).toBe(terrain);
        // A semente é reduzida à capacidade do código: re-codificar o que voltou é estável.
        expect(encodeRoom(back!.seed, back!.terrain)).toBe(code);
      }
    }
  });

  it("gera códigos curtos e legíveis (sem caracteres ambíguos)", () => {
    const code = encodeRoom(randomSeed(), "Cidade");
    expect(code).toHaveLength(5);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
  });

  it("aceita código digitado com minúsculas e normaliza O/I/L", () => {
    const code = encodeRoom(777, "Montanha");
    const messy = code.toLowerCase();
    expect(decodeRoom(messy)).toEqual(decodeRoom(code));
  });

  it("rejeita código inválido ou curto demais", () => {
    expect(decodeRoom("AB")).toBeNull();
    expect(decodeRoom("!!!!")).toBeNull();
  });
});

describe("pareamento do lobby", () => {
  const waiter = (id: string, at: number, name = id): Waiter => ({ id, name, at });

  it("forma pares 1-2, 3-4 na ordem de entrada", () => {
    const pairs = pairUp([waiter("b", 20), waiter("a", 10), waiter("c", 30)]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.host.id).toBe("a");
    expect(pairs[0]!.guest.id).toBe("b");
  });

  it("o código do par é o MESMO para os dois lados", () => {
    const a = waiter("a", 10);
    const b = waiter("b", 20);
    const fromA = roleForMe(a, [a, b]);
    const fromB = roleForMe(b, [a, b]);
    expect(fromA).not.toBeNull();
    expect(fromB).not.toBeNull();
    expect(fromA!.code).toBe(fromB!.code);
    expect(fromA!.role).toBe("host");
    expect(fromB!.role).toBe("guest");
    expect(fromA!.code).toBe(pairingCode("a", "b"));
  });

  it("não pareia quem está sozinho na fila", () => {
    const a = waiter("a", 10);
    expect(roleForMe(a, [a])).toBeNull();
  });

  it("o barramento em memória pareia dois jogadores com o mesmo código", () => {
    const bus = createFakeLobbyBus();
    const seen: { role: string; code: string }[] = [];
    bus.join("Ana", { onPaired: (p) => seen.push({ role: p.role, code: p.code }) });
    bus.join("Beto", { onPaired: (p) => seen.push({ role: p.role, code: p.code }) });
    expect(seen).toHaveLength(2);
    expect(seen[0]!.code).toBe(seen[1]!.code);
    expect(new Set(seen.map((s) => s.role))).toEqual(new Set(["host", "guest"]));
  });
});
