import type { ArchiveEntry, Chapter } from "./types";

// Campanha "A história que não te contaram".
// Regra de conteúdo: tudo marcado "fato" ou "documento" é verificável; a tese que conecta
// os fatos é marcada "ficcao" — é a interpretação do jogo, apresentada como obra de ficção.

export const archives: ArchiveEntry[] = [
  // FEB
  {
    id: "a-feb-criacao",
    kind: "fato",
    date: "09/08/1943",
    title: "Criação da FEB",
    text: "A Força Expedicionária Brasileira é organizada após o Brasil declarar guerra ao Eixo (agosto de 1942), motivado pelo afundamento de navios mercantes brasileiros por submarinos alemães.",
    source: "Arquivo Histórico do Exército",
  },
  {
    id: "a-feb-embarque",
    kind: "fato",
    date: "02/07/1944",
    title: "O primeiro escalão embarca",
    text: "Cerca de 5 mil homens partem do Rio de Janeiro no navio de transporte USS General Mann rumo a Nápoles. No total, cerca de 25 mil brasileiros serviram na Itália.",
    source: "Exército Brasileiro / DPHCEx",
  },
  {
    id: "a-feb-cobra",
    kind: "documento",
    date: "1943–1945",
    title: '"A cobra vai fumar"',
    text: "Diziam que era mais fácil uma cobra fumar do que o Brasil mandar tropas à guerra. Os pracinhas adotaram a cobra fumando como emblema.",
    source: "Insígnia da FEB",
  },
  {
    id: "a-feb-castello",
    kind: "fato",
    date: "21/02/1945",
    title: "Tomada de Monte Castello",
    text: "Após quatro ataques sem sucesso entre novembro e dezembro de 1944, sob neve e fogo alemão vindo do alto, a FEB conquista Monte Castello, nos Apeninos.",
    source: "Mascarenhas de Moraes, 'A FEB pelo seu comandante'",
  },
  {
    id: "a-feb-montese",
    kind: "fato",
    date: "14/04/1945",
    title: "Batalha de Montese",
    text: "Considerada a batalha mais sangrenta da FEB. A cidade é tomada em combate casa a casa.",
    source: "DPHCEx",
  },
  {
    id: "a-feb-fornovo",
    kind: "fato",
    date: "28–29/04/1945",
    title: "Rendição em Fornovo di Taro",
    text: "A 148ª Divisão de Infantaria alemã e remanescentes italianos — cerca de 15 mil homens e dois generais — rendem-se à FEB.",
    source: "DPHCEx",
  },
  {
    id: "a-feb-mortos",
    kind: "fato",
    date: "1945",
    title: "O preço",
    text: "Cerca de 450 brasileiros morreram em combate. Foram sepultados em Pistoia; os restos voltaram ao Brasil em 1960, para o Monumento aos Mortos da Segunda Guerra, no Rio.",
    source: "Monumento Nacional aos Mortos da 2ª GM",
  },
  {
    id: "a-feb-desmob",
    kind: "fato",
    date: "1945",
    title: "Desmobilização imediata",
    text: "Ao retornar, a FEB foi desmobilizada rapidamente, com unidades dissolvidas logo após o desembarque. Muitos veteranos enfrentaram desemprego e sequelas sem amparo; direitos específicos só foram consolidados décadas depois (ex.: Lei 5.315/1967).",
    source: "Lei 5.315/1967",
  },
  {
    id: "a-feb-vargas",
    kind: "fato",
    date: "29/10/1945",
    title: "Queda do Estado Novo",
    text: "Meses após o retorno dos pracinhas — que lutaram contra o fascismo — Getúlio Vargas é deposto.",
    source: "CPDOC/FGV",
  },
  {
    id: "a-feb-tese",
    kind: "ficcao",
    date: "—",
    title: "Tese: o apagamento",
    text: "Interpretação do jogo: homens que venceram uma guerra real voltaram com prestígio, disciplina e consciência nacional. Dispersá-los rápido e tirá-los dos livros seria mais conveniente para quem pretendia disputar o Brasil sem tiros.",
  },

  // Rockefeller no Brasil
  {
    id: "a-ciaa",
    kind: "fato",
    date: "1940–1946",
    title: "Escritório de Nelson Rockefeller",
    text: "Nelson Rockefeller dirige o Office of the Coordinator of Inter-American Affairs, órgão dos EUA para influência econômica e cultural na América Latina — cinema, rádio, imprensa.",
    source: "U.S. National Archives, RG 229",
  },
  {
    id: "a-zecarioca",
    kind: "fato",
    date: "1942",
    title: "Zé Carioca",
    text: "Com apoio do escritório, Walt Disney viaja à América do Sul; nasce o Zé Carioca em 'Alô, Amigos' (Saludos Amigos). Orson Welles filma no Rio no mesmo programa.",
    source: "Saludos Amigos, 1942",
  },
  {
    id: "a-natal",
    kind: "fato",
    date: "1942–1945",
    title: "Trampolim da Vitória",
    text: "Natal (RN) abriga a base aérea de Parnamirim, usada pelos EUA como ponte aérea para a África e a Europa.",
    source: "FAB / Parnamirim Field",
  },
  {
    id: "a-ibec",
    kind: "fato",
    date: "1946–1947",
    title: "AIA e IBEC",
    text: "Nelson Rockefeller funda a American International Association e a IBEC, com projetos agrícolas e de crédito rural no Brasil.",
    source: "Rockefeller Archive Center",
  },
  {
    id: "a-rock-tese",
    kind: "ficcao",
    date: "—",
    title: "Tese: amizade como doutrina",
    text: "Interpretação do jogo: a boa vizinhança foi a primeira grande operação de influência cultural do século XX no Brasil — não por armas, mas por imaginário.",
  },

  // Petróleo
  {
    id: "a-standard",
    kind: "fato",
    date: "1870 / 1911",
    title: "Standard Oil",
    text: "John D. Rockefeller funda a Standard Oil em 1870. Em 1911, a Suprema Corte dos EUA determina sua divisão por monopólio.",
    source: "Standard Oil Co. of New Jersey v. United States, 1911",
  },
  {
    id: "a-fundacao",
    kind: "fato",
    date: "1913",
    title: "Fundação Rockefeller",
    text: "Criada em 1913, torna-se uma das maiores financiadoras de saúde pública, ciência e ciências sociais do mundo.",
    source: "Rockefeller Foundation",
  },
  {
    id: "a-lobato",
    kind: "documento",
    date: "1936",
    title: "O Escândalo do Petróleo",
    text: "Monteiro Lobato publica livro acusando trustes estrangeiros de sabotar a busca de petróleo no Brasil. Em 1941 ele é preso pelo Estado Novo.",
    source: "Monteiro Lobato, 1936",
  },
  {
    id: "a-petrobras",
    kind: "fato",
    date: "03/10/1953",
    title: '"O petróleo é nosso"',
    text: "Após campanha popular, a Lei 2.004 cria a Petrobras e o monopólio estatal do petróleo.",
    source: "Lei 2.004/1953",
  },

  // Tesla
  {
    id: "a-wardenclyffe",
    kind: "fato",
    date: "1901–1906",
    title: "Torre de Wardenclyffe",
    text: "Tesla constrói em Long Island uma torre para comunicação e transmissão de energia sem fio, financiada por J. P. Morgan, que retira o apoio. O projeto é abandonado.",
    source: "Tesla, 'My Inventions', 1919",
  },
  {
    id: "a-tesla-morte",
    kind: "fato",
    date: "07/01/1943",
    title: "Morte no quarto 3327",
    text: "Nikola Tesla morre sozinho, endividado, no quarto 3327 do Hotel New Yorker. Seus papéis são apreendidos pelo Office of Alien Property dos EUA.",
    source: "FBI Records: Nikola Tesla",
  },
  {
    id: "a-tesla-tese",
    kind: "ficcao",
    date: "—",
    title: "Tese: energia que não se cobra",
    text: "Interpretação do jogo: uma energia impossível de medir é impossível de vender. O inventor que iluminou o século morreu esquecido no mesmo ano em que os pracinhas treinavam para a guerra.",
  },

  // Medicina
  {
    id: "a-flexner",
    kind: "fato",
    date: "1910",
    title: "Relatório Flexner",
    text: "Financiado pela Fundação Carnegie, o relatório redesenha a medicina nos EUA. Com recursos do General Education Board (Rockefeller), escolas são reformadas e muitas fecham — entre elas 5 das 7 escolas médicas para negros.",
    source: "Flexner, 'Medical Education in the US and Canada', 1910",
  },
  {
    id: "a-febre",
    kind: "fato",
    date: "1923–1939",
    title: "Febre amarela no Brasil",
    text: "A Fundação Rockefeller atua em convênio com o governo brasileiro no combate à febre amarela e financia a Faculdade de Medicina de São Paulo.",
    source: "Fiocruz / Casa de Oswaldo Cruz",
  },
  {
    id: "a-med-tese",
    kind: "ficcao",
    date: "—",
    title: "Tese: quem define a cura",
    text: "Interpretação do jogo: ajuda real e influência real podem vir no mesmo envelope. Quem financia a escola define o currículo.",
  },

  // Antropologia / eugenia
  {
    id: "a-kwi",
    kind: "fato",
    date: "1927–1930s",
    title: "Instituto Kaiser Wilhelm",
    text: "A Fundação Rockefeller financiou o Instituto Kaiser Wilhelm de Antropologia, Hereditariedade Humana e Eugenia, em Berlim, antes do regime nazista se consolidar.",
    source: "Rockefeller Archive Center; Stefan Kühl, 'The Nazi Connection'",
  },
  {
    id: "a-camelot",
    kind: "fato",
    date: "1964–1965",
    title: "Projeto Camelot",
    text: "Projeto de ciências sociais do Exército dos EUA para estudar e prever insurgências na América Latina, usando antropólogos e sociólogos. Exposto no Chile, foi cancelado em 1965.",
    source: "Irving L. Horowitz, 'The Rise and Fall of Project Camelot'",
  },
  {
    id: "a-antro-tese",
    kind: "ficcao",
    date: "—",
    title: "Tese: estudar para conduzir",
    text: "Interpretação do jogo: entender uma sociedade é o primeiro passo para conduzi-la. O mapa humano vale mais que o topográfico.",
  },

  // Jane Jacobs
  {
    id: "a-jacobs",
    kind: "fato",
    date: "1961",
    title: "Morte e Vida de Grandes Cidades",
    text: "Jane Jacobs defende ruas vivas, vizinhança e uso misto contra o urbanismo rodoviarista. Curiosamente, o livro foi escrito com uma bolsa da própria Fundação Rockefeller.",
    source: "Jacobs, 1961; Rockefeller Foundation grant, 1958",
  },
  {
    id: "a-lomex",
    kind: "fato",
    date: "1960s",
    title: "Contra Robert Moses",
    text: "Jacobs lidera a resistência à via expressa de Lower Manhattan (LOMEX), defendida por Robert Moses e apoiada pela associação empresarial de David Rockefeller. O projeto é derrubado.",
    source: "Anthony Flint, 'Wrestling with Moses'",
  },
  {
    id: "a-jacobs-tese",
    kind: "ficcao",
    date: "—",
    title: "Tese: a cidade como campo de batalha",
    text: "Interpretação do jogo: Jacobs prova que uma comunidade que se conhece resiste. A mesma rede que financia também pode ser vencida na rua.",
  },

  // Brasil tomado
  {
    id: "a-brothersam",
    kind: "fato",
    date: "1964",
    title: "Operação Brother Sam",
    text: "Documentos liberados nos EUA mostram que Washington preparou força naval e apoio logístico para o golpe de 1964 no Brasil.",
    source: "LBJ Library; National Security Archive",
  },
  {
    id: "a-ipes",
    kind: "fato",
    date: "1961–1964",
    title: "IPES e IBAD",
    text: "Institutos financiados por empresários e recursos estrangeiros produzem propaganda contra o governo João Goulart. Uma CPI de 1963 investiga o IBAD.",
    source: "René Dreifuss, '1964: A Conquista do Estado'",
  },
  {
    id: "a-gerasimov",
    kind: "documento",
    date: "2013",
    title: "O valor da ciência na previsão",
    text: "Artigo do general russo Valery Gerasimov descreve a guerra moderna como combinação de meios políticos, econômicos, informacionais e militares.",
    source: "Voenno-Promyshlennyi Kurier, 2013",
  },
  {
    id: "a-korybko",
    kind: "documento",
    date: "2015",
    title: "Guerras Híbridas",
    text: "O analista Andrew Korybko publica estudo sobre revoluções coloridas e guerras não convencionais como estratégia de mudança de regime.",
    source: "Korybko, 'Hybrid Wars', 2015",
  },
  {
    id: "a-final-tese",
    kind: "ficcao",
    date: "—",
    title: "Tese: a guerra nunca acabou",
    text: "Interpretação do jogo: a guerra só mudou de uniforme. Do petróleo ao currículo, do cinema ao algoritmo — e quem esquece seus heróis não reconhece o próprio campo de batalha.",
  },
];

