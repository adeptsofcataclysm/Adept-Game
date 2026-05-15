/**
 * Server-side plugin registry.
 *
 * Owns the dynamic FSM edges contributed by segments (built-in and third-party)
 * and the card-kind handlers attached to question cells. `applyHostTransition`
 * passes `pluginRegistry.edges` to `canTransition` so the FSM stays data-driven.
 *
 * Segment registrations:
 *   @adept-plugins/spectator-bet (pluginId "spectator-bet"):
 *     spectator_bet: lobby → spectator_bet → round:1
 *   @adept-plugins/funeral (pluginId "funeral"):
 *     story_video : round:2 → story_video → donations
 *     donations   : story_video → donations → round:3
 *   @adept-plugins/final-round-selection (pluginId "final-round-selection"):
 *     between_final: round:3 → between_final → final
 *
 *   @adept-plugins/raccoon (pluginId "raccoon"):
 *     cardKind `raccoon` — spiral splash + pass turn to another seat (in_card).
 *
 *   @adept-plugins/wheel-of-adepts (pluginId "wheel-of-adepts"):
 *     cardKind `wheel_of_adepts` — fortune wheel (`replace_field`, gated by plugin state).
 *
 * Card-kind registrations are added via `registerCardKind`. The `phase` is
 * intentionally NOT changed by an open card — the card layer is orthogonal
 * (see `ActiveCard` on `SessionSnapshot`).
 */

import { registerServer as registerSpectatorBet } from "@adept-plugins/spectator-bet";
import { registerServer as registerOpeningShow } from "@adept-plugins/opening-show";
import { registerServer as registerFuneral } from "@adept-plugins/funeral";
import { registerServer as registerFinalRoundSelection } from "@adept-plugins/final-round-selection";
import { registerServer as registerRaccoon } from "@adept-plugins/raccoon";
import { registerServer as registerWheelOfAdepts } from "@adept-plugins/wheel-of-adepts";
import type { Phase } from "./phase.js";
import type { SessionSnapshot, ActiveCard } from "./session.js";

export type Actor = {
  participantId: string;
  displayName: string;
  role: "host" | "player" | "spectator";
};

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

export type SegmentEventHandler = (
  event: string,
  payload: unknown,
  actor: Actor,
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
  onEvent?: SegmentEventHandler;
};

// ---------------------------------------------------------------------------
// Card-plugin types (mirrors @adept/plugin-sdk v2)
// ---------------------------------------------------------------------------

export type CardMode = "in_card" | "replace_card" | "replace_field";

export type CardCellTarget = {
  boardKind: "round" | "finalTransition";
  roundIndex?: 1 | 2 | 3;
  rowIndex: number;
  colIndex: number;
};

export type CardCtx = {
  readonly snapshot: SessionSnapshot;
  readonly cardParams: unknown;
  readonly pluginState: unknown;
  setPluginState(value: unknown): void;
  advanceCardStage(to: "answer"): MutatorResult;
  closeCard(outcome: "revealed" | "cancelled"): MutatorResult;
  openCellInstead(target: CardCellTarget): MutatorResult;
  requireHost(actor: Actor): MutatorResult;
};

export type CardOpenHandler = (ctx: CardCtx) => MutatorResult;
export type CardAdvanceHandler = (to: "answer", ctx: CardCtx) => MutatorResult;
export type CardCloseHandler = (
  outcome: "revealed" | "cancelled",
  ctx: CardCtx,
) => MutatorResult;
export type CardEventHandler = (
  event: string,
  payload: unknown,
  actor: Actor,
  ctx: CardCtx,
) => MutatorResult;

export type CardParamsValidatorOk = { ok: true; value: unknown };
export type CardParamsValidatorResult = MutatorResult | CardParamsValidatorOk;
export type CardParamsValidator = (raw: unknown) => CardParamsValidatorResult;

