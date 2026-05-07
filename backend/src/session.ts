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

/** Well-known key `"spectator_picks"` in `segmentState`. */
export type SpectatorPicksState = {
  locked: boolean;
  bets: Record<string, 1 | 2 | 3 | 4 | 5>;
};

/** Well-known key `"donations"` in `segmentState`. */
export type DonationsState = {
  bySeat: [number | null, number | null, number | null, number | null, number | null];
};

export type SessionSnapshot = {
  showId: string;
  version: number;
  phase: Phase;
  scores: Scores;
  /** Seat 0–4 = Player numbers 1–5 (REQ-2). */
  currentTurnSeat: number;
  /** Per-round board: themes + question cells from JSON; `revealed` tracks opened cells (REQ-1). */
  roundBoard: Record<RoundIndex, RoundBoardRuntime>;
  /**
   * Board for the **transition to Final** and **Final** segment (REQ-13), loaded from `data/round-4.json`.
   */
  finalTransitionBoard: RoundBoardRuntime;
  /**
   * All plugin-managed state lives here, keyed by a stable string the plugin owns.
   * Well-known keys: `"spectator_picks"` (SpectatorPicksState),
   *                  `"donations"` (DonationsState).
   * The core session service never reads or writes this object except to back-fill it.
   */
  segmentState: Record<string, unknown>;
  openingShow: { emojiLineIndex: number; spectatorCorrectCounts: Record<string, number> };
  lottery: { candidates: string[]; optOut: Record<string, true>; lastWinnerNick: string | null };
  chat: ChatLine[];
  participants: Participant[];
};

export function createInitialSession(showId: string): SessionSnapshot {
  const roundBoard: SessionSnapshot["roundBoard"] = {
    1: loadRoundBoard(1),
    2: loadRoundBoard(2),
    3: loadRoundBoard(3),
  };
  const finalTransitionBoard = loadRoundBoardFile(4);
  const spectatorPicksInit: SpectatorPicksState = { locked: false, bets: {} };
  const donationsInit: DonationsState = { bySeat: [null, null, null, null, null] };
  return {
    showId,
    version: 1,
    phase: { kind: "lobby" },
    scores: [0, 0, 0, 0, 0],
    currentTurnSeat: 0,
    roundBoard,
    finalTransitionBoard,
    segmentState: {
      spectator_picks: spectatorPicksInit,
      donations: donationsInit,
    },
    openingShow: { emojiLineIndex: 0, spectatorCorrectCounts: {} },
    lottery: { candidates: [], optOut: {}, lastWinnerNick: null },
    chat: [],
    participants: [],
  };
}

export type SessionStore = {
  get(showId: string): SessionSnapshot | undefined;
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
    mutate(showId, fn) {
      let cur = map.get(showId);
      if (!cur) {
        cur = createInitialSession(showId);
        map.set(showId, cur);
      }
      const draft: SessionSnapshot = structuredClone(cur);
      if (draft.chat.length > MAX_CHAT_MESSAGES) {
        draft.chat = draft.chat.slice(-MAX_CHAT_MESSAGES);
      }
      const result = fn(draft);
      if (!result.ok) return result;
      draft.version = cur.version + 1;
      map.set(showId, draft);
      return { ok: true, snapshot: draft };
    },
  };
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
    return { ok: false, error: "Illegal phase transition for current state" };
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
