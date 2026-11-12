import { describe, expect, it } from "vitest";

import { aiTick, aiTickSide, configureAi, defaultAiWeights } from "@/game/battle/ai";
import { cardById, commanders, militaryById, startingDeck } from "@/game/battle/catalog";
import {
  applyAction,
  createBattle,
  deploy,
  deployBatch,
  dist,
  insideDeployZone,
  reposition,
  stepBattle,
} from "@/game/battle/engine";
import { buildBattleConfig, defaultNation, missionById } from "@/game/battle/missions";
import { WORLD_H } from "@/game/battle/world";
import type {
  BattleConfig,
  BattleState,
  BattleUnit,
  Side,
  Structure,
  Territory,
} from "@/game/battle/types";

function testConfig(overrides: Partial<BattleConfig> = {}): BattleConfig {
  const base = buildBattleConfig({
    nation: defaultNation,
    mission: missionById("m-apagao"),
    deck: startingDeck,
    commander: commanders[0]!,
    doctrine: commanders[0]!.doctrine,
    seed: 7,
  });
  return { ...base, duration: 300, ...overrides };
}

function advance(state: BattleState, seconds: number, dt = 0.1): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps && state.running; i++) stepBattle(state, dt);
}

// Conveniência para os testes de mecânica: desdobra a carta e mantém APENAS UM
// membro da força na coordenada pedida (as demais cartas/esquadrões são testados
// em casos próprios). O motor continua dono da unidade.
function place(state: BattleState, side: Side, cardId: string, x: number, y: number) {
  const cfg = side === "blue" ? state.blue : state.red;
  cfg.command = 999;
  cfg.deck.hand[0] = { cardId, ready: true };
  const z = state.config.arena.deployZone[side];
  const before = cfg.units.length;
  const ok = deploy(state, side, cardId, z.x + z.w / 2, z.y + z.h / 2);
  if (!ok) throw new Error(`falha ao desdobrar ${cardId}`);
  const spawned = cfg.units.slice(before);
  const unit = spawned[0]!;
  for (const u of spawned) {
    u.x = x;
    u.y = y;
    delete u.goalX;
    delete u.goalY;
    u.holdAtGoal = false;
  }
  // remove os demais membros para isolar a unidade sob teste
  for (const u of spawned.slice(1)) u.alive = false;
  cfg.units = cfg.units.filter((u) => u.alive);
  return unit;
}

function baseOf(state: BattleState, side: Side): Structure {
  return state.structures.find((s) => s.kind === "base-principal" && s.side === side)!;
}

// Mantém uma unidade artificialmente viva (vida cheia e de volta ao tabuleiro).
// Usado apenas em testes de mecânica que precisam de um atacante sobrevivente para
// isolar o alvo sob verificação (ex.: uma base levando dano até a destruição).
function keepAlive(state: BattleState, side: Side, unit: BattleUnit): void {
  const cfg = side === "blue" ? state.blue : state.red;
  unit.alive = true;
  unit.hp = unit.maxHp;
  if (!cfg.units.includes(unit)) cfg.units.push(unit);
}

function territory(state: BattleState, id: string): Territory {
  return state.territories.find((t) => t.id === id)!;
}

describe("motor de batalha — bases, torres e vitória", () => {
  // 1. As duas bases principais aparecem corretamente, cada lado com DUAS torres defensivas.
  it("1. cria as duas bases principais e duas torres defensivas por lado", () => {
    const state = createBattle(testConfig());
    const bases = state.structures.filter((s) => s.kind === "base-principal");
    expect(bases).toHaveLength(2);
    expect(bases.find((b) => b.side === "blue")!.x).toBeLessThan(50);
    expect(bases.find((b) => b.side === "red")!.x).toBeGreaterThan(50);
    for (const side of ["blue", "red"] as const) {
      expect(state.structures.filter((s) => s.side === side && s.kind === "torre")).toHaveLength(2);
    }
    // As demais posições defensivas não nascem prontas: são construídas na partida.
    expect(state.structures.filter((s) => s.kind === "base-avancada")).toHaveLength(0);
  });

  // 2. As torres defensivas atacam unidades inimigas dentro do alcance.
  it("2. torres defensivas atacam automaticamente unidades inimigas no alcance", () => {
    const state = createBattle(testConfig());
    const tower = state.structures.find((s) => s.side === "red" && s.kind === "torre")!;
    const unit = place(state, "blue", "inf-fuzileiros", tower.x, tower.y + 6);
    const hpBefore = unit.hp;
    advance(state, 3);
    expect(unit.hp).toBeLessThan(hpBefore);
  });

  // 17/18. Destruição da base principal adversária = vitória imediata.
  it("17/18. destruir a base principal adversária encerra a partida em vitória", () => {
    const state = createBattle(testConfig({ duration: 1800 }));
    const redBase = baseOf(state, "red");
    const at = place(state, "blue", "inf-antitanque", redBase.x, redBase.y + redBase.radius + 4);
    at.order = "manter";
    for (let i = 0; i < 6000 && state.running && redBase.alive; i++) {
      // mantém a unidade viva e imóvel enquanto ela derruba a base
      keepAlive(state, "blue", at);
      at.order = "manter";
      stepBattle(state, 0.1);
    }
    expect(redBase.alive).toBe(false);
    expect(state.running).toBe(false);
    expect(state.outcome).toBe("vitoria");
  });
});

