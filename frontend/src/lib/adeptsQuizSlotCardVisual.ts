/** Slot colors 1–5 — shared quiz / player strip . */
export const ADEPTS_SLOT_THEMES: { hsl: string }[] = [
  { hsl: "280 92% 62%" },
  { hsl: "192 98% 52%" },
  { hsl: "48 100% 54%" },
  { hsl: "158 78% 48%" },
  { hsl: "0 86% 58%" },
];

export function hsl(hslTriplet: string, alpha?: number) {
  return alpha != null ? `hsl(${hslTriplet} / ${alpha})` : `hsl(${hslTriplet})`;
}

/** Octagon: 45° corners (--oct = cut length). */
export const PLAYER_CARD_OCTAGON_CLIP =
  "polygon(var(--oct) 0,calc(100% - var(--oct)) 0,100% var(--oct),100% calc(100% - var(--oct)),calc(100% - var(--oct)) 100%,var(--oct) 100%,0 calc(100% - var(--oct)),0 var(--oct))";

/** Outline glow along octagon silhouette (no border on clip layer). */
export function slotCardShellFilter(accent: string, isTurn: boolean): string {
  const rim = hsl(accent, isTurn ? 0.74 : 0.52);
  const outline = `drop-shadow(0 0 0.5px ${rim}) drop-shadow(0 0 1px ${rim})`;
  const glow = isTurn
    ? `drop-shadow(0 0 20px ${hsl(accent, 0.32)}) drop-shadow(0 0 44px ${hsl(accent, 0.12)})`
    : `drop-shadow(0 0 12px ${hsl(accent, 0.18)})`;
  return `${outline} ${glow}`;
}
