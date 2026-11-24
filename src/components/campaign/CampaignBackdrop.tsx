import heroSovereign from "@/assets/hero-sovereign.jpg";

// Atmosfera única da campanha: a arte fica fixa atrás de todas as telas do fluxo
// (mapa, decisão, briefing, história) para o jogador não cair em preto chapado.
export function CampaignBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <img src={heroSovereign} alt="" className="h-full w-full object-cover opacity-30" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,oklch(0.16_0.012_120/0.12)_0%,oklch(0.16_0.012_120/0.9)_74%)]" />
      <div className="scanlines absolute inset-0 opacity-30" />
    </div>
  );
}