describe("motor de batalha — expansão territorial e construção", () => {
  // 3/4. Territórios neutros podem ser capturados e mudam de dono.
  it("3/4. captura de território neutro muda a propriedade", () => {
    const state = createBattle(testConfig());
    const t = territory(state, "t-c");
    expect(t.owner).toBe("neutro");
    const unit = place(state, "blue", "inf-fuzileiros", t.x, t.y);
    unit.order = "manter";
    advance(state, 15);
    expect(t.owner).toBe("blue");
    expect(t.progress.blue).toBe(100);
  });

  it("4b. presença adversária disputa a captura e impede a tomada", () => {
    const state = createBattle(testConfig());
    const t = territory(state, "t-c");
    const blue = place(state, "blue", "inf-fuzileiros", t.x, t.y);
    const red = place(state, "red", "inf-fuzileiros", t.x, t.y);
    blue.order = "manter";
    red.order = "manter";
    for (let i = 0; i < 100 && state.running; i++) {
      blue.x = t.x;
      blue.y = t.y;
      red.x = t.x;
      red.y = t.y;
      blue.hp = blue.maxHp;
      red.hp = red.maxHp;
      stepBattle(state, 0.1);
    }
    expect(t.owner).toBe("neutro");
  });

  // 4c. Base NEUTRA do centro: capturar transforma o marcador em base operacional real.
  it("4c. capturar base neutra ergue uma base avançada operacional do lado vencedor", () => {
    const state = createBattle(testConfig());
    const nb = state.territories.find((t) => t.base)!;
    expect(nb).toBeDefined();
    expect(nb.owner).toBe("neutro");
    const unit = place(state, "blue", "inf-fuzileiros", nb.x, nb.y);
    unit.order = "manter";
    advance(state, 15);
    expect(nb.owner).toBe("blue");
    const op = state.structures.find((s) => s.territoryId === nb.id && s.alive);
    expect(op).toBeDefined();
    expect(op!.side).toBe("blue");
    expect(op!.underConstruction).toBe(false);
    expect(op!.hp).toBeGreaterThan(0);
    expect(op!.dmg).toBeGreaterThan(0);
  });

  // 5. Engenheiros constroem novas bases; 6. bases avançadas recebem dano e podem ser destruídas.
  it("5/6. engenheiro constrói base avançada que opera e pode ser destruída", () => {
    const state = createBattle(testConfig({ duration: 900 }));
    const t = territory(state, "t-sw");
    t.owner = "blue";
    t.progress = { blue: 100, red: 0 };
    const eng = place(state, "blue", "inf-engenheiro", t.x, t.y);
    stepBattle(state, 0.1);
    let base = state.structures.find((s) => s.kind === "base-avancada" && s.side === "blue");
    expect(base).toBeDefined();
    expect(base!.underConstruction).toBe(true);
    // o engenheiro conclui a obra sozinho
    for (let i = 0; i < 400 && base!.underConstruction; i++) {
      keepAlive(state, "blue", eng);
      stepBattle(state, 0.1);
    }
    base = state.structures.find((s) => s.kind === "base-avancada" && s.side === "blue")!;
    expect(base.underConstruction).toBe(false);
    expect(base.buildProgress).toBe(100);

    // dano real de artilharia deve reduzir a vida e destruir a base
    // (afasta o engenheiro para ele não reparar a estrutura durante o teste)
    eng.x = 50;
    eng.y = 90;
    eng.order = "manter";
    const arty = place(state, "red", "art-obus", base.x, base.y + base.range - 2);
    const hpBefore = base.hp;
    for (let i = 0; i < 3000 && state.running; i++) {
      if (arty.alive) {
        arty.x = base.x;
        arty.y = base.y + base.range - 2;
        arty.order = "manter";
      }
      keepAlive(state, "red", arty);
      keepAlive(state, "blue", eng);
      stepBattle(state, 0.1);
      if (!state.structures.some((s) => s.id === base!.id && s.alive)) break;
    }
    expect(base.hp).toBeLessThan(hpBefore);
    expect(state.structures.some((s) => s.id === base!.id && s.alive)).toBe(false);
  });

  it("5b. base avançada amplia a área de posicionamento", () => {
    const state = createBattle(testConfig());
    const t = territory(state, "t-c");
    t.owner = "blue";
    expect(insideDeployZone(state, "blue", t.x, t.y)).toBe(false);
    state.structures.push({
      id: "adv-test",
      kind: "base-avancada",
      side: "blue",
      name: "Base de teste",
      x: t.x,
      y: t.y,
      radius: 6,
      hp: 1600,
      maxHp: 1600,
      dmg: 60,
      range: 16,
      cooldown: 1,
      readyIn: 0,
      targets: "ambos",
      alive: true,
      underConstruction: false,
      buildTime: 10,
      buildProgress: 100,
      aim: 0,
      recoil: 0,
    });
    expect(insideDeployZone(state, "blue", t.x, t.y)).toBe(true);
  });

  // 7. Ordens podem ser dadas em qualquer ponto do teatro; a força nasce na base.
  it("7. aceita ordem em qualquer ponto do mapa e a força nasce na base", () => {
    const state = createBattle(testConfig());
    state.blue.command = 30;
    state.blue.deck.hand[0] = { cardId: "inf-fuzileiros", ready: true };
    // ordem sobre o próprio território (oeste)
    expect(deploy(state, "blue", "inf-fuzileiros", 20, 23)).toBe(true);
    // ordem sobre a zona inimiga: aceita (a força marcha até lá) e nasce na base azul
    state.blue.deck.hand[0] = { cardId: "inf-fuzileiros", ready: true };
    state.blue.command = 30;
    const before = state.blue.units.length;
    expect(deploy(state, "blue", "inf-fuzileiros", 90, 23)).toBe(true);
    const spawned = state.blue.units.slice(before);
    expect(spawned.length).toBeGreaterThan(0);
    for (const u of spawned) {
      expect(u.x).toBeLessThan(50); // nasceu no lado azul (oeste)
      expect(u.goalX).toBeGreaterThan(50); // caminha para o destino ordenado (leste)
    }
    // O destino é o ponto clicado: a formação se distribui em volta dele, mas o
    // CENTRO da tropa coincide com a ordem.
    const cx = spawned.reduce((a, u) => a + (u.goalX ?? 0), 0) / spawned.length;
    expect(cx).toBeCloseTo(90, 0);
  });
});

