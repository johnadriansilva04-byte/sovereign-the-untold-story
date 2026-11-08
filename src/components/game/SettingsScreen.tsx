import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { GameShell, PageTitle, Panel } from "@/components/game/shell";
import { useProfile } from "@/game/progress/store";
import { isSupabaseConfigured } from "@/lib/supabase";

const STORAGE_KEY = "sovereign.settings.v1";

interface Settings {
  battleSpeed: 1 | 2 | 3;
  sound: boolean;
  reduceMotion: boolean;
  showHints: boolean;
}

const defaults: Settings = { battleSpeed: 3, sound: true, reduceMotion: false, showHints: true };

function load(): Settings {
  if (typeof localStorage === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return defaults;
  }
}

export function SettingsScreen() {
  const { hardReset, syncNow, signedIn, lastError } = useProfile();
  const [settings, setSettings] = useState<Settings>(defaults);
  const [saved, setSaved] = useState(false);

  useEffect(() => setSettings(load()), []);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => {
      const next = { ...s, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* armazenamento indisponível: mantém apenas em memória */
      }
      setSaved(true);
      return next;
    });
  };

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1600);
    return () => clearTimeout(t);
  }, [saved]);

  return (
    <GameShell>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <PageTitle kicker="Preferências" title="Configurações" compact>
          Ajustes locais de jogo, salvos neste dispositivo.
        </PageTitle>

        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto pr-1 lg:grid-cols-2">
          <Panel title="Batalha">
            <Row label="Velocidade padrão da batalha">
              <div className="flex gap-1">
                {([1, 2, 3] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => update("battleSpeed", s)}
                    className={cn(
                      "border px-3 py-1 font-mono text-xs",
                      settings.battleSpeed === s
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Mostrar dicas táticas">
              <Toggle value={settings.showHints} onChange={(v) => update("showHints", v)} />
            </Row>
            <Row label="Sons de interface">
              <Toggle value={settings.sound} onChange={(v) => update("sound", v)} />
            </Row>
            <Row label="Reduzir animações">
              <Toggle value={settings.reduceMotion} onChange={(v) => update("reduceMotion", v)} />
            </Row>
            {saved && (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-fact">
                preferências salvas
              </p>
            )}
          </Panel>

          <Panel title="Conta e dados">
            <div className="space-y-3 font-mono text-[11px]">
              <Row label="Armazenamento" plain>
                <span className="text-foreground">local (offline-first)</span>
              </Row>
              <Row label="Supabase" plain>
                <span className={isSupabaseConfigured ? "text-fact" : "text-muted-foreground"}>
                  {isSupabaseConfigured ? "configurado" : "não configurado"}
                </span>
              </Row>
              <Row label="Sessão" plain>
                <span className={signedIn ? "text-fact" : "text-muted-foreground"}>
                  {signedIn ? "ativa" : "local"}
                </span>
              </Row>
            </div>
            {lastError && (
              <p className="mt-3 text-[11px] text-destructive">
                Última falha de sincronização: {lastError}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => void syncNow()}
                className="border border-primary px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-primary hover:bg-primary hover:text-primary-foreground"
              >
                Sincronizar agora
              </button>
              <Link
                to="/perfil"
                className="border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground hover:border-primary hover:text-primary"
              >
                Abrir perfil
              </Link>
            </div>
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

function Row({
  label,
  children,
  plain,
}: {
  label: string;
  children: React.ReactNode;
  plain?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-2",
        !plain && "border-b border-border/60",
      )}
    >
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cn(
        "h-5 w-10 border transition",
        value ? "border-primary bg-primary/30" : "border-border bg-muted",
      )}
    >
      <span
        className={cn(
          "block h-4 w-4 bg-foreground transition",
          value ? "translate-x-5 bg-primary" : "translate-x-0",
        )}
      />
    </button>
  );
}
