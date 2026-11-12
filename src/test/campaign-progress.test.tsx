import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StoryBook } from "@/components/campaign/StoryBook";
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

describe("livro de história com escrita ao vivo", () => {
  const pages = [
    { speaker: "Narrador", text: "A nossa luta segue ate hoje." },
    { speaker: "Davi", text: "Se isso e uma guerra, quem declarou?" },
  ];

  it("escreve palavra por palavra, avança com clique e chama onFinish no fim", async () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(
      <StoryBook
        chapterLabel="Ato I · Capítulo 1"
        title="Ruído"
        pages={pages}
        onFinish={onFinish}
      />,
    );
    // no começo, nenhuma palavra apareceu ainda
    expect(screen.queryByText(/A nossa/)).not.toBeInTheDocument();
    // o tempo passa e as palavras vão surgindo
    act(() => {
      vi.advanceTimersByTime(90 * 4);
    });
    expect(screen.getByText(/A nossa luta segue/)).toBeInTheDocument();
    // clique acelera a página inteira
    fireEvent.click(screen.getByRole("button", { name: /Acelerar|Virar/ }));
    expect(screen.getByText(/A nossa luta segue ate hoje\./)).toBeInTheDocument();
    // página 1 de 2
    expect(screen.getByText(/Página 1 \/ 2/)).toBeInTheDocument();
    // clique vira a folha para a segunda página
    fireEvent.click(screen.getByRole("button", { name: /Virar a página/ }));
    act(() => {
      vi.advanceTimersByTime(90 * 10);
    });
    expect(screen.getByText(/Página 2 \/ 2/)).toBeInTheDocument();
    // no fim, o clique conclui o relato
    fireEvent.click(screen.getByRole("button", { name: /Virar a página/ }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("mostra o título e a procedência do capítulo", () => {
    render(
      <StoryBook chapterLabel="Ato I · Capítulo 1" title="Ruído" place="Cidade" era="Hoje" pages={pages} />,
    );
    expect(screen.getByRole("heading", { name: "Ruído" })).toBeInTheDocument();
    expect(screen.getByText(/Cidade · Hoje/)).toBeInTheDocument();
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