export const archiveById = (id: string) => archives.find((a) => a.id === id)!;

export const characters = [
  {
    name: "Davi Moraes",
    role: "Protagonista · analista de dados, 27 anos",
    kind: "ficcao" as const,
    bio: "Vive conectado, mas não sabe que está numa guerra. Até o dia em que a cidade apaga.",
  },
  {
    name: "Sgt. Joaquim Moraes",
    role: "Bisavô · pracinha da FEB",
    kind: "ficcao" as const,
    bio: "Personagem fictício. Lutou em Monte Castello. Deixou cartas, uma medalha e um silêncio.",
  },
  {
    name: "Profa. Helena Duarte",
    role: "Historiadora · guia de Davi",
    kind: "ficcao" as const,
    bio: "Personagem fictícia. Separa fato, documento e tese — e obriga Davi a fazer o mesmo.",
  },
  {
    name: "O Curador",
    role: "Antagonista · voz da rede",
    kind: "ficcao" as const,
    bio: "Não é uma pessoa. É a soma de interesses que preferem que você não lembre.",
  },
  {
    name: "Mascarenhas de Moraes",
    role: "Comandante da FEB (real)",
    kind: "fato" as const,
    bio: "Marechal João Baptista Mascarenhas de Moraes comandou a 1ª Divisão de Infantaria Expedicionária na Itália.",
  },
  {
    name: "Nikola Tesla",
    role: "Inventor (real, 1856–1943)",
    kind: "fato" as const,
    bio: "Pai da corrente alternada. Morreu pobre num quarto de hotel em Nova York.",
  },
  {
    name: "Jane Jacobs",
    role: "Urbanista e ativista (real, 1916–2006)",
    kind: "fato" as const,
    bio: "Enfrentou Robert Moses e mudou para sempre o modo de pensar cidades.",
  },
  {
    name: "Nelson Rockefeller",
    role: "Coordenador de Assuntos Interamericanos (real)",
    kind: "fato" as const,
    bio: "Neto de John D. Rockefeller. Arquiteto da política cultural dos EUA para a América Latina nos anos 1940.",
  },
  {
    name: "Monteiro Lobato",
    role: "Escritor (real, 1882–1948)",
    kind: "fato" as const,
    bio: "Denunciou trustes do petróleo e foi preso por isso.",
  },
];

