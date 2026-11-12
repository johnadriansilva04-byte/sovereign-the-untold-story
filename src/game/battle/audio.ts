// Áudio de combate — SINTETIZADO (WebAudio), sem arquivos de som.
//
// A batalha já produz os eventos certos no motor (efeitos "explosion"/"impact" com raio
// real). Aqui esses eventos viram SOM: uma explosão grande soa grave e longa, um impacto
// pequeno soa curto e seco. Nada é disparado por quadro — há limiar e limitação de taxa
// para o áudio não virar uma parede de ruído.
//
// Tudo é criado sob demanda e degrada em silêncio quando não há WebAudio (SSR, teste,
// navegador sem suporte). O mudo é persistido no localStorage.

const MUTE_KEY = "sovereign.audio.muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let lastAt = 0;
let budget = 0;

export function isAudioMuted(): boolean {
  if (typeof window === "undefined") return true;
  if (!mutedLoaded) {
    mutedLoaded = true;
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  }
  return muted;
}
let mutedLoaded = false;

export function setAudioMuted(value: boolean): void {
  muted = value;
  if (typeof window !== "undefined") window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
}

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  // Autoplay: o contexto só sai de "suspended" após um gesto do usuário.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Destrava o áudio no primeiro gesto (política de autoplay dos navegadores). */
export function primeAudio(): void {
  ensure();
}

// Ruído branco em buffer, reaproveitado por todos os sons.
let noiseBuffer: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const len = Math.floor(c.sampleRate * 0.5);
    noiseBuffer = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function rateOk(c: AudioContext, cost: number): boolean {
  const now = c.currentTime;
  if (now - lastAt > 0.2) budget = 4; // repõe o orçamento a cada 200 ms
  lastAt = now;
  if (budget <= 0) return false;
  budget -= cost;
  return true;
}

/**
 * Explosão: um estrondo grave (queda de senoide) somado a um sopro de ruído filtrado.
 * `size` (0..1) escala a duração e o peso — granada de morte é curta, obus é grave.
 */
export function playExplosion(size = 0.5): void {
  if (isAudioMuted()) return;
  const c = ensure();
  if (!c || !master) return;
  if (!rateOk(c, 1)) return;
  const s = Math.max(0.15, Math.min(1, size));
  const t = c.currentTime;

  const boom = c.createOscillator();
  const boomGain = c.createGain();
  boom.type = "sine";
  boom.frequency.setValueAtTime(140 * (0.7 + s), t);
  boom.frequency.exponentialRampToValueAtTime(38, t + 0.18 + 0.3 * s);
  boomGain.gain.setValueAtTime(0.0001, t);
  boomGain.gain.exponentialRampToValueAtTime(0.9 * s + 0.2, t + 0.012);
  boomGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35 + 0.5 * s);
  boom.connect(boomGain).connect(master);
  boom.start(t);
  boom.stop(t + 1.1);

  const src = c.createBufferSource();
  src.buffer = noise(c);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1800, t);
  lp.frequency.exponentialRampToValueAtTime(320, t + 0.25 + 0.3 * s);
  const nGain = c.createGain();
  nGain.gain.setValueAtTime(0.5 * s + 0.15, t);
  nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3 + 0.4 * s);
  src.connect(lp).connect(nGain).connect(master);
  src.start(t);
  src.stop(t + 1.0);
}

/** Disparo: estalo seco. `weight` (0..1): fuzil é leve, canhão é grave. */
export function playShot(weight = 0.3): void {
  if (isAudioMuted()) return;
  const c = ensure();
  if (!c || !master) return;
  if (!rateOk(c, 1)) return;
  const t = c.currentTime;
  const w = Math.max(0.05, Math.min(1, weight));

  const src = c.createBufferSource();
  src.buffer = noise(c);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 300 + 900 * (1 - w);
  const g = c.createGain();
  g.gain.setValueAtTime(0.35 * (0.5 + w), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + 0.09 * w);
  src.connect(hp).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.2);

  const thump = c.createOscillator();
  const tg = c.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(180 * (0.6 + w), t);
  thump.frequency.exponentialRampToValueAtTime(70, t + 0.08);
  tg.gain.setValueAtTime(0.3 * w, t);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  thump.connect(tg).connect(master);
  thump.start(t);
  thump.stop(t + 0.2);
}

/** Lançamento de foguete/míssil: sopro crescente que sobe de tom. */
export function playLaunch(): void {
  if (isAudioMuted()) return;
  const c = ensure();
  if (!c || !master) return;
  if (!rateOk(c, 1)) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(1600, t + 0.4);
  bp.Q.value = 1.2;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.4, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  src.connect(bp).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.7);
}

/** Impacto seco (bala atingindo metal/terra): estalo curto e agudo. */
export function playImpact(): void {
  if (isAudioMuted()) return;
  const c = ensure();
  if (!c || !master) return;
  if (!rateOk(c, 1)) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2200;
  const g = c.createGain();
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(hp).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.12);
}