describe("motor de batalha — armas e projéteis reais", () => {
  // 8. Soldados efetivamente disparam (traçantes com dano real).
  it("8. soldados disparam e aplicam dano a distância", () => {
    const state = createBattle(testConfig());
    const blue = place(state, "blue", "inf-fuzileiros", 50, 60);
    const red = place(state, "red", "inf-fuzileiros", 50, 55);
    const hpBefore = red.hp;
    let tracer = false;
    let dmg = false;
    for (let i = 0; i < 400 && state.running; i++) {
      blue.x = 50;
      blue.y = 60;
      red.x = 50;
      red.y = 55;
      blue.order = "manter";
      red.order = "manter";
      blue.hp = blue.maxHp;
      stepBattle(state, 0.05);
      if (state.effects.some((e) => e.kind === "tracer")) tracer = true;
      if (red.hp < hpBefore) dmg = true;
      if (tracer && dmg) break;
    }
    expect(tracer).toBe(true);
    expect(dmg).toBe(true);
  });

  // 9. Canhões efetivamente disparam com projétil visível.
  it("9. canhão gera projétil visível com trajetória até o impacto", () => {
    const state = createBattle(testConfig());
    const cannon = place(state, "blue", "art-canhao", 55, WORLD_H / 2);
    const target = place(state, "red", "inf-fuzileiros", 68, WORLD_H / 2);
    const hpBefore = target.hp;
    let sawShell = false;
    let dmg = false;
    for (let i = 0; i < 600 && state.running; i++) {
      cannon.x = 55;
      cannon.y = WORLD_H / 2;
      target.x = 68;
      target.y = WORLD_H / 2;
      cannon.order = "manter";
      target.order = "manter";
      cannon.hp = cannon.maxHp;
      stepBattle(state, 0.05);
      if (state.projectiles.some((p) => p.kind === "shell")) sawShell = true;
      if (target.hp < hpBefore) dmg = true;
      if (sawShell && dmg) break;
    }
    expect(sawShell).toBe(true);
    expect(dmg).toBe(true);
  });

  // 10. Mísseis possuem trajetória e impacto.
  it("10. lançador de mísseis gera míssil com trajetória e explosão no impacto", () => {
    const state = createBattle(testConfig());
    const launcher = place(state, "blue", "mss-lancador", 58, WORLD_H / 2);
    const target = place(state, "red", "inf-fuzileiros", 72, WORLD_H / 2);
    let sawMissile = false;
    let sawExplosion = false;
    for (let i = 0; i < 600 && state.running; i++) {
      launcher.x = 58;
      launcher.y = WORLD_H / 2;
      target.x = 72;
      target.y = WORLD_H / 2;
      launcher.order = "manter";
      target.order = "manter";
      launcher.hp = launcher.maxHp;
      target.hp = target.maxHp;
      stepBattle(state, 0.05);
      if (state.projectiles.some((p) => p.kind === "missile")) sawMissile = true;
      if (state.effects.some((e) => e.kind === "explosion")) sawExplosion = true;
      if (sawMissile && sawExplosion) break;
    }
    expect(sawMissile).toBe(true);
    expect(sawExplosion).toBe(true);
  });

  // 11. Tanques movimentam a torre e disparam.
  it("11. tanque mira, dispara e causa dano", () => {
    const state = createBattle(testConfig());
    const tank = place(state, "blue", "bld-tanque", 60, 12);
    const target = place(state, "red", "inf-fuzileiros", 66, 9);
    const aim0 = tank.aim;
    const hpBefore = target.hp;
    let moved = false;
    let dmg = false;
    for (let i = 0; i < 600 && state.running; i++) {
      tank.x = 60;
      tank.y = 12;
      target.x = 66;
      target.y = 9;
      tank.order = "manter";
      target.order = "manter";
      tank.hp = tank.maxHp;
      stepBattle(state, 0.05);
      if (Math.abs(tank.aim - aim0) > 1e-6) moved = true;
      if (target.hp < hpBefore) dmg = true;
      if (moved && dmg) break;
    }
    expect(moved).toBe(true);
    expect(dmg).toBe(true);
  });

  // 12. Drones voam (domínio aéreo) e executam suas funções.
  it("12. drone de reconhecimento voa e o de combate ataca alvos terrestres", () => {
    const state = createBattle(testConfig());
    expect(militaryById("rec-drone").domain).toBe("aereo");
    const drone = place(state, "blue", "rec-drone-combate", 50, 62);
    const target = place(state, "red", "inf-fuzileiros", 50, 54);
    expect(drone.domain).toBe("aereo");
    const hpBefore = target.hp;
    let dmg = false;
    for (let i = 0; i < 400 && state.running; i++) {
      drone.x = 50;
      drone.y = 62;
      target.x = 50;
      target.y = 54;
      drone.order = "manter";
      target.order = "manter";
      drone.hp = drone.maxHp;
      stepBattle(state, 0.05);
      if (target.hp < hpBefore) {
        dmg = true;
        break;
      }
    }
    expect(dmg).toBe(true);
  });

  // 13/14. Todas as armas aplicam dano; unidades identificam e atacam inimigos.
  it("13/14. unidades identificam inimigos no alcance e aplicam dano", () => {
    const state = createBattle(testConfig());
    const at = place(state, "blue", "inf-antitanque", 50, 60);
    const tank = place(state, "red", "bld-tanque", 50, 50);
    const hpBefore = tank.hp;
    let engaged = false;
    let dmg = false;
    for (let i = 0; i < 600 && state.running; i++) {
      at.x = 50;
      at.y = 60;
      tank.x = 50;
      tank.y = 50;
      at.order = "manter";
      tank.order = "manter";
      at.hp = at.maxHp;
      stepBattle(state, 0.05);
      if (at.engaged) engaged = true;
      if (tank.hp < hpBefore) dmg = true;
      if (engaged && dmg) break;
    }
    expect(engaged).toBe(true);
    expect(dmg).toBe(true);
  });
});

describe("motor de batalha — cartas, energia e ritmo", () => {
  // 15. As cartas permanecem FIXAS na mão (baralho equipado, sem rotação).
  it("15. as cartas equipadas permanecem fixas na mão durante a partida", () => {
    const state = createBattle(testConfig());
    const initial = state.blue.deck.hand.map((h) => h.cardId);
    expect(state.blue.deck.hand).toHaveLength(initial.length);
    expect(state.blue.deck.queue).toHaveLength(0);
    for (let i = 0; i < initial.length; i++) {
      state.blue.command = 1000;
      const cardId = state.blue.deck.hand[i]!.cardId;
      expect(cardId).toBe(initial[i]);
      deploy(state, "blue", cardId, 50, 90);
      // A carta usada continua exatamente no mesmo slot — nada rotaciona.
      expect(state.blue.deck.hand[i]!.cardId).toBe(initial[i]);
    }
    expect(state.blue.deck.hand.map((h) => h.cardId)).toEqual(initial);
  });

  it("15b. nenhuma carta nova é sorteada: o baralho nunca muda de composição", () => {
    const state = createBattle(testConfig());
    const initial = state.blue.deck.hand.map((h) => h.cardId);
    state.blue.command = 1000;
    const first = state.blue.deck.hand[0]!.cardId;
    deploy(state, "blue", first, 50, 90);
    const after = state.blue.deck.hand.map((h) => h.cardId);
    expect(after).toEqual(initial);
  });

  // 16. Sov é consumido ao desdobrar e NÃO regenera passivamente (recurso finito).
  it("16. Sov é consumido ao desdobrar e não regenera sem conquista", () => {
    const state = createBattle(testConfig());
    const card = state.blue.deck.hand[0]!.cardId;
    const cost = cardById(card).cost;
    const before = state.blue.command;
    deploy(state, "blue", card, 50, 90);
    expect(state.blue.command).toBeCloseTo(before - cost, 1);
    const spent = state.blue.command;
    advance(state, 3);
    expect(state.blue.command).toBeCloseTo(spent, 5);
    expect(state.blue.command).toBeLessThanOrEqual(state.blue.commandMax);
  });

  it("16b. recusa o desdobramento sem energia suficiente", () => {
    const state = createBattle(testConfig());
    state.blue.command = 0;
    expect(deploy(state, "blue", state.blue.deck.hand[0]!.cardId, 50, 90)).toBe(false);
  });

  // 16c. Envio em lote: 3× a MESMA carta deve criar 3 forças (o bug antigo parava em 1
  // porque o primeiro lançamento já punha a carta em recarga).
  it("16c. envio em lote da mesma carta cria TODAS as unidades pedidas", () => {
    const state = createBattle(testConfig());
    state.blue.command = 1000;
    const cardId = "inf-fuzileiros";
    const before = state.blue.units.length;
    const res = deployBatch(state, "blue", [{ cardId, count: 3 }], { x: 60, y: WORLD_H / 2 });
    expect(res.ok).toBe(true);
    expect(res.deployed).toBe(3);
    expect(state.blue.units.length - before).toBe(3);
    // A carta entra em recarga UMA vez, no fim do lote.
    const hand = state.blue.deck.hand.find((h) => h.cardId === cardId)!;
    expect(hand.ready).toBe(false);
  });

  // 16d. Envio combinado marcha em formação: blindados à frente da artilharia na
  // direção do avanço (o combo não vira um amontoado no mesmo ponto).
  it("16d. combo de cartas marcha em coluna (blindado à frente, apoio atrás)", () => {
    const state = createBattle(testConfig());
    state.blue.command = 1000;
    const res = deployBatch(
      state,
      "blue",
      [
        { cardId: "bld-vbld", count: 1 },
        { cardId: "art-canhao", count: 1 },
      ],
      { x: 80, y: WORLD_H / 2, originStructureId: "base-blue" },
    );
    expect(res.ok).toBe(true);
    const armor = state.blue.units.find((u) => u.cardId === "bld-vbld")!;
    const arty = state.blue.units.find((u) => u.cardId === "art-canhao")!;
    // Avanço é no eixo +x (azul → leste): o blindado nasce mais à frente (x maior).
    expect(armor.x).toBeGreaterThan(arty.x);
  });
});

