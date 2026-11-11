// Ponte entre a camada geopolítica (campanha, nação, árvore tecnológica) e a batalha.
// É aqui que "o que o país construiu" define "o que o jogador consegue fazer no campo".
// A economia dá vantagens marginais (regeneração, teto de comando), nunca vitória comprada.

import {
  allCards,
  allDoctrines,
  arenaByTerrain,
  cardById,
  commanders,
  startingDeck,
} from "./catalog";
import type {
  AiDifficulty,
  Arena,
  BattleConfig,
  BattleOutcome,
  BattleResult,
  Commander,
  Doctrine,
  ObjectiveKind,
  SideConfig,
  SideModifiers,
  TerrainKind,
} from "./types";

// ---------------------------------------------------------------------------
// Estado da nação (protótipo local; no jogo final vira tabela do back-end)
// ---------------------------------------------------------------------------

export interface NationState {
  countryId: string;
  countryName: string;
  flag: string;
  techs: string[]; // ids desbloqueados na árvore tecnológica
  military: number; // 0-100
  gdp: number; // bilhões
  stability: number; // 0-100
  industry: number; // 0-100 (define reposição de blindados)
  logistics: number; // 0-100 (define sustentação)
  influence: number; // 0-100 (influência diplomática)
}

export const defaultNation: NationState = {
  countryId: "br",
  countryName: "Brasil",
  flag: "🇧🇷",
  techs: ["t1", "t4", "t10", "t8"],
  military: 61,
  gdp: 2170,
  stability: 54,
  industry: 62,
  logistics: 55,
  influence: 40,
};

const STORAGE_KEY = "sovereign.nation.v1";

export function loadNation(): NationState {
  if (typeof localStorage === "undefined") return defaultNation;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultNation;
    return { ...defaultNation, ...(JSON.parse(raw) as Partial<NationState>) };
  } catch {
    return defaultNation;
  }
}

export function saveNation(nation: NationState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nation));
  } catch {
    /* ambiente sem storage: ignora */
  }
}

// Cartas liberadas pela situação real do país.
export function unlockedDeck(nation: NationState): string[] {
  const unlocked = allCards.filter(
    (c) => !c.unlocksTech || c.unlocksTech.every((t) => nation.techs.includes(t)),
  );
  const ids = unlocked.map((c) => c.id);
  // sempre inclui o baralho inicial
  return Array.from(new Set([...startingDeck, ...ids]));
}

// Bônus econômico: vantagem pequena e limitada — não substitui habilidade.
export function economyBonus(nation: NationState): number {
  const gdpFactor = Math.min(1, nation.gdp / 3000);
  const stabilityFactor = nation.stability / 100;
  const raw = 0.02 + gdpFactor * 0.05 + stabilityFactor * 0.03;
  return Math.round(Math.min(0.1, raw) * 1000) / 1000;
}

export function commandCapacity(nation: NationState): number {
  return 10 + Math.round(nation.logistics / 40); // 10 a 13
}

export function regenRate(nation: NationState): number {
  return 0.85 + nation.military / 400; // ~0.85 a 1.1 por segundo
}

// ---------------------------------------------------------------------------
// Missões
// ---------------------------------------------------------------------------

export interface MissionDef {
  id: string;
  name: string;
  act: string;
  terrain: TerrainKind;
  objectiveKind: ObjectiveKind;
  objectiveText: string;
  duration: number;
  missionNote: string;
  brief: string;
  enemyCountry: { id: string; name: string; flag: string; commanderId: string; doctrine: Doctrine };
  operational?: { controlPointId: string; seconds: number };
  militaryThreshold?: number;
}

