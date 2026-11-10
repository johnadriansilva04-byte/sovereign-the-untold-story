// Dilemas de comando da campanha.
//
// Cada capítulo coloca o jogador diante de uma escolha concreta. A escolha NÃO é
// decorativa: ela altera a doutrina da força e/ou os modificadores de combate
// (vida, dano, velocidade, captura, visão, energia máxima) que o motor de batalha
// aplica de verdade em `spawnUnit`/captura/energia. A decisão fica gravada no
// perfil, então é determinística e reaplicada a cada tentativa da missão.

import type { Doctrine, SideModifiers } from "@/game/battle/types";

export type DecisionTag = "ousado" | "prudente" | "técnico" | "político";

export interface DecisionEffect {
  /** Troca a doutrina da força — muda multiplicadores reais de velocidade/dano/vida/custo. */
  doctrine?: Doctrine;
  /** Bônus por categoria e modificadores diretos (energia, captura, visão). */
  mods?: SideModifiers;
  /** Concessão única ao escolher (persistente, modesta). */
  research?: number;
  sovereigns?: number;
}

export interface DecisionOption {
  id: string;
  label: string;
  tag: DecisionTag;
  text: string;
  effect: DecisionEffect;
}

export interface Decision {
  chapterId: string;
  prompt: string;
  options: DecisionOption[];
}

// Atalhos de leitura para os modificadores (frações: 0.1 = +10%).
const inf = (v: number): SideModifiers => ({ hp: { infantaria: v } });
const dmg = (category: keyof NonNullable<SideModifiers["dmg"]>, v: number): SideModifiers => ({
  dmg: { [category]: v },
});
const speed = (category: keyof NonNullable<SideModifiers["speed"]>, v: number): SideModifiers => ({
  speed: { [category]: v },
});
const energy = (v: number): SideModifiers => ({ commandMax: v });
const capture = (v: number): SideModifiers => ({ capture: v });
const sight = (v: number): SideModifiers => ({ sight: v });

