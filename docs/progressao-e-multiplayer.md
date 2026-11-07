# Progressão, campanha e multiplayer — desenho de jogo

Documento de design da camada que liga a batalha ao resto do jogo: campanha narrativa,
inventário, árvore tecnológica, PvP e persistência. A batalha em si está descrita em
`docs/batalha.md`.

Implementação: `src/game/progress/` (catálogo, campanha, perfil, PvP, sincronização, store) e
`src/components/{campaign,progress,pvp}/` (interfaces). Rotas: `/campanha`, `/multiplayer`,
`/colecao`, `/nacao`, `/perfil`.

---

## 1. O princípio

Nada é um minigame solto. O que o jogador constrói, pesquisa e conquista na campanha é
exatamente o que ele leva para a batalha — e o resultado da batalha volta para a conta:
cartas novas, acessórios, tecnologia, pesquisa e Sovereigns.

Três regras sustentam isso:

1. **Você só luta com o que tem.** O baralho é montado a partir do inventário real. Uma carta
   que você não desbloqueou não aparece na preparação.
2. **A dificuldade é escolha, não castigo.** Cada capítulo sugere uma dificuldade, e o jogador
   pode subir ou descer. A dificuldade muda o ritmo de decisão da IA, a economia dela e a
   reserva que ela guarda — não "trapaça" (a IA nunca tem visão de mapa indevida nem recursos
   infinitos).
3. **Perder tem consequência.** Na campanha, perder não dá recompensa. No PvP por aposta,
   perder custa cartas de verdade.

---

## 2. Campanha

