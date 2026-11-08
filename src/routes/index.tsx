import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import hero from "@/assets/hero-sovereign.jpg";
import { Footer, pageHead } from "@/components/game/shell";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "A história que não te contaram",
      "SOVEREIGN: estratégia geopolítica, batalhas táticas e uma campanha que vai da guerra híbrida de hoje à Força Expedicionária Brasileira.",
    ),
  component: Index,
});

const menu = [
  { to: "/campanha", label: "Campanha", sub: "A história que não te contaram" },
  { to: "/multiplayer", label: "Multiplayer", sub: "Salas, lobbies e países" },
  { to: "/mapa", label: "Continuar partida", sub: "Atlântico Sul · Turno 14" },
  { to: "/eventos", label: "Partidas salvas", sub: "3 registros locais" },
  { to: "/perfil", label: "Perfil", sub: "Cmdt. Davi" },
  { to: "/configuracoes", label: "Configurações", sub: "Áudio, vídeo, controles" },
  { to: "/creditos", label: "Créditos", sub: "" },
] as const;

function Index() {
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
          <span>v0.1 · protótipo de interface</span>
          <span className="animate-flicker text-primary">● sinal instável</span>
        </div>

        <div className="grid min-h-0 items-end gap-6 lg:grid-cols-[1.2fr_1fr] lg:gap-12">
          <div className="animate-rise">
            <p className="label-mono text-primary">
              Estratégia geopolítica · Batalhas táticas · Campanha histórica
            </p>
            <h1 className="mt-1 text-5xl font-black uppercase leading-[0.85] md:mt-2 md:text-[9rem]">
              Sovereign
            </h1>
            <p className="mt-2 font-serif text-xl italic text-foreground/90 md:mt-4 md:text-3xl">
              A história que não te contaram.
            </p>
            <p className="mt-3 hidden max-w-lg text-muted-foreground sm:block md:mt-6">
              Você acha que vive em paz. Não vive. Lute a primeira batalha sem saber contra quem — e
              descubra, arquivo por arquivo, a trilha que liga os pracinhas de Monte Castello à
              guerra de hoje.
            </p>
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
            <button
              onClick={() =>
                toast("Sair do jogo", { description: "No navegador, basta fechar a aba." })
              }
              className="px-4 py-2 text-left font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-destructive md:px-6 md:py-3"
            >
              Sair
            </button>
          </nav>
        </div>
      </div>
      <div className="relative z-10 hidden md:block">
        <Footer />
      </div>
    </div>
  );
}