export const chapters: Chapter[] = [
  {
    id: "c1",
    number: 1,
    act: "Ato I · O Presente",
    title: "Ruído",
    era: "Hoje",
    place: "São Paulo",
    summary:
      "Davi vive entre telas. Um apagão coordenado, boatos virais e um protesto que ninguém convocou transformam a cidade em zona de conflito. Ele luta sem saber contra quem.",
    mission: {
      title: "Operação Apagão",
      objective: "Sobreviva 90 segundos e proteja o centro de distribuição do bairro.",
      battle: "Cidade",
    },
    dialogue: [
      {
        speaker: "Davi",
        text: "Sem sinal, sem luz, e o grupo da família diz que é golpe, invasão, fim do mundo. Tudo ao mesmo tempo.",
      },
      {
        speaker: "Voz no rádio",
        text: "Não confiem nas mensagens. Metade delas não foi escrita por gente.",
        kind: "ficcao",
      },
      { speaker: "Davi", text: "Se isso é uma guerra... quem declarou?" },
    ],
    archives: ["a-gerasimov"],
  },
  {
    id: "c2",
    number: 2,
    act: "Ato II · A Descoberta",
    title: "A Medalha",
    era: "1943–1945",
    place: "Apeninos, Itália",
    summary:
      "Na casa da avó, Davi encontra a medalha e as cartas do bisavô Joaquim. Ele descobre que o Brasil mandou cerca de 25 mil homens à Segunda Guerra — e que quase ninguém lhe contou isso.",
    mission: {
      title: "Monte Castello",
      objective: "Avance montanha acima sob fogo de artilharia e capture o cume.",
      battle: "Montanha",
    },
    dialogue: [
      {
        speaker: "Carta de Joaquim",
        text: "A neve aqui não é como a de cinema. Ela entra na bota e na alma. Mas a cobra vai fumar.",
        kind: "ficcao",
      },
      {
        speaker: "Profa. Helena",
        text: "Monte Castello caiu em 21 de fevereiro de 1945, depois de quatro ataques fracassados. Isso é fato. Agora, pergunte por que você não aprendeu isso na escola.",
        kind: "fato",
      },
    ],
    archives: [
      "a-feb-criacao",
      "a-feb-embarque",
      "a-feb-cobra",
      "a-feb-castello",
      "a-feb-montese",
      "a-feb-fornovo",
    ],
  },
  {
    id: "c3",
    number: 3,
    act: "Ato II · A Descoberta",
    title: "O Retorno Silenciado",
    era: "1945",
    place: "Rio de Janeiro",
    summary:
      "Os pracinhas voltam vitoriosos e são desmobilizados quase imediatamente. Meses depois, o regime cai. Davi começa a ver um padrão: vitória real, memória apagada.",
    mission: {
      title: "Desfile Interrompido",
      objective: "Recupere 3 arquivos de veteranos antes que sejam descartados.",
    },
    dialogue: [
      {
        speaker: "Profa. Helena",
        text: "A desmobilização rápida é documentada. A intenção por trás dela... aí já é interpretação.",
        kind: "fato",
      },
      {
        speaker: "O Curador",
        text: "Heróis são perigosos quando lembram por que lutaram.",
        kind: "ficcao",
      },
    ],
    archives: ["a-feb-mortos", "a-feb-desmob", "a-feb-vargas", "a-feb-tese"],
  },
  {
    id: "c4",
    number: 4,
    act: "Ato III · A Trilha",
    title: "Os Bons Vizinhos",
    era: "1940–1947",
    place: "Natal · Rio · Nova York",
    summary:
      "Enquanto os pracinhas lutavam, um Rockefeller cuidava do coração dos brasileiros: cinema, rádio, Zé Carioca. Davi segue o dinheiro da amizade.",
    mission: {
      title: "Trampolim da Vitória",
      objective: "Mapeie as 5 redes de influência cultural no tabuleiro estratégico.",
    },
    dialogue: [
      { speaker: "Davi", text: "O Zé Carioca nasceu num programa de governo americano?" },
      {
        speaker: "Profa. Helena",
        text: "Nasceu num programa do escritório de Nelson Rockefeller, sim. Documentado.",
        kind: "fato",
      },
    ],
    archives: ["a-ciaa", "a-zecarioca", "a-natal", "a-ibec", "a-rock-tese"],
  },
  {
    id: "c5",
    number: 5,
    act: "Ato III · A Trilha",
    title: "O Petróleo é Nosso",
    era: "1870–1953",
    place: "Cleveland · São Paulo",
    summary:
      "A trilha recua até a Standard Oil e a fundação que nasceu de sua fortuna. No Brasil, Monteiro Lobato é preso por falar de petróleo. O povo responde nas ruas.",
    mission: {
      title: "Campanha do Petróleo",
      objective: "Mantenha a estabilidade acima de 50% enquanto nacionaliza o recurso.",
    },
    dialogue: [
      {
        speaker: "Monteiro Lobato (citação adaptada)",
        text: "Petróleo é coisa séria demais para ser deixada aos trustes.",
        kind: "documento",
      },
    ],
    archives: ["a-standard", "a-fundacao", "a-lobato", "a-petrobras"],
  },
  {
    id: "c6",
    number: 6,
    act: "Ato III · A Trilha",
    title: "Quarto 3327",
    era: "1901–1943",
    place: "Long Island · Nova York",
    summary:
      "Davi encontra Tesla: a torre de Wardenclyffe, o financiamento retirado, a morte solitária em 1943 — no mesmo ano em que a FEB era criada.",
    mission: {
      title: "A Torre",
      objective: "Proteja a pesquisa de energia sem fio até 100% na árvore tecnológica.",
    },
    dialogue: [
      {
        speaker: "Profa. Helena",
        text: "Morgan retirou o dinheiro, isso está nas cartas. Por quê? Aí cada um tem sua tese.",
        kind: "fato",
      },
      {
        speaker: "O Curador",
        text: "O que não pode ser medido não pode ser vendido.",
        kind: "ficcao",
      },
    ],
    archives: ["a-wardenclyffe", "a-tesla-morte", "a-tesla-tese"],
  },
  {
    id: "c7",
    number: 7,
    act: "Ato III · A Trilha",
    title: "O Currículo",
    era: "1910–1939",
    place: "Baltimore · São Paulo",
    summary:
      "O Relatório Flexner redesenha a medicina; a Fundação Rockefeller combate a febre amarela no Brasil e financia faculdades. Ajuda real — e quem paga define a regra.",
    mission: {
      title: "Saúde Soberana",
      objective: "Equilibre investimento externo e autonomia científica.",
    },
    dialogue: [
      { speaker: "Davi", text: "Então eles salvaram vidas aqui." },
      {
        speaker: "Profa. Helena",
        text: "Salvaram. As duas coisas podem ser verdade. É isso que torna tudo difícil de ver.",
        kind: "fato",
      },
    ],
    archives: ["a-flexner", "a-febre", "a-med-tese"],
  },
  {
    id: "c8",
    number: 8,
    act: "Ato III · A Trilha",
    title: "O Mapa Humano",
    era: "1927–1965",
    place: "Berlim · Santiago",
    summary:
      "Ciência social como ferramenta: o financiamento ao instituto de eugenia em Berlim e o Projeto Camelot, que queria prever revoluções latino-americanas.",
    mission: {
      title: "Camelot",
      objective: "Descubra os agentes infiltrados antes que mapeiem suas províncias.",
    },
    dialogue: [
      {
        speaker: "O Curador",
        text: "Para conduzir um povo, primeiro é preciso descrevê-lo.",
        kind: "ficcao",
      },
    ],
    archives: ["a-kwi", "a-camelot", "a-antro-tese"],
  },
  {
    id: "c9",
    number: 9,
    act: "Ato III · A Trilha",
    title: "A Rua",
    era: "1958–1968",
    place: "Nova York",
    summary:
      "Jane Jacobs, com bolsa da própria Fundação Rockefeller, derruba a via expressa apoiada por David Rockefeller. Davi aprende que a rede pode ser vencida — na rua, em comunidade.",
    mission: {
      title: "Washington Square",
      objective: "Organize 4 bairros e bloqueie a via expressa.",
      battle: "Cidade",
    },
    dialogue: [
      {
        speaker: "Jane Jacobs (paráfrase)",
        text: "Cidades têm capacidade de prover algo para todos, porque são criadas por todos.",
        kind: "documento",
      },
      { speaker: "Davi", text: "Então dá pra vencer." },
    ],
    archives: ["a-jacobs", "a-lomex", "a-jacobs-tese"],
  },
  {
    id: "c10",
    number: 10,
    act: "Ato IV · O Retorno",
    title: "Brother Sam",
    era: "1961–1964",
    place: "Brasil",
    summary:
      "Institutos de propaganda, uma frota pronta no Atlântico e um país tomado sem que um único soldado estrangeiro desembarcasse.",
    mission: {
      title: "Frota no Horizonte",
      objective: "Identifique as operações de influência antes do turno 10.",
    },
    dialogue: [
      {
        speaker: "Profa. Helena",
        text: "Os documentos da Operação Brother Sam foram liberados pelos próprios EUA.",
        kind: "fato",
      },
    ],
    archives: ["a-ipes", "a-brothersam"],
  },
  {
    id: "c11",
    number: 11,
    act: "Ato IV · O Retorno",
    title: "Soberano",
    era: "Hoje",
    place: "Brasil",
    summary:
      "De volta ao presente, Davi entende a primeira batalha que lutou. Agora ele conhece o terreno, as armas e os heróis. A guerra híbrida ganha nome — e resposta.",
    mission: {
      title: "A Cobra Vai Fumar",
      objective: "Vença a batalha final com a Doutrina de Montanha da FEB desbloqueada.",
      battle: "Região fortificada",
    },
    dialogue: [
      { speaker: "Davi", text: "A guerra nunca acabou. Só trocou de uniforme." },
      {
        speaker: "Carta de Joaquim",
        text: "Se um dia te perguntarem quem somos, diga que fomos.",
        kind: "ficcao",
      },
    ],
    archives: ["a-korybko", "a-final-tese"],
  },
];