// Cada missão nasce de um capítulo da campanha. O terreno vem da narrativa
// (Monte Castello é montanha; o apagão é cidade; a travessia é rio).
export const missions: MissionDef[] = [
  {
    id: "m-apagao",
    name: "Operação Apagão",
    act: "Ato I · O Presente",
    terrain: "Cidade",
    objectiveKind: "operacional",
    objectiveText: "Proteja o centro de distribuição e sobreviva à pressão urbana.",
    duration: 300,
    missionNote: "Você luta sem saber contra quem. Vença para descobrir.",
    brief:
      "Sem luz, sem sinal, boatos por todo lado. Mantenha o centro de distribuição do bairro sob controle até o fim da janela de crise.",
    enemyCountry: {
      id: "us",
      name: "Forças Irregulares",
      flag: "🕶️",
      commanderId: "cmd-duarte",
      doctrine: "Mobilidade",
    },
    operational: { controlPointId: "cp-c", seconds: 45 },
  },
  {
    id: "m-blecaute",
    name: "Nó Cego",
    act: "Ato I · O Presente",
    terrain: "Cidade",
    objectiveKind: "operacional",
    objectiveText: "Defenda o centro de dados e restabeleça as comunicações.",
    duration: 300,
    missionNote: "Quando a luz e o dado caem juntos, a cidade vira refém.",
    brief:
      "Um ataque coordenado derruba energia e dados juntos. Segure o nó de comunicações enquanto as equipes restabelecem a rede.",
    enemyCountry: {
      id: "us",
      name: "Célula Cibernética",
      flag: "💻",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
    operational: { controlPointId: "cp-c", seconds: 50 },
  },
  {
    id: "m-vozes",
    name: "Cortina de Fumaça Digital",
    act: "Ato I · O Presente",
    terrain: "Cidade",
    objectiveKind: "militar",
    objectiveText: "Neutralize a capacidade de combate adversária — os núcleos de desinformação.",
    duration: 300,
    missionNote: "A primeira baixa de uma guerra híbrida é a verdade.",
    brief:
      "Robôs e perfis falsos coordenam a narrativa. Derrube os núcleos que alimentam o caos antes que a rua se perca.",
    enemyCountry: {
      id: "us",
      name: "Fábrica de Bots",
      flag: "🤖",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
    militaryThreshold: 0.7,
  },
  {
    id: "m-fronteira",
    name: "Olhos na Floresta",
    act: "Ato I · O Presente",
    terrain: "Floresta",
    objectiveKind: "territorial",
    objectiveText: "Domine as clareiras e negue a rede ao adversário.",
    duration: 300,
    missionNote: "A Amazônia não é cenário. É alvo.",
    brief:
      "Sensores, drones e trilhas disputam a informação na maior fronteira do país. Reconhecimento vale mais que blindagem.",
    enemyCountry: {
      id: "us",
      name: "Rede Extrativista",
      flag: "🌳",
      commanderId: "cmd-duarte",
      doctrine: "Mobilidade",
    },
  },
  {
    id: "m-porto",
    name: "Cais 7",
    act: "Ato I · O Presente",
    terrain: "Cidade",
    objectiveKind: "territorial",
    objectiveText: "Segure os pontos do porto e impeça a operação fantasma.",
    duration: 300,
    missionNote: "O que entra e sai do porto conta uma história que ninguém lê.",
    brief:
      "Um carregamento estratégico some dos registros oficiais. Controle o cais e os sistemas antes que a carga desapareça.",
    enemyCountry: {
      id: "us",
      name: "Sindicato Fantasma",
      flag: "⚓",
      commanderId: "cmd-sarmiento",
      doctrine: "Mecanizada",
    },
  },
  {
    id: "m-castello",
    name: "Monte Castello",
    act: "Ato II · A Descoberta",
    terrain: "Montanha",
    objectiveKind: "territorial",
    objectiveText: "Avance montanha acima e capture o cume (Cume Norte).",
    duration: 360,
    missionNote: "A cobra vai fumar. Onde a FEB lutou quatro vezes.",
    brief:
      "Neve, fogo vindo do alto e quatro ataques fracassados antes deste. Use as passagens e negue o cume ao inimigo.",
    enemyCountry: {
      id: "de",
      name: "Defesa Alemã",
      flag: "⚫",
      commanderId: "cmd-lima",
      doctrine: "Defesa territorial",
    },
  },
  {
    id: "m-escalao",
    name: "General Mann",
    act: "Ato II · A Descoberta",
    terrain: "Travessia de rio",
    objectiveKind: "operacional",
    objectiveText: "Proteja o desembarque e assegure a cabeça de ponte.",
    duration: 300,
    missionNote: "O Brasil entrou na guerra pelo mar, não pelo livro.",
    brief:
      "O navio de transporte chega ao porto sob ameaça. Segure a cabeça de ponte até o último pracinha desembarcar.",
    enemyCountry: {
      id: "us",
      name: "Defesa Costeira",
      flag: "⚓",
      commanderId: "cmd-lima",
      doctrine: "Defesa territorial",
    },
    operational: { controlPointId: "cp-c", seconds: 45 },
  },
  {
    id: "m-montese",
    name: "Montese",
    act: "Ato II · A Descoberta",
    terrain: "Cidade",
    objectiveKind: "militar",
    objectiveText: "Neutralize a capacidade de combate adversária na cidade.",
    duration: 360,
    missionNote: "A batalha mais sangrenta da FEB. Casa a casa.",
    brief: "Combate urbano casa a casa. A infantaria e o apoio decidem cada quarteirão.",
    enemyCountry: {
      id: "de",
      name: "Defesa Alemã",
      flag: "⚫",
      commanderId: "cmd-lima",
      doctrine: "Defesa territorial",
    },
    militaryThreshold: 0.72,
  },
  {
    id: "m-fornovo",
    name: "Fornovo",
    act: "Ato II · A Descoberta",
    terrain: "Campo aberto",
    objectiveKind: "operacional",
    objectiveText: "Cerque e force a rendição das forças adversárias.",
    duration: 300,
    missionNote: "Cerca de 15 mil homens e dois generais se rendem à FEB.",
    brief: "Cerca o dispositivo inimigo e negue as rotas de fuga até a rendição.",
    enemyCountry: {
      id: "us",
      name: "148ª Divisão",
      flag: "⚫",
      commanderId: "cmd-lima",
      doctrine: "Defesa territorial",
    },
    operational: { controlPointId: "cp-c", seconds: 50 },
  },
  {
    id: "m-desfile",
    name: "Desfile Interrompido",
    act: "Ato II · A Descoberta",
    terrain: "Cidade",
    objectiveKind: "militar",
    objectiveText: "Mantenha as posições enquanto os arquivos são preservados.",
    duration: 300,
    missionNote: "Vitória real, memória apagada. Não deixe apagarem de novo.",
    brief:
      "Os arquivos dos veteranos estão sendo descartados enquanto o desfile acontece. Destrua o dispositivo que os escolta.",
    enemyCountry: {
      id: "us",
      name: "Segurança Contratada",
      flag: "🕶️",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
    militaryThreshold: 0.7,
  },
  {
    id: "m-desmob",
    name: "Arquivo Vivo",
    act: "Ato II · A Descoberta",
    terrain: "Cidade",
    objectiveKind: "operacional",
    objectiveText: "Proteja o acervo e negue o avanço sobre a memória.",
    duration: 300,
    missionNote: "Quem apaga um povo começa apagando os seus arquivos.",
    brief:
      "Uma operação tenta sumir com o acervo dos veteranos. Segure o prédio e as rotas até a retirada dos documentos.",
    enemyCountry: {
      id: "us",
      name: "Departamento de Arquivo",
      flag: "📁",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
    operational: { controlPointId: "cp-n", seconds: 45 },
  },
  {
    id: "m-trampolim",
    name: "Trampolim da Vitória",
    act: "Ato III · A Trilha do Dinheiro",
    terrain: "Floresta",
    objectiveKind: "territorial",
    objectiveText: "Mapeie e domine as redes de influência na região.",
    duration: 300,
    missionNote: "Da amizade nasce a doutrina. Nem tudo que ajuda é neutro.",
    brief:
      "Parnamirim, ponte aérea para a África. Domine as trilhas e clareiras para revelar quem controla o fluxo.",
    enemyCountry: {
      id: "us",
      name: "Missão Cultural",
      flag: "🎬",
      commanderId: "cmd-duarte",
      doctrine: "Mobilidade",
    },
  },
  {
    id: "m-zecarioca",
    name: "Alô, Amigos",
    act: "Ato III · A Trilha do Dinheiro",
    terrain: "Cidade",
    objectiveKind: "territorial",
    objectiveText: "Assuma o controle das narrativas culturais na cidade.",
    duration: 300,
    missionNote: "A boa vizinhança foi a primeira operação cultural do século.",
    brief:
      "O imaginário é o campo. Domine os pontos de influência cultural antes que a versão oficial se consolide.",
    enemyCountry: {
      id: "us",
      name: "Departamento Cultural",
      flag: "🎥",
      commanderId: "cmd-duarte",
      doctrine: "Mobilidade",
    },
  },
  {
    id: "m-standard",
    name: "A Linha de Fogo",
    act: "Ato III · A Trilha do Dinheiro",
    terrain: "Campo aberto",
    objectiveKind: "territorial",
    objectiveText: "Rompa o cerco econômico e retome os poços.",
    duration: 300,
    missionNote: "Quem controla o combustível controla o movimento.",
    brief:
      "Monopólio, preços e sabotagem. Rompa o cerco e retome o controle dos pontos de extração.",
    enemyCountry: {
      id: "us",
      name: "Truste do Petróleo",
      flag: "🛢️",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
  },
  {
    id: "m-lobato",
    name: "O Poço Que Não Existe",
    act: "Ato III · A Trilha do Dinheiro",
    terrain: "Campo aberto",
    objectiveKind: "militar",
    objectiveText: "Neutralize a sabotagem e proteja as frentes de pesquisa.",
    duration: 300,
    missionNote: "Quem impede o poço não precisa invadir o país.",
    brief:
      "Sabotagem, boatos e pressão sobre a pesquisa. Proteja as equipes e as frentes de perfuração.",
    enemyCountry: {
      id: "us",
      name: "Consórcio Estrangeiro",
      flag: "🏦",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
    militaryThreshold: 0.7,
  },
  {
    id: "m-petroleo",
    name: "Campanha do Petróleo",
    act: "Ato III · A Trilha do Dinheiro",
    terrain: "Campo aberto",
    objectiveKind: "territorial",
    objectiveText: "Mantenha os poços sob controle popular até o fim.",
    duration: 300,
    missionNote: "O petróleo é nosso. A pressão vem de fora.",
    brief:
      "Trustes sabotam a busca; o povo responde nas ruas. Segure os pontos de extração até a estabilidade aguentar.",
    enemyCountry: {
      id: "us",
      name: "Truste do Petróleo",
      flag: "🛢️",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
  },
  {
    id: "m-fundacao",
    name: "A Mão Invisível",
    act: "Ato III · A Trilha do Dinheiro",
    terrain: "Cidade",
    objectiveKind: "operacional",
    objectiveText: "Segure o centro de decisão e negue a captura da agenda.",
    duration: 300,
    missionNote: "Ajuda real e influência real podem vir no mesmo envelope.",
    brief:
      "O financiamento não é neutro. Segure os pontos de decisão antes que a agenda seja escrita por outro.",
    enemyCountry: {
      id: "us",
      name: "Conselho Filantrópico",
      flag: "🏛️",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
    operational: { controlPointId: "cp-c", seconds: 50 },
  },
  {
    id: "m-cafe",
    name: "A Grande Depressão",
    act: "Ato III · A Trilha do Dinheiro",
    terrain: "Campo aberto",
    objectiveKind: "territorial",
    objectiveText: "Reorganize as posições econômicas sob crise.",
    duration: 300,
    missionNote: "Antes do tanque, passa o preço do café.",
    brief:
      "A crise derruba preços e o poder. Reorganize as posições antes que o colapso vire ocupação.",
    enemyCountry: {
      id: "us",
      name: "Comitê Financeiro",
      flag: "📉",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
  },
  {
    id: "m-curriculo",
    name: "O Currículo",
    act: "Ato IV · A Ciência da Influência",
    terrain: "Floresta",
    objectiveKind: "territorial",
    objectiveText: "Reorganize as posições de saúde pública sob pressão.",
    duration: 300,
    missionNote: "Quem financia a escola define o currículo.",
    brief: "Reforma, cortes e fechamentos. Reorganize os postos de saúde sem entregar o currículo.",
    enemyCountry: {
      id: "us",
      name: "Comitê de Reforma",
      flag: "⚕️",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
  },
  {
    id: "m-febre",
    name: "Saúde Soberana",
    act: "Ato IV · A Ciência da Influência",
    terrain: "Floresta",
    objectiveKind: "territorial",
    objectiveText: "Contenha o surto e proteja a autonomia sanitária.",
    duration: 300,
    missionNote: "A ajuda chega no mesmo envelope da influência.",
    brief:
      "Epidemia e influência avançam juntas. Contenha o surto sem entregar o comando sanitário.",
    enemyCountry: {
      id: "us",
      name: "Missão Sanitária",
      flag: "🦟",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
  },
  {
    id: "m-berlim",
    name: "A Ciência do Controle",
    act: "Ato IV · A Ciência da Influência",
    terrain: "Cidade",
    objectiveKind: "militar",
    objectiveText: "Bloqueie o posto de pesquisa e negue a ciência do controle.",
    duration: 300,
    missionNote: "Estudar um povo é o primeiro passo para governá-lo.",
    brief: "Ciência a serviço do controle. Bloqueie o posto antes que a teoria vire política.",
    enemyCountry: {
      id: "us",
      name: "Instituto de Eugenia",
      flag: "🧬",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
    militaryThreshold: 0.7,
  },
  {
    id: "m-camelot",
    name: "Camelot",
    act: "Ato IV · A Ciência da Influência",
    terrain: "Montanha",
    objectiveKind: "operacional",
    objectiveText: "Descubra e bloqueie o posto de mapeamento social.",
    duration: 300,
    missionNote: "Para conduzir um povo, primeiro é preciso descrevê-lo.",
    brief:
      "Pesquisadores infiltrados mapeiam as províncias. Encontre o posto central e mantenha-o sob controle.",
    enemyCountry: {
      id: "us",
      name: "Projeto Camelot",
      flag: "📐",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
    operational: { controlPointId: "cp-n", seconds: 45 },
  },
  {
    id: "m-soa",
    name: "A Doutrina",
    act: "Ato IV · A Ciência da Influência",
    terrain: "Campo aberto",
    objectiveKind: "militar",
    objectiveText: "Enfrente a doutrina importada e retome a formação militar.",
    duration: 300,
    missionNote: "Quem forma o oficial decide de que lado ele luta.",
    brief:
      "Uma doutrina estrangeira forma os seus oficiais. Enfrente-a no campo e retome a formação.",
    enemyCountry: {
      id: "us",
      name: "Corpo de Oficiais",
      flag: "🎖️",
      commanderId: "cmd-sarmiento",
      doctrine: "Mecanizada",
    },
    militaryThreshold: 0.7,
  },
  {
    id: "m-guatemala",
    name: "Operação PBSUCCESS",
    act: "Ato IV · A Ciência da Influência",
    terrain: "Floresta",
    objectiveKind: "operacional",
    objectiveText: "Impeça a operação de desestabilização na região.",
    duration: 300,
    missionNote: "O roteiro do golpe foi escrito na Guatemala antes de ser lido no Brasil.",
    brief:
      "Uma operação estrangeira desestabiliza o vizinho. Impeça o roteiro antes que ele chegue ao Brasil.",
    enemyCountry: {
      id: "us",
      name: "Agentes Encobertos",
      flag: "🕶️",
      commanderId: "cmd-duarte",
      doctrine: "Mobilidade",
    },
    operational: { controlPointId: "cp-c", seconds: 50 },
  },
  {
    id: "m-alianca",
    name: "O Envelope",
    act: "Ato IV · A Ciência da Influência",
    terrain: "Cidade",
    objectiveKind: "territorial",
    objectiveText: "Negocie a ajuda sem entregar a agenda.",
    duration: 300,
    missionNote: "Dinheiro com contrato não é caridade.",
    brief: "Ajuda chega com condições. Segure os pontos de decisão sem entregar a agenda nacional.",
    enemyCountry: {
      id: "us",
      name: "Missão de Cooperação",
      flag: "🤝",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
  },
  {
    id: "m-cpi",
    name: "Os Documentos",
    act: "Ato IV · A Ciência da Influência",
    terrain: "Cidade",
    objectiveKind: "operacional",
    objectiveText: "Proteja as provas e leve a investigação até o fim.",
    duration: 300,
    missionNote: "Quem controla o arquivo controla a história.",
    brief: "A CPI vai ser arquivada. Proteja as provas e os arquivos até a verdade vir a público.",
    enemyCountry: {
      id: "us",
      name: "Comissão de Inquérito",
      flag: "📜",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
    operational: { controlPointId: "cp-c", seconds: 45 },
  },
  {
    id: "m-torre",
    name: "A Torre",
    act: "Ato V · Energia e Cidades",
    terrain: "Campo aberto",
    objectiveKind: "operacional",
    objectiveText: "Proteja a estação de transmissão até a pesquisa concluir.",
    duration: 300,
    missionNote: "O que não pode ser medido não pode ser vendido.",
    brief:
      "Wardenclyffe, 1901. O financiamento foi retirado. Segure a torre e as equipes até a pesquisa fechar.",
    enemyCountry: {
      id: "us",
      name: "Consórcio Morgan",
      flag: "🏦",
      commanderId: "cmd-lima",
      doctrine: "Defesa territorial",
    },
    operational: { controlPointId: "cp-c", seconds: 50 },
  },
  {
    id: "m-3327",
    name: "Quarto 3327",
    act: "Ato V · Energia e Cidades",
    terrain: "Cidade",
    objectiveKind: "operacional",
    objectiveText: "Recupere os documentos e negue a captura do legado.",
    duration: 300,
    missionNote: "Um homem que iluminou o século morreu no escuro.",
    brief:
      "O inventor morreu e o legado está em risco. Recupere os documentos antes que sejam apreendidos.",
    enemyCountry: {
      id: "us",
      name: "Office of Alien Property",
      flag: "🗄️",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
    operational: { controlPointId: "cp-c", seconds: 50 },
  },
  {
    id: "m-corrente",
    name: "A Guerra das Correntes",
    act: "Ato V · Energia e Cidades",
    terrain: "Campo aberto",
    objectiveKind: "territorial",
    objectiveText: "Rompa o bloqueio energético e retome a rede.",
    duration: 300,
    missionNote: "A energia que se cobra venceu a energia que se compartilha.",
    brief: "Dois modelos de energia se enfrentam. Rompa o bloqueio e retome o controle da rede.",
    enemyCountry: {
      id: "us",
      name: "Consórcio Elétrico",
      flag: "⚡",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
  },
  {
    id: "m-automovel",
    name: "A Rua",
    act: "Ato V · Energia e Cidades",
    terrain: "Cidade",
    objectiveKind: "territorial",
    objectiveText: "Segure os bairros e negue a via que corta a cidade.",
    duration: 300,
    missionNote: "A cidade é o último campo de batalha da guerra híbrida.",
    brief: "Uma via expressa quer cortar os bairros ao meio. Segure as praças e o parque.",
    enemyCountry: {
      id: "us",
      name: "Consórcio Rodoviário",
      flag: "🏗️",
      commanderId: "cmd-sarmiento",
      doctrine: "Mecanizada",
    },
  },
  {
    id: "m-rua",
    name: "Washington Square",
    act: "Ato V · Energia e Cidades",
    terrain: "Cidade",
    objectiveKind: "territorial",
    objectiveText: "Organize os bairros e bloqueie a via expressa.",
    duration: 300,
    missionNote: "Uma comunidade que se conhece resiste.",
    brief:
      "Jane Jacobs enfrentou a via expressa e venceu. Segure as praças e o parque contra o projeto.",
    enemyCountry: {
      id: "us",
      name: "Associação Empresarial",
      flag: "🏗️",
      commanderId: "cmd-sarmiento",
      doctrine: "Mecanizada",
    },
  },
  {
    id: "m-cidadeviva",
    name: "Diversidade",
    act: "Ato V · Energia e Cidades",
    terrain: "Cidade",
    objectiveKind: "militar",
    objectiveText: "Defenda a vizinhança e negue o plano que a apaga.",
    duration: 300,
    missionNote: "A cidade viva é uma forma de resistência.",
    brief: "O plano quer apagar a vizinhança. Defenda as ruas vivas e negue o avanço.",
    enemyCountry: {
      id: "us",
      name: "Planejamento Central",
      flag: "📐",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
  },
  {
    id: "m-mockingbird",
    name: "A Operação Silenciosa",
    act: "Ato VI · A Máquina de Guerra",
    terrain: "Cidade",
    objectiveKind: "militar",
    objectiveText: "Neutralize a rede de propaganda e retome a informação.",
    duration: 300,
    missionNote: "Quando a notícia é operação, o jornalista é soldado.",
    brief:
      "Uma rede controla a notícia. Derrube os nós de propaganda antes que a versão oficial se fixe.",
    enemyCountry: {
      id: "us",
      name: "Rede de Imprensa",
      flag: "📰",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
  },
  {
    id: "m-cointelpro",
    name: "Ameaça Interna",
    act: "Ato VI · A Máquina de Guerra",
    terrain: "Cidade",
    objectiveKind: "operacional",
    objectiveText: "Proteja as organizações e negue a infiltração.",
    duration: 300,
    missionNote: "Chamar o adversário de 'interno' é o primeiro passo para persegui-lo.",
    brief:
      "O aparato vigia e infiltra organizações legais. Proteja os núcleos e negue a infiltração.",
    enemyCountry: {
      id: "us",
      name: "Departamento de Vigilância",
      flag: "🕵️",
      commanderId: "cmd-duarte",
      doctrine: "Mobilidade",
    },
    operational: { controlPointId: "cp-c", seconds: 45 },
  },
  {
    id: "m-condor",
    name: "Rotas do Silêncio",
    act: "Ato VI · A Máquina de Guerra",
    terrain: "Floresta",
    objectiveKind: "operacional",
    objectiveText: "Rompas as rotas da repressão transfronteiriça.",
    duration: 300,
    missionNote: "A repressão ganhou um mapa que não respeitava fronteiras.",
    brief: "Uma rede persegue opositores além-fronteiras. Rompa as rotas e liberte os alvos.",
    enemyCountry: {
      id: "us",
      name: "Coordenação Repressiva",
      flag: "⛓️",
      commanderId: "cmd-lima",
      doctrine: "Defesa territorial",
    },
    operational: { controlPointId: "cp-c", seconds: 50 },
  },
  {
    id: "m-gerasimov",
    name: "Guerra Sem Declaração",
    act: "Ato VI · A Máquina de Guerra",
    terrain: "Montanha",
    objectiveKind: "territorial",
    objectiveText: "Enfrente a doutrina híbrida e retome as posições.",
    duration: 300,
    missionNote: "A guerra moderna não começa com um tiro. Começa com uma notícia.",
    brief: "A doutrina híbrida mistura tudo. Enfrente-a no terreno e retome as posições-chave.",
    enemyCountry: {
      id: "us",
      name: "Doutrina Híbrida",
      flag: "🕸️",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
  },
  {
    id: "m-hibridas",
    name: "Revolução de Cores",
    act: "Ato VI · A Máquina de Guerra",
    terrain: "Cidade",
    objectiveKind: "operacional",
    objectiveText: "Desmonte a operação de mudança de regime.",
    duration: 300,
    missionNote: "Derrubar um governo virou serviço de engenharia social.",
    brief: "Uma operação muda o governo por dentro. Desmonte os núcleos antes do ponto de virada.",
    enemyCountry: {
      id: "us",
      name: "Operação Não Convencional",
      flag: "🎭",
      commanderId: "cmd-duarte",
      doctrine: "Mobilidade",
    },
    operational: { controlPointId: "cp-c", seconds: 45 },
  },
  {
    id: "m-snowden",
    name: "O Grande Ouvido",
    act: "Ato VI · A Máquina de Guerra",
    terrain: "Cidade",
    objectiveKind: "militar",
    objectiveText: "Proteja a infraestrutura digital e negue a vigilância.",
    duration: 300,
    missionNote: "O que era segredo virou manchete. A guerra estava no cabo.",
    brief: "A vigilância alcança tudo. Proteja a infraestrutura crítica e negue o acesso.",
    enemyCountry: {
      id: "us",
      name: "Programa de Vigilância",
      flag: "📡",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
    militaryThreshold: 0.7,
  },
  {
    id: "m-petrobras",
    name: "Perímetro",
    act: "Ato VI · A Máquina de Guerra",
    terrain: "Cidade",
    objectiveKind: "operacional",
    objectiveText: "Segure o perímetro industrial e negue a coleta de dados.",
    duration: 300,
    missionNote: "A economia é alvo militar. O balanço é mapa de guerra.",
    brief:
      "A maior empresa do país está sendo espionada. Segure o perímetro industrial e negue a coleta.",
    enemyCountry: {
      id: "us",
      name: "Célula de Coleta",
      flag: "💾",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
    operational: { controlPointId: "cp-c", seconds: 50 },
  },
  {
    id: "m-stuxnet",
    name: "Código e Aço",
    act: "Ato VI · A Máquina de Guerra",
    terrain: "Região fortificada",
    objectiveKind: "operacional",
    objectiveText: "Bloqueie a sabotagem cibernética da instalação.",
    duration: 300,
    missionNote: "A primeira arma cibernética a causar dano físico mudou a guerra.",
    brief:
      "Uma arma cibernética ataca instalações físicas. Bloqueie a sabotagem antes que a instalação caia.",
    enemyCountry: {
      id: "us",
      name: "Verme Industrial",
      flag: "🖥️",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
    operational: { controlPointId: "cp-c", seconds: 50 },
  },
  {
    id: "m-cambridge",
    name: "O Perfil",
    act: "Ato VII · A Guerra Híbrida",
    terrain: "Cidade",
    objectiveKind: "militar",
    objectiveText: "Proteja os dados dos cidadãos e negue a manipulação.",
    duration: 300,
    missionNote: "Quem lê o seu perfil pode escrever o seu voto.",
    brief: "Dados são usados para manipular o voto. Proteja os cidadãos e negue a segmentação.",
    enemyCountry: {
      id: "us",
      name: "Corporação de Dados",
      flag: "📊",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
    militaryThreshold: 0.7,
  },
  {
    id: "m-trolls",
    name: "Trolls",
    act: "Ato VII · A Guerra Híbrida",
    terrain: "Cidade",
    objectiveKind: "militar",
    objectiveText: "Derrube a fábrica de propaganda estatal.",
    duration: 300,
    missionNote: "A mentira industrializada é uma arma de Estado.",
    brief: "Uma agência industrializa a mentira. Derrube os núcleos que inflamam a divisão.",
    enemyCountry: {
      id: "us",
      name: "Fábrica de Trolls",
      flag: "🧌",
      commanderId: "cmd-duarte",
      doctrine: "Mobilidade",
    },
  },
  {
    id: "m-pegasus",
    name: "O Celular na Mesa",
    act: "Ato VII · A Guerra Híbrida",
    terrain: "Cidade",
    objectiveKind: "operacional",
    objectiveText: "Proteja os alvos e negue a invasão.",
    duration: 300,
    missionNote: "O espião agora cabe no bolso do alvo.",
    brief: "Um software invade qualquer telefone. Proteja os alvos antes que o sigilo caia.",
    enemyCountry: {
      id: "us",
      name: "Fornecedor de Software",
      flag: "📱",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
    operational: { controlPointId: "cp-n", seconds: 45 },
  },
  {
    id: "m-5g",
    name: "A Antena",
    act: "Ato VII · A Guerra Híbrida",
    terrain: "Região fortificada",
    objectiveKind: "territorial",
    objectiveText: "Dispute a infraestrutura e garanta a soberania digital.",
    duration: 300,
    missionNote: "Quem instala a antena controla o que passa por ela.",
    brief: "A infraestrutura de rede é o prêmio. Dispute-a e garanta o controle do fluxo de dados.",
    enemyCountry: {
      id: "us",
      name: "Consórcio de Rede",
      flag: "📶",
      commanderId: "cmd-sarmiento",
      doctrine: "Mecanizada",
    },
  },
  {
    id: "m-deepfake",
    name: "A Prova",
    act: "Ato VII · A Guerra Híbrida",
    terrain: "Cidade",
    objectiveKind: "militar",
    objectiveText: "Proteja a verdade verificável e negue a falsificação.",
    duration: 300,
    missionNote: "A dúvida é mais barata que a verdade — e mais eficaz.",
    brief:
      "Uma fala falsa pode derrubar um governo. Proteja a verdade verificável e negue a falsificação.",
    enemyCountry: {
      id: "us",
      name: "Estúdio Sintético",
      flag: "🎭",
      commanderId: "cmd-duarte",
      doctrine: "Mobilidade",
    },
  },
  {
    id: "m-ouroazul",
    name: "Ouro Azul",
    act: "Ato VII · A Guerra Híbrida",
    terrain: "Floresta",
    objectiveKind: "territorial",
    objectiveText: "Proteja as fontes e negue a apropriação estratégica.",
    duration: 300,
    missionNote: "O próximo petróleo é azul e corre nos rios.",
    brief: "A água e a floresta são o prêmio do século. Proteja as fontes e negue a apropriação.",
    enemyCountry: {
      id: "us",
      name: "Consórcio da Água",
      flag: "💧",
      commanderId: "cmd-lima",
      doctrine: "Defesa territorial",
    },
  },
  {
    id: "m-arquivos",
    name: "Wikileaks",
    act: "Ato VIII · Soberano",
    terrain: "Montanha",
    objectiveKind: "operacional",
    objectiveText: "Mapeie as operações e negue a infraestrutura oculta.",
    duration: 300,
    missionNote: "A guerra secreta deixou de ser secreta — e virou mapa.",
    brief:
      "Vazamentos expõem a infraestrutura secreta. Mapeie as operações e negue os postos ocultos.",
    enemyCountry: {
      id: "us",
      name: "Rede de Bases",
      flag: "📡",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
    operational: { controlPointId: "cp-n", seconds: 50 },
  },
  {
    id: "m-brics",
    name: "O Banco do Sul",
    act: "Ato VIII · Soberano",
    terrain: "Campo aberto",
    objectiveKind: "territorial",
    objectiveText: "Construa a alternativa financeira e negue o bloqueio.",
    duration: 300,
    missionNote: "A moeda é uma arma. Quem imprime, comanda.",
    brief: "A dependência financeira é o alvo. Construa a alternativa e negue o bloqueio.",
    enemyCountry: {
      id: "us",
      name: "Bloco Financeiro",
      flag: "🏦",
      commanderId: "cmd-varela",
      doctrine: "Operações combinadas",
    },
  },
  {
    id: "m-tabuleiro",
    name: "O Tabuleiro",
    act: "Ato VIII · Soberano",
    terrain: "Região fortificada",
    objectiveKind: "militar",
    objectiveText: "Desmonte a rede híbrida e retome o controle do país.",
    duration: 360,
    missionNote: "Tudo que você aprendeu era uma única guerra.",
    brief: "Todas as peças se conectam. Desmonte a rede híbrida e retome o controle do país.",
    enemyCountry: {
      id: "us",
      name: "Rede Híbrida",
      flag: "🕸️",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
    militaryThreshold: 0.7,
  },
  {
    id: "m-final",
    name: "A Cobra Vai Fumar",
    act: "Ato VIII · Soberano",
    terrain: "Região fortificada",
    objectiveKind: "territorial",
    objectiveText: "Vença a batalha final com a Doutrina de Montanha da FEB desbloqueada.",
    duration: 360,
    missionNote: "A guerra nunca acabou. Só trocou de uniforme.",
    brief:
      "De volta ao presente, você conhece o terreno, as armas e os heróis. A guerra híbrida ganha nome — e resposta.",
    enemyCountry: {
      id: "us",
      name: "Rede Híbrida",
      flag: "🕸️",
      commanderId: "cmd-orlov",
      doctrine: "Poder de fogo",
    },
  },
];

export const missionById = (id: string): MissionDef =>
  missions.find((m) => m.id === id) ?? missions[0]!;

// Cada capítulo da campanha que envolve combate aponta para a sua missão no teatro.
export const chapterMission: Record<string, string> = {
  c1: "m-apagao",
  c2: "m-blecaute",
  c3: "m-vozes",
  c4: "m-fronteira",
  c5: "m-porto",
  c6: "m-castello",
  c7: "m-escalao",
  c8: "m-montese",
  c9: "m-fornovo",
  c10: "m-desfile",
  c11: "m-desmob",
  c12: "m-trampolim",
  c13: "m-zecarioca",
  c14: "m-standard",
  c15: "m-lobato",
  c16: "m-petroleo",
  c17: "m-fundacao",
  c18: "m-cafe",
  c19: "m-curriculo",
  c20: "m-febre",
  c21: "m-berlim",
  c22: "m-camelot",
  c23: "m-soa",
  c24: "m-guatemala",
  c25: "m-alianca",
  c26: "m-cpi",
  c27: "m-torre",
  c28: "m-3327",
  c29: "m-corrente",
  c30: "m-automovel",
  c31: "m-rua",
  c32: "m-cidadeviva",
  c33: "m-mockingbird",
  c34: "m-cointelpro",
  c35: "m-condor",
  c36: "m-gerasimov",
  c37: "m-hibridas",
  c38: "m-snowden",
  c39: "m-petrobras",
  c40: "m-stuxnet",
  c41: "m-cambridge",
  c42: "m-trolls",
  c43: "m-pegasus",
  c44: "m-5g",
  c45: "m-deepfake",
  c46: "m-ouroazul",
  c47: "m-arquivos",
  c48: "m-brics",
  c49: "m-tabuleiro",
  c50: "m-final",
};

export const missionForChapter = (chapterId: string): MissionDef | null => {
  const id = chapterMission[chapterId];
  return id ? missionById(id) : null;
};

// ---------------------------------------------------------------------------
// Montagem do BattleConfig
// ---------------------------------------------------------------------------

export function sideFromNation(
  nation: NationState,
  deck: string[],
  commander: Commander,
  doctrine: Doctrine,
  mods?: SideModifiers,
  cardLevels?: Record<string, number>,
): SideConfig {
  const cfg: SideConfig = {
    countryId: nation.countryId,
    countryName: nation.countryName,
    flag: nation.flag,
    commander,
    doctrine,
    deck: deck.slice(0, 8),
    commandMax: commandCapacity(nation) + (mods?.commandMax ?? 0),
    regen: regenRate(nation),
    economyBonus: economyBonus(nation),
  };
  if (mods) cfg.mods = mods;
  if (cardLevels) cfg.cardLevels = cardLevels;
  return cfg;
}

export function sideFromMission(mission: MissionDef): SideConfig {
  const commander =
    commanders.find((c) => c.id === mission.enemyCountry.commanderId) ?? commanders[0]!;
  return {
    countryId: mission.enemyCountry.id,
    countryName: mission.enemyCountry.name,
    flag: mission.enemyCountry.flag,
    commander,
    doctrine: mission.enemyCountry.doctrine,
    deck: [
      "inf-fuzileiros",
      "inf-assalto",
      "inf-engenheiro",
      "bld-vbld",
      "bld-tanque",
      "art-obus",
      "def-aa",
      "rec-drone",
    ],
    commandMax: 12,
    regen: 1.0,
    economyBonus: 0.03,
  };
}

export interface BuildBattleOptions {
  nation: NationState;
  mission: MissionDef;
  deck: string[];
  commander: Commander;
  doctrine: Doctrine;
  seed?: number;
  mods?: SideModifiers;
  aiDifficulty?: AiDifficulty;
  redDeck?: string[];
  cardLevels?: Record<string, number>;
  redCardLevels?: Record<string, number>;
}

export function buildBattleConfig(opts: BuildBattleOptions): BattleConfig {
  const arena = cloneArena(arenaByTerrain(opts.mission.terrain));
  const red = sideFromMission(opts.mission);
  if (opts.redDeck && opts.redDeck.length >= 8) red.deck = opts.redDeck.slice(0, 8);
  if (opts.redCardLevels) red.cardLevels = opts.redCardLevels;
  const config: BattleConfig = {
    id: opts.mission.id,
    missionName: opts.mission.name,
    objectiveKind: opts.mission.objectiveKind,
    objectiveText: opts.mission.objectiveText,
    duration: opts.mission.duration,
    arena,
    blue: sideFromNation(
      opts.nation,
      opts.deck,
      opts.commander,
      opts.doctrine,
      opts.mods,
      opts.cardLevels,
    ),
    red,
    seed: opts.seed ?? 20260101,
  };
  if (opts.mission.militaryThreshold !== undefined)
    config.militaryThreshold = opts.mission.militaryThreshold;
  if (opts.mission.operational !== undefined) config.operationalTarget = opts.mission.operational;
  if (opts.aiDifficulty !== undefined) config.aiDifficulty = opts.aiDifficulty;
  return config;
}

// A arena é um template estático: clonar evita que barricadas de uma partida vazem para outra.
function cloneArena(arena: Arena): Arena {
  return {
    ...arena,
    controlPoints: arena.controlPoints.map((p) => ({
      ...p,
      owner: "neutro",
      progress: { blue: 0, red: 0 },
    })),
    territories: arena.territories.map((t) => ({
      ...t,
      owner: "neutro",
      progress: { blue: 0, red: 0 },
    })),
    structures: arena.structures.map((s) => ({ ...s })),
    obstacles: arena.obstacles.map((o) => ({ ...o })),
    routes: arena.routes.map((r) => ({ ...r })),
    deployZone: { blue: { ...arena.deployZone.blue }, red: { ...arena.deployZone.red } },
  };
}

// ---------------------------------------------------------------------------
// Consequências no mapa geopolítico
// ---------------------------------------------------------------------------

export interface WarConsequence {
  outcome: BattleOutcome;
  controlShift: string; // texto curto para o mapa
  militaryDelta: number;
  stabilityDelta: number;
  influenceDelta: number;
  losses: number;
  equipmentLost: number;
  note: string;
}

export function consequencesOf(result: BattleResult, mission: MissionDef): WarConsequence {
  const win = result.outcome === "vitoria";
  const draw = result.outcome === "empate";
  const losses = result.losses.blue;
  const equipmentLost = Math.round(losses * 0.6);
  const controlShift = win
    ? `${mission.name}: objetivo conquistado.`
    : draw
      ? `${mission.name}: fronteira estabilizada.`
      : `${mission.name}: posição perdida.`;
  return {
    outcome: result.outcome,
    controlShift,
    militaryDelta: win ? 2 : draw ? 0 : -2,
    stabilityDelta: win ? 3 : draw ? 0 : -4,
    influenceDelta: win ? 4 : draw ? 1 : -3,
    losses,
    equipmentLost,
    note: win
      ? "Vitória abre caminho para novas operações."
      : draw
        ? "Empate obriga a reorganizar sem ganho territorial."
        : "Derrota exige recompor forças antes de nova ofensiva.",
  };
}

export function applyConsequences(nation: NationState, consequence: WarConsequence): NationState {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const next: NationState = {
    ...nation,
    military: clamp(nation.military + consequence.militaryDelta),
    stability: clamp(nation.stability + consequence.stabilityDelta),
  };
  saveNation(next);
  return next;
}

export { cardById, commanders };
export const doctrineList = allDoctrines;
