import { cn } from "@/lib/utils";

// BANDEIRA DO LADO. O dado do país é um emoji (`🇧🇷`), e emoji de bandeira não
// renderiza em todo sistema (Windows mostra as letras "BR"; alguns ambientes mostram
// um quadrado vazio). No HUD da batalha a bandeira do Brasil é desenhada em SVG — nítida
// em qualquer zoom — e os símbolos das organizações adversárias seguem como emoji.
export function NationFlag({
  flag,
  className,
  label,
}: {
  flag: string;
  className?: string;
  label?: string;
}) {
  if (flag === "🇧🇷") {
    return (
      <svg
        viewBox="0 0 20 14"
        role="img"
        aria-label={label ?? "Brasil"}
        className={cn("h-3 w-[1.15rem] shrink-0", className)}
      >
        <rect width="20" height="14" rx="0.6" fill="#009C3B" />
        <path d="M10 1.5 L18.4 7 L10 12.5 L1.6 7 Z" fill="#FFDF00" />
        <circle cx="10" cy="7" r="3.1" fill="#002776" />
        <path d="M7.1 6.2 Q10 4.8 12.9 6.2" stroke="#ffffff" strokeWidth="1.15" fill="none" />
      </svg>
    );
  }
  return (
    <span aria-label={label} className={cn("shrink-0 text-base leading-none", className)}>
      {flag}
    </span>
  );
}
