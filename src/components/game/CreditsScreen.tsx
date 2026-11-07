import { GameShell, PageTitle, Panel, EvidenceBadge } from "@/components/game/shell";
import { archives } from "@/game/campaign";

export function CreditsScreen() {
  return (
    <GameShell>
      <PageTitle kicker="Ficha técnica" title="Créditos">
        SOVEREIGN é uma obra de ficção construída sobre fatos verificáveis. Toda afirmação marcada
        como fato ou documento tem fonte; a tese que conecta esses fatos é a interpretação do jogo.
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Equipe e homenagem">
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              <b className="text-foreground">Desenvolvido por Variant.</b> Um estúdio dedicado a
              contar histórias que costumam ficar fora dos livros — e, sobretudo, a honrar a Força
              Expedicionária Brasileira.
            </p>
            <p>
              Aos pracinhas que embarcaram rumo à Itália, lutaram contra o fascismo e voltaram para
              um país que preferiu esquecer: esta obra é para vocês. Cerca de 25 mil brasileiros
              serviram na Itália; cerca de 450 não voltaram.
            </p>
            <p className="font-mono text-[11px] uppercase tracking-wider text-primary">
              "A cobra vai fumar." — emblema da FEB
            </p>
          </div>
        </Panel>

        <Panel title="Como ler os fatos">
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>
              <EvidenceBadge kind="fato" />
              <span className="mt-1 block">Datas, números e eventos históricos verificáveis.</span>
            </li>
            <li>
              <EvidenceBadge kind="documento" />
              <span className="mt-1 block">Citações, símbolos e registros de época.</span>
            </li>
            <li>
              <EvidenceBadge kind="ficcao" />
              <span className="mt-1 block">
                A narrativa que liga os fatos — tese do jogo, apresentada como ficção.
              </span>
            </li>
          </ul>
        </Panel>

        <Panel title="Fontes citadas na campanha" className="lg:col-span-2">
          <div className="grid gap-3 md:grid-cols-2">
            {archives.map((a) => (
              <div key={a.id} className="border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold uppercase">{a.title}</span>
                  <EvidenceBadge kind={a.kind} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{a.text}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-primary">
                  {a.date}
                  {a.source ? ` · ${a.source}` : ""}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </GameShell>
  );
}
