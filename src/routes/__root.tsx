import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  Navigate,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ProfileProvider, useProfile } from "@/game/progress/store";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Território não mapeado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta página não existe ou foi apagada da história.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Voltar ao menu
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta tela não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado. Tente novamente ou volte ao menu.
        </p>
        {import.meta.env.DEV && (
          <pre className="mt-3 max-h-40 overflow-auto border border-input bg-muted/40 p-2 text-left font-mono text-[11px] whitespace-pre-wrap text-destructive">
            {error instanceof Error ? `${error.name}: ${error.message}` : String(error)}
          </pre>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Tentar de novo
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center border border-input px-4 py-2 text-sm font-medium text-foreground"
          >
            Menu
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SOVEREIGN — A história que não te contaram" },
      {
        name: "description",
        content:
          "Jogo de estratégia geopolítica e campanha histórica sobre a Força Expedicionária Brasileira e a guerra híbrida.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;700&family=Big+Shoulders+Display:wght@600;800;900&family=JetBrains+Mono:wght@400;600&family=Spectral:ital,wght@0,400;0,600;1,400&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ProfileProvider>
        <DocumentTitle />
        <AuthGate />
        <Toaster />
      </ProfileProvider>
    </QueryClientProvider>
  );
}

// O <HeadContent /> cobre o servidor, mas na navegação do cliente nenhum título novo
// era aplicado e a aba ficava presa na primeira página aberta. Aqui o título acompanha
// a rota resolvida: usa o `meta` já resolvido quando existe e, no cliente, chama o
// `head()` da própria rota — a mesma fonte do SSR, sem duplicar títulos.
type HeadMeta = Array<{ title?: unknown }>;

function titleOfMeta(meta: unknown): string | null {
  if (!Array.isArray(meta)) return null;
  for (const entry of meta as HeadMeta) {
    if (typeof entry?.title === "string" && entry.title) return entry.title;
  }
  return null;
}

function DocumentTitle() {
  const router = useRouter();
  const title = useRouterState({ select: (s) => titleForState(router, s.matches) });
  const titleRef = useRef(title);
  titleRef.current = title;

  // O <HeadContent /> cobre o SSR, mas na navegação do cliente nada repinta a aba — e
  // o React 19 não atualiza o <title> içado depois do primeiro render. O efeito
  // reaplica o título a cada rota e sempre que algo mexe no <head>.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const apply = () => {
      const next = titleRef.current;
      if (next && document.title !== next) document.title = next;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);

  return null;
}

function titleForState(
  router: ReturnType<typeof useRouter>,
  matches: Array<{ routeId: string; meta?: unknown }>,
): string {
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    if (!match) continue;
    const resolved = titleOfMeta((match as { meta?: unknown }).meta);
    if (resolved) return resolved;
    const route = router.routesById[match.routeId] as { options?: { head?: unknown } } | undefined;
    const head = route?.options?.head as ((ctx: never) => unknown) | undefined;
    if (typeof head !== "function") continue;
    try {
      // Só o título interessa; rotas cujo `head` depende de params/loader caem no catch.
      const generated = head({} as never) as { meta?: unknown } | undefined;
      const fromHead = titleOfMeta(generated?.meta);
      if (fromHead) return fromHead;
    } catch {
      /* segue para a rota anterior */
    }
  }
  return "SOVEREIGN — A história que não te contaram";
}

function Connecting() {
  return (
    <div className="flex h-[100dvh] items-center justify-center">
      <p className="animate-flicker font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        Estabelecendo ligação segura…
      </p>
    </div>
  );
}

// Portão de entrada: sem sessão, o jogo mostra a tela de entrar/criar conta.
// A própria rota /entrar fica liberada para evitar laço de redirecionamento.
function AuthGate() {
  const { ready, session } = useProfile();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isEntry = pathname === "/entrar";
  // HIDRATAÇÃO: o servidor não tem localStorage, então `ready` é false no SSR. Se o
  // cliente restaurasse a sessão já no primeiro render, a árvore divergiria do HTML
  // enviado (erro de hydration). Seguramos a tela de ligação até o primeiro efeito —
  // aí cliente e servidor concordam e o portão decide com a sessão real.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  if (!hydrated || !ready) return <Connecting />;
  if (isEntry) return <Outlet />;
  if (!session) return <Navigate to="/entrar" />;
  return <Outlet />;
}
