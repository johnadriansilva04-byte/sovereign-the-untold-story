import { useCallback, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// ANALÓGICO VIRTUAL do chanceler (celular/tablet). Um disco fixo à esquerda; arrastar
// o botão produz um VETOR normalizado (-1..1 por eixo) que o motor usa para mover o
// herói em tempo real. Soltar zera o vetor. Mesma semântica das setas do teclado no PC.
//
// O ponteiro é capturado no próprio elemento (`setPointerCapture`), então o dedo pode
// sair do disco sem "largar" o controle — o comportamento esperado de um joystick.
export function BattleJoystick({
  onChange,
  className,
}: {
  onChange: (dx: number, dy: number) => void;
  className?: string;
}) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const activeId = useRef<number | null>(null);
  const R = 44; // raio útil do disco em px

  const vectorFrom = useCallback((clientX: number, clientY: number): { dx: number; dy: number } => {
    const el = padRef.current;
    if (!el) return { dx: 0, dy: 0 };
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    return { dx: dx / R, dy: dy / R };
  }, []);

  const move = useCallback(
    (clientX: number, clientY: number) => {
      const v = vectorFrom(clientX, clientY);
      setKnob({ x: v.dx * R, y: v.dy * R });
      onChange(v.dx, v.dy);
    },
    [onChange, vectorFrom],
  );

  const release = useCallback(() => {
    activeId.current = null;
    setKnob(null);
    onChange(0, 0);
  }, [onChange]);

  return (
    <div
      ref={padRef}
      className={cn(
        "relative h-28 w-28 touch-none select-none rounded-full border border-primary/50 bg-background/40 backdrop-blur",
        className,
      )}
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        activeId.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (activeId.current !== e.pointerId) return;
        move(e.clientX, e.clientY);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      aria-label="Analógico do chanceler"
      role="application"
    >
      {/* marcas cardeais */}
      <span className="absolute left-1/2 top-1 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary/40" />
      <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary/40" />
      <span className="absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary/40" />
      <span className="absolute right-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary/40" />
      {/* botão */}
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary bg-primary/70 shadow"
        style={{
          transform: `translate(calc(-50% + ${knob?.x ?? 0}px), calc(-50% + ${knob?.y ?? 0}px))`,
        }}
      />
    </div>
  );
}
