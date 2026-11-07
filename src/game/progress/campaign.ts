// Estrutura de progressão da campanha: o que cada capítulo libera e premia.
// A campanha ensina uma mecânica por vez; o PvP cobra todas ao mesmo tempo.

import { commanders } from "@/game/battle/catalog";
import { buildBattleConfig, missionById, type NationState } from "@/game/battle/missions";
import type { BattleConfig } from "@/game/battle/types";
import { difficultyById, modsFromAccessories, type Difficulty, type Reward } from "./catalog";
import { activeAccessories, effectiveDeck, type ProfileState } from "./profile";

export interface ChapterMeta {
  id: string;
  number: number;
  missionId: string;
  difficulty: Difficulty;
  requires?: string; // capítulo anterior
  reward: Reward;
  // texto curto mostrado na tela de recompensa
  rewardNote: string;
  // enquadramento narrativo: tensão antes, consequência depois
  intro: string;
  outro: string; // desfecho em caso de vitória
  outroDerrota?: string; // desfecho em caso de derrota (cai em um texto padrão se ausente)
}

// Cada capítulo libera exatamente uma ideia nova de jogo.
export const chapterMeta: ChapterMeta[] = [
  {
    id: "c1",
    number: 1,
    missionId: "m-apagao",
    difficulty: "recruta",
    reward: { research: 1, sovereigns: 120, techs: ["t1"] },
    intro:
      "A luz cai. O sinal some. Um protesto que ninguém convocou fecha as ruas e você é chamado para segurar um centro de distribuição — sem saber contra quem está lutando.",
    outro:
      "Você venceu. E a vitória só abriu a primeira porta de uma trilha que começa muito antes de você.",
    outroDerrota:
      "Você perdeu o centro de distribuição. As ruas ficaram escuras mais tempo do que deviam — e alguém, em algum lugar, anotou que você recuou.",
    rewardNote: "Você aprendeu a lutar. Agora precisa entender contra quem.",
  },
  {
    id: "c2",
    number: 2,
    missionId: "m-castello",
    difficulty: "veterano",
    requires: "c1",
    reward: {
      cards: ["inf-montanha"],
      techs: ["t10"],
      accessories: ["acc-cobra"],
      research: 1,
      sovereigns: 140,
    },
    intro:
      "Neve. Fogo vindo do alto. Três ataques fracassados antes do seu. Monte Castello não cai por força — cai por leitura de terreno.",
    outro: "A cobra fumou. E você entendeu, na pele, o que custou cada metro daquele morro.",
    outroDerrota:
      "O morro continuou em mãos erradas. Cada ataque fracassado ensina o mesmo: terreno não se compra, se lê.",
    rewardNote: "A Tropa de Montanha da FEB entra no seu baralho. A cobra vai fumar.",
  },
  {
    id: "c3",
    number: 3,
    missionId: "m-desfile",
    difficulty: "veterano",
    requires: "c2",
    reward: { accessories: ["acc-radio"], research: 2, sovereigns: 160 },
    intro:
      "Um desfile em homenagem aos heróis — enquanto os arquivos deles são descartados a poucos metros. Alguém escolta o esquecimento.",
    outro: "Você recuperou o que era seu. Mas a memória apagada não volta só com uma vitória.",
    outroDerrota:
      "Os arquivos foram descartados antes de você chegar. O esquecimento avançou um passo — e agora você sabe que ele é organizado.",
    rewardNote: "Rádio de campanha: mais comando por segundo na mão.",
  },
  {
    id: "c4",
    number: 4,
    missionId: "m-trampolim",
    difficulty: "veterano",
    requires: "c3",
    reward: { cards: ["rec-drone"], techs: ["t8"], research: 2, sovereigns: 180 },
    intro:
      "Parnamirim, ponte aérea para a África. Das trilhas e clareiras da floresta, alguém controla o fluxo de informação — e não é quem você pensa.",
    outro: "Você mapeou a rede. E descobriu que amizade, às vezes, é uma doutrina militar.",
    outroDerrota:
      "A ponte aérea seguiu sem você. A rede continua lá, mais visível agora, porque você falhou em mapeá-la a tempo.",
    rewardNote: "Reconhecimento aéreo: você passa a enxergar o que o inimigo esconde.",
  },
  {
    id: "c5",
    number: 5,
    missionId: "m-petroleo",
    difficulty: "elite",
    requires: "c4",
    reward: {
      cards: ["art-foguete"],
      techs: ["t7"],
      accessories: ["acc-obus-feb"],
      research: 2,
      sovereigns: 220,
    },
    intro:
      "Trustes sabotam a busca pelo petróleo. O povo responde nas ruas. O fogo de saturação é a única resposta para quem se concentra.",
    outro: "O petróleo é nosso. E a pressão, você aprendeu, sempre vem de fora.",
    outroDerrota:
      "A pressão veio de fora e você cedeu. O petróleo é uma disputa longa — perder uma batalha não é perder a guerra, mas dói igual.",
    rewardNote: "Foguetes de campanha. Saturação de área contra concentrações.",
  },
  {
    id: "c6",
    number: 6,
    missionId: "m-torre",
    difficulty: "elite",
    requires: "c5",
    reward: {
      cards: ["sup-interferencia"],
      techs: ["t9"],
      accessories: ["acc-observacao"],
      research: 3,
      sovereigns: 240,
    },
    intro:
      "Wardenclyffe, 1901. O financiamento foi retirado e a torre ficou no escuro. O que não pode ser medido não pode ser vendido.",
    outro:
      "A pesquisa fechou. Mas você ficou com a pergunta que não sai da cabeça: por que o inventor que iluminou o século morreu sozinho?",
    outroDerrota:
      "A torre segue no escuro. A pergunta continua sem resposta: por que o inventor que iluminou o século morreu sozinho?",
    rewardNote: "Guerra eletrônica: cale a artilharia e os drones inimigos.",
  },
  {
    id: "c7",
    number: 7,
    missionId: "m-curriculo",
    difficulty: "elite",
    requires: "c6",
    reward: { techs: ["t14"], accessories: ["acc-trincheira"], research: 3, sovereigns: 260 },
    intro:
      "Febre amarela, escolas de medicina, currículos em disputa. A ajuda chega no mesmo envelope da influência.",
    outro:
      "Você segurou as posições. Quem financia a escola define o currículo — e você aprendeu a ler as entrelinhas.",
    outroDerrota:
      "As posições caíram. Quem financia a escola define o currículo — e você ainda não aprendeu a ler as entrelinhas.",
    rewardNote: "Medicina militar e kit de trincheira: sobreviver também é vencer.",
  },
  {
    id: "c8",
    number: 8,
    missionId: "m-camelot",
    difficulty: "soberano",
    requires: "c7",
    reward: { techs: ["t5"], accessories: ["acc-mapa"], research: 3, sovereigns: 280 },
    intro:
      "Para conduzir um povo, primeiro é preciso descrevê-lo. Pesquisadores infiltrados mapeiam as províncias em silêncio.",
    outro:
      "O posto central caiu. O mapa humano vale mais que o topográfico — e agora está nas suas mãos.",
    outroDerrota:
      "O posto central resistiu. O mapa humano segue fora das suas mãos — e quem descreve um povo pode conduzi-lo.",
    rewardNote: "Logística militar: o país passa a sustentar operações longas.",
  },
  {
    id: "c9",
    number: 9,
    missionId: "m-rua",
    difficulty: "elite",
    requires: "c8",
    reward: {
      cards: ["bld-pesado"],
      techs: ["t6"],
      accessories: ["acc-blindagem"],
      research: 3,
      sovereigns: 300,
    },
    intro:
      "Uma via expressa quer cortar os bairros ao meio. Do outro lado, uma comunidade que se conhece. Davi contra Golias, quarteirão por quarteirão.",
    outro:
      "A rua venceu. Você aprendeu que uma comunidade organizada resiste — e que a rede que financia também pode ser vencida.",
    outroDerrota:
      "A rua perdeu desta vez. Mas uma comunidade que se conhece não desaparece: ela se reorganiza e volta.",
    rewardNote: "Blindado pesado e blindagem reativa. A rua venceu — e você também.",
  },
  {
    id: "c10",
    number: 10,
    missionId: "m-brothersam",
    difficulty: "soberano",
    requires: "c9",
    reward: {
      cards: ["bld-anfibio"],
      techs: ["t11"],
      accessories: ["acc-motorizada"],
      research: 4,
      sovereigns: 340,
    },
    intro:
      "Uma frota pronta no Atlântico. Documentos liberados mostram o plano: tomar o país sem desembarcar um único soldado.",
    outro:
      "Você segurou a travessia. Quem controla a ponte controla o fluxo — e o fluxo era o país inteiro.",
    outroDerrota:
      "A travessia avançou. Quem controla a ponte controla o fluxo — e você precisa retomá-la antes que o fluxo vire o país inteiro.",
    rewardNote: "Anfíbios e coluna motorizada: agora você cruza qualquer terreno.",
  },
  {
    id: "c11",
    number: 11,
    missionId: "m-final",
    difficulty: "llm",
    requires: "c10",
    reward: { research: 6, sovereigns: 500, xp: 1000 },
    intro:
      "De volta ao presente. Você conhece o terreno, as armas e os heróis. A guerra híbrida perdeu o disfarce — e vai ter resposta.",
    outro:
      "Você venceu a guerra que ninguém contou. Agora sabe quem você é, de onde veio, e por que nunca esteve em paz.",
    outroDerrota:
      "A guerra híbrida ganhou esta rodada. Você conhece o terreno e os heróis — agora precisa de uma resposta à altura.",
    rewardNote: "A guerra nunca acabou. Só trocou de uniforme — e agora tem nome.",
  },
];

