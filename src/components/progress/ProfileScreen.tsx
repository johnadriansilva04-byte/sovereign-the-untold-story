import { cn } from "@/lib/utils";
import { GameShell, PageTitle, Panel } from "@/components/game/shell";
import { totalChapters } from "@/game/progress/campaign";
import { isSupabaseConfigured } from "@/lib/supabase";
import { totalXpForLevel } from "@/game/progress/profile";
import { useProfile } from "@/game/progress/store";

export function ProfileScreen() {
  const { profile, signedIn, lastError, syncNow, setDisplayName, hardReset } = useProfile();
  const lvl = totalXpForLevel(profile.xp);
  const completed = Object.values(profile.chapters).filter((c) => c.status === "concluido").length;

  return (
    <GameShell>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <PageTitle kicker="Comandante" title="Perfil" compact>
          Seu progresso fica salvo neste dispositivo e é sincronizado automaticamente quando há
          conexão. Sem cadastro, sem senha.
        </PageTitle>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto pr-1 lg:grid-cols-2">
          <Panel title="Identidade">
            <label className="label-mono">Nome de guerra</label>
            <input
              value={profile.displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full border border-border bg-background px-3 py-2 font-display text-lg"
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat label="Nível" value={lvl.level} sub={`${lvl.into}/${lvl.need} XP`} />
              <Stat label="Sovereigns" value={profile.sovereigns} />
              <Stat label="Pesquisa" value={profile.research} />
              <Stat label="Capítulos" value={`${completed}/${totalChapters}`} />
            </div>
          </Panel>

          <Panel title="Sincronização automática">
            <div className="space-y-3 font-mono text-[11px]">
              <Row
                label="Nuvem"
                value={isSupabaseConfigured ? "conectada" : "offline"}
                ok={isSupabaseConfigured}
              />
              <Row
                label="Progresso"
                value={signedIn ? "salvo na nuvem" : "salvo neste dispositivo"}
                ok={signedIn}
              />
              <Row label="Registros de batalha" value={profile.records.length} ok />
              <Row label="Cartas" value={Object.keys(profile.inventory.cards).length} ok />
              <Row
                label="Acessórios"
                value={Object.keys(profile.inventory.accessories).length}
                ok
              />
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Sem login: cada dispositivo recebe uma identidade anônima e o progresso sincroniza
              sozinho.
            </p>
            {lastError && (
              <p className="mt-3 text-[11px] text-destructive">
                Última falha de sincronização: {lastError}. O progresso local está intacto.
              </p>
            )}
            <button
              onClick={() => void syncNow()}
              className="mt-4 border border-primary px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-primary hover:bg-primary hover:text-primary-foreground"
            >
              Sincronizar agora
            </button>
          </Panel>

          <Panel title="Histórico de batalhas" className="lg:col-span-2">
            {profile.records.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma batalha registrada ainda.</p>
            ) : (
              <div className="space-y-1">
                {profile.records.slice(0, 15).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between border-b border-border/60 py-1.5 font-mono text-[11px]"
                  >
                    <span className="text-muted-foreground">
                      {r.mode.toUpperCase()} · {r.missionName}
                    </span>
                    <span
                      className={cn(
                        r.outcome === "vitoria" && "text-fact",
                        r.outcome === "derrota" && "text-destructive",
                        r.outcome === "empate" && "text-muted-foreground",
                      )}
                    >
                      {r.outcome} · {r.territorialScore}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Zona de risco" className="lg:col-span-2">
            <p className="text-sm text-muted-foreground">
              Recomeçar apaga o progresso local (campanha, cartas, acessórios). Esta ação não pode
              ser desfeita.
            </p>
            <button
              onClick={() => {
                if (confirm("Apagar todo o progresso local e recomeçar?")) hardReset();
              }}
              className="mt-3 border border-destructive px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              Recomeçar campanha
            </button>
          </Panel>
        </div>
      </div>
    </GameShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-border p-3">
      <p className="label-mono text-[9px]">{label}</p>
      <p className="font-display text-2xl font-bold">{value}</p>
      {sub && <p className="font-mono text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string | number; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(ok ? "text-fact" : "text-muted-foreground")}>{value}</span>
    </div>
  );
}
