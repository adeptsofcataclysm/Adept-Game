/**
 * Authoritative game lifecycle.
 *
 * Main anchor phases:
 *   lobby  →  round:1 → round:2 → round:3  →  final
 *
 *
 * Everything else (spectator_picks, funeral:story_video, funeral:donations,
 * between_final, mini_wheel, mini_roulette …) lives as a `plugin_segment`
 * registered via `PluginRegistry`. The core map only contains anchor ↔ anchor
 * edges so the cell-reveal authority and per-round counters are immutable.
 *
 * Direct anchor hops (e.g. round:2 → round:3) exist in the core map so a
 * game can skip optional segments when none are registered for that slot.
 */

export type RoundIndex = 1 | 2 | 3;

export type Phase =
  | { kind: "lobby" }
  | { kind: "round"; roundIndex: RoundIndex }
  | { kind: "final" }
  /** Opaque segment registered by a plugin (first-party or third-party). */
  | { kind: "plugin_segment"; id: string; pluginId: string };

export function phaseKey(p: Phase): string {
  switch (p.kind) {
    case "lobby":
    case "final":
      return p.kind;
    case "round":
      return `round:${p.roundIndex}`;
    case "plugin_segment":
      return `plugin_segment:${p.pluginId}:${p.id}`;
  }
}

/**
 * Immutable core transitions — anchor ↔ anchor only.
 *
 * Plugin registry contributes extra edges (segments, card-kind overlays) on top.
 * `final` is terminal: no outgoing edges.
 */
const CORE_ALLOWED: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["lobby",   new Set(["round:1"])],
  // Allow host to move back/forward between rounds (REQ: header arrows).
  ["round:1", new Set(["lobby", "round:2"])],
  ["round:2", new Set(["round:1", "round:3"])],
  ["round:3", new Set(["round:2", "final"])],
  // `final` is terminal for gameplay, but the host can navigate back.
  ["final",   new Set(["round:3"])],
]);

/**
 * Returns true when transitioning `from → to` is legal.
 *
 * @param extraEdges  Additional edges contributed by PluginRegistry (segments +
 *                    card-kind mini-game overlays). Pass `pluginRegistry.edges`
 *                    from `applyHostTransition`.
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
