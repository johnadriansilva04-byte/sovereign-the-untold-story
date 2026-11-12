// Estrutura de progressão da campanha: o que cada capítulo libera e premia.
// A campanha ensina uma mecânica por vez; o PvP cobra todas ao mesmo tempo.

import { commanders } from "@/game/battle/catalog";
import {
  buildBattleConfig,
  enemyScalingForChapter,
  meanCardLevel,
  missionById,
  type NationState,
} from "@/game/battle/missions";
import type { BattleConfig } from "@/game/battle/types";
import {
  difficultyForChapter,
  modsFromAccessories,
  type Difficulty,
  type Reward,
} from "./catalog";
import {
  activeAccessories,
  cardLevelsForDeck,
  effectiveDeck,
  ownedCardIds,
  type ProfileState,
} from "./profile";

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

// A CARTA-PRÊMIO do capítulo: a carta que o INIMIGO traz para o campo e que só entra
// no arsenal se for CAPTURADA em combate (não basta vencer). Quando o capítulo não
// define uma carta própria, a primeira carta da recompensa é a que vai a campo.
export function prizeCardFor(chapterId: string): string | undefined {
  const meta = chapterMetaById(chapterId);
  return meta?.reward.cards?.[0];
}

// Cada capítulo libera exatamente uma ideia nova de jogo.
const chapterMetaBase: Omit<ChapterMeta, "difficulty">[] = [
  {
    id: "c1",
    number: 1,
    missionId: "m-apagao",
    reward: {
      research: 1,
      sovereigns: 120,
      techs: ["t1"],
    },
    rewardNote: "Você aprendeu a lutar. Agora precisa entender contra quem.",
    intro:
      "A luz cai. O sinal some. Um protesto que ninguém convocou fecha as ruas e você é chamado para segurar um centro de distribuição.",
    outro:
      "Você venceu. E a vitória só abriu a primeira porta de uma trilha que começa muito antes de você.",
    outroDerrota:
      "Você perdeu o centro de distribuição. As ruas ficaram escuras mais tempo do que deviam.",
  },
  {
    id: "c2",
    number: 2,
    missionId: "m-blecaute",
    requires: "c1",
    reward: {
      research: 1,
      sovereigns: 130,
      cards: ["sup-gas"],
    },
    rewardNote: "Você aprendeu que a guerra chega pela tomada e pelo cabo.",
    intro:
      "O blecaute foi só o começo: o ataque veio pela rede elétrica e pela rede de dados ao mesmo tempo.",
    outro:
      "Você segurou o nó de comunicações. A cidade voltou a respirar — e você percebeu que o inimigo tem dois mapas.",
    outroDerrota:
      "A rede caiu sob sua responsabilidade. O inimigo agora conhece o ponto exato onde você é frágil.",
  },
  {
    id: "c3",
    number: 3,
    missionId: "m-vozes",
    requires: "c2",
    reward: {
      research: 2,
      sovereigns: 150,
      cards: ["rec-drone"],
    },
    rewardNote: "Você aprendeu a enxergar a mão por trás das vozes.",
    intro: "As ruas ardem por causa de contas que não existem. A batalha agora é por narrativa.",
    outro:
      "Você desmontou a fábrica de bots. As ruas esvaziaram — mas a máquina só trocou de endereço.",
    outroDerrota:
      "A desinformação venceu a rodada. Você vai precisar de olhos melhores antes de lutar de novo.",
  },
  {
    id: "c4",
    number: 4,
    missionId: "m-fronteira",
    requires: "c3",
    reward: {
      research: 2,
      sovereigns: 160,
      techs: ["t8"],
    },
    rewardNote: "Você aprendeu que a floresta se lê antes de se defender.",
    intro: "A fronteira mais rica do país não tem cerca: tem rio, clareira e satélite.",
    outro:
      "Você dominou as clareiras e a rede adversária recuou para o escuro. A floresta guardou os seus segredos.",
    outroDerrota: "A floresta ficou sem olhos. Quem controla a informação controla a fronteira.",
  },
  {
    id: "c5",
    number: 5,
    missionId: "m-porto",
    requires: "c4",
    reward: {
      research: 2,
      sovereigns: 170,
      cards: ["inf-assalto"],
    },
    rewardNote: "Você entendeu que a economia é a retaguarda da guerra.",
    intro:
      "O porto é a veia aberta do país. Quem controla o cais controla o que entra e o que sai.",
    outro:
      "Você retomou o cais. A carga fantasma apareceu — e com ela, os nomes por trás da operação.",
    outroDerrota: "O cais caiu. O que entrou no país esta noite não estava em manifesto nenhum.",
  },
  {
    id: "c6",
    number: 6,
    missionId: "m-castello",
    requires: "c5",
    reward: {
      cards: ["inf-assalto"],
      techs: ["t10"],
      accessories: ["acc-cobra"],
      research: 1,
      sovereigns: 140,
    },
    rewardNote: "A Tropa de Montanha da FEB entra no seu baralho. A cobra vai fumar.",
    intro:
      "Neve. Fogo vindo do alto. Três ataques fracassados antes do seu. Monte Castello não cai por força — cai por leitura de terreno.",
    outro: "A cobra fumou. E você entendeu, na pele, o que custou cada metro daquele morro.",
    outroDerrota:
      "O morro continuou em mãos erradas. Cada ataque fracassado ensina o mesmo: terreno não se compra, se lê.",
  },
  {
    id: "c7",
    number: 7,
    missionId: "m-escalao",
    requires: "c6",
    reward: {
      research: 2,
      sovereigns: 150,
      cards: ["bld-vbld"],
    },
    rewardNote: "Anfíbios: agora você cruza rios e desembarca sob fogo.",
    intro:
      "O porto de Nápoles recebe o primeiro escalão da FEB. A cabeça de ponte precisa resistir.",
    outro:
      "A cabeça de ponte segurou. O primeiro escalão pisou em solo italiano — e a história começou a ser esquecida no mesmo dia.",
    outroDerrota: "O desembarque foi contestado. Sem cabeça de ponte, não há avanço.",
  },
  {
    id: "c8",
    number: 8,
    missionId: "m-montese",
    requires: "c7",
    reward: {
      research: 3,
      sovereigns: 200,
      cards: ["inf-fuzileiros"],
      accessories: ["acc-trincheira"],
    },
    rewardNote: "Kit de trincheira e fuzileiros de elite: sobreviver também é vencer.",
    intro: "Montese: a FEB enfrenta o combate urbano mais duro da campanha italiana.",
    outro:
      "Você tomou Montese rua por rua. A cidade mudou de mãos — e o preço foi medido em nomes.",
    outroDerrota:
      "Montese resistiu. Cada quarteirão perdido é uma lista de baixas que você vai ter de escrever.",
  },
  {
    id: "c9",
    number: 9,
    missionId: "m-fornovo",
    requires: "c8",
    reward: {
      research: 3,
      sovereigns: 210,
      techs: ["t13"],
      cards: ["inf-engenheiro"],
    },
    rewardNote: "Engenharia de combate: cerque, negue rotas, force a rendição.",
    intro: "O dispositivo alemão está cercado em Fornovo. Não é destruir: é forçar a rendição.",
    outro:
      "Você cercou e forçou a rendição. Dois generais entregaram as armas a pracinhas brasileiros.",
    outroDerrota: "O cerco se abriu e o dispositivo escapou. A rendição que era sua virou recuo.",
  },
  {
    id: "c10",
    number: 10,
    missionId: "m-desfile",
    requires: "c9",
    reward: {
      research: 2,
      sovereigns: 160,
      accessories: ["acc-radio"],
    },
    rewardNote: "Rádio de campanha: mais comando por segundo na mão.",
    intro:
      "Um desfile em homenagem aos heróis — enquanto os arquivos deles são descartados a poucos metros.",
    outro: "Você recuperou o que era seu. Mas a memória apagada não volta só com uma vitória.",
    outroDerrota:
      "Os arquivos foram descartados antes de você chegar. O esquecimento avançou um passo.",
  },
  {
    id: "c11",
    number: 11,
    missionId: "m-desmob",
    requires: "c10",
    reward: {
      research: 2,
      sovereigns: 170,
      cards: ["bld-vbld"],
    },
    rewardNote: "Reconhecimento blindado: enxergue a tempo de guardar o que importa.",
    intro: "O acervo dos pracinhas corre risco. O esquecimento não é acidente: é operação.",
    outro: "Você salvou o acervo. A memória da FEB ganhou um cofre — e um vigia.",
    outroDerrota: "O acervo foi perdido. Mais uma vez, os heróis viraram uma nota de rodapé.",
  },
  {
    id: "c12",
    number: 12,
    missionId: "m-trampolim",
    requires: "c11",
    reward: {
      cards: ["rec-drone"],
      techs: ["t8"],
      research: 2,
      sovereigns: 180,
    },
    rewardNote: "Reconhecimento aéreo: você passa a enxergar o que o inimigo esconde.",
    intro:
      "Parnamirim, ponte aérea para a África. Das trilhas, alguém controla o fluxo de informação.",
    outro: "Você mapeou a rede. E descobriu que amizade, às vezes, é uma doutrina militar.",
    outroDerrota:
      "A ponte aérea seguiu sem você. A rede continua lá, mais visível agora, porque você falhou em mapeá-la.",
  },
  {
    id: "c13",
    number: 13,
    missionId: "m-zecarioca",
    requires: "c12",
    reward: {
      research: 2,
      sovereigns: 185,
      cards: ["sup-recon-avancado"],
    },
    rewardNote: "Reconhecimento avançado: leia o terreno do imaginário.",
    intro: "Um papagaio simpático vende o Brasil para os brasileiros.",
    outro: "Você retomou a narrativa. O país voltou a se desenhar com o próprio traço.",
    outroDerrota: "A narrativa ficou com o outro lado. Uma imagem vale mais que um batalhão.",
  },
  {
    id: "c14",
    number: 14,
    missionId: "m-standard",
    requires: "c13",
    reward: {
      research: 3,
      sovereigns: 220,
      cards: ["art-obus"],
    },
    rewardNote: "Obuses: alcance e volume de fogo contra concentrações.",
    intro: "A trilha recua até a Standard Oil. O monopólio caiu no papel — a influência, não.",
    outro: "Você rompeu o cerco econômico. O petróleo voltou a ser uma questão de soberania.",
    outroDerrota: "O cerco apertou. Sem combustível, nenhuma operação avança.",
  },
  {
    id: "c15",
    number: 15,
    missionId: "m-lobato",
    requires: "c14",
    reward: {
      research: 3,
      sovereigns: 225,
      cards: ["mss-lmf"],
    },
    rewardNote: "Foguetes de campanha: saturação de área contra concentrações.",
    intro:
      "Monteiro Lobato denunciou os trustes e acabou preso. A pesquisa pelo petróleo é campo de batalha.",
    outro: "Você protegeu a pesquisa. O poço que não existia finalmente apareceu no mapa.",
    outroDerrota: "A sabotagem venceu. O poço continua 'não existindo' — e a dependência continua.",
  },
  {
    id: "c16",
    number: 16,
    missionId: "m-petroleo",
    requires: "c15",
    reward: {
      cards: ["mss-lmf"],
      techs: ["t7"],
      accessories: ["acc-obus-feb"],
      research: 2,
      sovereigns: 230,
    },
    rewardNote: "Foguetes e doutrina de obuses: saturação contra concentrações.",
    intro: "A nação escolheu lutar pela própria energia. O povo responde nas ruas.",
    outro: "O petróleo é nosso. E a pressão, você aprendeu, sempre vem de fora.",
    outroDerrota:
      "A pressão veio de fora e você cedeu. O petróleo é uma disputa longa — perder uma batalha não é perder a guerra.",
  },
  {
    id: "c17",
    number: 17,
    missionId: "m-fundacao",
    requires: "c16",
    reward: {
      research: 3,
      sovereigns: 235,
      accessories: ["acc-observacao"],
    },
    rewardNote: "Posto de observação: enxergue a agenda antes que ela seja escrita.",
    intro: "A fortuna do petróleo vira filantropia. Quem paga define a pauta.",
    outro: "Você segurou o centro de decisão. A agenda voltou a ser escrita em casa.",
    outroDerrota: "A agenda foi capturada. A partir de hoje, as decisões vêm de fora.",
  },
  {
    id: "c18",
    number: 18,
    missionId: "m-cafe",
    requires: "c17",
    reward: {
      research: 3,
      sovereigns: 240,
      cards: ["apo-posto"],
    },
    rewardNote: "Logística militar: sustente operações longas.",
    intro: "A crise de 1929 derruba o café e reordena o poder. A economia precede a guerra.",
    outro: "Você reorganizou a economia sob fogo. O país atravessou a depressão de pé.",
    outroDerrota: "A crise venceu a rodada. Sem economia, não há retaguarda para a guerra.",
  },
  {
    id: "c19",
    number: 19,
    missionId: "m-curriculo",
    requires: "c18",
    reward: {
      research: 3,
      sovereigns: 245,
      techs: ["t14"],
    },
    rewardNote: "Medicina militar: reduz baixas e melhora a recuperação.",
    intro: "Um relatório redesenha a medicina. Quem define a cura define o poder.",
    outro:
      "Você segurou os postos de saúde. O currículo voltou a ser escrito com as próprias mãos.",
    outroDerrota: "O currículo foi entregue. A partir de agora, a cura vem com bula de fora.",
  },
  {
    id: "c20",
    number: 20,
    missionId: "m-febre",
    requires: "c19",
    reward: {
      research: 3,
      sovereigns: 250,
      accessories: ["acc-trincheira"],
      cards: ["apo-posto"],
    },
    rewardNote: "Posto de socorro: mantenha as tropas vivas na linha de frente.",
    intro: "A epidemia e a influência avançam juntas. Salvar vidas e manter a soberania.",
    outro: "Você conteve o surto e manteve o comando sanitário. Saúde é soberania.",
    outroDerrota: "O surto avançou e o comando se perdeu. A porta ficou aberta.",
  },
  {
    id: "c21",
    number: 21,
    missionId: "m-berlim",
    requires: "c20",
    reward: {
      research: 4,
      sovereigns: 260,
      cards: ["bld-tanque"],
    },
    rewardNote: "Blindado pesado: rompa a ciência do controle com força de choque.",
    intro: "Um instituto transforma preconceito em método. A ciência pode ser arma.",
    outro: "Você bloqueou o posto. A teoria do controle perdeu o laboratório.",
    outroDerrota: "O posto resistiu. A teoria do controle ganhou mais um capítulo.",
  },
  {
    id: "c22",
    number: 22,
    missionId: "m-camelot",
    requires: "c21",
    reward: {
      research: 4,
      sovereigns: 270,
      accessories: ["acc-mapa"],
      techs: ["t5"],
    },
    rewardNote: "Logística militar: o país passa a sustentar operações longas.",
    intro:
      "Um posto militar mapeia a alma latino-americana. O mapa humano vale mais que o topográfico.",
    outro: "O posto central caiu. O mapa humano está nas suas mãos — e você aprendeu a lê-lo.",
    outroDerrota: "O posto resistiu. O mapa humano segue fora das suas mãos.",
  },
  {
    id: "c23",
    number: 23,
    missionId: "m-soa",
    requires: "c22",
    reward: {
      research: 4,
      sovereigns: 280,
      cards: ["bld-vbld"],
      accessories: ["acc-motorizada"],
    },
    rewardNote: "Coluna motorizada: mobilidade e poder de choque no seu baralho.",
    intro: "Uma doutrina importada forma os seus oficiais. A guerra começa na caserna.",
    outro: "Você retomou a formação militar. A doutrina voltou a falar português.",
    outroDerrota: "A doutrina importada venceu. Os oficiais continuam olhando para fora.",
  },
  {
    id: "c24",
    number: 24,
    missionId: "m-guatemala",
    requires: "c23",
    reward: {
      research: 4,
      sovereigns: 290,
      cards: ["sup-interferencia"],
      techs: ["t9"],
    },
    rewardNote: "Guerra eletrônica: cale a artilharia e os drones inimigos.",
    intro: "A Guatemala caiu antes do Brasil. O roteiro é o mesmo, muda o endereço.",
    outro: "Você impediu a operação. O roteiro do golpe perdeu a primeira página no Brasil.",
    outroDerrota: "A operação avançou. O roteiro chegou ao Brasil com o selo já pronto.",
  },
  {
    id: "c25",
    number: 25,
    missionId: "m-alianca",
    requires: "c24",
    reward: {
      research: 5,
      sovereigns: 300,
      cards: ["inf-engenheiro"],
    },
    rewardNote: "Engenharia de campanha: construa e sustente as suas próprias defesas.",
    intro: "A ajuda econômica chega com uma agenda embutida. Soberania se negocia ponto a ponto.",
    outro: "Você aceitou a ajuda sem entregar a agenda. O dinheiro entrou; a decisão, não.",
    outroDerrota: "A agenda foi entregue junto com o dinheiro. A reforma virou instrução.",
  },
  {
    id: "c26",
    number: 26,
    missionId: "m-cpi",
    requires: "c25",
    reward: {
      research: 5,
      sovereigns: 310,
      accessories: ["acc-observacao"],
      cards: ["bld-vbld"],
    },
    rewardNote: "Reconhecimento blindado: veja o que querem apagar antes que apaguem.",
    intro:
      "Uma CPI chega perto do topo da cadeia. Os documentos precisam sobreviver ao arquivamento.",
    outro: "As provas sobreviveram. A verdade ganhou um registro — e um número de processo.",
    outroDerrota: "As provas sumiram. A verdade foi arquivada com um carimbo.",
  },
  {
    id: "c27",
    number: 27,
    missionId: "m-torre",
    requires: "c26",
    reward: {
      research: 3,
      sovereigns: 250,
      cards: ["sup-interferencia"],
      techs: ["t9"],
    },
    rewardNote: "Guerra eletrônica: cale a artilharia e os drones inimigos.",
    intro: "Wardenclyffe, 1901. O financiamento foi retirado e a torre ficou no escuro.",
    outro: "A pesquisa fechou. Você ficou com a pergunta que não sai da cabeça.",
    outroDerrota: "A torre segue no escuro. A pergunta continua sem resposta.",
  },
  {
    id: "c28",
    number: 28,
    missionId: "m-3327",
    requires: "c27",
    reward: {
      research: 4,
      sovereigns: 260,
      cards: ["sup-recon-avancado"],
      accessories: ["acc-radio"],
    },
    rewardNote: "Reconhecimento avançado: encontre o que querem esconder.",
    intro: "Um inventor morre no esquecimento e o seu legado é confiscado.",
    outro: "Você recuperou os documentos. O legado de Tesla voltou a pertencer ao mundo.",
    outroDerrota: "Os documentos foram apreendidos. Mais uma ideia virou propriedade de outro.",
  },
  {
    id: "c29",
    number: 29,
    missionId: "m-corrente",
    requires: "c28",
    reward: {
      research: 4,
      sovereigns: 265,
      cards: ["def-fortificacao"],
      techs: ["t13"],
    },
    rewardNote: "Fortificação de campanha: proteja as suas instalações vitais.",
    intro: "A energia que poderia ser livre perdeu para a que pode ser cobrada.",
    outro: "Você rompeu o bloqueio e retomou a rede. A energia voltou a ter dono — o seu.",
    outroDerrota: "O bloqueio resistiu. A rede segue controlada por quem cobra o interruptor.",
  },
  {
    id: "c30",
    number: 30,
    missionId: "m-automovel",
    requires: "c29",
    reward: {
      research: 4,
      sovereigns: 270,
      cards: ["bld-tanque"],
      accessories: ["acc-blindagem"],
    },
    rewardNote: "Blindado pesado e blindagem reativa: a rua venceu — e você também.",
    intro: "O asfalto avança sobre os bairros. A cidade virou campo de batalha.",
    outro: "A rua venceu. Você aprendeu que uma comunidade organizada resiste.",
    outroDerrota: "A via avançou. A comunidade perdeu um quarteirão — e vai voltar.",
  },
  {
    id: "c31",
    number: 31,
    missionId: "m-rua",
    requires: "c30",
    reward: {
      research: 4,
      sovereigns: 280,
      accessories: ["acc-mapa"],
    },
    rewardNote: "Carta topográfica: leia a cidade como se lê um terreno.",
    intro:
      "A comunidade se organiza contra a via expressa. A rede que financia também pode ser vencida.",
    outro: "A rua venceu. Você aprendeu que uma comunidade organizada resiste.",
    outroDerrota: "A via avançou. Mas uma comunidade que se conhece não desaparece.",
  },
  {
    id: "c32",
    number: 32,
    missionId: "m-cidadeviva",
    requires: "c31",
    reward: {
      research: 4,
      sovereigns: 290,
      cards: ["inf-fuzileiros"],
      accessories: ["acc-trincheira"],
    },
    rewardNote: "Fuzileiros e trincheira: a infantaria defende a cidade casa a casa.",
    intro: "A cidade viva se organiza. A vizinhança vira linha de frente.",
    outro: "Você defendeu a vizinhança. A cidade viva resistiu — e continuou viva.",
    outroDerrota: "O plano avançou. A vizinhança perdeu ruas, mas não a memória.",
  },
  {
    id: "c33",
    number: 33,
    missionId: "m-mockingbird",
    requires: "c32",
    reward: {
      research: 3,
      sovereigns: 250,
      cards: ["sup-interferencia"],
    },
    rewardNote: "Guerra eletrônica: cale a rede que fabrica a narrativa.",
    intro: "Uma rede controla o que o país lê. A informação é o campo de batalha.",
    outro: "Você desmontou a rede de propaganda. A notícia voltou a ser notícia.",
    outroDerrota: "A rede venceu. A versão oficial foi publicada antes da verdade.",
  },
  {
    id: "c34",
    number: 34,
    missionId: "m-cointelpro",
    requires: "c33",
    reward: {
      research: 4,
      sovereigns: 300,
      cards: ["bld-vbld"],
      accessories: ["acc-observacao"],
    },
    rewardNote: "Posto de observação: enxergue o vigilante antes de ser vigiado.",
    intro: "O aparato vigia e infiltra organizações legais. A defesa é enxergar primeiro.",
    outro: "Você protegeu as organizações. A infiltração bateu em porta fechada.",
    outroDerrota: "A infiltração venceu. Mais um núcleo foi desmontado por dentro.",
  },
  {
    id: "c35",
    number: 35,
    missionId: "m-condor",
    requires: "c34",
    reward: {
      research: 4,
      sovereigns: 305,
      cards: ["bld-vbld"],
      accessories: ["acc-motorizada"],
    },
    rewardNote: "Coluna motorizada: cruze fronteiras e rompa as rotas da repressão.",
    intro: "A repressão cruzou fronteiras. A resposta também precisa cruzar.",
    outro: "Você rompeu as rotas. A rede de perseguição perdeu os seus nós.",
    outroDerrota: "A rede resistiu. As rotas continuam abertas — e os alvos, em risco.",
  },
  {
    id: "c36",
    number: 36,
    missionId: "m-gerasimov",
    requires: "c35",
    reward: {
      research: 5,
      sovereigns: 320,
      techs: ["t12"],
    },
    rewardNote: "Aviação de apoio: a doutrina híbrida exige resposta em todas as camadas.",
    intro: "A guerra moderna é descrita em um artigo. Você está dentro dele.",
    outro: "Você retomou as posições. A doutrina híbrida perdeu o elemento surpresa.",
    outroDerrota: "A doutrina avançou. A guerra sem declaração segue sem resposta.",
  },
  {
    id: "c37",
    number: 37,
    missionId: "m-hibridas",
    requires: "c36",
    reward: {
      research: 5,
      sovereigns: 330,
      cards: ["sup-reforcos"],
    },
    rewardNote: "Reforços: resposta rápida quando a crise é desenhada para te pegar sem tropa.",
    intro: "Uma operação muda o governo por dentro. A resposta tem de ser rápida.",
    outro: "Você desmontou a operação. A mudança de regime ficou sem o roteiro.",
    outroDerrota: "A operação avançou. O ponto de virada passou por você.",
  },
  {
    id: "c38",
    number: 38,
    missionId: "m-snowden",
    requires: "c37",
    reward: {
      research: 5,
      sovereigns: 340,
      cards: ["sup-interferencia"],
      techs: ["t9"],
    },
    rewardNote: "Guerra eletrônica: quem cega a vigilância controla a rede.",
    intro: "A vigilância alcança chefes de Estado e empresas. O cabo virou arma.",
    outro: "Você protegeu a infraestrutura. A vigilância perdeu o acesso — e o país, o segredo.",
    outroDerrota: "A vigilância manteve o acesso. Tudo que você fez foi ouvido.",
  },
  {
    id: "c39",
    number: 39,
    missionId: "m-petrobras",
    requires: "c38",
    reward: {
      research: 5,
      sovereigns: 345,
      cards: ["def-aa"],
    },
    rewardNote: "Defesa antiaérea: proteja o perímetro contra olhos e asas.",
    intro: "A maior empresa do país é alvo. A economia está sob vigilância.",
    outro: "Você selou o perímetro. A coleta perdeu o acesso ao coração econômico.",
    outroDerrota: "A coleta venceu. O balanço do país está nas mãos de outro.",
  },
  {
    id: "c40",
    number: 40,
    missionId: "m-stuxnet",
    requires: "c39",
    reward: {
      research: 5,
      sovereigns: 350,
      cards: ["sup-reparo"],
      techs: ["t15"],
    },
    rewardNote: "Sistemas de manutenção: reponha o que a sabotagem destrói.",
    intro: "Uma arma cibernética ataca instalações físicas. Código e aço na mesma batalha.",
    outro: "Você bloqueou a sabotagem. A instalação resistiu ao ataque invisível.",
    outroDerrota: "A sabotagem venceu. A instalação caiu sem um único tiro.",
  },
  {
    id: "c41",
    number: 41,
    missionId: "m-cambridge",
    requires: "c40",
    reward: {
      research: 5,
      sovereigns: 360,
      cards: ["sup-gas"],
      accessories: ["acc-radio"],
    },
    rewardNote: "Cortina de fumaça: esconda as suas posições de quem lê os seus dados.",
    intro: "Dados viram mira. O cidadão vira perfil — e o perfil, alvo.",
    outro: "Você protegeu os dados. O eleitor voltou a ser cidadão, não perfil.",
    outroDerrota: "Os dados vazaram. O voto foi escrito antes de ser depositado.",
  },
  {
    id: "c42",
    number: 42,
    missionId: "m-trolls",
    requires: "c41",
    reward: {
      research: 5,
      sovereigns: 370,
      cards: ["sup-interferencia"],
      techs: ["t9"],
    },
    rewardNote: "Guerra eletrônica: cale a fábrica que industrializa a mentira.",
    intro: "A mentira virou linha de montagem. A fábrica produz divisão.",
    outro: "Você derrubou a fábrica. A divisão perdeu o fornecedor.",
    outroDerrota: "A fábrica continuou produzindo. A divisão segue em estoque.",
  },
  {
    id: "c43",
    number: 43,
    missionId: "m-pegasus",
    requires: "c42",
    reward: {
      research: 6,
      sovereigns: 380,
      cards: ["sup-evacuacao"],
      accessories: ["acc-observacao"],
    },
    rewardNote: "Evacuação aeromédica: retire os alvos antes que o sigilo caia.",
    intro: "O espião cabe no bolso. Qualquer celular é uma janela aberta.",
    outro: "Você protegeu os alvos. O sigilo resistiu à invasão invisível.",
    outroDerrota: "Os alvos foram expostos. O sigilo caiu sem um único alarme.",
  },
  {
    id: "c44",
    number: 44,
    missionId: "m-5g",
    requires: "c43",
    reward: {
      research: 6,
      sovereigns: 390,
      cards: ["bld-vbld"],
      techs: ["t12"],
    },
    rewardNote: "Aviação de apoio: a soberania digital exige resposta em todas as camadas.",
    intro: "A infraestrutura de rede é o prêmio. Quem controla o fluxo, controla o país.",
    outro: "Você garantiu a soberania digital. O fluxo de dados voltou a ser seu.",
    outroDerrota:
      "A infraestrutura ficou com o outro lado. O fluxo de dados tem dono — e não é você.",
  },
  {
    id: "c45",
    number: 45,
    missionId: "m-deepfake",
    requires: "c44",
    reward: {
      research: 6,
      sovereigns: 400,
      cards: ["sup-recon-avancado"],
      accessories: ["acc-mapa"],
    },
    rewardNote: "Reconhecimento avançado: separe o real do sintético antes de agir.",
    intro: "A fala falsa pode derrubar um governo. A dúvida virou arma.",
    outro: "Você protegeu a verdade verificável. A falsificação perdeu o palco.",
    outroDerrota: "A falsificação venceu. A dúvida se espalhou mais rápido que a prova.",
  },
  {
    id: "c46",
    number: 46,
    missionId: "m-ouroazul",
    requires: "c45",
    reward: {
      research: 6,
      sovereigns: 410,
      cards: ["apo-posto"],
      techs: ["t15"],
    },
    rewardNote: "Sistemas de manutenção: sustente a defesa das fontes por tempo indefinido.",
    intro: "A água é o petróleo do século. A floresta, a sua refinaria.",
    outro: "Você protegeu as fontes. A água e a floresta seguem sendo do país.",
    outroDerrota: "As fontes foram cercadas. O século XXI começou a ser cobrado pela torneira.",
  },
  {
    id: "c47",
    number: 47,
    missionId: "m-arquivos",
    requires: "c46",
    reward: {
      research: 6,
      sovereigns: 420,
      cards: ["rec-drone"],
      accessories: ["acc-observacao"],
    },
    rewardNote: "Posto de observação: veja o tabuleiro inteiro antes de mover.",
    intro: "Vazamentos expõem a infraestrutura oculta. A guerra secreta virou mapa.",
    outro: "Você mapeou as operações. A infraestrutura oculta perdeu o disfarce.",
    outroDerrota: "As operações seguem ocultas. O tabuleiro continua escondido.",
  },
  {
    id: "c48",
    number: 48,
    missionId: "m-brics",
    requires: "c47",
    reward: {
      research: 7,
      sovereigns: 430,
      cards: ["inf-engenheiro"],
      techs: ["t5"],
    },
    rewardNote: "Logística militar: uma alternativa financeira precisa de retaguarda real.",
    intro: "A dependência do dólar é o alvo. A moeda é uma arma.",
    outro: "Você construiu a alternativa. O bloqueio financeiro perdeu o efeito.",
    outroDerrota: "O bloqueio resistiu. A dependência continua amarrando o país.",
  },
  {
    id: "c49",
    number: 49,
    missionId: "m-tabuleiro",
    requires: "c48",
    reward: {
      research: 7,
      sovereigns: 450,
      cards: ["bld-tanque"],
      accessories: ["acc-blindagem"],
    },
    rewardNote: "Blindado pesado e blindagem: rompa a rede híbrida com força de choque.",
    intro: "Todas as peças se conectam. A guerra híbrida perdeu o disfarce.",
    outro: "Você desmontou a rede. O país voltou a ver o próprio tabuleiro.",
    outroDerrota: "A rede resistiu. O tabuleiro continua nas mãos de outro.",
  },
  {
    id: "c50",
    number: 50,
    missionId: "m-final",
    requires: "c49",
    reward: {
      research: 8,
      sovereigns: 500,
      xp: 1000,
    },
    rewardNote: "A guerra nunca acabou. Só trocou de uniforme — e agora tem nome.",
    intro:
      "De volta ao presente. Você conhece o terreno, as armas e os heróis. A guerra híbrida perdeu o disfarce.",
    outro:
      "Você venceu a guerra que ninguém contou. Agora sabe quem você é, de onde veio, e por que nunca esteve em paz.",
    outroDerrota:
      "A guerra híbrida ganhou esta rodada. Você conhece o terreno e os heróis — agora precisa de uma resposta à altura.",
  },
];

export const chapterMeta: ChapterMeta[] = chapterMetaBase.map((meta) => ({
  ...meta,
  difficulty: difficultyForChapter(meta.number),
}));

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
  const nation: NationState = profile.nation;
  const activeDeck = profile.decks.find((d) => d.id === profile.activeDeckId) ?? profile.decks[0];
  const commander = commanders.find((c) => c.id === activeDeck?.commanderId) ?? commanders[0]!;
  const levels = cardLevelsForDeck(profile);
  const scale = enemyScalingForChapter(meta.number, meanCardLevel(levels));
  return buildBattleConfig({
    nation,
    mission,
    chapterNumber: meta.number,
    deck: effectiveDeck(profile),
    ownedCardIds: ownedCardIds(profile),
    commander,
    doctrine: activeDeck?.doctrine ?? commander.doctrine,
    mods: modsFromAccessories(activeAccessories(profile)),
    cardLevels: levels,
    aiDifficulty: scale.aiDifficulty,
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
