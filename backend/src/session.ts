import { randomUUID } from "node:crypto";
import type { Phase, RoundIndex } from "./phase.js";
import { canTransition } from "./phase.js";
import { pluginRegistry } from "./pluginRegistry.js";
import { loadRoundBoard, loadRoundBoardFile } from "./quizData.js";
import type { RoundBoardRuntime } from "./quizData.js";

export type Role = "host" | "player" | "spectator";

export type Scores = [number, number, number, number, number];

/** In-memory ring buffer: only the last `MAX_CHAT_MESSAGES` lines are kept; snapshots include them for new joins. */
export const MAX_CHAT_MESSAGES = 50;

export type ChatLine = {
  id: string;
  atMs: number;
  fromDisplayName: string;
  fromRole: Role;
  text: string;
};

export type Participant = {
  id: string;
  displayName: string;
  role: Role;
};

export type SessionSnapshot = {
  showId: string;
  version: number;
  phase: Phase;
  /** Canonical phase timeline for host navigation UI. */
  phaseNav: Phase[];
  /** Fixed seat names (0–4). Host-editable. */
  seatNames: [string, string, string, string, string];
  scores: Scores;
  /** Seat 0–4 = Player numbers 1–5 (REQ-2). */
  currentTurnSeat: number;
  /** Per-round board: themes + question cells from JSON; `revealed` tracks opened cells (REQ-1). */
  roundBoard: Record<RoundIndex, RoundBoardRuntime>;
  /**
   * Board for the **transition to Final** and **Final** segment (REQ-13), loaded from `data/rounds/round-4.json`.
   */
  finalTransitionBoard: RoundBoardRuntime;
  /**
   * All plugin-managed state lives here, keyed by a stable string the plugin owns.
   * The core session service never reads or writes this object.
   */
  segmentState: Record<string, unknown>;
  lottery: { candidates: string[]; optOut: Record<string, true>; lastWinnerNick: string | null };
  chat: ChatLine[];
  participants: Participant[];
  /** Participant ids with at least one open WebSocket in this show (presence). */
  onlineParticipantIds: string[];
};

export function createInitialSession(showId: string): SessionSnapshot {
  const roundBoard: SessionSnapshot["roundBoard"] = {
    1: loadRoundBoard(1),
    2: loadRoundBoard(2),
    3: loadRoundBoard(3),
  };
  const finalTransitionBoard = loadRoundBoardFile(4);
  return {
    showId,
    version: 1,
    phase: { kind: "lobby" },
    phaseNav: buildPhaseNav(),
    seatNames: ["P1", "P2", "P3", "P4", "P5"],
    scores: [0, 0, 0, 0, 0],
    currentTurnSeat: 0,
    roundBoard,
    finalTransitionBoard,
    segmentState: {},
    lottery: { candidates: [], optOut: {}, lastWinnerNick: null },
    chat: [],
    participants: [],
    onlineParticipantIds: [],
  };
}

export type SessionStore = {
  get(showId: string): SessionSnapshot | undefined;
  /** Replace in-memory session with a fresh snapshot (quiz boards re-read from disk). */
  reset(showId: string): void;
  mutate(
    showId: string,
    fn: (s: SessionSnapshot) => { ok: true } | { ok: false; error: string },
  ): { ok: true; snapshot: SessionSnapshot } | { ok: false; error: string };
};

export function createSessionStore(): SessionStore {
  const map = new Map<string, SessionSnapshot>();

  return {
    get(showId) {
      return map.get(showId);
    },
    reset(showId) {
      map.set(showId, createInitialSession(showId));
    },
    mutate(showId, fn) {
      let cur = map.get(showId);
      if (!cur) {
        cur = createInitialSession(showId);
        map.set(showId, cur);
      }
      const draft: SessionSnapshot = structuredClone(cur);
      if (!Array.isArray(draft.onlineParticipantIds)) draft.onlineParticipantIds = [];
      if (draft.chat.length > MAX_CHAT_MESSAGES) {
        draft.chat = draft.chat.slice(-MAX_CHAT_MESSAGES);
      }
      const result = fn(draft);
      if (!result.ok) return result;
      draft.phaseNav = buildPhaseNav();
      draft.version = cur.version + 1;
      map.set(showId, draft);
      return { ok: true, snapshot: draft };
    },
  };
}

