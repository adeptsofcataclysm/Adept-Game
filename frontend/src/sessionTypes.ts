/**
 * Mirrors backend snapshot for the SPA projection (authoritative copy from server).
 *
 * Main anchor phases: lobby → round:1 → round:2 → round:3 → final
 * `final` is terminal. All other segments (spectator_picks, story_video,
 * donations, between_final …) are `plugin_segment` instances registered via
 * PluginRegistry.
 */

/** In sync with `backend/src/session.ts` `MAX_CHAT_MESSAGES`. */
export const MAX_CHAT_MESSAGES = 50;

export type RoundIndex = 1 | 2 | 3;

export type Phase =
  | { kind: "lobby" }
  | { kind: "round"; roundIndex: RoundIndex }
  | { kind: "final" }
  /** Opaque segment registered by a plugin (first-party or third-party). */
  | { kind: "plugin_segment"; id: string; pluginId: string };

export type Role = "host" | "player" | "spectator";

export type Scores = [number, number, number, number, number];

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

export type QuestionCell = {
  text: string;
  questionUrl: string;
  answerText: string;
  answerUrl: string;
  /** Identifies the card handler; standard quiz cell when absent. */
  cardKind?: string;
  /** Handler-specific parameters for non-standard card kinds. */
  cardParams?: unknown;
  splashUrl?: string;
  splashVariant?: "spiral" | "dedFly";
  splashAudioUrl?: string;
  splashDismissHostOnly?: boolean;
  headerUrl?: string;
  headerCornerUrl?: string;
};

export type RoundBoardRuntime = {
  themes: string[];
  questions: QuestionCell[][];
  revealed: boolean[][];
  pointValues: number[][];
};

// ---------------------------------------------------------------------------
// Well-known segmentState keys
// ---------------------------------------------------------------------------

/** `segmentState["spectator_picks"]` — written by @adept-plugins/spectator-picks */
export type SpectatorPicksState = {
  locked: boolean;
  bets: Record<string, 1 | 2 | 3 | 4 | 5>;
};

/** `segmentState["donations"]` — written by builtin:donations segment */
export type DonationsState = {
  bySeat: [number | null, number | null, number | null, number | null, number | null];
};

// ---------------------------------------------------------------------------
// Session snapshot
// ---------------------------------------------------------------------------

export type SessionSnapshot = {
  showId: string;
  version: number;
  phase: Phase;
  scores: Scores;
  currentTurnSeat: number;
  roundBoard: Record<RoundIndex, RoundBoardRuntime>;
  /** `round-4.json` — transition to Final / Final segment (REQ-13). */
  finalTransitionBoard: RoundBoardRuntime;
  /**
   * All plugin-managed state. Well-known keys:
   *   `"spectator_picks"` → SpectatorPicksState
   *   `"donations"`       → DonationsState
   */
  segmentState: Record<string, unknown>;
  openingShow: { emojiLineIndex: number; spectatorCorrectCounts: Record<string, number> };
  lottery: { candidates: string[]; optOut: Record<string, true>; lastWinnerNick: string | null };
  chat: ChatLine[];
  participants: Participant[];
};
