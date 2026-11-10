import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CampaignComic } from "@/components/campaign/CampaignComic";
import { chapters } from "@/game/campaign";
import { applyChapterResult, createProfile } from "@/game/progress/profile";
import { chapterMeta, chapterMetaById } from "@/game/progress/campaign";
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
