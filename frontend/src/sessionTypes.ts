/** Mirrors backend snapshot for the SPA projection (authoritative copy from server). */

/** In sync with `backend/src/session.ts` `MAX_CHAT_MESSAGES`. */
export const MAX_CHAT_MESSAGES = 50;

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

export type SessionSnapshot = {
  showId: string;
  version: number;
  phase: Phase;
  scores: Scores;
  currentTurnSeat: number;
  roundBoard: Record<RoundIndex, RoundBoardRuntime>;
  /** `round-4.json` — transition to Final / Final segment (REQ-13). */
  finalTransitionBoard: RoundBoardRuntime;
  /** Count of Wheel / Roulette mini-games started from the board in rounds 1–3 (index 0 = round 1). */
  miniWheelPlaysByRound: [number, number, number];
  miniRoulettePlaysByRound: [number, number, number];
  /**
   * Generic per-segment state written only by the owning plugin's server handler.
   * Keyed by segmentId. Untouched by the core session service.
   */
  segmentState: Record<string, unknown>;
  openingShow: { emojiLineIndex: number; spectatorCorrectCounts: Record<string, number> };
  spectatorPicks: { locked: boolean; bets: Record<string, 1 | 2 | 3 | 4 | 5> };
  donations: { bySeat: [number | null, number | null, number | null, number | null, number | null] };
  lottery: { candidates: string[]; optOut: Record<string, true>; lastWinnerNick: string | null };
  chat: ChatLine[];
  participants: Participant[];
};
