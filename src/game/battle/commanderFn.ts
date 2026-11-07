// Server function do comandante LLM.
// A chave do modelo vive APENAS no servidor (variável de ambiente), nunca no navegador.
// Se não houver gateway configurado, a função devolve { ok:false } e o cliente usa a
// IA tática local — o modo "Comandante IA (LLM)" nunca fica inutilizável.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  COMMANDER_SYSTEM_PROMPT,
  buildCommanderPrompt,
  clampToLegalPlacement,
  parseCommanderDecision,
  type CommanderContext,
} from "@/game/battle/llm";
import type { BattleState, Side } from "@/game/battle/types";

const inputSchema = z.object({
  context: z.unknown(),
});

export type LlmDecisionResponse =
  | { ok: true; cardId: string; x: number; y: number; reason: string }
  | { ok: false; reason: string };

// A configuração é lida do ambiente do servidor. Nada de segredo no repositório.
function gatewayConfig(): { baseUrl: string; apiKey: string; model: string } | null {
  const env = process.env;
  const baseUrl =
    env["SOVEREIGN_LLM_BASE_URL"] ?? env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1";
  const apiKey = env["SOVEREIGN_LLM_API_KEY"] ?? env["OPENAI_API_KEY"] ?? "";
  const model = env["SOVEREIGN_LLM_MODEL"] ?? "gpt-4o-mini";
  if (!apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, model };
}

export const requestCommanderDecision = createServerFn({ method: "POST" })
  .validator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<LlmDecisionResponse> => {
    const cfg = gatewayConfig();
    if (!cfg) {
      return { ok: false, reason: "Gateway de IA não configurado no servidor." };
    }
    const context = data.context as CommanderContext;
    if (!context || !Array.isArray(context.legalCardIds)) {
      return { ok: false, reason: "Contexto inválido." };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0.7,
          max_tokens: 200,
          messages: [
            { role: "system", content: COMMANDER_SYSTEM_PROMPT },
            { role: "user", content: buildCommanderPrompt(context) },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        return { ok: false, reason: `Gateway respondeu ${res.status}.` };
      }
      const payload = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = payload.choices?.[0]?.message?.content ?? "";
      const decision = parseCommanderDecision(content, context.legalCardIds);
      if (!decision) return { ok: false, reason: "Resposta do modelo não utilizável." };
      return { ok: true, ...decision };
    } catch {
      return { ok: false, reason: "Falha ao consultar o modelo." };
    } finally {
      clearTimeout(timeout);
    }
  });

// Helper usado pelo cliente para traduzir a decisão em uma jogada legal.
export function applyLlmDecision(
  state: BattleState,
  side: Side,
  decision: { cardId: string; x: number; y: number },
): { cardId: string; x: number; y: number } {
  const pos = clampToLegalPlacement(state, side, decision.cardId, decision.x, decision.y);
  return { cardId: decision.cardId, x: pos.x, y: pos.y };
}
