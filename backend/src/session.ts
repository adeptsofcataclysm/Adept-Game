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
  scores: Scores;
  /** Seat 0–4 = Player numbers 1–5 (REQ-2). */
  currentTurnSeat: number;
  /** Per-round board: themes + question cells from JSON; `revealed` tracks opened cells (REQ-1). */
  roundBoard: Record<RoundIndex, RoundBoardRuntime>;
  /**
   * Board for the **transition to Final** and **Final** segment (REQ-13), loaded from `data/round-4.json`
   * (e.g. "Final round" / super-game cards — not the 5×5 grid itself).
   */
  finalTransitionBoard: RoundBoardRuntime;
  /**
   * How many times the Host has entered **Wheel of Adepts** / **Roulette** from the quiz board
   * this show, per main round (each entry = another mini-game instance in that round).
   */
  miniWheelPlaysByRound: [number, number, number];
  miniRoulettePlaysByRound: [number, number, number];
  /**
   * Generic per-segment state written only by the owning plugin's server handler.
   * Keyed by segmentId; untouched by the core session service.
   */
  segmentState: Record<string, unknown>;
  openingShow: { emojiLineIndex: number; spectatorCorrectCounts: Record<string, number> };
  spectatorPicks: { locked: boolean; bets: Record<string, 1 | 2 | 3 | 4 | 5> };
  donations: { bySeat: [number | null, number | null, number | null, number | null, number | null] };
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
  return {
    showId,
    version: 1,
    phase: { kind: "lobby" },
    scores: [0, 0, 0, 0, 0],
    currentTurnSeat: 0,
    roundBoard,
    finalTransitionBoard,
    miniWheelPlaysByRound: [0, 0, 0],
    miniRoulettePlaysByRound: [0, 0, 0],
    segmentState: {},
    openingShow: { emojiLineIndex: 0, spectatorCorrectCounts: {} },
    spectatorPicks: { locked: false, bets: {} },
    donations: { bySeat: [null, null, null, null, null] },
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
      // Legacy in-memory sessions may still have `opening_show`; treat as lobby.
      if (
        typeof draft.phase === "object" &&
        draft.phase !== null &&
        "kind" in draft.phase &&
        (draft.phase as { kind: string }).kind === "opening_show"
      ) {
        draft.phase = { kind: "lobby" };
      }
      // Back-fill segmentState for sessions persisted before this field existed.
      if (!draft.segmentState) {
        draft.segmentState = {};
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
  if (kind === "opening_show") return { kind: "lobby" };
  if (kind === "spectator_picks") return { kind: "spectator_picks" };
  if (kind === "story_video") return { kind: "story_video" };
  if (kind === "donations") return { kind: "donations" };
  if (kind === "between_final") return { kind: "between_final" };
  if (kind === "final") return { kind: "final" };
  if (kind === "game_over") return { kind: "game_over" };
  const ri = o["roundIndex"];
  if (kind === "round" && (ri === 1 || ri === 2 || ri === 3)) return { kind: "round", roundIndex: ri };
  if (kind === "mini_wheel" && (ri === 1 || ri === 2 || ri === 3))
    return { kind: "mini_wheel", roundIndex: ri };
  if (kind === "mini_roulette" && (ri === 1 || ri === 2 || ri === 3))
    return { kind: "mini_roulette", roundIndex: ri };
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

  if (from.kind === "round" && to.kind === "mini_wheel" && to.roundIndex === from.roundIndex) {
    const i = to.roundIndex - 1;
    snapshot.miniWheelPlaysByRound[i] = snapshot.miniWheelPlaysByRound[i] + 1;
  }
  if (from.kind === "round" && to.kind === "mini_roulette" && to.roundIndex === from.roundIndex) {
    const i = to.roundIndex - 1;
    snapshot.miniRoulettePlaysByRound[i] = snapshot.miniRoulettePlaysByRound[i] + 1;
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
