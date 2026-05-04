/**
 * Authoritative lifecycle + rounds + mini-game overlays (aligned with product flow).
 *
 * **Several Wheel / Roulette runs per round:** the graph allows `round:n` → `mini_*:n` → `round:n`
 * to repeat any number of times (each Pandora’s box / wheel card can start another instance).
 */

export type RoundIndex = 1 | 2 | 3;

export type Phase =
  | { kind: "lobby" }
  | { kind: "spectator_picks" }
  | { kind: "round"; roundIndex: RoundIndex }
  | { kind: "mini_wheel"; roundIndex: RoundIndex }
  | { kind: "mini_roulette"; roundIndex: RoundIndex }
  | { kind: "story_video" }
  | { kind: "donations" }
  | { kind: "between_final" }
  | { kind: "final" }
  | { kind: "game_over" };

export function phaseKey(p: Phase): string {
  switch (p.kind) {
    case "lobby":
    case "spectator_picks":
    case "story_video":
    case "donations":
    case "between_final":
    case "final":
    case "game_over":
      return p.kind;
    case "round":
    case "mini_wheel":
    case "mini_roulette":
      return `${p.kind}:${p.roundIndex}`;
  }
}

/** Host-driven edges for the show spine + enter/exit mini-games over a round. */
const ALLOWED: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  /** Lobby includes “opening the show” (REQ-8); same phase, no separate `opening_show` kind. */
  ["lobby", new Set(["spectator_picks"])],
  ["spectator_picks", new Set(["round:1"])],
  ["round:1", new Set(["round:2", "mini_wheel:1", "mini_roulette:1"])],
  ["round:2", new Set(["story_video", "mini_wheel:2", "mini_roulette:2"])],
  ["round:3", new Set(["between_final", "mini_wheel:3", "mini_roulette:3"])],
  ["mini_wheel:1", new Set(["round:1"])],
  ["mini_wheel:2", new Set(["round:2"])],
  ["mini_wheel:3", new Set(["round:3"])],
  ["mini_roulette:1", new Set(["round:1"])],
  ["mini_roulette:2", new Set(["round:2"])],
  ["mini_roulette:3", new Set(["round:3"])],
  ["story_video", new Set(["donations"])],
  ["donations", new Set(["round:3"])],
  ["between_final", new Set(["final"])],
  ["final", new Set(["game_over"])],
  ["game_over", new Set()],
]);

export function canTransition(from: Phase, to: Phase): boolean {
  const next = ALLOWED.get(phaseKey(from));
  return next?.has(phaseKey(to)) ?? false;
}
