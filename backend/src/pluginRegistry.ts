/**
 * Server-side plugin registry.
 *
 * Owns the dynamic FSM edges contributed by segments (built-in and third-party)
 * and the card-kind action handlers. `applyHostTransition` in session.ts passes
 * `pluginRegistry.edges` to `canTransition` so the FSM stays data-driven.
 *
 * Built-in segments (story_video, donations, between_final) are registered at
 * module load, so there is exactly one transition path through the code.
 */

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
  /** Phase key of the preceding anchor, e.g. `"round:2"`. */
  fromPhaseKey: string;
  /** Phase key of the following anchor, e.g. `"round:3"`. */
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
    // preceding anchor → this segment
    this.addEdge(def.fromPhaseKey, segKey);
    // this segment → following anchor
    this.addEdge(segKey, def.toPhaseKey);
  }

  /**
   * Register a built-in (non-plugin_segment) transition pair.
   * Used to route legacy Phase kinds (story_video, donations, between_final)
   * through the registry so they go through one transition path.
   */
  registerBuiltinEdge(fromKey: string, toKey: string): void {
    this.addEdge(fromKey, toKey);
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
// Built-in segment registrations
// These replace the hardcoded entries that were previously in ALLOWED.
// ---------------------------------------------------------------------------

// story_video sits between round:2 and donations
pluginRegistry.registerBuiltinEdge("round:2", "story_video");
pluginRegistry.registerBuiltinEdge("story_video", "donations");

// donations sits between story_video and round:3
pluginRegistry.registerBuiltinEdge("donations", "round:3");

// between_final sits between round:3 and final
pluginRegistry.registerBuiltinEdge("round:3", "between_final");
pluginRegistry.registerBuiltinEdge("between_final", "final");