describe("motor de batalha — IA autônoma", () => {
  it("IA joga dentro das regras e expande território", () => {
    const state = createBattle(testConfig({ duration: 200 }));
    configureAi(state, "blue", defaultAiWeights);
    let maxCommand = 0;
    for (let i = 0; i < 2000 && state.running; i++) {
      aiTickSide(state, "blue", 0.1);
      aiTick(state, 0.1);
      stepBattle(state, 0.1);
      maxCommand = Math.max(maxCommand, state.red.command);
    }
    expect(maxCommand).toBeLessThanOrEqual(state.red.commandMax + 0.001);
    expect(state.red.deployed).toBeGreaterThan(0);
    expect(state.blue.deployed).toBeGreaterThan(0);
  });

  it("unidades avançam sozinhas para disputar objetivos", () => {
    const state = createBattle(testConfig({ duration: 120 }));
    const unit = place(state, "blue", "inf-fuzileiros", 50, 88);
    const start = { x: unit.x, y: unit.y };
    advance(state, 10);
    expect(dist(unit.x, unit.y, start.x, start.y)).toBeGreaterThan(3);
  });

  // Regressão do "as cartas congelam": uma ordem do JOGADOR (destino explícito)
  // impulsiona a força para frente — ela NÃO trava no ponto clicado.
  it("ordem do jogador não congela a força no destino", () => {
    const state = createBattle(testConfig({ duration: 180 }));
    state.blue.command = 30;
    state.blue.deck.hand[0] = { cardId: "inf-fuzileiros", ready: true };
    const terr = state.territories.find((t) => t.owner === "neutro")!;
    const enemyBase = baseOf(state, "red");
    // O jogador manda a tropa contra a base inimiga a partir do território neutro.
    expect(
      deploy(state, "blue", "inf-fuzileiros", terr.x, terr.y, {
        x: enemyBase.x,
        y: enemyBase.y,
        holdAtArrival: false,
      }),
    ).toBe(true);
    const unit = state.blue.units.at(-1)!;
    expect(unit.holdAtGoal).toBe(false);

    const start = { x: unit.x, y: unit.y };
    advance(state, 25);
    // Não congela: a tropa avança firme rumo ao objetivo (sem parar no ponto).
    expect(dist(unit.x, unit.y, start.x, start.y)).toBeGreaterThan(10);
  });
});