export type CardKindDefinition = {
  pluginId: string;
  cardKind: string;
  mode: CardMode;
  validateParams?: CardParamsValidator;
  onOpen?: CardOpenHandler;
  onAdvance?: CardAdvanceHandler;
  onClose?: CardCloseHandler;
  onCardEvent?: CardEventHandler;
};

export type RegisteredCardKind = {
  pluginId: string;
  cardKind: string;
  mode: CardMode;
  hasParams: boolean;
};

class PluginRegistryImpl {
  private readonly _edges = new Map<string, Set<string>>();
  private readonly _segmentDefs = new Map<string, SegmentDefinition>();
  private readonly _cardKinds = new Map<string, CardKindDefinition>();

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
    this.addEdge(def.toPhaseKey, segKey);
    this.addEdge(segKey, def.fromPhaseKey);
  }

  /**
   * Register a card-plugin kind. `cardKind` strings are a global namespace —
   * collisions throw so the misconfiguration is caught at boot.
   */
  registerCardKind(def: CardKindDefinition): void {
    const existing = this._cardKinds.get(def.cardKind);
    if (existing) {
      throw new Error(
        `cardKind "${def.cardKind}" already registered by plugin "${existing.pluginId}"; second registration from "${def.pluginId}"`,
      );
    }
    this._cardKinds.set(def.cardKind, def);
  }

  /** Dynamic edges passed to `canTransition` in phase.ts. */
  get edges(): ReadonlyMap<string, ReadonlySet<string>> {
    return this._edges;
  }

  /** Segment definitions in registration order. */
  get segments(): readonly SegmentDefinition[] {
    return Array.from(this._segmentDefs.values());
  }

  getSegmentDef(pluginId: string, segmentId: string): SegmentDefinition | undefined {
    return this._segmentDefs.get(`plugin_segment:${pluginId}:${segmentId}`);
  }

  getSegmentDefByKey(segKey: string): SegmentDefinition | undefined {
    return this._segmentDefs.get(segKey);
  }

  getCardKind(cardKind: string): CardKindDefinition | undefined {
    return this._cardKinds.get(cardKind);
  }

  /** Manifest used by the host edit UI; immutable per process. */
  listCardKinds(): RegisteredCardKind[] {
    return Array.from(this._cardKinds.values()).map((def) => ({
      pluginId: def.pluginId,
      cardKind: def.cardKind,
      mode: def.mode,
      hasParams: typeof def.validateParams === "function",
    }));
  }

  /** Registered `cardKind` ids (sorted) — used by `gen-quiz-pack-schema` and editor tooling. */
  listRegisteredCardKindIds(): string[] {
    return [...this._cardKinds.keys()].sort((a, b) => a.localeCompare(b));
  }

  /**
   * JSON Schema (Draft-07) fragment for the canonical keyed `cardParams` record:
   * each property name must be a registered `cardKind`. Values are plugin-defined objects.
   */
  buildRegisteredCardParamsMapJsonSchema(): Record<string, unknown> {
    const keys = this.listRegisteredCardKindIds();
    if (keys.length === 0) {
      return {
        type: "object",
        description:
          "No card plugins registered at host boot — any object accepted. After registering card kinds, run `npm run gen:quiz-schema` in `backend/`.",
        additionalProperties: { type: "object" },
      };
    }
    return {
      type: "object",
      description:
        "Canonical keyed form: property names are registered `cardKind` strings. Regenerate `quiz-pack.schema.json` via `npm run gen:quiz-schema` in `backend/` when plugins change.",
      propertyNames: { enum: keys },
      additionalProperties: { type: "object" },
    };
  }
}

export const pluginRegistry = new PluginRegistryImpl();

// Register round transition plugins
registerOpeningShow(pluginRegistry);
registerSpectatorBet(pluginRegistry);
registerFuneral(pluginRegistry);
registerFinalRoundSelection(pluginRegistry);
registerRaccoon(pluginRegistry);
registerWheelOfAdepts(pluginRegistry);

