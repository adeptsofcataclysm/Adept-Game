/**
 * Authoritative lifecycle + rounds + mini-game overlays (aligned with product flow).
 *
 * **Several Wheel / Roulette runs per round:** the graph allows `round:n` → `mini_*:n` → `round:n`
 * to repeat any number of times (each Pandora's box / wheel card can start another instance).
 *
 * **Pluggable segments:** `story_video`, `donations`, and `between_final` are registered as
 * built-in plugins through `PluginRegistry`. The core map only contains anchor ↔ anchor edges
 * (round:1/2/3, final, game_over) and mini-game overlays. This keeps the cell-reveal authority
 * and per-round counters immutable — plugins can never replace a `round:n` node.
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
  | { kind: "game_over" }
  /** Opaque segment injected by a plugin between anchor rounds. */
  | { kind: "plugin_segment"; id: string; pluginId: string };

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
    case "plugin_segment":
      return `plugin_segment:${p.pluginId}:${p.id}`;
  }
}

/**
 * Immutable core transitions: anchor ↔ anchor hops and mini-game overlays.
 *
 * Segment transitions (story_video, donations, between_final, plugin_segment)
 * are NOT listed here — they are added by PluginRegistry at boot. This keeps
 * `CORE_ALLOWED` stable regardless of which plugins are installed.
 *
 * A direct round:2 → round:3 and round:3 → final edge exists so a show can
 * skip optional segments when none are registered for that slot.
 */
const CORE_ALLOWED: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["lobby", new Set(["spectator_picks"])],
  ["spectator_picks", new Set(["round:1"])],
  ["round:1", new Set(["round:2", "mini_wheel:1", "mini_roulette:1"])],
  ["round:2", new Set(["round:3", "mini_wheel:2", "mini_roulette:2"])],
  ["round:3", new Set(["final", "mini_wheel:3", "mini_roulette:3"])],
  ["mini_wheel:1", new Set(["round:1"])],
  ["mini_wheel:2", new Set(["round:2"])],
  ["mini_wheel:3", new Set(["round:3"])],
  ["mini_roulette:1", new Set(["round:1"])],
  ["mini_roulette:2", new Set(["round:2"])],
  ["mini_roulette:3", new Set(["round:3"])],
  ["final", new Set(["game_over"])],
  ["game_over", new Set()],
]);

/**
 * Returns true when transitioning `from → to` is legal.
 *
 * @param extraEdges  Additional edges contributed by PluginRegistry (built-in
 *                    segments + third-party plugins). Pass `pluginRegistry.edges`
 *                    from `applyHostTransition` so the FSM stays data-driven.
 */
export function canTransition(
  from: Phase,
  to: Phase,
  extraEdges?: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const fromKey = phaseKey(from);
  const toKey = phaseKey(to);
  if (CORE_ALLOWED.get(fromKey)?.has(toKey)) return true;
  if (extraEdges?.get(fromKey)?.has(toKey)) return true;
  return false;
}