describe("motor de batalha — cartas com efeito real", () => {
  const SUPPORT_DECK = [
    "sup-paraquedistas",
    "sup-bombardeiro",
    "inf-fuzileiros",
    "apo-posto",
    "inf-assalto",
    "bld-vbld",
    "def-fortificacao",
    "art-canhao",
  ];
  const supportConfig = (overrides: Partial<BattleConfig> = {}) => {
    const base = buildBattleConfig({
      nation: defaultNation,
      mission: missionById("m-apagao"),
      deck: SUPPORT_DECK,
      commander: commanders[0]!,
      doctrine: commanders[0]!.doctrine,
      seed: 7,
    });
    return { ...base, duration: 300, ...overrides };
  };

  it("Posto de Socorro cura infantaria aliada ferida (não é decoração)", () => {
    const state = createBattle(supportConfig({ duration: 300 }));
    const posto = place(state, "blue", "apo-posto", 50, WORLD_H / 2);
    const soldier = place(state, "blue", "inf-fuzileiros", 52, WORLD_H / 2);
    expect(posto.heal).toBeGreaterThan(0);
    soldier.hp = soldier.maxHp * 0.4;
    const before = soldier.hp;
    advance(state, 5);
    expect(soldier.hp).toBeGreaterThan(before);
    expect(soldier.hp).toBeLessThanOrEqual(soldier.maxHp);
  });

  it("Fortificação concede cobertura real: aliado ao lado recebe menos dano", () => {
    // Dois alvos idênticos, ambos parados, recebendo UM disparo do mesmo atirador
    // inimigo (também parado). A diferença de dano vem só da cobertura da fortificação.
    // A cena fica num corredor lateral, fora do alcance das torres, para isolar a cobertura.
    const measure = (withFort: boolean) => {
      const state = createBattle(supportConfig({ duration: 30 }));
      if (withFort) {
        const fort = place(state, "blue", "def-fortificacao", 88, 62);
        fort.speed = 0;
      }
      const target = place(state, "blue", "inf-fuzileiros", 90, 62);
      target.speed = 0;
      target.hp = target.maxHp;
      const shooter = place(state, "red", "inf-fuzileiros", 90, 64);
      shooter.speed = 0;
      shooter.cooldown = 10; // um único disparo dentro da janela
      const before = target.hp;
      advance(state, 1.2);
      return before - target.hp;
    };
    const withFort = measure(true);
    const withoutFort = measure(false);
    expect(withFort).toBeGreaterThan(0);
    expect(withFort).toBeLessThan(withoutFort);
  });

  it("Paraquedistas lançam pelotões atrás das linhas", () => {
    const state = createBattle(supportConfig({ duration: 300 }));
    state.blue.command = 999;
    state.blue.deck.hand[0] = { cardId: "sup-paraquedistas", ready: true };
    const before = state.blue.units.filter((u) => u.alive).length;
    const ok = deploy(state, "blue", "sup-paraquedistas", 70, 60);
    expect(ok).toBe(true);
    const after = state.blue.units.filter((u) => u.alive).length;
    expect(after).toBeGreaterThan(before);
    expect(state.blue.units.some((u) => u.model === "paraquedista")).toBe(true);
  });

  it("Bombardeiro tático causa impacto em área e dano real", () => {
    const state = createBattle(supportConfig({ duration: 300 }));
    const victim = place(state, "red", "inf-fuzileiros", 50, 40);
    victim.hp = victim.maxHp;
    const before = victim.hp;
    state.blue.command = 999;
    state.blue.deck.hand[0] = { cardId: "sup-bombardeiro", ready: true };
    const ok = deploy(state, "blue", "sup-bombardeiro", 50, 40);
    expect(ok).toBe(true);
    expect(victim.hp).toBeLessThan(before);
  });

  it("nível de carta escala vida e dano aplicados pelo motor", () => {
    const base = createBattle(testConfig({ duration: 60 }));
    const u1 = place(base, "blue", "inf-fuzileiros", 50, 90);
    const leveled = createBattle(
      testConfig({
        duration: 60,
        blue: { ...testConfig().blue, cardLevels: { "inf-fuzileiros": 10 } },
      }),
    );
    const u10 = place(leveled, "blue", "inf-fuzileiros", 50, 90);
    expect(u10.level).toBe(10);
    expect(u10.maxHp).toBeGreaterThan(u1.maxHp);
    expect(u10.dmg).toBeGreaterThan(u1.dmg);
  });

  it("cartas de área globais e cartas de tropa aceitam ordem em qualquer ponto do mapa", () => {
    const state = createBattle(testConfig({ duration: 60 }));
    // Ponto no território adversário (perto da base vermelha).
    const enemyBase = baseOf(state, "red");

    const global = createBattle(testConfig({ duration: 60 }));
    global.blue.command = 999;
    global.blue.deck.hand[0] = { cardId: "sup-paraquedistas", ready: true };
    expect(deploy(global, "blue", "sup-paraquedistas", enemyBase.x, enemyBase.y - 6)).toBe(true);

    // Tropa terrestre também aceita a ordem no lado inimigo: nasce na base e marcha.
    const local = createBattle(testConfig({ duration: 60 }));
    local.blue.command = 999;
    local.blue.deck.hand[0] = { cardId: "inf-fuzileiros", ready: true };
    expect(deploy(local, "blue", "inf-fuzileiros", enemyBase.x - 6, enemyBase.y)).toBe(true);
    const troop = local.blue.units.filter((u) => !u.hero);
    const trooper = troop[0]!;
    expect(trooper.x).toBeLessThan(50); // nasceu na base azul (oeste)
    // O destino é o ponto clicado: a formação se distribui em volta dele.
    const goals = troop.map((u) => u.goalX ?? 0);
    const cx = goals.reduce((a, v) => a + v, 0) / goals.length;
    expect(cx).toBeCloseTo(enemyBase.x - 6, 0); // centro da tropa no destino inimigo
  });

  // 8/9. O clique num inimigo manda a força atacá-lo (o alvo explícito é respeitado).
  it("clique num inimigo manda a força marchar para atacá-lo", () => {
    const state = createBattle(testConfig({ duration: 300 }));
    const victim = place(state, "red", "inf-fuzileiros", 50, 40);
    victim.order = "manter";
    state.blue.command = 999;
    state.blue.deck.hand[0] = { cardId: "inf-fuzileiros", ready: true };
    // Ordem com alvo explícito: como se o jogador tivesse clicado na unidade inimiga.
    const ok = deploy(state, "blue", "inf-fuzileiros", 50, 40, {
      x: 50,
      y: 40,
      holdAtArrival: false,
      targetUnitId: victim.id,
    });
    expect(ok).toBe(true);
    const squad = state.blue.units.filter((u) => u.alive && !u.hero);
    expect(squad.every((u) => u.targetId === victim.id)).toBe(true);
    // A força marcha até o alcance e abre fogo: a vida do inimigo cai.
    const hpBefore = victim.hp;
    for (let i = 0; i < 1200 && state.running && victim.hp >= hpBefore; i++) {
      victim.order = "manter";
      stepBattle(state, 0.1);
    }
    expect(victim.hp).toBeLessThan(hpBefore);
  });

  it("reposicionar manda a unidade selecionada para cima do alvo e ela o ataca", () => {
    const state = createBattle(testConfig({ duration: 300 }));
    const attacker = place(state, "blue", "inf-fuzileiros", 50, 80);
    const victim = place(state, "red", "inf-fuzileiros", 50, 40);
    victim.order = "manter";
    const ok = reposition(
      state,
      "blue",
      { unitId: attacker.id },
      { x: victim.x, y: victim.y, targetUnitId: victim.id },
      { holdAtArrival: false },
    );
    expect(ok).toBe(true);
    expect(attacker.targetId).toBe(victim.id);
    const hpBefore = victim.hp;
    for (let i = 0; i < 1200 && state.running && victim.hp >= hpBefore; i++) {
      victim.order = "manter";
      keepAlive(state, "blue", attacker);
      stepBattle(state, 0.1);
    }
    expect(victim.hp).toBeLessThan(hpBefore);
  });

  it("clique numa estrutura inimiga manda a força destruí-la", () => {
    const state = createBattle(testConfig({ duration: 300 }));
    const tower = state.structures.find((s) => s.side === "red" && s.kind === "torre")!;
    state.blue.command = 999;
    state.blue.deck.hand[0] = { cardId: "inf-antitanque", ready: true };
    const ok = deploy(state, "blue", "inf-antitanque", tower.x, tower.y + tower.radius + 3, {
      x: tower.x,
      y: tower.y + tower.radius + 3,
      holdAtArrival: false,
      targetStructureId: tower.id,
    });
    expect(ok).toBe(true);
    expect(
      state.blue.units.filter((u) => u.alive && !u.hero).every((u) => u.attackStructureId === tower.id),
    ).toBe(true);
    const hpBefore = tower.hp;
    for (let i = 0; i < 3000 && state.running && tower.hp >= hpBefore; i++) {
      for (const u of state.blue.units) if (u.alive && !u.hero) u.hp = u.maxHp;
      stepBattle(state, 0.1);
    }
    expect(tower.hp).toBeLessThan(hpBefore);
  });
});

