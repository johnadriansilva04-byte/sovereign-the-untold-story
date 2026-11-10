import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CampaignComic } from "@/components/campaign/CampaignComic";
import { DecisionCard } from "@/components/campaign/DecisionCard";
import { chapters } from "@/game/campaign";
import { applyChapterResult, createProfile } from "@/game/progress/profile";
import { chapterMeta, chapterMetaById } from "@/game/progress/campaign";
import { decisionFor } from "@/game/progress/decisions";
import { ProfileProvider, useProfile } from "@/game/progress/store";
import type { BattleResult } from "@/game/battle/types";

function fakeResult(outcome: BattleResult["outcome"]): BattleResult {
  return {
    configId: "m-apagao",
    missionName: "Operação Apagão",
    outcome,
    reason: "teste",
    duration: 60,
    territorialScore: { blue: 60, red: 40 },
    controlPoints: { blue: 1, red: 0 },
    territories: { blue: 1, red: 0 },
    structuresDestroyed: { blue: 0, red: 0 },
    losses: { blue: 0, red: 0 },
    kills: { blue: 0, red: 0 },
    pointsHeld: [],
  } as unknown as BattleResult;
}

describe("progressão da campanha", () => {
  it("vitória marca o capítulo como concluído e libera o próximo", () => {
    const profile = createProfile();
    const { profile: next } = applyChapterResult(profile, {
      chapterId: "c1",
      result: fakeResult("vitoria"),
      difficulty: "recruta",
      recordId: "r1",
      createdAt: new Date().toISOString(),
    });
    expect(next.chapters["c1"]!.status).toBe("concluido");
    expect(next.chapters["c2"]!.status).toBe("disponivel");

    // A tela de avanço usa exatamente esta regra: primeiro capítulo não concluído.
    const nextMeta = chapterMeta.find((m) => next.chapters[m.id]?.status !== "concluido");
    expect(nextMeta?.id).toBe("c2");
  });

  it("derrota não conclui o capítulo (a fase continua sendo a atual)", () => {
    const profile = createProfile();
    const { profile: next } = applyChapterResult(profile, {
      chapterId: "c1",
      result: fakeResult("derrota"),
      difficulty: "recruta",
      recordId: "r2",
      createdAt: new Date().toISOString(),
    });
    expect(next.chapters["c1"]!.status).not.toBe("concluido");
    expect(next.chapters["c2"]!.status).toBe("bloqueado");
    const nextMeta = chapterMeta.find((m) => next.chapters[m.id]?.status !== "concluido");
    expect(nextMeta?.id).toBe("c1");
  });
});

describe("página de gibi pós-vitória", () => {
  it("mostra título, narrativa, fatos e botão de próxima missão", () => {
    const chapter = chapters.find((c) => c.id === "c1")!;
    const meta = chapterMetaById("c1")!;
    const onNext = vi.fn();
    render(
      <CampaignComic
        chapter={chapter}
        meta={meta}
        terrain="Cidade"
        result={fakeResult("vitoria")}
        reward={{ research: 1, sovereigns: 120, techs: ["t1"], cards: ["inf-fuzil"] }}
        nextTitle="O Blecaute de Dados"
        onNext={onNext}
        onMap={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: chapter.title })).toBeInTheDocument();
    // narrativa (outro do capítulo)
    expect(screen.getByText(meta.outro)).toBeInTheDocument();
    // fatos da narrativa
    expect(screen.getByText("Fatos por trás da história")).toBeInTheDocument();
    // recompensa com nomes legíveis (nunca ids crus)
    expect(screen.getByText(/Tecnologia · Infantaria Avançada/)).toBeInTheDocument();
    expect(screen.getByText(/\+120 Sovereigns/)).toBeInTheDocument();
    // avanço
    expect(
      screen.getByRole("button", { name: /Próxima missão · O Blecaute de Dados/ }),
    ).toBeInTheDocument();
  });
});

describe("dilema de comando antes da batalha", () => {
  it("o DecisionCard mostra prompt, opções e resumo de efeito", () => {
    const decision = decisionFor("c1")!;
    render(
      <DecisionCard
        chapterNumber={1}
        act="Ato I"
        title="Ruído"
        decision={decision}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByText(decision.prompt)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: new RegExp(decision.options[0]!.label) }),
    ).toBeInTheDocument();
    // o resumo traduz o efeito real do motor (doutrina)
    expect(screen.getByText(/Doutrina: Mobilidade/)).toBeInTheDocument();
  });

  it("escolher grava a decisão no perfil e concede o bônus uma única vez", () => {
    function Probe() {
      const { profile, chooseDecision } = useProfile();
      return (
        <div>
          <span data-testid="decision">{profile.decisions["c10"] ?? "nenhuma"}</span>
          <span data-testid="research">{profile.research}</span>
          <span data-testid="sovereigns">{profile.sovereigns}</span>
          <button onClick={() => chooseDecision("c10", "c10-a")}>escolher</button>
        </div>
      );
    }
    const before = createProfile();
    render(
      <ProfileProvider>
        <Probe />
      </ProfileProvider>,
    );
    expect(screen.getByTestId("decision").textContent).toBe("nenhuma");
    fireEvent.click(screen.getByRole("button", { name: "escolher" }));
    expect(screen.getByTestId("decision").textContent).toBe("c10-a");
    // c10-a concede +1 pesquisa e +80 Sovereigns (única vez)
    expect(Number(screen.getByTestId("research").textContent)).toBe(before.research + 1);
    expect(Number(screen.getByTestId("sovereigns").textContent)).toBe(before.sovereigns + 80);
    // escolher de novo a MESMA opção não repete o bônus
    fireEvent.click(screen.getByRole("button", { name: "escolher" }));
    expect(Number(screen.getByTestId("research").textContent)).toBe(before.research + 1);
    expect(Number(screen.getByTestId("sovereigns").textContent)).toBe(before.sovereigns + 80);
  });
});
