/**
 * Mirrors backend snapshot for the SPA projection (authoritative copy from server).
 *
 * Main anchor phases: lobby → round:1 → round:2 → round:3 → final
 * `final` is terminal. All other segments (spectator_bet,
 * funeral:story_video, funeral:donations, between_final …) are
 * `plugin_segment` instances registered via PluginRegistry.
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
  /**
   * Normalized list of card-plugin kinds attached to this cell. Standard quiz
   * cell when absent or empty. The backend loader also accepts legacy
   * `cardKind: "x"` on disk and normalizes it on read.
   */
  cardKinds?: string[];
  /** Per-kind handler parameters keyed by `cardKind`. */
  cardParams?: Record<string, unknown>;
  splashUrl?: string;
  splashVariant?: "spiral" | "dedFly";
  splashAudioUrl?: string;
  splashDismissHostOnly?: boolean;
  headerUrl?: string;
  headerCornerUrl?: string;
};

export type CardMode = "in_card" | "replace_card" | "replace_field";

/** Plugin-discovery manifest entry exposed to clients via the snapshot. */
export type RegisteredCardKind = {
  pluginId: string;
  cardKind: string;
  mode: CardMode;
  /** True when the kind reads `cardParams` from JSON; UI shows the editor only then. */
  hasParams: boolean;
};

/**
 * Server-authoritative descriptor of the currently-open question card, or
 * `null` when no card is open. Orthogonal to `phase`.
 */
export type ActiveCard = {
  board: "round" | "finalTransition";
  roundIndex?: RoundIndex;
  rowIndex: number;
  colIndex: number;
  stage: "question" | "answer";
  cardKinds: string[];
  pluginState: Record<string, unknown>;
};

export type RoundBoardRuntime = {
  themes: string[];
  /** Optional icon URL per theme row (same length as `themes`). When absent or null → client falls back to theme-name mapping. */
  themeIcons?: (string | null)[];
  questions: QuestionCell[][];
  revealed: boolean[][];
  pointValues: number[][];
};

// ---------------------------------------------------------------------------
// Session snapshot
// ---------------------------------------------------------------------------

export type SessionSnapshot = {
  showId: string;
  version: number;
  phase: Phase;
  /** Canonical phase timeline for host navigation UI (from backend). */
  phaseNav: Phase[];
  /** Fixed seat names (0–4). Host-editable. */
  seatNames: [string, string, string, string, string];
  scores: Scores;
  currentTurnSeat: number;
  roundBoard: Record<RoundIndex, RoundBoardRuntime>;
  /** `round-4.json` — transition to Final / Final segment (REQ-13). */
  finalTransitionBoard: RoundBoardRuntime;
  /** Currently-open card overlay, or `null`. Orthogonal to `phase`. */
  activeCard: ActiveCard | null;
  /** Plugin-discovery manifest, populated at server boot from the host registry. */
  registeredCardKinds: RegisteredCardKind[];
  segmentState: Record<string, unknown>;
  lottery: { candidates: string[]; optOut: Record<string, true>; lastWinnerNick: string | null };
  chat: ChatLine[];
  participants: Participant[];
  /** Participant ids with at least one open WebSocket (presence). */
  onlineParticipantIds: string[];
};