describe("motor de batalha — desgaste (atrito de campanha)", () => {
  it("na zona de suprimento da base própria a unidade não desgasta", () => {
    const state = createBattle(testConfig({ duration: 300 }));
    const home = baseOf(state, "blue");
    const u = place(state, "blue", "inf-fuzileiros", home.x + 2, home.y + 2);
    u.order = "manter"; // segura posição na base: mede só o atrito, sem marcha
    const hp = u.hp;
    for (let i = 0; i < 60; i++) {
      u.hp = hp; // isola o desgaste do combate
      stepBattle(state, 0.1);
    }
    expect(u.hp).toBe(hp);
  });

  it("longe de bases aliadas a unidade perde vida com o tempo", () => {
    const state = createBattle(testConfig({ duration: 300 }));
    const enemyBase = baseOf(state, "red");
    const u = place(state, "blue", "inf-fuzileiros", enemyBase.x - 6, enemyBase.y);
    const hp = u.hp;
    for (let i = 0; i < 100; i++) {
      u.hp = hp; // mede só o atrito, anulando dano de combate
      stepBattle(state, 0.1);
    }
    expect(u.hp).toBeLessThan(hp);
  });

  it("uma base avançada operacional abastece a tropa por perto (corta o desgaste)", () => {
    const state = createBattle(testConfig({ duration: 300 }));
    const enemyBase = baseOf(state, "red");
    const x = enemyBase.x - 6;
    const y = enemyBase.y;
    // Cria uma base avançada azul no local para servir de âncora logística.
    state.structures.push({
      ...state.structures[0]!,
      id: "adv-test",
      kind: "base-avancada",
      side: "blue",
      x,
      y,
      underConstruction: false,
      alive: true,
      hp: 500,
      maxHp: 500,
    } as Structure);
    const u = place(state, "blue", "inf-fuzileiros", x, y);
    const hp = u.hp;
    for (let i = 0; i < 60; i++) {
      u.hp = hp;
      stepBattle(state, 0.1);
    }
    expect(u.hp).toBe(hp);
  });
});

describe("motor de batalha — ciclo de contrapesos (ninguém é imbatível)", () => {
  // Ancora uma base aliada no local para cortar o atrito de campanha: aqui medimos
  // só o dano do combate, não o desgaste por distância.
  function supply(state: BattleState, side: Side, x: number, y: number): void {
    state.structures.push({
      ...state.structures[0]!,
      id: `sup-${side}-${state.structures.length}`,
      kind: "base-avancada",
      side,
      x,
      y,
      dmg: 0, // passiva: só abastece, não interfere na medição de dano
      range: 0,
      radius: 0.1, // fora de mira: não rouba o alvo do duelista
      underConstruction: false,
      alive: true,
      hp: 900,
      maxHp: 900,
    } as Structure);
  }

  // Mede o dano real aplicado por um atirador a um alvo, isolando o combate: as
  // unidades ficam lado a lado, "manter" e sem cobertura, e a diferença de vida é
  // lida após alguns disparos.
  function damageOf(
    state: BattleState,
    shooterId: string,
    targetId: string,
    side: Side,
    seconds = 4,
  ): number {
    // Duelo no CENTRO do mapa, longe das torres das bases: mede só o dano do
    // atirador sobre o alvo, sem interferência de estruturas defensivas.
    const cx = 92;
    const cy = 30;
    const shooter = place(state, side, shooterId, cx, cy);
    const foe = place(
      state,
      side === "blue" ? "red" : "blue",
      targetId,
      cx + shooter.range - 1,
      cy,
    );
    supply(state, side, cx, cy);
    // A âncora logística do alvo fica FORA do alcance do atirador, para não roubar a
    // mira (estruturas também são alvos).
    supply(state, side === "blue" ? "red" : "blue", foe.x + 14, foe.y);
    shooter.order = "manter";
    foe.order = "manter";
    foe.revealed = 999; // sempre visível: isola o combate do reconhecimento
    foe.maxHp = 100000;
    foe.hp = 100000;
    const before = foe.hp;
    for (let i = 0; i < seconds * 10 && state.running; i++) stepBattle(state, 0.1);
    return before - foe.hp;
  }

  // O atirador causa, contra um alvo, um dano proporcional ao seu multiplicador de
  // contrapeso. Comparar o MESMO atirador contra dois alvos isola o ciclo: as
  // diferenças de cadência/alcance somem e sobra a relação pedra-papel-tesoura.
  function ratio(shooterId: string, strongVs: string, weakVs: string): number {
    const s1 = createBattle(testConfig({ duration: 60 }));
    const strong = damageOf(s1, shooterId, strongVs, "blue");
    const s2 = createBattle(testConfig({ duration: 60 }));
    const weak = damageOf(s2, shooterId, weakVs, "blue");
    return strong / Math.max(1, weak);
  }

  it("o fuzileiro derruba infantaria, mas mal arranha o blindado", () => {
    expect(ratio("inf-fuzileiros", "inf-antitanque", "bld-tanque")).toBeGreaterThan(1.8);
  });

  it("o antitanque devasta o blindado, mas é fraco contra infantaria", () => {
    expect(ratio("inf-antitanque", "bld-tanque", "inf-fuzileiros")).toBeGreaterThan(1.8);
  });

  it("o tanque esmaga infantaria, mas apanha do caça-tanques", () => {
    expect(ratio("bld-tanque", "inf-fuzileiros", "bld-caca-tanques")).toBeGreaterThan(1.4);
  });

  it("a defesa antiaérea abate drone e é quase inútil contra terra", () => {
    expect(ratio("def-aa", "rec-drone-combate", "bld-tanque")).toBeGreaterThan(2);
  });
});

