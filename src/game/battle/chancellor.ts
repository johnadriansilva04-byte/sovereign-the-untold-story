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
