import { createFileRoute, Link } from "@tanstack/react-router";

import hero from "@/assets/hero-sovereign.jpg";
import { Footer, pageHead } from "@/components/game/shell";
import { useProfile } from "@/game/progress/store";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "A história que não te contaram",
      "SOVEREIGN: estratégia geopolítica, batalhas táticas e uma campanha que vai da guerra híbrida de hoje à Força Expedicionária Brasileira.",
    ),
  component: Index,
});

const menu = [
  { to: "/campanha", label: "Campanha", sub: "50 operações" },
  { to: "/multiplayer", label: "Multiplayer", sub: "Salas e países" },
  { to: "/colecao", label: "Coleção", sub: "Cartas e baralhos" },
  { to: "/perfil", label: "Perfil", sub: "Progresso e conta" },
] as const;

function Index() {
  const { profile } = useProfile();
  return (
    <div className="relative flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden">
      <img
        src={hero}
        alt="Pracinha da FEB nos Apeninos diante de uma cidade moderna"
        width={1920}
        height={1088}
        className="absolute inset-0 h-full w-full object-cover opacity-70"
      />
      <div className="absolute inset-0 bg-vignette" />
      <div className="absolute inset-0 scanlines" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-between px-5 py-4 md:px-16 md:py-10">
        <div className="flex items-center justify-between label-mono">
          <span>SOVEREIGN · motor de batalha</span>
          <span className="animate-flicker text-primary">
            ● {profile.displayName || "Comandante"}
          </span>
        </div>

        <div className="grid min-h-0 items-end gap-6 lg:grid-cols-[1.2fr_1fr] lg:gap-12">
          <div className="animate-rise">
            <p className="label-mono text-primary">
              Estratégia geopolítica · Combate em tempo real
            </p>
            <h1 className="mt-1 text-5xl font-black uppercase leading-[0.85] md:mt-2 md:text-[9rem]">
              Sovereign
            </h1>
            <p className="mt-2 font-serif text-xl italic text-foreground/90 md:mt-4 md:text-3xl">
              Conquiste território. Construa bases. Domine o campo.
            </p>
            <Link
              to="/campanha"
              className="mt-5 inline-block bg-primary px-10 py-4 font-mono text-base uppercase tracking-[0.25em] text-primary-foreground shadow-brass transition hover:brightness-110 md:mt-8 md:text-lg"
            >
              Iniciar batalha
            </Link>
          </div>

          <nav
            className="hud-panel hud-corners flex min-h-0 flex-col divide-y divide-border overflow-hidden animate-rise"
            style={{ animationDelay: "0.2s" }}
          >
            {menu.map((m, i) => (
              <Link
                key={m.to + m.label}
                to={m.to}
                className="group flex flex-1 items-center justify-between gap-2 px-4 py-2 transition hover:bg-accent md:px-6 md:py-3.5"
              >
                <span className="flex items-baseline gap-3 md:gap-4">
                  <span className="font-mono text-[10px] text-muted-foreground md:text-xs">
                    0{i + 1}
                  </span>
                  <span
                    className={`font-display text-lg font-bold uppercase tracking-wide group-hover:text-primary md:text-2xl ${i === 0 ? "text-primary" : ""}`}
                  >
                    {m.label}
                  </span>
                </span>
                <span className="hidden font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:block">
                  {m.sub}
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <div className="relative z-10 hidden md:block">
        <Footer />
      </div>
    </div>
  );
}