export const decisions: Record<string, Decision> = {
  c1: {
    chapterId: "c1",
    prompt: "As ruas estão fechadas e você não sabe quem manda no protesto. Como entra?",
    options: [
      {
        id: "c1-a",
        label: "Ocupar as ruas com infantaria leve",
        tag: "ousado",
        text: "Presença imediata, mobilidade alta. Você controla o quarteirão antes que o boato vire barricada.",
        effect: {
          doctrine: "Mobilidade",
          mods: { ...speed("infantaria", 0.12), ...capture(0.15) },
        },
      },
      {
        id: "c1-b",
        label: "Cercar o centro e esperar",
        tag: "prudente",
        text: "Menos baixas, mais tempo. Você segura o objetivo em vez de correr atrás dele.",
        effect: { doctrine: "Defesa territorial", mods: { ...inf(0.15), ...energy(2) } },
      },
    ],
  },
  c2: {
    chapterId: "c2",
    prompt: "Energia e dados caem juntos. Onde você concentra a força?",
    options: [
      {
        id: "c2-a",
        label: "Blindar o nó de comunicações",
        tag: "prudente",
        text: "Prioridade à defesa do centro de dados: guarnição reforçada e reposição de energia.",
        effect: { doctrine: "Defesa territorial", mods: { ...inf(0.12), ...energy(3) } },
      },
      {
        id: "c2-b",
        label: "Caçar a célula que derrubou a rede",
        tag: "ousado",
        text: "Ofensiva de reconhecimento: você enxerga mais longe e chega antes.",
        effect: {
          doctrine: "Mobilidade",
          mods: { ...speed("reconhecimento", 0.2), ...sight(0.25) },
        },
      },
    ],
  },
  c3: {
    chapterId: "c3",
    prompt: "A batalha é por narrativa. Você ataca a máquina ou o discurso?",
    options: [
      {
        id: "c3-a",
        label: "Derrubar a fábrica de bots",
        tag: "técnico",
        text: "Alvo físico, efeito imediato: artilharia e apoio com dano ampliado.",
        effect: { doctrine: "Poder de fogo", mods: { ...dmg("apoio", 0.18) } },
      },
      {
        id: "c3-b",
        label: "Ocupar as ruas e desmentir ao vivo",
        tag: "político",
        text: "Presença visível quebra o boato. Tropa mais resistente e território mais fácil de marcar.",
        effect: { mods: { ...inf(0.14), ...capture(0.2) }, sovereigns: 60 },
      },
    ],
  },
  c4: {
    chapterId: "c4",
    prompt: "A floresta não tem cerca. Como você domina a clareira?",
    options: [
      {
        id: "c4-a",
        label: "Olhos primeiro: drones e sensores",
        tag: "técnico",
        text: "Reconhecimento ampliado — quem vê primeiro escolhe onde lutar.",
        effect: { mods: { ...sight(0.3), ...speed("reconhecimento", 0.15) } },
      },
      {
        id: "c4-b",
        label: "Trilhas abertas por infantaria de selva",
        tag: "prudente",
        text: "Infantaria endurecida, captura mais firme. Avança devagar e não recua.",
        effect: { doctrine: "Infantaria", mods: { ...inf(0.18), ...capture(0.12) } },
      },
    ],
  },
  c5: {
    chapterId: "c5",
    prompt: "O cais está silencioso. Contêineres e carga fantasma. Como retoma o porto?",
    options: [
      {
        id: "c5-a",
        label: "Assalto mecanizado ao cais",
        tag: "ousado",
        text: "Blindados rápidos tomam o pátio de uma vez.",
        effect: { doctrine: "Mecanizada", mods: { ...speed("blindado", 0.15) } },
      },
      {
        id: "c5-b",
        label: "Bloqueio naval e cerco lento",
        tag: "prudente",
        text: "Corta o fluxo e espera. Defesa mais dura, energia sobrando.",
        effect: { doctrine: "Defesa territorial", mods: { ...energy(3) } },
      },
    ],
  },
  c6: {
    chapterId: "c6",
    prompt: "A medalha do bisavô está na sua mão. O que ela muda na sua guerra?",
    options: [
      {
        id: "c6-a",
        label: "Honrar a FEB: lutar como pracinha",
        tag: "prudente",
        text: "Infantaria no centro da doutrina — resistência e captura.",
        effect: { doctrine: "Infantaria", mods: { ...inf(0.2) } },
      },
      {
        id: "c6-b",
        label: "Aprender com o erro deles: coordenação",
        tag: "técnico",
        text: "Operações combinadas: infantaria e blindado se cobrem.",
        effect: {
          doctrine: "Operações combinadas",
          mods: { ...dmg("blindado", 0.12), ...inf(0.08) },
        },
      },
    ],
  },
  c7: {
    chapterId: "c7",
    prompt: "Cinco mil homens desembarcam em Nápoles. Como os posiciona?",
    options: [
      {
        id: "c7-a",
        label: "Marcha rápida para o front",
        tag: "ousado",
        text: "Chegar primeiro custa baixas, mas define o terreno.",
        effect: { doctrine: "Mobilidade", mods: { ...speed("infantaria", 0.15) } },
      },
      {
        id: "c7-b",
        label: "Consolidar base antes de avançar",
        tag: "prudente",
        text: "Logística primeiro: mais energia e defesa sólida.",
        effect: { mods: { ...energy(3), ...inf(0.1) } },
      },
    ],
  },
  c8: {
    chapterId: "c8",
    prompt: "Montese, casa a casa. A ordem é tomá-la a qualquer custo. Qual custo?",
    options: [
      {
        id: "c8-a",
        label: "Assalto frontal com infantaria",
        tag: "ousado",
        text: "Dano de infantaria elevado, mas sem rede de proteção.",
        effect: { doctrine: "Infantaria", mods: { ...dmg("infantaria", 0.2) } },
      },
      {
        id: "c8-b",
        label: "Preparação de artilharia antes",
        tag: "técnico",
        text: "Bombardeia antes de entrar: apoio e artilharia mais fortes.",
        effect: { doctrine: "Poder de fogo", mods: { ...dmg("artilharia", 0.15) } },
      },
    ],
  },
  c9: {
    chapterId: "c9",
    prompt: "A 148ª Divisão está cercada e pede rendição. Aceitar ou apertar o cerco?",
    options: [
      {
        id: "c9-a",
        label: "Apertar o cerco até a rendição",
        tag: "prudente",
        text: "Menos risco: defesa territorial reforçada e captura firme.",
        effect: { doctrine: "Defesa territorial", mods: { ...capture(0.18), ...inf(0.1) } },
      },
      {
        id: "c9-b",
        label: "Perseguir os remanescentes",
        tag: "ousado",
        text: "Não deixar fugir: blindados mais rápidos e letais.",
        effect: {
          doctrine: "Mecanizada",
          mods: { ...speed("blindado", 0.18), ...dmg("blindado", 0.1) },
        },
      },
    ],
  },
  c10: {
    chapterId: "c10",
    prompt: "Os pracinhas voltam e são desmobilizados na hora. Você aceita?",
    options: [
      {
        id: "c10-a",
        label: "Aceitar e cuidar dos veteranos",
        tag: "político",
        text: "Estabilidade e influência: a nação confia em você.",
        effect: { mods: { ...energy(2) }, research: 1, sovereigns: 80 },
      },
      {
        id: "c10-b",
        label: "Manter as unidades prontas",
        tag: "ousado",
        text: "Exército mobilizado: infantaria mais resistente desde o início.",
        effect: { doctrine: "Infantaria", mods: { ...inf(0.15) } },
      },
    ],
  },
  c11: {
    chapterId: "c11",
    prompt: "Veteranos sem amparo, unidades dissolvidas. O que você defende?",
    options: [
      {
        id: "c11-a",
        label: "Direitos e reparação aos veteranos",
        tag: "político",
        text: "Consequência política: mais soberanos e influência.",
        effect: { sovereigns: 120, research: 1 },
      },
      {
        id: "c11-b",
        label: "Reequipar o que restou",
        tag: "técnico",
        text: "Menos gente, mais aço: blindados e artilharia reforçados.",
        effect: { mods: { ...dmg("blindado", 0.12), ...dmg("artilharia", 0.12) } },
      },
    ],
  },
  c12: {
    chapterId: "c12",
    prompt: "Um Rockefeller cuida do 'coração dos brasileiros'. Como responde?",
    options: [
      {
        id: "c12-a",
        label: "Aceitar a cooperação e aprender",
        tag: "técnico",
        text: "Ganho técnico: pesquisa e apoio com mais dano.",
        effect: { research: 2, mods: { ...dmg("apoio", 0.15) } },
      },
      {
        id: "c12-b",
        label: "Nacionalizar o programa",
        tag: "político",
        text: "Controle nacional: mais soberanos e estabilidade.",
        effect: { sovereigns: 140, mods: { ...inf(0.1) } },
      },
    ],
  },
  c13: {
    chapterId: "c13",
    prompt: "Um papagaio simpático vende o país. Qual imagem você projeta?",
    options: [
      {
        id: "c13-a",
        label: "Contra-narrativa nacional",
        tag: "político",
        text: "Mobiliza a opinião: captura territorial mais fácil.",
        effect: { mods: { ...capture(0.2) }, sovereigns: 90 },
      },
      {
        id: "c13-b",
        label: "Focar na capacidade militar",
        tag: "técnico",
        text: "Menos propaganda, mais combate: dano geral elevado.",
        effect: {
          doctrine: "Poder de fogo",
          mods: { ...dmg("infantaria", 0.1), ...dmg("artilharia", 0.1) },
        },
      },
    ],
  },
  c14: {
    chapterId: "c14",
    prompt: "A trilha leva ao monopólio que fundou a fortuna. Atacar o quê?",
    options: [
      {
        id: "c14-a",
        label: "Quebrar o truste com lei",
        tag: "político",
        text: "Vitória jurídica: soberanos e pesquisa.",
        effect: { sovereigns: 160, research: 2 },
      },
      {
        id: "c14-b",
        label: "Disputar o combustível no campo",
        tag: "ousado",
        text: "Mecanizada faminta por avanço rápido.",
        effect: { doctrine: "Mecanizada", mods: { ...speed("blindado", 0.15), ...energy(2) } },
      },
    ],
  },
  c15: {
    chapterId: "c15",
    prompt: "Lobato acusa o truste de sabotar o país. Você dá o quê à imprensa?",
    options: [
      {
        id: "c15-a",
        label: "Dossiê completo e aberto",
        tag: "político",
        text: "Escândalo vira força: captura e soberanos.",
        effect: { mods: { ...capture(0.18) }, sovereigns: 110 },
      },
      {
        id: "c15-b",
        label: "Provas técnicas e perícia",
        tag: "técnico",
        text: "Reconhecimento e visão para achar a sabotagem.",
        effect: { mods: { ...sight(0.25), ...speed("reconhecimento", 0.15) } },
      },
    ],
  },
  c16: {
    chapterId: "c16",
    prompt: "'O petróleo é nosso'. O monopólio é criado. Qual doutrina para defendê-lo?",
    options: [
      {
        id: "c16-a",
        label: "Defender o poço a todo custo",
        tag: "prudente",
        text: "Guarnição dura em torno da infraestrutura.",
        effect: { doctrine: "Defesa territorial", mods: { ...inf(0.15), ...energy(2) } },
      },
      {
        id: "c16-b",
        label: "Expandir para o mar e a fronteira",
        tag: "ousado",
        text: "Ocupação rápida de novos pontos de energia.",
        effect: {
          doctrine: "Mobilidade",
          mods: { ...speed("infantaria", 0.12), ...capture(0.15) },
        },
      },
    ],
  },
  c17: {
    chapterId: "c17",
    prompt: "A fortuna do petróleo vira filantropia. Você aceita a fundação?",
    options: [
      {
        id: "c17-a",
        label: "Aceitar e direcionar a ciência",
        tag: "técnico",
        text: "Pesquisa acelerada e apoio reforçado.",
        effect: { research: 3, mods: { ...dmg("apoio", 0.15) } },
      },
      {
        id: "c17-b",
        label: "Recusar e construir instituto próprio",
        tag: "político",
        text: "Soberania científica: soberanos e infantaria firme.",
        effect: { sovereigns: 150, mods: { ...inf(0.1) } },
      },
    ],
  },
  c18: {
    chapterId: "c18",
    prompt: "A crise de 1929 derruba o café e reordena o poder. Como você se reposiciona?",
    options: [
      {
        id: "c18-a",
        label: "Aproveitar a crise e expandir",
        tag: "ousado",
        text: "Vácuo de poder: mobilidade e captura aceleradas.",
        effect: { doctrine: "Mobilidade", mods: { ...capture(0.2), ...speed("infantaria", 0.1) } },
      },
      {
        id: "c18-b",
        label: "Blindar a economia e esperar",
        tag: "prudente",
        text: "Reserva e defesa: mais energia e resistência.",
        effect: { doctrine: "Defesa territorial", mods: { ...energy(3) } },
      },
    ],
  },
  c19: {
    chapterId: "c19",
    prompt: "Um relatório redesenha a medicina. Você compra a tese ou forma os seus?",
    options: [
      {
        id: "c19-a",
        label: "Adotar o modelo e padronizar",
        tag: "técnico",
        text: "Eficiência: apoio e reposição melhores.",
        effect: { research: 2, mods: { ...dmg("apoio", 0.18) } },
      },
      {
        id: "c19-b",
        label: "Formar escola própria",
        tag: "político",
        text: "Autonomia: soberanos e infantaria resistente.",
        effect: { sovereigns: 130, mods: { ...inf(0.12) } },
      },
    ],
  },
  c20: {
    chapterId: "c20",
    prompt: "Febre amarela na fronteira. Prioridade: sanear ou conter?",
    options: [
      {
        id: "c20-a",
        label: "Saneamento e logística",
        tag: "prudente",
        text: "Estrutura primeiro: energia e visão para enxergar o surto.",
        effect: { mods: { ...energy(2), ...sight(0.15) } },
      },
      {
        id: "c20-b",
        label: "Cordão sanitário e ação rápida",
        tag: "ousado",
        text: "Mobilidade para isolar o foco antes que se espalhe.",
        effect: {
          doctrine: "Mobilidade",
          mods: { ...speed("infantaria", 0.15), ...capture(0.12) },
        },
      },
    ],
  },
  c21: {
    chapterId: "c21",
    prompt: "Um instituto financia antropologia e eugenia. Você participa?",
    options: [
      {
        id: "c21-a",
        label: "Recusar e denunciar",
        tag: "político",
        text: "Custo diplomático, ganho moral: soberanos e captura.",
        effect: { sovereigns: 120, mods: { ...capture(0.15) } },
      },
      {
        id: "c21-b",
        label: "Infiltrar e usar os dados",
        tag: "técnico",
        text: "Inteligência: visão ampliada e reconhecimento veloz.",
        effect: { mods: { ...sight(0.3), ...speed("reconhecimento", 0.12) } },
      },
    ],
  },
  c22: {
    chapterId: "c22",
    prompt: "Um projeto militar quer prever insurgências na América Latina. E você?",
    options: [
      {
        id: "c22-a",
        label: "Prever e antecipar o movimento",
        tag: "técnico",
        text: "Inteligência preditiva: visão e reconhecimento.",
        effect: { mods: { ...sight(0.25), ...speed("reconhecimento", 0.15) } },
      },
      {
        id: "c22-b",
        label: "Reagir com força visível",
        tag: "ousado",
        text: "Presença dissuasória: infantaria e blindado reforçados.",
        effect: { mods: { ...inf(0.12), ...dmg("blindado", 0.1) } },
      },
    ],
  },
  c23: {
    chapterId: "c23",
    prompt: "Uma escola forma gerações de oficiais. Você manda gente para lá?",
    options: [
      {
        id: "c23-a",
        label: "Mandar e absorver a doutrina",
        tag: "técnico",
        text: "Doutrina de operações combinadas, bem coordenada.",
        effect: {
          doctrine: "Operações combinadas",
          mods: { ...dmg("infantaria", 0.1), ...dmg("blindado", 0.1) },
        },
      },
      {
        id: "c23-b",
        label: "Recusar e formar em casa",
        tag: "político",
        text: "Autonomia: mais energia e infantaria firme.",
        effect: { mods: { ...energy(3), ...inf(0.08) } },
      },
    ],
  },
  c24: {
    chapterId: "c24",
    prompt: "Guatemala, 1954: um governo reformista é derrubado. O que você faz?",
    options: [
      {
        id: "c24-a",
        label: "Denunciar a intervenção",
        tag: "político",
        text: "Preço diplomático, ganho de legitimidade: soberanos e captura.",
        effect: { sovereigns: 140, mods: { ...capture(0.15) } },
      },
      {
        id: "c24-b",
        label: "Aprender com a operação",
        tag: "técnico",
        text: "Estudo de caso: visão e reconhecimento.",
        effect: { research: 2, mods: { ...sight(0.2) } },
      },
    ],
  },
  c25: {
    chapterId: "c25",
    prompt: "A Aliança oferece dinheiro com condições. Aceita com que cláusula?",
    options: [
      {
        id: "c25-a",
        label: "Aceitar recursos, recusar a agenda",
        tag: "político",
        text: "Dinheiro entra, decisão fica: energia e soberanos.",
        effect: { mods: { ...energy(3) }, sovereigns: 160 },
      },
      {
        id: "c25-b",
        label: "Recusar tudo e ficar limpo",
        tag: "prudente",
        text: "Sem dívida política: defesa territorial sólida.",
        effect: { doctrine: "Defesa territorial", mods: { ...inf(0.12) } },
      },
    ],
  },
  c26: {
    chapterId: "c26",
    prompt: "Uma CPI investiga financiamento estrangeiro de propaganda. Como conduz?",
    options: [
      {
        id: "c26-a",
        label: "Abrir tudo ao público",
        tag: "político",
        text: "Transparência como arma: captura e soberanos.",
        effect: { mods: { ...capture(0.18) }, sovereigns: 110 },
      },
      {
        id: "c26-b",
        label: "Investigar em sigilo técnico",
        tag: "técnico",
        text: "Prova documental: visão e pesquisa.",
        effect: { research: 2, mods: { ...sight(0.2) } },
      },
    ],
  },
  c27: {
    chapterId: "c27",
    prompt: "Uma torre promete energia sem fio. Financia o sonho ou o concreto?",
    options: [
      {
        id: "c27-a",
        label: "Financiar o experimento",
        tag: "ousado",
        text: "Aposta de alto risco: artilharia e apoio com mais dano.",
        effect: { research: 2, mods: { ...dmg("artilharia", 0.15), ...dmg("apoio", 0.1) } },
      },
      {
        id: "c27-b",
        label: "Financiar a rede física",
        tag: "prudente",
        text: "Infraestrutura confiável: energia e resistência.",
        effect: { mods: { ...energy(3), ...inf(0.08) } },
      },
    ],
  },
  c28: {
    chapterId: "c28",
    prompt: "Um gênio morre sozinho e endividado. O que você tira disso?",
    options: [
      {
        id: "c28-a",
        label: "Proteger quem inventa",
        tag: "político",
        text: "Política de ciência: pesquisa e soberanos.",
        effect: { research: 3, sovereigns: 100 },
      },
      {
        id: "c28-b",
        label: "Industrializar a patente",
        tag: "técnico",
        text: "Escala industrial: blindado e artilharia reforçados.",
        effect: { mods: { ...dmg("blindado", 0.12), ...dmg("artilharia", 0.1) } },
      },
    ],
  },
  c29: {
    chapterId: "c29",
    prompt: "A guerra das correntes decide como o mundo acende. Qual corrente você adota?",
    options: [
      {
        id: "c29-a",
        label: "Corrente alternada: distribuir longe",
        tag: "técnico",
        text: "Alcance e eficiência: artilharia e apoio com dano ampliado.",
        effect: { doctrine: "Poder de fogo", mods: { ...dmg("artilharia", 0.12) } },
      },
      {
        id: "c29-b",
        label: "Corrente contínua: controlar perto",
        tag: "prudente",
        text: "Controle local: defesa territorial e energia.",
        effect: { doctrine: "Defesa territorial", mods: { ...energy(2), ...inf(0.1) } },
      },
    ],
  },
  c30: {
    chapterId: "c30",
    prompt: "O automóvel redesenha a cidade. Você planeja para o carro ou para a rua?",
    options: [
      {
        id: "c30-a",
        label: "Planejar para o automóvel",
        tag: "ousado",
        text: "Fluxo rápido: mobilidade e blindado veloz.",
        effect: { doctrine: "Mecanizada", mods: { ...speed("blindado", 0.15) } },
      },
      {
        id: "c30-b",
        label: "Planejar para quem mora ali",
        tag: "político",
        text: "Cidade viva: captura territorial e energia.",
        effect: { mods: { ...capture(0.15), ...energy(2) } },
      },
    ],
  },
  c31: {
    chapterId: "c31",
    prompt: "Uma via expressa vai rasgar um bairro. De que lado você fica?",
    options: [
      {
        id: "c31-a",
        label: "Derrubar a via expressa",
        tag: "político",
        text: "Vitória comunitária: captura e soberanos.",
        effect: { mods: { ...capture(0.2) }, sovereigns: 130 },
      },
      {
        id: "c31-b",
        label: "Engenhar a solução técnica",
        tag: "técnico",
        text: "Alternativa viável: apoio e visão.",
        effect: { research: 2, mods: { ...dmg("apoio", 0.12), ...sight(0.1) } },
      },
    ],
  },
  c32: {
    chapterId: "c32",
    prompt: "Ruas vivas resistem mais que concreto. Como você defende a cidade?",
    options: [
      {
        id: "c32-a",
        label: "Defesa em rede, quarteirão a quarteirão",
        tag: "prudente",
        text: "Defesa territorial distribuída, captura firme.",
        effect: { doctrine: "Defesa territorial", mods: { ...capture(0.18), ...inf(0.1) } },
      },
      {
        id: "c32-b",
        label: "Mobilidade urbana rápida",
        tag: "ousado",
        text: "Mobilidade para socorrer qualquer ponto.",
        effect: { doctrine: "Mobilidade", mods: { ...speed("infantaria", 0.15) } },
      },
    ],
  },
  c33: {
    chapterId: "c33",
    prompt: "A imprensa vira canal de influência. Como você trata a informação?",
    options: [
      {
        id: "c33-a",
        label: "Construir mídia própria",
        tag: "político",
        text: "Contra-narrativa: captura e soberanos.",
        effect: { mods: { ...capture(0.15) }, sovereigns: 120 },
      },
      {
        id: "c33-b",
        label: "Blindar a informação crítica",
        tag: "técnico",
        text: "Segurança de comunicações: visão e reconhecimento.",
        effect: { mods: { ...sight(0.25), ...speed("reconhecimento", 0.1) } },
      },
    ],
  },
  c34: {
    chapterId: "c34",
    prompt: "Um programa infiltra e desacredita opositores. Sua resposta?",
    options: [
      {
        id: "c34-a",
        label: "Expor o programa",
        tag: "político",
        text: "Denúncia pública: soberanos e captura.",
        effect: { sovereigns: 140, mods: { ...capture(0.12) } },
      },
      {
        id: "c34-b",
        label: "Contrainteligência defensiva",
        tag: "técnico",
        text: "Fecha as brechas: visão e resistência de infantaria.",
        effect: { mods: { ...sight(0.2), ...inf(0.1) } },
      },
    ],
  },
  c35: {
    chapterId: "c35",
    prompt: "Ditaduras coordenam a perseguição além-fronteiras. Como você reage?",
    options: [
      {
        id: "c35-a",
        label: "Rede de proteção regional",
        tag: "político",
        text: "Solidariedade como força: soberanos e captura.",
        effect: { sovereigns: 150, mods: { ...capture(0.15) } },
      },
      {
        id: "c35-b",
        label: "Blindar as fronteiras",
        tag: "prudente",
        text: "Cerco defensivo: defesa territorial e energia.",
        effect: { doctrine: "Defesa territorial", mods: { ...energy(3) } },
      },
    ],
  },
  c36: {
    chapterId: "c36",
    prompt: "A guerra moderna combina política, economia e informação. Sua doutrina?",
    options: [
      {
        id: "c36-a",
        label: "Guerra total e integrada",
        tag: "técnico",
        text: "Operações combinadas: tudo se cobre.",
        effect: {
          doctrine: "Operações combinadas",
          mods: { ...dmg("infantaria", 0.1), ...dmg("apoio", 0.1) },
        },
      },
      {
        id: "c36-b",
        label: "Foco na capacidade de fogo",
        tag: "ousado",
        text: "Poder de fogo concentrado.",
        effect: { doctrine: "Poder de fogo", mods: { ...dmg("artilharia", 0.15) } },
      },
    ],
  },
  c37: {
    chapterId: "c37",
    prompt: "Revoluções coloridas e guerra não convencional. Como você se prepara?",
    options: [
      {
        id: "c37-a",
        label: "Resiliência social e informação",
        tag: "político",
        text: "Blindagem da opinião: captura e energia.",
        effect: { mods: { ...capture(0.18), ...energy(2) } },
      },
      {
        id: "c37-b",
        label: "Unidades irregulares próprias",
        tag: "ousado",
        text: "Mobilidade e reconhecimento extremos.",
        effect: {
          doctrine: "Mobilidade",
          mods: { ...speed("reconhecimento", 0.2), ...sight(0.15) },
        },
      },
    ],
  },
  c38: {
    chapterId: "c38",
    prompt: "Snowden expõe vigilância em massa. O que você faz com a revelação?",
    options: [
      {
        id: "c38-a",
        label: "Denunciar e exigir soberania de dados",
        tag: "político",
        text: "Ganho diplomático: soberanos e captura.",
        effect: { sovereigns: 160, mods: { ...capture(0.12) } },
      },
      {
        id: "c38-b",
        label: "Criptografar as comunicações",
        tag: "técnico",
        text: "Contra-vigilância: visão e reconhecimento.",
        effect: { mods: { ...sight(0.3), ...speed("reconhecimento", 0.1) } },
      },
    ],
  },
  c39: {
    chapterId: "c39",
    prompt: "Confirmam a espionagem da maior empresa do país. Sua resposta?",
    options: [
      {
        id: "c39-a",
        label: "Proteger a estatal e punir",
        tag: "político",
        text: "Soberania energética: energia e soberanos.",
        effect: { mods: { ...energy(3) }, sovereigns: 140 },
      },
      {
        id: "c39-b",
        label: "Reforçar a segurança cibernética",
        tag: "técnico",
        text: "Defesa digital: visão e resistência.",
        effect: { mods: { ...sight(0.25), ...inf(0.08) } },
      },
    ],
  },
  c40: {
    chapterId: "c40",
    prompt: "Stuxnet sabota centrífugas sem um tiro. Qual sua arma de resposta?",
    options: [
      {
        id: "c40-a",
        label: "Ciberdefesa ofensiva",
        tag: "técnico",
        text: "Sabotagem de precisão: dano de apoio e artilharia.",
        effect: { mods: { ...dmg("apoio", 0.2), ...dmg("artilharia", 0.1) } },
      },
      {
        id: "c40-b",
        label: "Blindagem física do alvo",
        tag: "prudente",
        text: "Hardening: defesa territorial e energia.",
        effect: { doctrine: "Defesa territorial", mods: { ...energy(3), ...inf(0.1) } },
      },
    ],
  },
  c41: {
    chapterId: "c41",
    prompt: "Dados de redes sociais viram mira de propaganda. Como você entra?",
    options: [
      {
        id: "c41-a",
        label: "Lutar pela verdade dos dados",
        tag: "político",
        text: "Regulação e transparência: captura e soberanos.",
        effect: { mods: { ...capture(0.15) }, sovereigns: 130 },
      },
      {
        id: "c41-b",
        label: "Usar os dados com ética técnica",
        tag: "técnico",
        text: "Análise precisa: visão e reconhecimento.",
        effect: { mods: { ...sight(0.25), ...speed("reconhecimento", 0.1) } },
      },
    ],
  },
  c42: {
    chapterId: "c42",
    prompt: "Uma agência estrangeira inflama divisões com contas falsas. Sua arma?",
    options: [
      {
        id: "c42-a",
        label: "Contra-narrativa coordenada",
        tag: "político",
        text: "Reconquista da opinião: captura e soberanos.",
        effect: { mods: { ...capture(0.18) }, sovereigns: 120 },
      },
      {
        id: "c42-b",
        label: "Desmontar a rede por dentro",
        tag: "técnico",
        text: "Inteligência: visão e reconhecimento.",
        effect: { mods: { ...sight(0.3), ...speed("reconhecimento", 0.12) } },
      },
    ],
  },
  c43: {
    chapterId: "c43",
    prompt: "Um software espião invade celulares sem clique. Como você se protege?",
    options: [
      {
        id: "c43-a",
        label: "Blindar os alvos sensíveis",
        tag: "prudente",
        text: "Proteção dura: energia e resistência.",
        effect: { mods: { ...energy(3), ...inf(0.1) } },
      },
      {
        id: "c43-b",
        label: "Caçar os operadores do software",
        tag: "ousado",
        text: "Reconhecimento e velocidade para localizá-los.",
        effect: {
          doctrine: "Mobilidade",
          mods: { ...speed("reconhecimento", 0.18), ...sight(0.15) },
        },
      },
    ],
  },
  c44: {
    chapterId: "c44",
    prompt: "Quem instala a antena 5G controla o fluxo. Você entrega a rede a quem?",
    options: [
      {
        id: "c44-a",
        label: "Rede própria e soberana",
        tag: "político",
        text: "Independência tecnológica: energia e soberanos.",
        effect: { mods: { ...energy(3) }, sovereigns: 150 },
      },
      {
        id: "c44-b",
        label: "Diversificar fornecedores",
        tag: "técnico",
        text: "Redundância: visão e apoio reforçados.",
        effect: { mods: { ...sight(0.2), ...dmg("apoio", 0.12) } },
      },
    ],
  },
  c45: {
    chapterId: "c45",
    prompt: "Vídeos sintéticos simulam falas de pessoas reais. Como luta contra isso?",
    options: [
      {
        id: "c45-a",
        label: "Verificação pública e rápida",
        tag: "político",
        text: "Verdade em tempo real: captura e soberanos.",
        effect: { mods: { ...capture(0.15) }, sovereigns: 120 },
      },
      {
        id: "c45-b",
        label: "Detecção técnica de falsos",
        tag: "técnico",
        text: "Ferramentas de análise: visão e reconhecimento.",
        effect: { mods: { ...sight(0.28), ...speed("reconhecimento", 0.1) } },
      },
    ],
  },
  c46: {
    chapterId: "c46",
    prompt: "Água, aquíferos e floresta entram na conta estratégica. Como você as guarda?",
    options: [
      {
        id: "c46-a",
        label: "Militarizar a guarda dos aquíferos",
        tag: "prudente",
        text: "Guarnição dura: defesa territorial e energia.",
        effect: { doctrine: "Defesa territorial", mods: { ...energy(3), ...inf(0.12) } },
      },
      {
        id: "c46-b",
        label: "Sensoriar a floresta inteira",
        tag: "técnico",
        text: "Vigilância ampla: visão e reconhecimento.",
        effect: { mods: { ...sight(0.3), ...speed("reconhecimento", 0.12) } },
      },
    ],
  },
  c47: {
    chapterId: "c47",
    prompt: "Vazamentos revelam bases, drones e operações secretas. O que você faz?",
    options: [
      {
        id: "c47-a",
        label: "Publicar tudo e expor",
        tag: "político",
        text: "Escândalo internacional: soberanos e captura.",
        effect: { sovereigns: 180, mods: { ...capture(0.12) } },
      },
      {
        id: "c47-b",
        label: "Cruzar os dados em silêncio",
        tag: "técnico",
        text: "Inteligência profunda: visão e pesquisa.",
        effect: { research: 3, mods: { ...sight(0.25) } },
      },
    ],
  },
  c48: {
    chapterId: "c48",
    prompt: "O bloco de emergentes cria bancos e trocas próprias. Você adere?",
    options: [
      {
        id: "c48-a",
        label: "Adensar o bloco e trocar sem dólar",
        tag: "político",
        text: "Autonomia financeira: soberanos e energia.",
        effect: { sovereigns: 170, mods: { ...energy(2) } },
      },
      {
        id: "c48-b",
        label: "Manter as duas pontes abertas",
        tag: "técnico",
        text: "Equilíbrio hábil: apoio e visão.",
        effect: { research: 2, mods: { ...dmg("apoio", 0.12), ...sight(0.12) } },
      },
    ],
  },
  c49: {
    chapterId: "c49",
    prompt: "Todas as peças estão no tabuleiro. Qual delas você move primeiro?",
    options: [
      {
        id: "c49-a",
        label: "Fechar o cerco com operações combinadas",
        tag: "técnico",
        text: "Doutrina integrada: infantaria, blindado e apoio juntos.",
        effect: {
          doctrine: "Operações combinadas",
          mods: { ...dmg("infantaria", 0.12), ...dmg("blindado", 0.12), ...dmg("apoio", 0.12) },
        },
      },
      {
        id: "c49-b",
        label: "Golpe de mobilidade decisivo",
        tag: "ousado",
        text: "Rapidez total para tomar o tabuleiro antes do inimigo.",
        effect: { doctrine: "Mobilidade", mods: { ...speed("infantaria", 0.15), ...capture(0.2) } },
      },
    ],
  },
  c50: {
    chapterId: "c50",
    prompt: "De volta ao presente, você entende a primeira batalha. Como a luta termina?",
    options: [
      {
        id: "c50-a",
        label: "Soberania acima de tudo",
        tag: "prudente",
        text: "Defesa territorial total: a nação não recua.",
        effect: {
          doctrine: "Defesa territorial",
          mods: { ...inf(0.2), ...energy(3), ...capture(0.15) },
        },
      },
      {
        id: "c50-b",
        label: "Ofensiva final coordenada",
        tag: "ousado",
        text: "Todas as armas juntas para encerrar a guerra.",
        effect: {
          doctrine: "Operações combinadas",
          mods: {
            ...dmg("infantaria", 0.15),
            ...dmg("artilharia", 0.15),
            ...dmg("blindado", 0.15),
          },
        },
      },
    ],
  },
};

