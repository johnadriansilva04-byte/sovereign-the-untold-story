# Cartas, unidades e arquitetura do motor — referência para agentes

Documento de referência técnica do motor de batalha de SOVEREIGN. Lista **todas** as cartas
do catálogo (`src/game/battle/catalog.ts`), o que cada uma faz no motor
(`src/game/battle/engine.ts`) e a arquitetura de dados que sustenta tudo.

O catálogo é a **fonte oficial de atributos**. Não substituir IDs, custos ou valores sem
justificativa técnica. O motor é "data-driven": lê estas tabelas em vez de espalhar regras
pelo código. Nada aqui é decorativo — cada campo é consumido pelo motor.

---

## 1. Arquitetura do motor

### 1.1 Módulos

| Arquivo                                                  | Papel                                                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/game/battle/types.ts`                               | Modelo de dados: cartas, armas, arena, territórios, estruturas, estado da batalha, projéteis, efeitos.    |
| `src/game/battle/catalog.ts`                             | Tabelas de dados: cartas militares, cartas de apoio, doutrinas, comandantes e arenas.                     |
| `src/game/battle/engine.ts`                              | Simulação determinística: deploy, captura, construção, armas/projéteis, dano, IA de unidade, vitória.     |
| `src/game/battle/ai.ts`                                  | Comandante adversário: decide o que jogar e onde, lê territórios e pressão de estruturas.                 |
| `src/game/battle/missions.ts`                            | Ponte geopolítica: nação → `BattleConfig` (deck, energia, modificadores), 50 missões, arenas por terreno. |
| `src/game/battle/useBattle.ts`                           | Loop de quadro (requestAnimationFrame), pausa, velocidade, mão de cartas.                                 |
| `src/game/progress/*`                                    | Perfil persistente, progressão, coleção, PvP e catálogo de acessórios.                                    |
| `src/components/battle/*`                                | Interface: arena, HUD, cartas, painéis de IA/log, resultado.                                              |
| `src/components/campaign/*`, `src/components/progress/*` | Campanha e coleção (telas sem rolagem, expandem em diálogo).                                              |

### 1.2 Fluxo de uma partida

```
Nação + deck + comandante + doutrina + missão
        │  (missions.buildBattleConfig)
        ▼
BattleConfig  ──►  createBattle()  ──►  BattleState
                                          │  stepBattle(dt)  (a cada quadro)
                                          │   ├─ Energia regenera (inline; ×2 na fase de pressão)
                                          │   ├─ updateZones      (fumaça, barricada, revelação)
                                          │   ├─ updateUnit       (IA de cada unidade)
                                          │   │    └─ updateBuilder (engenheiro constrói/repara)
                                          │   ├─ updateStructures (torres e bases atiram)
                                          │   ├─ updateProjectiles(física, colisão, explosão)
                                          │   ├─ updateEffects    (partículas)
                                          │   ├─ updateCapture    (pontos de controle e territórios)
                                          │   ├─ updateVisibility (fog of war)
                                          │   ├─ cleanup          (remove mortos)
                                          │   ├─ updateScore      (pontuação territorial/militar)
                                          │   └─ checkVictory     (base destruída / objetivo / tempo)
                                          ▼
                                    BattleResult ──► volta para o mapa
```

### 1.3 Entidades do mundo

| Entidade       | Tipo            | O que é                                                                                      |
| -------------- | --------------- | -------------------------------------------------------------------------------------------- |
| `BattleUnit`   | unidade móvel   | Cada tropa/veículo/drone vivo, com vida, arma, ordem e alvo próprios.                        |
| `Structure`    | estrutura fixa  | `base-principal`, `torre` ou `base-avancada`. Atira sozinha, tem vida e estados de dano.     |
| `Territory`    | marcador        | Círculo branco luminoso. Conquistado por presença; recebe base avançada.                     |
| `ControlPoint` | marcador        | Ponto estratégico por setor (norte/central/sul), peso na pontuação.                          |
| `Projectile`   | projétil        | `tracer`, `shell`, `rocket` ou `missile`, com arco/perseguição/colisão reais.                |
| `Effect`       | partícula       | `muzzle`, `tracer`, `impact`, `explosion`, `fire`, `spark`, `smoke`.                         |
| `Zone`         | área temporária | `fumaca`, `reparacao`, `barricada`, `reconhecimento`.                                        |
| `Obstacle`     | terreno         | `rio`, `construcao`, `vegetacao`, `elevacao`, `barricada` (`blocksGround`, `slow`, `cover`). |

### 1.4 Constantes do motor (`engine.ts`)

| Constante             | Valor | Significado                                               |
| --------------------- | ----- | --------------------------------------------------------- |
| `HAND_SIZE`           | 4     | Cartas na mão (as outras 4 ficam na fila determinística). |
| `MOBILIZACAO_SECONDS` | 15    | Tempo de mobilização antes do combate.                    |
| `PRESSAO_SECONDS`     | 60    | Fase final de pressão (Energia regenera mais rápido).     |
| `CAPTURE_RATE`        | 9     | Progresso de captura por segundo (escala 0–100).          |
| `ENGAGE_RADIUS`       | 26    | Raio em que uma unidade avança para engajar.              |
| `SIGHT_BASE`          | 16    | Alcance de visão base (fog of war).                       |
| `CONTACT_RANGE`       | 6     | Abaixo disso a fumaça não oculta.                         |
| `BUILD_RANGE`         | 8     | Distância máxima do engenheiro ao território em obra.     |
| `BUILD_TIME`          | 10 s  | Tempo para erguer uma base avançada.                      |

### 1.5 Tipos de arma (`WeaponKind`) e comportamento

| `kind`       | Uso                          | Comportamento no motor                                             |
| ------------ | ---------------------------- | ------------------------------------------------------------------ |
| `fuzil`      | Fuzileiros, engenheiro       | Traçante instantâneo (`tracer: true`) + `applyHit` direto.         |
| `automatica` | Assalto, VBTP                | Rajada rápida por traçante, cadência alta.                         |
| `atgm`       | Infantaria antitanque        | Foguete guiado (`homing`), explosão em área, ×1,6 contra blindado. |
| `canhao`     | Canhão, tanque, fortificação | Projétil `shell` direto com recuo (`recoil`).                      |
| `obus`       | Artilharia pesada            | Projétil `shell` em **arco** (`arc`), grande explosão.             |
| `lmf`        | Lançador múltiplo            | **Salva de 5 foguetes** com dispersão e jitter determinístico.     |
| `missil`     | Lançador de mísseis          | Projétil `missile` guiado, longo alcance, explosão.                |
| `antiaereo`  | Defesa antiaérea             | Guiado (`homing`); especialista em alvos aéreos (`targets: "aereo"`). |
| `drone`      | Drones                       | Armamento leve aéreo; o de combate é guiado e com splash.          |

Campos do `WeaponSpec`: `projectileSpeed` (u/s), `splash` (raio de dano em área; 0 = alvo único),
`arc` (trajetória balística), `homing` (persegue alvo móvel), `muzzle` (deslocamento do ponto de
origem), `tracer` (raio instantâneo).

### 1.6 Dano e resistências

- **Cobertura**: `damageUnit` reduz o dano por `cover` do obstáculo no local (0 em unidades aéreas).
  A **Fortificação de Campanha** concede cobertura a aliados próximos (`coverBonusAt`).
- **Antitanque × blindado**: infantaria antitanque causa **×1,6** em blindados
  (`damageUnit`) e **×1,4** em estruturas (`damageStructure`). Aplicado uma única vez.
- **Estados de dano visual**: estrutura com vida baixa ganha fumaça/fogo; unidade destruída gera
  `explosion` (aérea) ou `impact` (terrestre).
- **Doutrinas**: multiplicam custo, velocidade, dano, vida e captura por categoria, além do
  `combinedArmsBonus` (bônus de dano por combinar categorias na mesma área).
- **Nível da carta**: multiplica vida, dano e cura por `1 + 0,05 × (nível − 1)` (ver §12).
- **Ordem de cálculo**: base → nível → doutrina → comandante → acessório → temporário → final.

### 1.7 Vitória (`checkVictory` / `finish`)

1. **Base principal destruída** → vitória/derrota **imediata** (`damageStructure` chama `finish`).
2. **Superioridade territorial** → controlar a maioria dos pontos estratégicos.
3. **Superioridade militar** → neutralizar o dispositivo adversário.
4. **Objetivo operacional** → cumprir a missão (proteger instalação, impedir travessia, sobreviver).
5. **Tempo esgotado** → decide por território, militar ou objetivo (empate se equilibrado).

---

## 2. Cartas militares (15)

Cada carta tem um **modelo visual próprio** (`model`) — silhueta, proporção e arma distintas.
`hp/dmg/range/speed/cooldown` são valores base (antes de nível/doutrina/modificadores).

### 2.1 Infantaria

| Carta                 | ID               | Custo | Vida | Dano | Alcance | Cadência | Veloc. | Alvos | Modelo               | Arma                      |
| --------------------- | ---------------- | ----- | ---- | ---- | ------- | -------- | ------ | ----- | -------------------- | ------------------------- |
| Fuzileiros            | `inf-fuzileiros` | 3     | 190  | 16   | 6       | 0,9 s    | 4,4    | terra | `soldado-fuzil`      | `fuzil` (traçante)        |
| Infantaria de Assalto | `inf-assalto`    | 4     | 320  | 14   | 5,5     | 0,32 s   | 3,6    | terra | `soldado-assalto`    | `automatica`              |
| Infantaria Antitanque | `inf-antitanque` | 4     | 200  | 95   | 15      | 2,6 s    | 3,8    | terra | `soldado-antitanque` | `atgm` (guiado, splash 3) |

- Fuzileiros: linha de frente barata; avança, captura e segura posição.
- Assalto: equipamento pesado + arma automática; resistente no combate próximo.
- Antitanque: foguete guiado; **prioriza blindados** (`priority: [blindado]`); ×1,6 vs blindado e ×1,4 vs estrutura.

### 2.2 Apoio / engenharia

| Carta                 | ID               | Custo | Vida | Dano | Alcance | Cadência | Veloc. | Modelo       | Arma    |
| --------------------- | ---------------- | ----- | ---- | ---- | ------- | -------- | ------ | ------------ | ------- |
| Engenheiros Militares | `inf-engenheiro` | 3     | 200  | 10   | 4,5     | 1,2 s    | 3,4    | `engenheiro` | `fuzil` |
| Posto de Socorro      | `apo-posto`      | 4     | 260  | 0    | 4       | 2,0 s    | 2,6    | `posto`      | `fuzil` |

- Engenheiro: **`builder: true`** — captura território, constrói base avançada (10 s) e repara estruturas aliadas.
- Posto de Socorro: **não dispara** (dano 0); cura infantaria aliada num raio (`HEAL_PER_PULSE` a cada 2 s).

### 2.3 Artilharia

| Carta                    | ID             | Custo | Vida | Dano | Alcance | Cadência | Veloc. | Modelo              | Arma                        |
| ------------------------ | -------------- | ----- | ---- | ---- | ------- | -------- | ------ | ------------------- | --------------------------- |
| Canhão de Campanha       | `art-canhao`   | 4     | 260  | 70   | 24      | 2,4 s    | 1,9    | `canhao`            | `canhao` (arco, splash 4,5) |
| Artilharia Pesada 155 mm | `art-obus`     | 7     | 230  | 130  | 38      | 3,6 s    | 1,3    | `artilharia-pesada` | `obus` (arco, splash 7)     |
| Lançador de Mísseis      | `mss-lancador` | 5     | 300  | 120  | 34      | 3,2 s    | 1,8    | `lancador-missil`   | `missil` (guiado, splash 5) |
| Lançador Múltiplo (LMF)  | `mss-lmf`      | 7     | 260  | 60   | 36      | 3,8 s    | 1,4    | `lmf`               | `lmf` (**salva de 5**)      |

### 2.4 Blindados

| Carta                   | ID           | Custo | Vida | Dano | Alcance | Cadência | Veloc. | Modelo   | Arma                  |
| ----------------------- | ------------ | ----- | ---- | ---- | ------- | -------- | ------ | -------- | --------------------- |
| Veículo Blindado (VBTP) | `bld-vbld`   | 4     | 640  | 30   | 8       | 1,1 s    | 3,4    | `vbld`   | `automatica`          |
| Carro de Combate        | `bld-tanque` | 6     | 1050 | 60   | 9       | 1,6 s    | 2,6    | `tanque` | `canhao` (splash 2,5) |

- VBTP: prioriza **infantaria** (`priority: [infantaria]`).
- Tanque: prioriza **blindados e artilharia**; torre gira (`aim`) e canhão recua (`recoil`).

### 2.5 Defesa estática

| Carta                    | ID                 | Custo | Vida | Dano | Alcance | Cadência | Veloc. | Modelo         | Arma                  |
| ------------------------ | ------------------ | ----- | ---- | ---- | ------- | -------- | ------ | -------------- | --------------------- |
| Defesa Antiaérea         | `def-aa`           | 4     | 320  | 55   | 20      | 1,0 s    | 2,0    | `aa`           | `antiaereo` (guiado)  |
| Fortificação de Campanha | `def-fortificacao` | 5     | 900  | 22   | 9       | 1,6 s    | 0      | `fortificacao` | `canhao` (splash 1,5) |

- AA: **especialista em alvos aéreos** (`targets: "aereo"`), com alcance longo (20) e mísseis guiados.
- Fortificação: estática (velocidade 0); ancora posição e concede **cobertura** aliada.

### 2.6 Drones

| Carta                   | ID                  | Custo | Vida | Dano | Alcance | Cadência | Veloc. | Modelo          | Arma                         |
| ----------------------- | ------------------- | ----- | ---- | ---- | ------- | -------- | ------ | --------------- | ---------------------------- |
| Drone de Reconhecimento | `rec-drone`         | 2     | 90   | 6    | 13      | 1,4 s    | 8,0    | `drone-recon`   | `drone` (traçante)           |
| Drone de Combate        | `rec-drone-combate` | 4     | 150  | 55   | 10      | 1,5 s    | 7,0    | `drone-combate` | `drone` (guiado, splash 2,5) |

> Domínio `aereo`: ignora obstáculos. As unidades de combate atiram em alvos aéreos
> (`targets: "ambos"`), então um drone **nunca é invencível**; a Defesa Antiaérea é o
> contra-específico (alcance e cadência maiores contra o ar).

---

## 3. Cartas de apoio (10)

Cartas de apoio **não** geram unidade: aplicam uma habilidade (`ability`) na área escolhida.
As globais (`ataque_aereo`, `fumaca`, `interferencia`, `reconhecimento`) podem ser jogadas em
qualquer ponto do mapa; as demais exigem alvo válido na zona de posicionamento.

| Carta                    | ID                   | Custo | Habilidade       | Magnitude | Duração | Raio | O que faz no motor                                                                       |
| ------------------------ | -------------------- | ----- | ---------------- | --------- | ------- | ---- | ---------------------------------------------------------------------------------------- |
| Ataque Aéreo             | `sup-aereo`          | 7     | `ataque_aereo`   | 160       | —       | 9    | Dano 160 em unidades inimigas na área + 60% em estruturas; explosão.                     |
| Cortina de Fumaça        | `sup-fumaca`         | 3     | `fumaca`         | —         | 8 s     | 8    | Oculta unidades próprias (fog of war) e reduz a precisão inimiga.                        |
| Reforços                 | `sup-reforcos`       | 5     | `reforcos`       | 2         | —       | 5    | Desembarca **2 pelotões de Fuzileiros** imediatamente.                                   |
| Reparação de Veículos    | `sup-reparo`         | 3     | `reparacao`      | 220       | —       | 6    | Restaura 220 de vida em **blindados e reconhecimento** aliados.                          |
| Barricada                | `sup-barricada`      | 3     | `barricada`      | 600       | 30 s    | 4    | Cria obstáculo (`blocksGround`, `slow 0,6`, `cover 0,2`) que bloqueia o avanço.          |
| Interferência Eletrônica | `sup-interferencia`  | 5     | `interferencia`  | —         | 6 s     | 11   | **Silencia** (jammed) artilharia e reconhecimento inimigos. Requer tech `t9`.            |
| Evacuação Aeromédica     | `sup-evacuacao`      | 4     | `evacuacao`      | 160       | —       | 6    | Cura a unidade aliada **mais ferida** no raio (+160); senão cura todas em 50%.           |
| Reconhecimento Avançado  | `sup-recon-avancado` | 3     | `reconhecimento` | —         | 12 s    | 16   | Revela uma área inteira por 12 s.                                                        |
| **Paraquedistas**        | `sup-paraquedistas`  | 6     | `paraquedistas`  | 2         | —       | 5    | Lança **2 pelotões paraquedistas** atrás das linhas (requer tech `t7`).                  |
| **Bombardeiro Tático**   | `sup-bombardeiro`    | 8     | `bombardeiro`    | 200       | —       | 11   | Passagem de bombardeio: 200 de dano em unidades + 65% em estruturas (requer tech `t10`). |

> As duas últimas são **operações especiais** adicionadas pelo spec §4. Diferem do Ataque Aéreo
> pelo custo, alcance, sequência de impactos e requisito tecnológico.

---

## 4. Catálogo completo por custo de Energia

| Custo | Cartas                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2     | Drone de Reconhecimento                                                                                                                                               |
| 3     | Fuzileiros · Engenheiros Militares · Cortina de Fumaça · Reparação de Veículos · Barricada · Reconhecimento Avançado                                                  |
| 4     | Infantaria de Assalto · Infantaria Antitanque · Canhão de Campanha · Veículo Blindado · Defesa Antiaérea · Drone de Combate · Posto de Socorro · Evacuação Aeromédica |
| 5     | Lançador de Mísseis · Fortificação de Campanha · Reforços · Interferência Eletrônica                                                                                  |
| 6     | Carro de Combate · Paraquedistas                                                                                                                                      |
| 7     | Artilharia Pesada 155 mm · Lançador Múltiplo (LMF) · Ataque Aéreo                                                                                                     |
| 8     | Bombardeiro Tático                                                                                                                                                    |

**Total: 25 cartas** (15 militares + 10 de apoio).

---

## 5. Doutrinas militares (6)

Modificam custo, velocidade, dano, vida e captura **por categoria**, mais o bônus de armas
combinadas. O modificador de dano de apoio afeta **apenas habilidades com dano** — não cura,
fumaça ou reconhecimento.

| Doutrina             | Efeito                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Mobilidade           | +20% velocidade reconhecimento, +12% infantaria, +8% blindado; `combinedArmsBonus` 0,05.                       |
| Defesa territorial   | −15% custo defesa, +20% dano defesa, +30% vida defesa, +10% vida infantaria; captura ×1,15.                    |
| Poder de fogo        | −10% custo artilharia, +35% dano artilharia, +20% dano apoio; captura ×0,9.                                    |
| Infantaria           | −20% custo, +10% velocidade, +20% dano, +15% vida na infantaria; captura ×1,3.                                 |
| Mecanizada           | −15% custo blindado, −10% reconhecimento, +15% velocidade e +10% dano/vida blindado; `combinedArmsBonus` 0,08. |
| Operações combinadas | Captura ×1,05; `combinedArmsBonus` 0,14 (maior bônus por misturar categorias).                                 |

---

## 6. Comandantes (5)

Cada comandante é um **perfil estratégico** que influencia o comportamento da IA (`ai.ts`),
não apenas um nome.

| Comandante      | Personalidade | Doutrina             | Comportamento da IA                                                              |
| --------------- | ------------- | -------------------- | -------------------------------------------------------------------------------- |
| Cel. Varela     | Metódico      | Operações combinadas | Economiza Energia, busca composições, constrói posições antes de avançar.        |
| Cmdt. Sarmiento | Agressivo     | Mecanizada           | Prioriza tanques e VBTP, pressiona territórios, avanços rápidos.                 |
| Gen. Orlov      | Econômico     | Poder de fogo        | Preserva Energia, investe em artilharia, ataques de longo alcance.               |
| Maj. Lima       | Cauteloso     | Defesa territorial   | Prioriza fortificações, protege engenheiros, mantém tropas perto de instalações. |
| Cap. Duarte     | Oportunista   | Mobilidade           | Explora territórios desprotegidos, usa drones, procura flancos.                  |

---

## 7. Arenas (6)

Todas simétricas: base azul ao sul (`y 92`), base vermelha ao norte (`y 8`); **5 territórios**
neutros (Centro + 4 flancos) e **3 pontos de controle** (norte/central/sul) entre elas.

| Arena               | Terreno            | Obstáculos | Pontos de controle (norte/central/sul)                   |
| ------------------- | ------------------ | ---------- | -------------------------------------------------------- |
| Perímetro Urbano    | Cidade             | 4          | Praça Norte (1) · Estação Central (2) · Terminal Sul (1) |
| Corredor Amazônico  | Floresta           | 4          | Clareira Norte (1) · Porto Fluvial (2) · Trilha Sul (1)  |
| Vazio do Saara      | Campo aberto       | 2          | Poço Norte (1) · Oásis Central (2) · Acampamento Sul (1) |
| Passos dos Apeninos | Montanha           | 4          | Cume Norte (2) · Desfiladeiro (2) · Base Sul (1)         |
| Travessia do Paraná | Travessia de rio   | 3          | Margem Norte (1) · Ponte Central (2) · Margem Sul (1)    |
| Linha Fortificada   | Região fortificada | 3          | Reduto Norte (1) · Reduto Central (2) · Reduto Sul (1)   |

Regras comuns: obstáculos terrestres afetam movimentação; unidades aéreas ignoram obstáculos;
projéteis respeitam a colisão da sua categoria; nenhuma unidade fica presa permanentemente.

### 7.1 Estruturas fixas (iguais em toda arena, por `standardStructures()`)

| Estrutura                          | Lado               | Vida | Dano | Alcance | Cadência | Alvos         |
| ---------------------------------- | ------------------ | ---- | ---- | ------- | -------- | ------------- |
| Base Principal                     | azul/vermelho      | 4000 | 45   | 15      | 1,4 s    | terra + aéreo |
| Torre Oeste                        | azul/vermelho      | 1400 | 55   | 17      | 0,9 s    | terra + aéreo |
| Torre Leste                        | azul/vermelho      | 1400 | 55   | 17      | 0,9 s    | terra + aéreo |
| Base Avançada (construída em jogo) | dono do território | 1600 | 60   | 16      | 1,1 s    | terra + aéreo |

- **Base Principal**: destruí-la é vitória imediata. Fica fixa durante toda a partida.
- **Torres**: defesa automática simétrica entre a base e o centro.
- **Base Avançada**: erguida por engenheiro em território conquistado (`BUILD_TIME` 10 s,
  em obra começa com 15% da vida e é atacável); ao concluir, defende e **amplia a zona de
  posicionamento**. Uma base incompleta **não** opera a defesa completa.

### 7.2 Zonas de posicionamento (deploy)

| Arena                                 | Zona azul                     | Zona vermelha             |
| ------------------------------------- | ----------------------------- | ------------------------- |
| Cidade / Floresta / Rio / Fortificada | `x 6, y 64–66, w 88, h 30–32` | `x 6, y 4, w 88, h 30–32` |
| Campo aberto                          | `x 8, y 68, w 84, h 28`       | `x 8, y 4, w 84, h 28`    |
| Montanha                              | `x 30, y 68, w 40, h 28`      | `x 30, y 4, w 40, h 28`   |

Regras: unidades convencionais só nascem na zona controlada ou em **bases avançadas
conquistadas**; o posicionamento é recusado em local ocupado, fora de zona ou sobre base
avançada existente.

---

## 8. Energia (recurso tático)

O recurso da batalha chama-se **Energia** (internamente `side.command` / `commandMax`).
Regenera continuamente e acelera na fase de pressão.

| Parâmetro         | Fórmula                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| Capacidade máxima | `10 + round(logistics / 40)` → 10 a 13, + modificadores de acessório.      |
| Regeneração       | `0,85 + military / 400` → ~0,85 a 1,1 por segundo (×2 na fase de pressão). |
| Bônus econômico   | `0,02 + min(1, gdp/3000)·0,05 + (stability/100)·0,03`, limitado a 0,10.    |

O baralho tem **8 cartas**: **4 na mão** e **4 na fila**. A rotação é **determinística** — ao
usar uma carta, ela vai para o fim da fila e a próxima entra na mão. Nada é randomizado ou
substituído automaticamente.

---

## 9. Acessórios (modificadores de deck)

| Acessório           | Custo | Efeito                                                     |
| ------------------- | ----- | ---------------------------------------------------------- |
| Rádio de Campanha   | 120   | +1 de comando máximo.                                      |
| Doutrina de Obuses  | 200   | +15% dano de artilharia.                                   |
| Insígnia da Cobra   | 240   | +8% dano e +5% vida na infantaria.                         |
| Blindagem Reativa   | 220   | +12% vida em blindados.                                    |
| Coluna Motorizada   | 180   | +10% velocidade em infantaria e blindados.                 |
| Posto de Observação | 160   | +20% alcance de visão.                                     |
| Kit de Trincheira   | 150   | +15% captura e +8% vida na defesa.                         |
| Carta Topográfica   | 130   | +5% velocidade geral (infantaria/blindado/reconhecimento). |

Um acessório não pode ser equipado mais de uma vez no mesmo baralho (`toggleAccessory`).

---

## 10. Baralhos padrão

- **Baralho inicial do jogador** (`startingDeck`):
  `inf-fuzileiros`, `inf-assalto`, `inf-antitanque`, `inf-engenheiro`,
  `art-canhao`, `bld-vbld`, `rec-drone`, `sup-fumaca`.

- **Baralho padrão da IA** (`sideFromMission`):
  `inf-fuzileiros`, `inf-assalto`, `bld-vbld`, `bld-tanque`,
  `art-obus`, `def-aa`, `def-fortificacao`, `rec-drone`.

- **Baralhos espelho do PvP** (`MIRROR_DECKS`): 3 composições rotativas usadas pelos
  oponentes locais (Aliança Varela, Bloco Sarmiento, Doutrina Orlov, Estado-Maior IA).

---

## 11. Missões da campanha (50)

Cada missão define terreno, duração, tipo de objetivo e texto. São 50 missões mapeadas para
os capítulos (`chapterMission`), de `m-apagao` a `m-final`.

| Tipo de objetivo | Como se vence                                                          |
| ---------------- | ---------------------------------------------------------------------- |
| `territorial`    | Controlar a maioria dos pontos/territórios estratégicos.               |
| `militar`        | Neutralizar a capacidade de combate adversária (limiar de força).      |
| `operacional`    | Cumprir a tarefa específica da missão (proteger, impedir, sobreviver). |

---

## 12. Progressão de cartas

### 12.1 Faixas de desbloqueio (`src/game/progress/catalog.ts`)

| Faixa                   | Requisito          | Cartas                                                                                                    |
| ----------------------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| 1 — Recrutamento        | inicial            | Fuzileiros, Engenheiros, Drone de Reconhecimento, Fumaça, Reconhecimento Avançado, Barricada, VBTP        |
| 2 — Operações táticas   | comandante nível 3 | Assalto, Antitanque, Canhão, Posto de Socorro, AA, Drone de Combate, Reparação, Reforços, Evacuação       |
| 3 — Guerra mecanizada   | comandante nível 6 | Carro de Combate, Lançador de Mísseis, Fortificação, Obus 155 mm, LMF, Interferência (também requer `t9`) |
| 4 — Operações especiais | nível avançado     | Ataque Aéreo, Paraquedistas (`t7`), Bombardeiro Tático (`t10`)                                            |

Regras: cartas desbloqueadas entram na coleção; o jogador vê as bloqueadas e o requisito;
desbloquear não coloca a carta no baralho automaticamente; nenhuma carta é substituída
silenciosamente; a progressão é persistente.

### 12.2 Níveis de carta

Cada carta tem nível próprio (1–15), independente do nível do comandante.

| Atributos que evoluem                               | Atributos que **não** evoluem                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Vida, dano, cura, resistência, potência de explosão | Custo, alcance, cadência, velocidade, duração de habilidade, número de unidades, quantidade de foguetes |

Fórmula: `multiplicador = 1 + 0,05 × (nível − 1)`.

Exemplo: fuzileiro nível 1 → 190 vida / 16 dano; nível 5 → 266 vida / 19,2 dano.

### 12.3 Evolução com duplicatas

Cópias necessárias por evolução: 2, 4, 6, 10, 15, 20, 30, 40, 55, 70, 90, 110, 140, 175
(níveis 1→2 até 14→15). Configurável e testada. O jogador **confirma** a evolução; nada é
consumido automaticamente.

---

## 13. Como cada mecânica está ligada ao motor

| Mecânica exigida                | Onde vive                                     | Comportamento real                                       |
| ------------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| Duas bases principais           | `standardStructures()` + `Structure`          | Fixas, atiram sozinhas, destruir = vitória.              |
| Duas torres defensivas por lado | `standardStructures()`                        | Defesa automática simétrica.                             |
| Territórios neutros             | `standardTerritories()` + `updateCapture`     | Círculos brancos; capturados por presença.               |
| Captura altera propriedade      | `updateCapture`                               | `owner` muda para o lado com progresso 100.              |
| Engenheiro constrói base        | `updateBuilder` + `startConstruction`         | Caminha ao território, obra progressiva, atacável.       |
| Base avançada recebe dano       | `damageStructure`                             | Vida própria; em obra com 15% da vida.                   |
| Unidades nascem só onde pode    | `insideDeployZone` + `advancedBaseAt`         | Recusa fora de zona/ocupado/sobre base avançada.         |
| Soldados disparam               | `fireWeapon` (`tracer`) + `applyHit`          | Traçante + dano real por tiro.                           |
| Canhões disparam                | `fireWeapon` (`canhao`)                       | Projétil `shell` com recuo e splash.                     |
| Mísseis com trajetória          | `updateProjectiles` (`missile`/`rocket`)      | Arco/perseguição, colisão, explosão.                     |
| Tanque gira torre e atira       | `aim` + `recoil` + `fireWeapon`               | Torre mira o alvo; canhão recua ao disparar.             |
| Drones voam e agem              | `domain: "aereo"` + `updateUnit`              | Ignoram obstáculos; atingíveis por unidades `ambos` e pela AA. |
| Todas as armas causam dano      | `applyHit` / `damageUnit` / `damageStructure` | Dano calculado com cobertura e multiplicadores.          |
| Unidades identificam alvos      | `selectTarget` + `priorityFor`                | Priorizam categorias; não atacam fora do alcance.        |
| Cartas em ordem fixa            | `useBattle` (mão/fila)                        | Rotação determinística, sem randomização.                |
| Energia consome e regenera      | `updateSide`/`stepBattle`                     | Gasto no deploy, regeneração contínua.                   |
| Base principal destruível       | `damageStructure`                             | `finish()` na destruição.                                |
| Condição de vitória             | `checkVictory`                                | Base, território, militar, objetivo ou tempo.            |
| Posto de Socorro cura           | `updateSupport`                               | Cura infantaria aliada a cada 2 s, sem passar do máximo. |
| Fortificação dá cobertura       | `coverBonusAt`                                | Aliados próximos recebem `cover` no cálculo de dano.     |
| Nível da carta influencia       | `cardLevel` em `spawnUnit`                    | Vida/dano/cura multiplicados pelo nível do perfil.       |
| Desbloqueio por faixas          | `unlockTier` / `isUnlocked`                   | `unlockedDeck(nation, level)` filtra por nível e tech.   |
| Comandante influencia a IA      | `ai.ts` (`personality`)                       | Metódico/agressivo/econômico/cauteloso/oportunista.      |

---

## 14. Interface: padrão de uma tela, sem rolagem

Regra de UX do projeto: **nenhuma tela rola a página**. `GameShell` fixa a altura em
`h-[100dvh]` com `overflow-hidden`; o `<main>` é a única área rolável (e as telas `full`,
como a batalha, nem isso). Cabeçalho nunca some, página nunca rola. Listas longas são
recortadas por painéis com rolagem própria e o detalhe abre numa tela nova (diálogo).

| Tela                                | Padrão aplicado                                                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home (`/`)                          | Hero + menu em uma tela (`h-[calc(100dvh-3.5rem)]`).                                                                                                              |
| Campanha (`CampaignScreen`)         | Visão geral: barra de progresso, atos em abas, só a missão atual em destaque (vencidas somem). "Iniciar missão" entra direto na batalha — sem texto nem escolhas. |
| Coleção (`CollectionScreen`)        | Abas cartas/acessórios/baralhos; cartão abre detalhe em diálogo.                                                                                                  |
| Batalha · preparação (`BattlePrep`) | Baralho, comandante e doutrina numa tela; missão em diálogo. Sem texto longo.                                                                                     |
| Multiplayer (`MultiplayerScreen`)   | Modos em abas; adversários em cartões; apostas em tela própria.                                                                                                   |
| Batalha em si (`BattleArena`)       | Arena + HUD fixos; `overflow-hidden`, sem rolagem de página.                                                                                                      |
| Mapa/Nacão/IA/Perfil/Config         | Cabeçalho compacto + métricas fixas; painéis internos com rolagem contida.                                                                                        |

**Armadilha de altura fixa (já corrigida):** telas que usam `h-[calc(100dvh-3.5rem)]` só
cabem se forem filhas diretas do `<main>` (`GameShell full`). Se houver um cabeçalho extra
ou um wrapper antes (ex.: `BattleScreen` com `modeLabel`), a soma ultrapassa a viewport e a
barra de ação inferior (o botão de iniciar) é recortada. Solução: o wrapper usa
`flex h-full min-h-0 flex-col` e a tela interna `h-full min-h-0` — a altura é herdada, não
recalculada.

---

## 15. Verificação

- Testes de cartas e combate: `src/test/battle-mechanics.test.ts` (cobre os 18 checks
  obrigatórios do spec + efeitos reais de carta, níveis e posicionamento global).
- Testes de progressão: `src/test/progress-*.test.ts`.
- Suite completa: `npx vitest run` · Tipos: `npx tsc --noEmit` · Lint: `npx eslint .` ·
  Build: `npm run build`.
- A verificação de UI (sem rolagem, clique abre diálogo) é feita no navegador com o dev
  server (`vite dev`), conforme a §14.
