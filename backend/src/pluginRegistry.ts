/**
 * Server-side plugin registry.
 *
 * Owns the dynamic FSM edges contributed by segments (built-in and third-party)
 * and the card-kind action handlers. `applyHostTransition` passes
 * `pluginRegistry.edges` to `canTransition` so the FSM stays data-driven.
 *
 * Built-in segments registered here (pluginId "builtin"):
 *   story_video   : round:2  → story_video  → donations
 *   donations     : story_video → donations → round:3
 *   between_final : round:3  → between_final → final
 *
 * @adept-plugins/spectator-picks registers itself (pluginId "spectator-picks"):
 *   spectator_picks: lobby → spectator_picks → round:1
 *
 * Card kinds registered here (pluginId "builtin"):
 *   wheel    — Wheel of Adepts card
 *   roulette — Roulette card
 */

import { registerServer as registerSpectatorPicks } from "@adept-plugins/spectator-picks";
import type { Phase } from "./phase.js";
import type { SessionSnapshot } from "./session.js";

export type MutatorResult = { ok: true } | { ok: false; error: string };

export type Ctx = {
  readonly snapshot: SessionSnapshot;
  requestTransition(to: Phase): MutatorResult;
  setSegmentState(key: string, value: unknown): void;
};

export type SegmentActionHandler = (
  action: string,
  payload: unknown,
  ctx: Ctx,
) => MutatorResult;

export type SegmentDefinition = {
  pluginId: string;
  id: string;
  /** Phase key of the preceding phase, e.g. `"round:2"`. */
  fromPhaseKey: string;
  /** Phase key of the following phase, e.g. `"round:3"`. */
  toPhaseKey: string;
  onAction?: SegmentActionHandler;
};

export type CardHandlerDef = {
  pluginId: string;
  cardKind: string;
};

class PluginRegistryImpl {
  private readonly _edges = new Map<string, Set<string>>();
  private readonly _segmentDefs = new Map<string, SegmentDefinition>();
  private readonly _cardHandlers = new Map<string, CardHandlerDef>();

  private addEdge(from: string, to: string): void {
    let s = this._edges.get(from);
    if (!s) {
      s = new Set<string>();
      this._edges.set(from, s);
    }
    s.add(to);
  }

  registerSegment(def: SegmentDefinition): void {
    const segKey = `plugin_segment:${def.pluginId}:${def.id}`;
    this._segmentDefs.set(segKey, def);
    this.addEdge(def.fromPhaseKey, segKey);
    this.addEdge(segKey, def.toPhaseKey);
  }

  registerCardHandler(def: CardHandlerDef): void {
    this._cardHandlers.set(def.cardKind, def);
  }

  /** Dynamic edges passed to `canTransition` in phase.ts. */
  get edges(): ReadonlyMap<string, ReadonlySet<string>> {
    return this._edges;
  }

  getSegmentDef(pluginId: string, segmentId: string): SegmentDefinition | undefined {
    return this._segmentDefs.get(`plugin_segment:${pluginId}:${segmentId}`);
  }

  getCardHandler(cardKind: string): CardHandlerDef | undefined {
    return this._cardHandlers.get(cardKind);
  }
}

export const pluginRegistry = new PluginRegistryImpl();

// ---------------------------------------------------------------------------
// @adept-plugins/spectator-picks  (lobby → spectator_picks → round:1)
// ---------------------------------------------------------------------------

registerSpectatorPicks(pluginRegistry);

// ---------------------------------------------------------------------------
// Built-in segment registrations (pluginId "builtin")
// ---------------------------------------------------------------------------

// story_video: round:2 → story_video → donations
pluginRegistry.registerSegment({
  pluginId: "builtin",
  id: "story_video",
  fromPhaseKey: "round:2",
  toPhaseKey: "plugin_segment:builtin:donations",
});

// donations: story_video → donations → round:3
pluginRegistry.registerSegment({
  pluginId: "builtin",
  id: "donations",
  fromPhaseKey: "plugin_segment:builtin:story_video",
  toPhaseKey: "round:3",
});

// between_final: round:3 → between_final → final
pluginRegistry.registerSegment({
  pluginId: "builtin",
  id: "between_final",
  fromPhaseKey: "round:3",
  toPhaseKey: "final",
});

// ---------------------------------------------------------------------------
// Built-in card kind registrations (pluginId "builtin")
// ---------------------------------------------------------------------------

pluginRegistry.registerCardHandler({ pluginId: "builtin", cardKind: "wheel" });
pluginRegistry.registerCardHandler({ pluginId: "builtin", cardKind: "roulette" });