// ---------------------------------------------------------------------------
// Card-plugin helpers consumed by wsHandlers.ts
// ---------------------------------------------------------------------------

/**
 * Build a `CardCtx` scoped to a single `cardKind`, backed by the draft snapshot
 * passed in by `ctx.store.mutate(...)`. The returned object mirrors the SDK's
 * `CardCtx` (apiVersion 2).
 */
export function makeCardCtx(args: {
  snap: SessionSnapshot;
  cardKind: string;
  applyTransition: (to: Phase) => MutatorResult;
}): CardCtx & { drainPendingFollowUp(): CardCtxFollowUp | null } {
  const { snap, cardKind, applyTransition } = args;
  void applyTransition;

  let pendingFollowUp: CardCtxFollowUp | null = null;

  const ctx = {
    snapshot: snap,
    get cardParams(): unknown {
      const active = snap.activeCard;
      if (!active) return undefined;
      const cell = readActiveCardCell(snap, active);
      if (!cell) return undefined;
      const params = cell.cardParams as Record<string, unknown> | undefined;
      return params ? params[cardKind] : undefined;
    },
    get pluginState(): unknown {
      const active = snap.activeCard;
      if (!active) return undefined;
      return active.pluginState[cardKind];
    },
    setPluginState(value: unknown): void {
      const active = snap.activeCard;
      if (!active) return;
      active.pluginState[cardKind] = value;
    },
    advanceCardStage(to: "answer"): MutatorResult {
      const active = snap.activeCard;
      if (!active) return { ok: false, error: "No active card" };
      if (to !== "answer") return { ok: false, error: "Invalid stage" };
      active.stage = "answer";
      return { ok: true };
    },
    closeCard(outcome: "revealed" | "cancelled"): MutatorResult {
      const active = snap.activeCard;
      if (!active) return { ok: false, error: "No active card" };
      if (outcome !== "revealed" && outcome !== "cancelled") {
        return { ok: false, error: "Invalid close outcome" };
      }
      pendingFollowUp = { kind: "close", outcome };
      return { ok: true };
    },
    openCellInstead(target: CardCellTarget): MutatorResult {
      if (!isValidCellTarget(target)) return { ok: false, error: "Invalid cell target" };
      pendingFollowUp = { kind: "open_instead", target };
      return { ok: true };
    },
    requireHost(actor: Actor): MutatorResult {
      return actor.role === "host" ? { ok: true } : { ok: false, error: "Host only" };
    },
  };

  return {
    ...ctx,
    drainPendingFollowUp(): CardCtxFollowUp | null {
      const next = pendingFollowUp;
      pendingFollowUp = null;
      return next;
    },
  };
}

export type CardCtxFollowUp =
  | { kind: "close"; outcome: "revealed" | "cancelled" }
  | { kind: "open_instead"; target: CardCellTarget };

function isValidCellTarget(t: CardCellTarget): boolean {
  if (t.boardKind === "round") {
    return (t.roundIndex === 1 || t.roundIndex === 2 || t.roundIndex === 3) &&
      Number.isInteger(t.rowIndex) && t.rowIndex >= 0 &&
      Number.isInteger(t.colIndex) && t.colIndex >= 0;
  }
  if (t.boardKind === "finalTransition") {
    return Number.isInteger(t.rowIndex) && t.rowIndex >= 0 &&
      Number.isInteger(t.colIndex) && t.colIndex >= 0;
  }
  return false;
}

function readActiveCardCell(snap: SessionSnapshot, active: ActiveCard) {
  const board =
    active.board === "finalTransition"
      ? snap.finalTransitionBoard
      : active.roundIndex
        ? snap.roundBoard[active.roundIndex]
        : null;
  if (!board) return null;
  return board.questions[active.rowIndex]?.[active.colIndex] ?? null;
}