function phaseFromKey(key: string): Phase | null {
  if (key === "lobby") return { kind: "lobby" };
  if (key === "final") return { kind: "final" };
  if (key.startsWith("round:")) {
    const n = Number(key.slice("round:".length));
    if (n === 1 || n === 2 || n === 3) return { kind: "round", roundIndex: n };
    return null;
  }
  if (key.startsWith("plugin_segment:")) {
    const rest = key.slice("plugin_segment:".length);
    const firstColon = rest.indexOf(":");
    if (firstColon < 0) return null;
    const pluginId = rest.slice(0, firstColon);
    const id = rest.slice(firstColon + 1);
    if (!pluginId || !id) return null;
    return { kind: "plugin_segment", pluginId, id };
  }
  return null;
}

/**
 * Builds a canonical **forward** timeline from lobby → … → final.
 *
 * IMPORTANT:
 * - This must be built from forward-only segment definitions, not the bidirectional edge map.
 *   Otherwise nav can loop back (e.g. round:1 → spectator_picks → round:1) and "skip" to final.
 */
function buildPhaseNav(): Phase[] {
  const anchorNext: Record<string, string | undefined> = {
    lobby: "round:1",
    "round:1": "round:2",
    "round:2": "round:3",
    "round:3": "final",
    final: undefined,
  };

  const segByKey = new Map<string, { segKey: string; toPhaseKey: string }>();
  for (const seg of pluginRegistry.segments) {
    const segKey = `plugin_segment:${seg.pluginId}:${seg.id}`;
    segByKey.set(segKey, { segKey, toPhaseKey: seg.toPhaseKey });
  }

  const firstSegFrom = (fromPhaseKey: string): string | null => {
    const seg = pluginRegistry.segments.find((s) => s.fromPhaseKey === fromPhaseKey);
    if (!seg) return null;
    return `plugin_segment:${seg.pluginId}:${seg.id}`;
  };

  const phases: Phase[] = [];
  const seen = new Set<string>();

  let curKey = "lobby";
  for (let guard = 0; guard < 64; guard++) {
    if (seen.has(curKey)) break;
    seen.add(curKey);

    const curPhase = phaseFromKey(curKey);
    if (!curPhase) break;
    phases.push(curPhase);
    if (curKey === "final") break;

    let nextKey: string | null = null;

    if (curKey.startsWith("plugin_segment:")) {
      nextKey = segByKey.get(curKey)?.toPhaseKey ?? null;
    } else {
      nextKey = firstSegFrom(curKey) ?? anchorNext[curKey] ?? null;
    }

    if (!nextKey) break;
    curKey = nextKey;
  }

  if (!phases.some((p) => p.kind === "final")) {
    phases.push({ kind: "final" });
  }

  return phases;
}

export function parsePhase(input: unknown): Phase | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const kind = o["kind"];
  if (kind === "lobby") return { kind: "lobby" };
  if (kind === "final") return { kind: "final" };
  const ri = o["roundIndex"];
  if (kind === "round" && (ri === 1 || ri === 2 || ri === 3)) return { kind: "round", roundIndex: ri };
  if (kind === "plugin_segment") {
    const id = o["id"];
    const pluginId = o["pluginId"];
    if (typeof id === "string" && id && typeof pluginId === "string" && pluginId) {
      return { kind: "plugin_segment", id, pluginId };
    }
  }
  return null;
}

export function applyHostTransition(
  snapshot: SessionSnapshot,
  to: Phase,
): { ok: true } | { ok: false; error: string } {
  const from = snapshot.phase;
  if (!canTransition(from, to, pluginRegistry.edges)) {
    return { ok: false, error: `Illegal phase transition from ${from} to ${to}` };
  }
  snapshot.phase = to;
  return { ok: true };
}

export function appendChat(
  snapshot: SessionSnapshot,
  fromDisplayName: string,
  fromRole: Role,
  text: string,
): { ok: true } | { ok: false; error: string } {
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return { ok: false, error: "Empty chat message" };
  const line: ChatLine = {
    id: randomUUID(),
    atMs: Date.now(),
    fromDisplayName,
    fromRole,
    text: trimmed,
  };
  snapshot.chat.push(line);
  if (snapshot.chat.length > MAX_CHAT_MESSAGES) {
    snapshot.chat.splice(0, snapshot.chat.length - MAX_CHAT_MESSAGES);
  }
  return { ok: true };
}
