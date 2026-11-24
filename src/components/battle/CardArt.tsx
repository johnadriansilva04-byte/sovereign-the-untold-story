import { cn } from "@/lib/utils";

// ARTE DAS CARTAS: cada função tem uma silhueta própria (soldado, blindado, peça de
// artilharia, drone, suprimento, escudo). Antes a carta estampava o código da unidade
// em letras gigantes que o recorte cortava ("ALTO", "BTP") — a silhueta lê de longe e
// dá cara de carta de unidade em vez de marcador de texto.
const SILHOUETTES: Record<string, { path: string; detail?: string }> = {
  infantaria: {
    // Soldado agachado com fuzil.
    path: "M6 30 L9 22 Q11 18 15 18 L19 18 Q23 18 24 22 L26 30 Z M15 17 A4.6 4.6 0 0 1 24 17 L24 19 L15 19 Z",
    detail: "M22 21 L34 16 L35 18 L24 24 Z M9 30 L11 26 L13 30 Z M18 30 L20 26 L22 30 Z",
  },
  blindado: {
    // Carro de combate: esteira, casco e torre com canhão.
    path: "M4 27 L6 21 L30 21 L32 27 Z M8 28 L31 28 L31 31 L8 31 Z",
    detail: "M13 20 L14 15 L24 15 L26 20 Z M25 17 L38 17 L38 18.6 L25 18.6 Z",
  },
  artilharia: {
    // Obus: tubo elevado, mantelete e rodas.
    path: "M4 30 L9 22 L23 22 L28 30 Z",
    detail:
      "M18 21 L36 9 L37.6 10.4 L20 23 Z M9 30 A3.6 3.6 0 1 1 9 37 A3.6 3.6 0 1 1 9 30 Z M23 30 A3.6 3.6 0 1 1 23 37 A3.6 3.6 0 1 1 23 30 Z",
  },
  reconhecimento: {
    // Drone de asa rotativa visto de cima.
    path: "M16 18 L21 18 L23 22 L21 26 L16 26 L14 22 Z",
    detail:
      "M14 18 L4 12 L6 9 L16 15 Z M23 15 L33 9 L35 12 L25 18 Z M14 26 L4 32 L6 35 L16 29 Z M23 29 L33 35 L35 32 L25 26 Z",
  },
  apoio: {
    // Caixa de suprimento com faixa de carga.
    path: "M6 22 L34 22 L34 34 L6 34 Z M9 22 L11 17 L29 17 L31 22 Z",
    detail: "M6 26 L34 26 L34 28.6 L6 28.6 Z",
  },
  defesa: {
    // Escudo de posição fortificada.
    path: "M20 6 L34 12 L34 22 Q34 32 20 38 Q6 32 6 22 L6 12 Z",
    detail: "M20 13 L20 32 M12 21 L28 21",
  },
};

export function CardArt({
  category,
  className,
  tone = "currentColor",
}: {
  category: string;
  className?: string;
  tone?: string;
}) {
  const art = SILHOUETTES[category] ?? SILHOUETTES["apoio"]!;
  return (
    <svg
      viewBox="0 0 40 42"
      className={cn("h-16 w-16", className)}
      fill="none"
      stroke={tone}
      strokeWidth="1.1"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden
    >
      <path d={art.path} fill={tone} fillOpacity="0.22" stroke={tone} />
      {art.detail && <path d={art.detail} fill={tone} fillOpacity="0.3" stroke={tone} />}
    </svg>
  );
}