A campanha é uma trilha de 11 capítulos que vai do presente (guerra híbrida, "Operação
Apagão") até a Força Expedicionária Brasileira na Itália, e volta ao presente ("A Cobra Vai
Fumar"). Cada capítulo tem:

- **Contexto narrativo** (ato, era, local, resumo) — `src/game/campaign.ts`.
- **Briefing com tensão** (`intro`): o que está em jogo antes da batalha.
- **Missão tática** com terreno, objetivo e duração próprios.
- **Dossiê** com as evidências separadas por tipo: `fato` (documentado), `documento`
  (citação/fonte) e `ficcao` (a tese do jogo). O jogo nunca mistura fato e interpretação.
- **Desfecho** (`outro`) na vitória e **desfecho de derrota** (`outroDerrota`) quando a batalha
  se perde — o jogo nunca mostra a narrativa de vitória após uma derrota. A função
  `chapterOutro(meta, outcome)` escolhe o texto certo.
- **Recompensa** que destrava o próximo capítulo — concedida **apenas na vitória**.

A progressão de dificuldade acompanha a progressão narrativa: Recruta no primeiro contato,
Veterano na Itália, Elite nos capítulos temáticos, Soberano nos clímax e **Comandante IA
(LLM)** no capítulo final.

Estados de um capítulo: `bloqueado` → `disponivel` → `concluido`. Vencer desbloqueia o
seguinte; o melhor placar territorial e o número de tentativas ficam registrados. A aplicação do
resultado é uma função pura e testada, `applyChapterResult` (`src/game/progress/profile.ts`):
vitória concede recompensa e libera o próximo capítulo; derrota apenas registra a tentativa, sem
recompensa e sem desbloquear.

---

## 3. Inventário e árvore tecnológica

**Cartas** (`src/game/battle/catalog.ts`): infantaria, blindados, artilharia, defesa,
reconhecimento e apoio. O jogador começa com 8; as demais entram por recompensa de capítulo.

**Acessórios** (`src/game/progress/catalog.ts`): modificadores equipáveis que entram na
batalha de verdade (`modsFromAccessories` → `SideModifiers`): comando máximo, dano/vida/
velocidade por categoria, captura e visão. Ex.: Insígnia da Cobra (+dano e vida de
infantaria), Blindagem Reativa (+vida de blindados), Posto de Observação (+visão).

**Tecnologia** (`techs`): três ramos — terrestre, aérea e suporte. Pesquisar consome Pontos de
Pesquisa (ganhos nos capítulos) e aplica efeitos à nação (militar, estabilidade, indústria,
logística) e desbloqueia cartas.

**Estado da nação** (`NationState`): militar, estabilidade, indústria, logística e influência
(0–100) + techs pesquisadas. Isso alimenta a batalha via `commandCapacity`, `regenRate` e
`economyBonus`.

---

## 4. PvP

Três modos (`src/game/progress/pvp.ts`):

| Modo | Risco | Regra |
| ---- | ----- | ----- |
| Confronto equilibrado | nenhum | Partida justa; ganha experiência e Sovereigns. |
| Cenário histórico | 1 carta | Terreno e doutrinas fixos; aposta leve. |
| Aposta de guerra | 3 cartas | Venceu, leva as cartas do adversário. Perdeu, perde as suas. |

`resolveStakes` é determinístico e testado: vitória transfere as cartas do adversário, derrota
transfere as suas, empate não transfere nada. O adversário pode ser local (offline) ou o
"Estado-Maior IA" (dificuldade LLM).

---

## 5. Persistência

**Local-first.** O perfil vive no `localStorage` (`src/game/progress/profile.ts`) e é a fonte da
verdade durante o jogo. `ProfileProvider` (`store.tsx`) expõe o perfil e as ações; o estado
inicial é determinístico (mesmo no servidor e no cliente) para não quebrar a hidratação — o
perfil real entra num `useEffect`.

**Sincronização opcional.** Quando `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` estão
definidos, o jogo faz login anônimo e envia o perfil em segundo plano
(`src/game/progress/sync.ts`). Falha de rede é silenciosa: nunca interrompe uma batalha nem
perde progresso local. Sem as variáveis, o jogo roda 100% offline.

Tabelas (Supabase, ver `supabase/migrations/0001_sovereign_schema.sql`): `profiles`,
`nation_state`, `inventory`, `decks`, `campaign_progress`, `battle_records`, `pvp_matches`. Um
trigger de bootstrap cria perfil, nação, cartas iniciais e baralho ao criar o usuário.

---

## 6. Modo offline (solo)

O jogo é jogável sozinho, sem rede:

1. `npm run dev` e abrir `/campanha`.
2. Iniciar o capítulo 1 → briefing → "Entrar no teatro".
3. Na preparação, escolher missão, baralho, comandante, doutrina e dificuldade.
4. Jogar. Sem configuração de LLM, a IA tática local assume; sem Supabase, tudo fica local.
5. Vencer concede recompensa e desbloqueia o próximo capítulo.

O LLM é um extra: `SOVEREIGN_LLM_BASE_URL`, `SOVEREIGN_LLM_API_KEY` e `SOVEREIGN_LLM_MODEL`
(ou `OPENAI_*`). Sem eles, a dificuldade "Comandante IA (LLM)" cai para a IA local.

---

## 7. Telas de apoio

Além de campanha, batalha, PvP, coleção e nação, o jogo tem as telas que amarram a
narrativa ao mundo:

| Rota              | Tela                    | O que faz                                                                 |
| ----------------- | ----------------------- | ------------------------------------------------------------------------- |
| `/mapa`           | Mapa-múndi              | Mapa interativo com países, províncias estratégicas, relações e feed. Cada país abre um dossiê e leva à operação. |
| `/eventos`        | Eventos e histórico     | Feed da guerra (eventos por turno) e o histórico das suas batalhas.        |
| `/ia`             | Agentes IA              | Comandantes, doutrinas, níveis de ameaça e países controlados por IA; inicia um treino. |
| `/configuracoes`  | Configurações           | Preferências locais (velocidade, som, animações), sincronização e reset.   |
| `/creditos`       | Créditos                | Autoria (Variant), homenagem à FEB e as fontes históricas citadas.         |
| `/dossie`         | Dossiê do projeto       | Índice da documentação de design.                                          |

O mapa-múndi e os eventos usam dados de `src/game/data.ts`; os comandantes, doutrinas e níveis
vêm de `src/game/battle/catalog.ts` e `src/game/progress/catalog.ts`. O mapa lê o progresso do
perfil para abrir o capítulo disponível no teatro.