describe("motor de batalha — separar tropa", () => {
  it("separa o grupo: cada unidade vira sua própria frente", () => {
    const state = createBattle(testConfig({ duration: 120 }));
    state.blue.command = 200;
    state.blue.deck.hand[0] = { cardId: "inf-fuzileiros", ready: true };
    expect(
      deployBatch(state, "blue", [{ cardId: "inf-fuzileiros", count: 3 }], { x: 60, y: 46 }).ok,
    ).toBe(true);
    const units = state.blue.units.filter((u) => u.alive && !u.hero);
    const gid = units[0]!.groupId;
    expect(units.every((u) => u.groupId === gid)).toBe(true);
    expect(applyAction(state, { type: "separar", side: "blue", groupId: gid })).toEqual({
      ok: true,
    });
    const ids = new Set(state.blue.units.filter((u) => !u.hero).map((u) => u.groupId));
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe("motor de batalha — chanceler, prisão e escolta", () => {
  function heroConfig(overrides: Partial<BattleConfig> = {}): BattleConfig {
    const base = testConfig(overrides);
    base.heroSetup = [
      { side: "blue", status: "preso", x: 130, y: 46 },
      { side: "red", status: "livre", x: 150, y: 46 },
    ];
    base.heroDecisive = true;
    return base;
  }

  it("cria a prisão que mantém o chanceler azul cativo", () => {
    const state = createBattle(heroConfig());
    const prison = state.structures.find((s) => s.kind === "prisao")!;
    expect(prison).toBeTruthy();
    expect(prison.side).toBe("red"); // a prisão pertence ao adversário
    expect(prison.captiveSide).toBe("blue");
    expect(state.heroes.blue.state).toBe("preso");
    // Nenhum chanceler azul em campo enquanto estiver preso.
    expect(state.blue.units.some((u) => u.hero)).toBe(false);
  });

  it("destruir a prisão liberta o chanceler cativo em campo (fugindo até chegar em casa)", () => {
    const state = createBattle(heroConfig());
    const prison = state.structures.find((s) => s.kind === "prisao")!;
    prison.hp = 1;
    // Dano suficiente para derrubar a prisão.
    state.blue.command = 999;
    state.blue.deck.hand[0] = { cardId: "sup-aereo", ready: true };
    deploy(state, "blue", "sup-aereo", prison.x, prison.y);
    expect(prison.alive).toBe(false);
    expect(state.heroes.blue.state).toBe("fugindo");
    expect(state.blue.units.some((u) => u.hero && u.alive)).toBe(true);
  });

  it("eliminar o chanceler adversário encerra a partida em vitória", () => {
    // Neste cenário o NOSSO chanceler começa livre em campo (seguro para vencer).
    const base = testConfig({ duration: 300 });
    base.heroSetup = [
      { side: "blue", status: "livre", x: 34, y: 46 },
      { side: "red", status: "livre", x: 150, y: 46 },
    ];
    base.heroDecisive = true;
    const state = createBattle(base);
    const redHero = state.red.units.find((u) => u.hero)!;
    expect(redHero).toBeTruthy();
    redHero.hp = 1;
    state.blue.command = 999;
    state.blue.deck.hand[0] = { cardId: "sup-aereo", ready: true };
    deploy(state, "blue", "sup-aereo", redHero.x, redHero.y);
    expect(state.running).toBe(false);
    expect(state.outcome).toBe("vitoria");
    expect(state.heroes.red.state).toBe("morto");
  });

  it("perder o próprio chanceler é derrota imediata", () => {
    const state = createBattle(heroConfig());
    const prison = state.structures.find((s) => s.kind === "prisao")!;
    prison.hp = 1;
    state.blue.command = 999;
    state.blue.deck.hand[0] = { cardId: "sup-aereo", ready: true };
    deploy(state, "blue", "sup-aereo", prison.x, prison.y); // liberta o azul
    const blueHero = state.blue.units.find((u) => u.hero)!;
    blueHero.hp = 1;
    state.red.command = 999;
    state.red.deck.hand[0] = { cardId: "sup-aereo", ready: true };
    deploy(state, "red", "sup-aereo", blueHero.x, blueHero.y);
    expect(state.running).toBe(false);
    expect(state.outcome).toBe("derrota");
  });

  it("escolta: a tropa destacada orbita o chanceler sem encostar nele", () => {
    const state = createBattle(heroConfig());
    // Liberta o chanceler azul e traz uma escolta.
    const prison = state.structures.find((s) => s.kind === "prisao")!;
    prison.hp = 1;
    state.blue.command = 999;
    state.blue.deck.hand[0] = { cardId: "sup-aereo", ready: true };
    deploy(state, "blue", "sup-aereo", prison.x, prison.y);
    const hero = state.blue.units.find((u) => u.hero)!;
    // Traz o herói para perto da própria base, para a escolta alcançá-lo no teste.
    hero.x = 60;
    hero.y = 46;

    state.blue.command = 999;
    state.blue.deck.hand[0] = { cardId: "inf-fuzileiros", ready: true };
    expect(
      deploy(state, "blue", "inf-fuzileiros", 60, 46, { x: 60, y: 46, escortId: hero.id }),
    ).toBe(true);
    const escorts = state.blue.units.filter((u) => u.escortId === hero.id);
    expect(escorts.length).toBeGreaterThan(0);
    // Avança um tempo (mantendo o herói vivo): os escoltas devem fechar o cerco.
    for (let i = 0; i < 200 && state.running; i++) {
      keepAlive(state, "blue", hero);
      hero.x = 60;
      hero.y = 46;
      stepBattle(state, 0.1);
    }
    for (const e of escorts.filter((u) => u.alive)) {
      const d = dist(e.x, e.y, hero.x, hero.y);
      expect(d).toBeLessThan(hero.radius + 8);
      expect(d).toBeGreaterThan(hero.radius + 0.5); // não encosta no chanceler
    }
  });
});

describe("motor de batalha — economia de Sov finito", () => {
  it("o Sov NÃO regenera passivamente ao longo do tempo", () => {
    const state = createBattle(testConfig({ duration: 600 }));
    state.blue.command = 40;
    advance(state, 90);
    expect(state.blue.command).toBeCloseTo(40, 5);
  });

  it("cada território sob controle paga 50 Sov por minuto", () => {
    const state = createBattle(testConfig({ duration: 600 }));
    state.blue.command = 0;
    // Toma um território à força (o motor reconhece a posse real).
    for (const t of state.territories.slice(0, 1)) {
      t.owner = "blue";
      t.progress = { blue: 1, red: 0 };
    }
    advance(state, 61);
    expect(state.blue.command).toBeGreaterThanOrEqual(50);
  });
});

describe("motor de batalha — resgate exige extração (fugindo → seguro)", () => {
  function heroConfig(): BattleConfig {
    const base = testConfig({ duration: 300 });
    base.heroSetup = [
      { side: "blue", status: "preso", x: 118, y: 46 }, // preso longe, no lado vermelho
      { side: "red", status: "livre", x: 150, y: 46 },
    ];
    base.heroDecisive = true;
    return base;
  }

  it("resgatar NÃO vence sozinho: o chanceler sai fugindo e a partida segue", () => {
    const state = createBattle(heroConfig());
    const prison = state.structures.find((s) => s.kind === "prisao")!;
    prison.hp = 1;
    state.blue.command = 999;
    state.blue.deck.hand[0] = { cardId: "sup-aereo", ready: true };
    deploy(state, "blue", "sup-aereo", prison.x, prison.y);
    expect(prison.alive).toBe(false);
    expect(state.heroes.blue.state).toBe("fugindo"); // resgatado, mas ainda longe de casa
    // Matar o chanceler vermelho agora NÃO vence: o nosso ainda não está em segurança.
    const redHero = state.red.units.find((u) => u.hero)!;
    redHero.hp = 1;
    state.blue.deck.hand[0] = { cardId: "sup-aereo", ready: true };
    deploy(state, "blue", "sup-aereo", redHero.x, redHero.y);
    expect(state.heroes.red.state).toBe("morto");
    expect(state.running).toBe(true); // a guerra continua até a extração
  });

  it("trazer o chanceler de volta ao território controlado o torna 'seguro' e habilita a vitória", () => {
    const state = createBattle(heroConfig());
    const prison = state.structures.find((s) => s.kind === "prisao")!;
    prison.hp = 1;
    state.blue.command = 999;
    state.blue.deck.hand[0] = { cardId: "sup-aereo", ready: true };
    deploy(state, "blue", "sup-aereo", prison.x, prison.y);
    const blueHero = state.blue.units.find((u) => u.hero)!;
    // Extração: coloca o chanceler na zona de desdobramento azul.
    blueHero.x = 20;
    blueHero.y = 46;
    stepBattle(state, 0.1);
    expect(state.heroes.blue.state).toBe("seguro");
    // Agora sim: eliminar o chanceler vermelho vence.
    const redHero = state.red.units.find((u) => u.hero)!;
    redHero.hp = 1;
    state.blue.command = 999;
    state.blue.deck.hand[0] = { cardId: "sup-aereo", ready: true };
    deploy(state, "blue", "sup-aereo", redHero.x, redHero.y);
    expect(state.running).toBe(false);
    expect(state.outcome).toBe("vitoria");
  });
});

describe("motor de batalha — chanceler: atrito em marcha, regeneração parado", () => {
  function heroConfig(): BattleConfig {
    const base = testConfig({ duration: 300 });
    base.heroSetup = [
      { side: "blue", status: "livre", x: 34, y: 46 },
      { side: "red", status: "livre", x: 150, y: 46 },
    ];
    return base;
  }

  it("o desgaste de campanha NÃO mata o chanceler: ele regenera quando parado", () => {
    const state = createBattle(heroConfig());
    const hero = state.blue.units.find((u) => u.hero)!;
    // Longe da base e em marcha: o chanceler sofre atrito...
    hero.x = 70;
    hero.y = 10;
    hero.order = "avancar";
    hero.goalX = 70;
    hero.goalY = 78;
    const startHp = hero.hp;
    for (let i = 0; i < 120 && state.running; i++) {
      keepAlive(state, "blue", hero);
      stepBattle(state, 0.1);
    }
    // ...mas nunca abaixo de 1 de vida (o atrito não é fatal para o herói).
    expect(hero.hp).toBeGreaterThanOrEqual(1);

    // Parado e fora de combate: regenera de volta.
    delete hero.goalX;
    delete hero.goalY;
    hero.order = "manter";
    const low = Math.min(hero.hp, hero.maxHp);
    for (let i = 0; i < 200; i++) {
      keepAlive(state, "blue", hero);
      hero.engaged = false;
      hero.hitFlash = 0;
      stepBattle(state, 0.1);
    }
    expect(hero.hp).toBeGreaterThan(low);
    expect(hero.hp).toBeLessThanOrEqual(hero.maxHp);
    expect(hero.alive).toBe(true);
    expect(startHp).toBeGreaterThan(0);
  });
});

describe("motor de batalha — escolta automática ao derrubar a prisão", () => {
  function heroConfig(): BattleConfig {
    const base = testConfig({ duration: 300 });
    base.heroSetup = [
      { side: "blue", status: "preso", x: 118, y: 46 },
      { side: "red", status: "livre", x: 150, y: 46 },
    ];
    return base;
  }

  it("a tropa que destrói a prisão passa a escoltar o chanceler resgatado", () => {
    const state = createBattle(heroConfig());
    const prison = state.structures.find((s) => s.kind === "prisao")!;
    // Uma tropa azul já posicionada na área do resgate (vai aderir à escolta).
    const soldier = place(state, "blue", "inf-fuzileiros", prison.x - 2, prison.y + 2);
    expect(soldier.escortId).toBeUndefined();
    // Dano aéreo derruba a prisão e liberta o chanceler.
    prison.hp = 1;
    state.blue.command = 999;
    state.blue.deck.hand[0] = { cardId: "sup-aereo", ready: true };
    deploy(state, "blue", "sup-aereo", prison.x, prison.y);

    expect(state.heroes.blue.state).toBe("fugindo");
    const heroId = state.heroes.blue.unitId!;
    expect(soldier.escortId).toBe(heroId);
  });

  it("sem tropa na área, o resgate não cria escolta artificial", () => {
    const state = createBattle(heroConfig());
    const prison = state.structures.find((s) => s.kind === "prisao")!;
    prison.hp = 1;
    state.blue.command = 999;
    state.blue.deck.hand[0] = { cardId: "sup-aereo", ready: true };
    deploy(state, "blue", "sup-aereo", prison.x, prison.y);
    const heroId = state.heroes.blue.unitId!;
    const escorts = state.blue.units.filter((u) => u.alive && u.escortId === heroId);
    // Sem tropa na área não há escolta: o motor nunca inventa unidades.
    expect(escorts).toHaveLength(0);
  });
});

describe("motor de batalha — rota de fuga segura do chanceler", () => {
  it("o chanceler desvia de um bolsão de inimigos em vez de seguir reto", () => {
    const base = testConfig({ duration: 300 });
    base.heroSetup = [
      { side: "blue", status: "livre", x: 118, y: 46 }, // já perto do lado vermelho
      { side: "red", status: "livre", x: 150, y: 46 },
    ];
    const state = createBattle(base);
    const hero = state.blue.units.find((u) => u.hero)!;
    // Bloqueio inimigo exatamente no caminho reto de volta para casa (oeste).
    for (let i = 0; i < 6; i++) place(state, "red", "inf-fuzileiros", 100 - i * 4, 46);
    state.heroes.blue = { state: "fugindo", unitId: hero.id };
    hero.order = "avancar";
    stepBattle(state, 0.1);
    // O destino NÃO é uma reta direta ao oeste: a rota contorna o bloqueio (desvio em Y).
    const dy = Math.abs((hero.goalY ?? 46) - hero.y);
    expect(dy).toBeGreaterThan(3);
  });
});