export function decisionFor(chapterId: string): Decision | undefined {
  return decisions[chapterId];
}

// Soma dois conjuntos de modificadores (acessórios + escolha) sem perder nada.
export function mergeMods(a?: SideModifiers, b?: SideModifiers): SideModifiers {
  const out: SideModifiers = {};
  const add = <K extends "dmg" | "hp" | "speed">(key: K, from?: SideModifiers[K]): void => {
    if (!from) return;
    const target = (out[key] ?? {}) as Record<string, number>;
    for (const [k, v] of Object.entries(from)) target[k] = (target[k] ?? 0) + (v ?? 0);
    out[key] = target as SideModifiers[K];
  };
  const commandMax = (a?.commandMax ?? 0) + (b?.commandMax ?? 0);
  const capture = (a?.capture ?? 0) + (b?.capture ?? 0);
  const sight = (a?.sight ?? 0) + (b?.sight ?? 0);
  if (commandMax) out.commandMax = commandMax;
  if (capture) out.capture = capture;
  if (sight) out.sight = sight;
  add("dmg", a?.dmg);
  add("dmg", b?.dmg);
  add("hp", a?.hp);
  add("hp", b?.hp);
  add("speed", a?.speed);
  add("speed", b?.speed);
  if (Object.keys(out.dmg ?? {}).length === 0) delete out.dmg;
  if (Object.keys(out.hp ?? {}).length === 0) delete out.hp;
  if (Object.keys(out.speed ?? {}).length === 0) delete out.speed;
  return out;
}

export function decisionOption(chapterId: string, optionId: string): DecisionOption | undefined {
  return decisions[chapterId]?.options.find((o) => o.id === optionId);
}

export const allDecisions: Decision[] = Object.values(decisions);
