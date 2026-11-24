// IDENTIDADE DO CHANCELER: o chefe de Estado em campo é a peça que decide a batalha, e
// um nome próprio com um tempero claro faz o jogador tratá-lo como personagem — não como
// mais um ícone. A persona é derivada do país da facção; forças irregulares têm a sua.

export interface ChancellorPersona {
  name: string;
  title: string;
  /** Maneira de comandar, em uma palavra — aparece no cartão do herói. */
  trait: string;
  bio: string;
}

const PERSONAS: Record<string, ChancellorPersona> = {
  br: {
    name: "Davi Moraes",
    title: "Chanceler do Brasil",
    trait: "Metódico",
    bio: "27 anos, analista de dados. Comanda o campo como lê um grafo: cada peça tem de justificar a posição.",
  },
  us: {
    name: "O Curador",
    title: "Chancelaria irregular",
    trait: "Paciente",
    bio: "Não é uma pessoa: é a soma de interesses que preferem que você não lembre. Fala pouco e não recua.",
  },
  de: {
    name: "Cel. Adler",
    title: "Chancelaria estrangeira",
    trait: "Obstinado",
    bio: "Veterano de doutrina de choque. Não negocia posição conquistada e cobra do subordinado a mesma teimosia.",
  },
};

export function chancellorPersona(countryId?: string, countryName?: string): ChancellorPersona {
  const known = countryId ? PERSONAS[countryId] : undefined;
  if (known) return known;
  return {
    name: "Chanceler",
    title: countryName ? `Chancelaria · ${countryName}` : "Chanceler",
    trait: "Imprevisível",
    bio: "Chefe de Estado em campo. Proteja o seu e elimine o adversário.",
  };
}

// ---------------------------------------------------------------------------
// O NOSSO chanceler é criado pelo jogador no começo da campanha: nome, uniforme e
// estilo de comando. A persona acima vale para o ADVERSÁRIO (o jogo precisa de um nome
// pronto para quem entra em campo contra você).
// ---------------------------------------------------------------------------

export interface ChancellorIdentity {
  name: string;
  /** Estilo de comando (ver `CHANCELLOR_TRAITS`). */
  traitId: string;
  /** Uniforme (ver `CHANCELLOR_UNIFORMS`) — vira a cor do retrato e do marcador em campo. */
  uniformId: string;
  bio: string;
}

/** Bônus numéricos dos equipamentos. Somam sobre os atributos da carta de herói. */
export interface ChancellorMods {
  speed?: number;
  hp?: number;
  dmg?: number;
  range?: number;
  /** Segundos somados ao intervalo entre disparos (use negativo para atirar mais rápido). */
  cooldown?: number;
  projectileSpeed?: number;
}

/** O que a batalha recebe: identidade + arma equipada + bônus somados. */
export interface ChancellorLoadout extends ChancellorIdentity {
  weaponName?: string;
  gearIds: string[];
  mods: ChancellorMods;
}

export interface ChancellorTrait {
  id: string;
  name: string;
  bio: string;
}

// Estilos de comando: muda a BIO (o jogador escolhe como quer ser lido pelo exército),
// não os números — bônus de combate vêm do equipamento, para não vender vantagem.
export const CHANCELLOR_TRAITS: ChancellorTrait[] = [
  {
    id: "metodico",
    name: "Metódico",
    bio: "Lê o campo como um grafo: cada peça tem de justificar a posição antes de se mover.",
  },
  {
    id: "impetuoso",
    name: "Impetuoso",
    bio: "Abre caminho no primeiro sinal de brecha e cobra da tropa a mesma pressa que tem.",
  },
  {
    id: "prudente",
    name: "Prudente",
    bio: "Ganha terreno devagar e não devolve: prefere a posição boa ao abate bonito.",
  },
  {
    id: "tecnico",
    name: "Técnico",
    bio: "Confia em rádio, mapa e número. Improvisa só quando o plano quebra de vez.",
  },
  {
    id: "insurgente",
    name: "Insurgente",
    bio: "Comanda de dentro da linha, sem cerimônia: o exemplo vale mais que a ordem escrita.",
  },
];

export interface ChancellorUniform {
  id: string;
  name: string;
  /** Cor do uniforme no retrato e no marcador do chanceler em campo. */
  color: string;
}

export const CHANCELLOR_UNIFORMS: ChancellorUniform[] = [
  { id: "oliva", name: "Verde-oliva", color: "oklch(0.52 0.06 130)" },
  { id: "areia", name: "Areia", color: "oklch(0.66 0.05 85)" },
  { id: "grafite", name: "Grafite", color: "oklch(0.42 0.012 260)" },
  { id: "noturno", name: "Azul-noturno", color: "oklch(0.44 0.05 250)" },
  { id: "cacau", name: "Cacau", color: "oklch(0.48 0.05 55)" },
];

export function traitById(id?: string): ChancellorTrait {
  return CHANCELLOR_TRAITS.find((t) => t.id === id) ?? CHANCELLOR_TRAITS[0]!;
}

export function uniformById(id?: string): ChancellorUniform {
  return CHANCELLOR_UNIFORMS.find((u) => u.id === id) ?? CHANCELLOR_UNIFORMS[0]!;
}

/** Identidade padrão (Davi, o chanceler do Brasil) — usada antes da criação e como base. */
export function defaultIdentity(): ChancellorIdentity {
  return {
    name: PERSONAS["br"]!.name,
    traitId: "metodico",
    uniformId: "oliva",
    bio: PERSONAS["br"]!.bio,
  };
}