export const chapterMetaById = (id: string): ChapterMeta | undefined =>
  chapterMeta.find((c) => c.id === id);

export const chapterMetaByMission = (missionId: string): ChapterMeta | undefined =>
  chapterMeta.find((c) => c.missionId === missionId);

export const totalChapters = chapterMeta.length;

// Recompensa agregada de todos os capítulos (usada na tela de coleção).
export const allRewardCards = Array.from(new Set(chapterMeta.flatMap((c) => c.reward.cards ?? [])));
export const allRewardAccessories = Array.from(
  new Set(chapterMeta.flatMap((c) => c.reward.accessories ?? [])),
);

// Configuração de batalha pronta para um capítulo: usa o baralho ativo do jogador,
// aplica os acessórios equipados e converte a dificuldade do capítulo em parâmetros de IA.
export function battleConfigForChapter(
  chapterId: string,
  profile: ProfileState,
  seed = 20260101,
): BattleConfig | null {
  const meta = chapterMetaById(chapterId);
  if (!meta) return null;
  const mission = missionById(meta.missionId);
  const def = difficultyById(meta.difficulty);
  const nation: NationState = profile.nation;
  const activeDeck = profile.decks.find((d) => d.id === profile.activeDeckId) ?? profile.decks[0];
  const commander = commanders.find((c) => c.id === activeDeck?.commanderId) ?? commanders[0]!;
  return buildBattleConfig({
    nation,
    mission,
    deck: effectiveDeck(profile),
    commander,
    doctrine: activeDeck?.doctrine ?? commander.doctrine,
    mods: modsFromAccessories(activeAccessories(profile)),
    aiDifficulty: {
      intervalMult: def.aiIntervalMult,
      commandMult: def.aiCommandMult,
      reserveBonus: def.aiReserveBonus,
      isLlm: def.isLlm,
    },
    seed,
  });
}

// Texto de desfecho conforme o resultado: vitória lê o "outro"; derrota tem um texto próprio
// (ou um padrão) para nunca mostrar a narrativa de vitória depois de perder.
export function chapterOutro(meta: ChapterMeta, outcome: "vitoria" | "derrota" | "empate"): string {
  if (outcome === "vitoria") return meta.outro;
  return (
    meta.outroDerrota ??
    "A batalha foi perdida, mas a guerra continua. Reorganize as forças e tente de novo."
  );
}
