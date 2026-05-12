import path from "node:path";
import fs from "node:fs";
import type { RawData } from "ws";
import type { WebSocket } from "ws";
import type { Phase, RoundIndex } from "./phase.js";
import { pluginRegistry, makeCardCtx } from "./pluginRegistry.js";
import type {
  Actor,
  CardCtxFollowUp,
  CardKindDefinition,
  MutatorResult,
} from "./pluginRegistry.js";
import type { ActiveCard, Participant, Role, SessionSnapshot, SessionStore } from "./session.js";
import { appendChat, applyHostTransition, parsePhase } from "./session.js";
import { normalizeAndValidateCardKinds } from "./quizData.js";

export type ClientMeta = {
  showId: string;
  participantId: string;
  displayName: string;
  role: Role;
};

/**
 * Host auth stays on the socket (`meta.role === "host"`). Everyone else follows
 * `snapshot.participants` so segments (e.g. opening_show) can promote spectators
 * to players without a second join.
 */
function effectiveParticipantRole(snap: SessionSnapshot, meta: ClientMeta): Role {
  if (meta.role === "host") return "host";
  const pr = snap.participants.find((p) => p.id === meta.participantId);
  if (pr) return pr.role;
  return meta.role;
}

export type InboundMessage = {
  type: string;
  payload: unknown;
};

export type HandlerCtx = {
  store: SessionStore;
  dataDir: string;
  broadcast: (showId: string, payload: unknown) => void;
  sendError: (ws: WebSocket, message: string) => void;
  joinRoom: (showId: string, ws: WebSocket) => void;
  setMeta: (ws: WebSocket, meta: ClientMeta) => void;
  getMeta: (ws: WebSocket) => ClientMeta | undefined;
  isHostAuthorized: (role: Role, hostSecret: string | undefined) => boolean;
  getOnlineParticipantIds: (showId: string) => string[];
  /** Joined socket metas currently in `showId` (one entry per connection). */
  listMetasInShow: (showId: string) => ClientMeta[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function parseJson(raw: RawData): unknown {
  try {
    const t = raw.toString();
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

export function parseInboundMessage(raw: RawData): InboundMessage | null {
  const msg = parseJson(raw);
  if (!isRecord(msg)) return null;
  const type = msg["type"];
  if (typeof type !== "string" || !type) return null;
  return { type, payload: msg["payload"] };
}

function tryPersistRoundPackEdit(
  dataDir: string,
  args: {
    roundFile: 1 | 2 | 3 | 4;
    rowIndex: number;
    themeText: string;
    iconUrl: string | null;
  },
): { ok: true } | { ok: false; error: string } {
  const fileName = `round-${args.roundFile}.json`;
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) return { ok: false, error: `${fileName} not found` };

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return { ok: false, error: `${fileName}: invalid JSON` };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, error: `${fileName}: invalid object` };
  const o = parsed as Record<string, unknown>;
  if (!Array.isArray(o["themes"]) || !Array.isArray(o["questions"])) {
    return { ok: false, error: `${fileName}: missing themes/questions` };
  }

  const themes = o["themes"] as unknown[];
  if (args.rowIndex < 0 || args.rowIndex >= themes.length) return { ok: false, error: "rowIndex out of range" };

  (themes as unknown[])[args.rowIndex] = args.themeText;
  o["themes"] = themes;

  let icons: (string | null)[] | null = null;
  if (Array.isArray(o["themeIcons"])) {
    icons = (o["themeIcons"] as unknown[]).map((v) => (typeof v === "string" ? v : null));
  }
  if (!icons || icons.length !== themes.length) {
    icons = Array.from({ length: themes.length }, (_, i) =>
      Array.isArray(o["themeIcons"]) ? (icons?.[i] ?? null) : null,
    );
  }
  icons[args.rowIndex] = args.iconUrl;
  o["themeIcons"] = icons;

  try {
    fs.writeFileSync(filePath, `${JSON.stringify(o, null, 2)}\n`, "utf8");
    return { ok: true };
  } catch {
    return { ok: false, error: `${fileName}: write failed` };
  }
}

function tryPersistRoundPackQuestionEdit(
  dataDir: string,
  args: {
    roundFile: 1 | 2 | 3 | 4;
    rowIndex: number;
    colIndex: number;
    questionText: string;
    answerText: string;
    questionUrl: string;
    answerUrl: string;
    /** When defined, replaces both cardKinds and cardParams on the persisted cell. */
    cardKinds?: string[];
    cardParams?: Record<string, unknown>;
  },
): { ok: true } | { ok: false; error: string } {
  const fileName = `round-${args.roundFile}.json`;
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) return { ok: false, error: `${fileName} not found` };

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return { ok: false, error: `${fileName}: invalid JSON` };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, error: `${fileName}: invalid object` };
  const o = parsed as Record<string, unknown>;
  const qs = o["questions"];
  if (!Array.isArray(qs)) return { ok: false, error: `${fileName}: missing questions` };
  const row = qs[args.rowIndex];
  if (!Array.isArray(row)) return { ok: false, error: "theme row out of range" };
  if (args.colIndex < 0 || args.colIndex >= row.length) return { ok: false, error: "column out of range" };
  const cell = row[args.colIndex];
  if (!cell || typeof cell !== "object") return { ok: false, error: "cell missing" };

  const updated: Record<string, unknown> = {
    ...(cell as Record<string, unknown>),
    text: args.questionText,
    questionUrl: args.questionUrl,
    answerText: args.answerText,
    answerUrl: args.answerUrl,
  };
  if (typeof args.cardKinds !== "undefined") {
    delete updated["cardKind"];
    if (args.cardKinds.length === 0) {
      delete updated["cardKinds"];
      delete updated["cardParams"];
    } else {
      updated["cardKinds"] = [...args.cardKinds];
      const params = args.cardParams ?? {};
      if (Object.keys(params).length > 0) {
        updated["cardParams"] = { ...params };
      } else {
        delete updated["cardParams"];
      }
    }
  }
  row[args.colIndex] = updated;
  try {
    fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    return { ok: true };
  } catch {
    return { ok: false, error: `${fileName}: write failed` };
  }
}

function handleJoin(
  ctx: HandlerCtx,
  ws: WebSocket,
  connectShowId: string,
  payload: unknown,
): void {
  if (!isRecord(payload)) return;
  const role = payload["role"];
  const displayName = String(payload["displayName"] ?? "").trim().slice(0, 64);
  const participantId = String(payload["participantId"] ?? "").trim().slice(0, 128);
  const joinShowId =
    String(payload["showId"] ?? connectShowId).trim().slice(0, 128) || connectShowId;
  const hostSecret = typeof payload["hostSecret"] === "string" ? payload["hostSecret"] : undefined;

  if (!displayName || !participantId) {
    ctx.sendError(ws, "displayName and participantId required");
    return;
  }
  if (role !== "host" && role !== "player" && role !== "spectator") {
    ctx.sendError(ws, "Invalid role");
    return;
  }
  if (!ctx.isHostAuthorized(role, hostSecret)) {
    ctx.sendError(ws, "Host authentication failed");
    return;
  }

  ctx.setMeta(ws, { showId: joinShowId, participantId, displayName, role });
  ctx.joinRoom(joinShowId, ws);

  const result = ctx.store.mutate(joinShowId, (snap) => {
    const exists = snap.participants.some((x) => x.id === participantId);
    if (!exists) {
      snap.participants.push({ id: participantId, displayName, role });
    } else {
      const pr = snap.participants.find((x) => x.id === participantId);
      if (pr) {
        pr.displayName = displayName;
        if (role === "host") {
          pr.role = role;
        }
      }
    }
    snap.onlineParticipantIds = ctx.getOnlineParticipantIds(joinShowId);
    return { ok: true };
  });

  if (result.ok) {
    ctx.broadcast(joinShowId, { type: "snapshot", payload: result.snapshot });
  }
}

function handleChat(ctx: HandlerCtx, ws: WebSocket, meta: ClientMeta, payload: unknown): void {
  if (!isRecord(payload)) {
    ctx.sendError(ws, "Chat payload must be an object");
    return;
  }
  const text = String(payload["text"] ?? "");
  const r = ctx.store.mutate(meta.showId, (snap) =>
    appendChat(snap, meta.displayName, effectiveParticipantRole(snap, meta), text),
  );
  if (r.ok) ctx.broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
  else ctx.sendError(ws, r.error);
}

function participantsFromConnectedMetas(metas: ClientMeta[]): Participant[] {
  const byId = new Map<string, Participant>();
  for (const m of metas) {
    byId.set(m.participantId, { id: m.participantId, displayName: m.displayName, role: m.role });
  }
  return [...byId.values()];
}

function handleHostResetSession(ctx: HandlerCtx, ws: WebSocket, meta: ClientMeta): void {
  if (meta.role !== "host") {
    ctx.sendError(ws, "Host only");
    return;
  }
  const showId = meta.showId;
  const metas = ctx.listMetasInShow(showId);
  ctx.store.reset(showId);
  const r = ctx.store.mutate(showId, (snap) => {
    snap.participants = participantsFromConnectedMetas(metas);
    snap.onlineParticipantIds = ctx.getOnlineParticipantIds(showId);
    return { ok: true };
  });
  if (r.ok) ctx.broadcast(showId, { type: "snapshot", payload: r.snapshot });
  else ctx.sendError(ws, r.error);
}

function handleHostTransition(ctx: HandlerCtx, ws: WebSocket, meta: ClientMeta, payload: unknown): void {
  if (meta.role !== "host") {
    ctx.sendError(ws, "Host only");
    return;
  }
  const to = parsePhase(payload);
  if (!to) {
    ctx.sendError(ws, "Invalid phase payload");
    return;
  }
  const r = ctx.store.mutate(meta.showId, (snap) => applyHostTransition(snap, to));
  if (r.ok) ctx.broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
  else ctx.sendError(ws, r.error);
}

function handleHostEditQuizTheme(
  ctx: HandlerCtx,
  ws: WebSocket,
  meta: ClientMeta,
  payload: unknown,
): void {
  if (meta.role !== "host") {
    ctx.sendError(ws, "Host only");
    return;
  }
  if (!isRecord(payload)) return;

  const boardKind = String(payload["boardKind"] ?? "").trim();
  const roundIndex = payload["roundIndex"];
  const rowIndex = payload["rowIndex"];
  const themeTextRaw = payload["themeText"];
  const iconUrlRaw = payload["iconUrl"];

  if (typeof rowIndex !== "number" || !Number.isFinite(rowIndex) || rowIndex < 0) return;
  const themeText = String(themeTextRaw ?? "").trim().slice(0, 64);
  if (!themeText) {
    ctx.sendError(ws, "Theme text required");
    return;
  }

  let iconUrl: string | null = null;
  if (typeof iconUrlRaw === "string") {
    const trimmed = iconUrlRaw.trim();
    if (trimmed.length > 200_000) {
      ctx.sendError(ws, "Icon payload too large");
      return;
    }
    iconUrl = trimmed || null;
  } else if (iconUrlRaw === null || typeof iconUrlRaw === "undefined") {
    iconUrl = null;
  } else {
    return;
  }

  const r = ctx.store.mutate(meta.showId, (snap) => {
    const board =
      boardKind === "finalTransition"
        ? snap.finalTransitionBoard
        : boardKind === "round" && (roundIndex === 1 || roundIndex === 2 || roundIndex === 3)
          ? snap.roundBoard[roundIndex]
          : null;
    if (!board) return { ok: false, error: "Invalid board selector" };
    if (rowIndex >= board.themes.length) return { ok: false, error: "Theme row out of range" };

    board.themes[rowIndex] = themeText;
    if (!board.themeIcons || board.themeIcons.length !== board.themes.length) {
      board.themeIcons = board.themes.map((_, i) => board.themeIcons?.[i] ?? null);
    }
    board.themeIcons[rowIndex] = iconUrl;
    return { ok: true };
  });

  if (r.ok) {
    const roundFile: 1 | 2 | 3 | 4 | null =
      boardKind === "finalTransition"
        ? 4
        : boardKind === "round" && (roundIndex === 1 || roundIndex === 2 || roundIndex === 3)
          ? roundIndex
          : null;
    if (roundFile) {
      const persist = tryPersistRoundPackEdit(ctx.dataDir, { roundFile, rowIndex, themeText, iconUrl });
      if (!persist.ok) {
        ctx.sendError(ws, `Persist failed: ${persist.error}`);
      }
    }
    ctx.broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
  } else ctx.sendError(ws, r.error);
}

const MAX_QUESTION_TEXT_LEN = 16_384;
const MAX_ANSWER_TEXT_LEN = 16_384;
const MAX_MEDIA_URL_LEN = 4_096;

function handleHostEditQuizQuestion(
  ctx: HandlerCtx,
  ws: WebSocket,
  meta: ClientMeta,
  payload: unknown,
): void {
  if (meta.role !== "host") {
    ctx.sendError(ws, "Host only");
    return;
  }
  if (!isRecord(payload)) return;

  const boardKind = String(payload["boardKind"] ?? "").trim();
  const roundIndex = payload["roundIndex"];
  const rowIndex = payload["rowIndex"];
  const colIndex = payload["colIndex"];
  const questionTextRaw = payload["questionText"];
  const answerTextRaw = payload["answerText"];
  const questionUrlRaw = payload["questionUrl"];
  const answerUrlRaw = payload["answerUrl"];
  const hasCardKindsInPayload =
    Object.prototype.hasOwnProperty.call(payload, "cardKinds") ||
    Object.prototype.hasOwnProperty.call(payload, "cardKind") ||
    Object.prototype.hasOwnProperty.call(payload, "cardParams");

  if (
    typeof rowIndex !== "number" ||
    !Number.isFinite(rowIndex) ||
    rowIndex < 0 ||
    typeof colIndex !== "number" ||
    !Number.isFinite(colIndex) ||
    colIndex < 0
  )
    return;
  if (
    typeof questionTextRaw !== "string" ||
    typeof answerTextRaw !== "string" ||
    typeof questionUrlRaw !== "string" ||
    typeof answerUrlRaw !== "string"
  )
    return;

  const questionText = questionTextRaw.slice(0, MAX_QUESTION_TEXT_LEN);
  const answerText = answerTextRaw.slice(0, MAX_ANSWER_TEXT_LEN);
  const questionUrl = questionUrlRaw.trim().slice(0, MAX_MEDIA_URL_LEN);
  const answerUrl = answerUrlRaw.trim().slice(0, MAX_MEDIA_URL_LEN);

  let normalizedKinds: string[] | undefined;
  let normalizedParams: Record<string, unknown> | undefined;
  if (hasCardKindsInPayload) {
    const norm = normalizeAndValidateCardKinds({
      cardKind: (payload as Record<string, unknown>)["cardKind"],
      cardKinds: (payload as Record<string, unknown>)["cardKinds"],
      cardParams: (payload as Record<string, unknown>)["cardParams"],
    });
    if (!norm.ok) {
      ctx.sendError(ws, norm.error);
      return;
    }
    normalizedKinds = norm.value.cardKinds;
    normalizedParams = norm.value.cardParams;
  }

  const r = ctx.store.mutate(meta.showId, (snap) => {
    const board =
      boardKind === "finalTransition"
        ? snap.finalTransitionBoard
        : boardKind === "round" && (roundIndex === 1 || roundIndex === 2 || roundIndex === 3)
          ? snap.roundBoard[roundIndex]
          : null;
    if (!board) return { ok: false, error: "Invalid board selector" };
    if (rowIndex >= board.themes.length) return { ok: false, error: "Theme row out of range" };
    const row = board.questions[rowIndex];
    if (!row || colIndex >= row.length) return { ok: false, error: "Question column out of range" };
    row[colIndex].text = questionText;
    row[colIndex].answerText = answerText;
    row[colIndex].questionUrl = questionUrl;
    row[colIndex].answerUrl = answerUrl;

    if (normalizedKinds !== undefined) {
      const oldKinds = row[colIndex].cardKinds ?? [];
      if (normalizedKinds.length === 0) {
        delete row[colIndex].cardKinds;
        delete row[colIndex].cardParams;
      } else {
        row[colIndex].cardKinds = [...normalizedKinds];
        row[colIndex].cardParams = { ...(normalizedParams ?? {}) };
      }
      const active = snap.activeCard;
      if (active && cellMatchesActive(active, boardKind, roundIndex, rowIndex, colIndex)) {
        syncActiveCardKinds(active, oldKinds, normalizedKinds);
      }
    }
    return { ok: true };
  });

  if (r.ok) {
    const roundFile: 1 | 2 | 3 | 4 | null =
      boardKind === "finalTransition"
        ? 4
        : boardKind === "round" && (roundIndex === 1 || roundIndex === 2 || roundIndex === 3)
          ? roundIndex
          : null;
    if (roundFile) {
      const persist = tryPersistRoundPackQuestionEdit(ctx.dataDir, {
        roundFile,
        rowIndex,
        colIndex,
        questionText,
        answerText,
        questionUrl,
        answerUrl,
        ...(normalizedKinds !== undefined ? { cardKinds: normalizedKinds, cardParams: normalizedParams } : {}),
      });
      if (!persist.ok) {
        ctx.sendError(ws, `Persist failed: ${persist.error}`);
      }
    }
    ctx.broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
  } else ctx.sendError(ws, r.error);
}

/**
 * Live-edit sync: when the host edits `cardKinds` on the currently-open cell,
 * drop removed kinds' pluginState buckets and init empty buckets for added
 * kinds. Plugin lifecycle hooks are NOT fired (the kind is detached/attached,
 * not opened/closed; the host can cancel + re-open to re-run hooks).
 */
function syncActiveCardKinds(active: ActiveCard, oldKinds: string[], newKinds: string[]): void {
  for (const k of oldKinds) {
    if (!newKinds.includes(k)) delete active.pluginState[k];
  }
  for (const k of newKinds) {
    if (!Object.prototype.hasOwnProperty.call(active.pluginState, k)) {
      active.pluginState[k] = {};
    }
  }
  active.cardKinds = [...newKinds];
}

function cellMatchesActive(
  active: ActiveCard,
  boardKind: string,
  roundIndex: unknown,
  rowIndex: number,
  colIndex: number,
): boolean {
  if (active.rowIndex !== rowIndex || active.colIndex !== colIndex) return false;
  if (boardKind === "finalTransition" && active.board === "finalTransition") return true;
  if (
    boardKind === "round" &&
    active.board === "round" &&
    (roundIndex === 1 || roundIndex === 2 || roundIndex === 3) &&
    active.roundIndex === roundIndex
  ) {
    return true;
  }
  return false;
}

function handleHostScoreStep(ctx: HandlerCtx, ws: WebSocket, meta: ClientMeta, payload: unknown): void {
  if (meta.role !== "host") {
    ctx.sendError(ws, "Host only");
    return;
  }
  if (!isRecord(payload)) return;
  const seatIndex = payload["seatIndex"];
  const direction = payload["direction"];
  if (typeof seatIndex !== "number" || seatIndex < 0 || seatIndex > 4) return;
  if (direction !== "up" && direction !== "down") return;

  const delta = direction === "up" ? 100 : -100;
  const r = ctx.store.mutate(meta.showId, (snap) => {
    snap.scores[seatIndex] = snap.scores[seatIndex] + delta;
    return { ok: true };
  });
  if (r.ok) ctx.broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
}

function handleHostSetScore(ctx: HandlerCtx, ws: WebSocket, meta: ClientMeta, payload: unknown): void {
  if (meta.role !== "host") {
    ctx.sendError(ws, "Host only");
    return;
  }
  if (!isRecord(payload)) return;
  const seatIndex = payload["seatIndex"];
  const score = payload["score"];
  if (typeof seatIndex !== "number" || seatIndex < 0 || seatIndex > 4) return;
  if (typeof score !== "number" || !Number.isFinite(score)) return;

  const clamped = Math.max(-999_999, Math.min(999_999, Math.trunc(score)));
  const r = ctx.store.mutate(meta.showId, (snap) => {
    snap.scores[seatIndex] = clamped;
    return { ok: true };
  });
  if (r.ok) ctx.broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
}

function handleHostAdvanceTurn(ctx: HandlerCtx, ws: WebSocket, meta: ClientMeta, _payload: unknown): void {
  if (meta.role !== "host") {
    ctx.sendError(ws, "Host only");
    return;
  }
  const r = ctx.store.mutate(meta.showId, (snap) => {
    const cur = snap.currentTurnSeat;
    const norm =
      typeof cur === "number" && Number.isFinite(cur) ? (((Math.trunc(cur) % 5) + 5) % 5) : 0;
    snap.currentTurnSeat = (norm + 1) % 5;
    return { ok: true };
  });
  if (r.ok) ctx.broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
}

function handleHostRevealQuizCell(ctx: HandlerCtx, ws: WebSocket, meta: ClientMeta, payload: unknown): void {
  if (meta.role !== "host") {
    ctx.sendError(ws, "Host only");
    return;
  }
  if (!isRecord(payload)) return;

  const boardKind = String(payload["boardKind"] ?? "").trim();
  const roundIndex = payload["roundIndex"];
  const rowIndex = payload["rowIndex"];
  const colIndex = payload["colIndex"];

  if (
    typeof rowIndex !== "number" ||
    !Number.isFinite(rowIndex) ||
    rowIndex < 0 ||
    typeof colIndex !== "number" ||
    !Number.isFinite(colIndex) ||
    colIndex < 0
  )
    return;

  const r = ctx.store.mutate(meta.showId, (snap) => {
    const board =
      boardKind === "finalTransition"
        ? snap.finalTransitionBoard
        : boardKind === "round" && (roundIndex === 1 || roundIndex === 2 || roundIndex === 3)
          ? snap.roundBoard[roundIndex]
          : null;
    if (!board) return { ok: false, error: "Invalid board selector" };
    if (rowIndex >= board.themes.length) return { ok: false, error: "Theme row out of range" };
    const row = board.questions[rowIndex];
    if (!row || colIndex >= row.length) return { ok: false, error: "Question column out of range" };

    if (!Array.isArray(board.revealed) || board.revealed.length !== board.themes.length) {
      board.revealed = board.themes.map((_, ri) => board.questions[ri]!.map(() => false));
    }
    const revRow = board.revealed[rowIndex];
    if (!Array.isArray(revRow) || revRow.length !== row.length) {
      board.revealed[rowIndex] = row.map(() => false);
    }
    const rr = board.revealed[rowIndex];
    if (!rr || colIndex >= rr.length) return { ok: false, error: "Reveal grid out of range" };
    rr[colIndex] = true;
    if (snap.activeCard && cellMatchesActive(snap.activeCard, boardKind, roundIndex, rowIndex, colIndex)) {
      snap.activeCard = null;
    }
    return { ok: true };
  });

  if (r.ok) ctx.broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
  else ctx.sendError(ws, r.error);
}

function handleHostSetSeatName(ctx: HandlerCtx, ws: WebSocket, meta: ClientMeta, payload: unknown): void {
  if (meta.role !== "host") {
    ctx.sendError(ws, "Host only");
    return;
  }
  if (!isRecord(payload)) return;
  const seatIndex = payload["seatIndex"];
  const nameRaw = payload["name"];
  if (typeof seatIndex !== "number" || seatIndex < 0 || seatIndex > 4) return;

  const name = String(nameRaw ?? "").trim().slice(0, 32) || `P${seatIndex + 1}`;
  const r = ctx.store.mutate(meta.showId, (snap) => {
    if (!Array.isArray(snap.seatNames) || snap.seatNames.length !== 5) {
      snap.seatNames = ["P1", "P2", "P3", "P4", "P5"];
    }
    snap.seatNames[seatIndex] = name;
    return { ok: true };
  });
  if (r.ok) ctx.broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
}

function handlePluginEvent(ctx: HandlerCtx, ws: WebSocket, meta: ClientMeta, payload: unknown): void {
  if (!isRecord(payload)) return;
  const pluginId = String(payload["pluginId"] ?? "").trim();
  const segmentId = String(payload["segmentId"] ?? "").trim();
  const event = String(payload["event"] ?? "").trim();
  const eventPayload = payload["payload"] ?? null;

  if (!pluginId || !segmentId || !event) {
    ctx.sendError(ws, "plugin_event requires pluginId, segmentId, event");
    return;
  }

  const def = pluginRegistry.getSegmentDef(pluginId, segmentId);
  if (!def?.onEvent) {
    ctx.sendError(ws, `No event handler for plugin ${pluginId}:${segmentId}`);
    return;
  }

  const handler = def.onEvent;
  const result = ctx.store.mutate(meta.showId, (snap) => {
    const actor = {
      participantId: meta.participantId,
      displayName: meta.displayName,
      role: effectiveParticipantRole(snap, meta),
    } as const;
    const pluginCtx = {
      snapshot: snap,
      requestTransition: (to: Phase) => applyHostTransition(snap, to),
      setSegmentState: (key: string, value: unknown) => {
        snap.segmentState[key] = value;
      },
    };
    return handler(event, eventPayload, actor, pluginCtx);
  });

  if (result.ok) ctx.broadcast(meta.showId, { type: "snapshot", payload: result.snapshot });
  else ctx.sendError(ws, result.error);
}

// ---------------------------------------------------------------------------
// Card-flow handlers (see requirements/plugin.md §Question-card plugins)
// ---------------------------------------------------------------------------

function parseCellTarget(payload: unknown): {
  boardKind: "round" | "finalTransition";
  roundIndex?: RoundIndex;
  rowIndex: number;
  colIndex: number;
} | { error: string } {
  if (!isRecord(payload)) return { error: "Invalid payload" };
  const boardKind = String(payload["boardKind"] ?? "").trim();
  const roundIndexRaw = payload["roundIndex"];
  const rowIndex = payload["rowIndex"];
  const colIndex = payload["colIndex"];
  if (
    typeof rowIndex !== "number" ||
    !Number.isFinite(rowIndex) ||
    rowIndex < 0 ||
    typeof colIndex !== "number" ||
    !Number.isFinite(colIndex) ||
    colIndex < 0
  ) {
    return { error: "rowIndex/colIndex required" };
  }
  if (boardKind === "finalTransition") {
    return { boardKind, rowIndex, colIndex };
  }
  if (boardKind === "round" && (roundIndexRaw === 1 || roundIndexRaw === 2 || roundIndexRaw === 3)) {
    return { boardKind, roundIndex: roundIndexRaw, rowIndex, colIndex };
  }
  return { error: "Invalid boardKind/roundIndex" };
}

function actorIsCurrentTurnPlayer(snap: SessionSnapshot, meta: ClientMeta): boolean {
  if (effectiveParticipantRole(snap, meta) !== "player") return false;
  const seat = snap.currentTurnSeat;
  if (typeof seat !== "number" || !Number.isInteger(seat) || seat < 0 || seat > 4) return false;
  const slotName = (snap.seatNames[seat] ?? "").trim().toLowerCase();
  const me = meta.displayName.trim().toLowerCase();
  return me.length > 0 && slotName.length > 0 && me === slotName;
}

function boardForTarget(
  snap: SessionSnapshot,
  target: { boardKind: "round" | "finalTransition"; roundIndex?: RoundIndex },
) {
  if (target.boardKind === "finalTransition") return snap.finalTransitionBoard;
  if (target.boardKind === "round" && target.roundIndex) return snap.roundBoard[target.roundIndex];
  return null;
}

/**
 * Run a card hook across every kind attached to the active card. Returns the
 * last follow-up requested by any kind (close / open_instead); caller is
 * responsible for applying it after all hooks have run.
 */
function runCardKindHooks(
  snap: SessionSnapshot,
  hook: (def: CardKindDefinition, cardCtx: ReturnType<typeof makeCardCtx>) => MutatorResult,
): { ok: true; followUp: CardCtxFollowUp | null } | { ok: false; error: string } {
  const active = snap.activeCard;
  if (!active) return { ok: false, error: "No active card" };
  let lastFollowUp: CardCtxFollowUp | null = null;
  for (const kind of active.cardKinds) {
    const def = pluginRegistry.getCardKind(kind);
    if (!def) continue;
    const cardCtx = makeCardCtx({
      snap,
      cardKind: kind,
      applyTransition: (to) => applyHostTransition(snap, to),
    });
    const result = hook(def, cardCtx);
    if (!result.ok) return result;
    const fu = cardCtx.drainPendingFollowUp();
    if (fu) lastFollowUp = fu;
  }
  return { ok: true, followUp: lastFollowUp };
}

function applyCardFollowUp(snap: SessionSnapshot, fu: CardCtxFollowUp | null): MutatorResult {
  if (!fu) return { ok: true };
  if (fu.kind === "close") return closeActiveCardCore(snap, fu.outcome);
  if (fu.kind === "open_instead") {
    const closeResult = closeActiveCardCore(snap, "revealed");
    if (!closeResult.ok) return closeResult;
    return openCellCore(snap, fu.target);
  }
  return { ok: false, error: "Unknown follow-up" };
}

/**
 * Mark the active card's cell as revealed (when `outcome === "revealed"`) and
 * clear `activeCard`. No plugin hooks fired; intended to be called as the
 * final step after `onClose` hooks have run (or from a `closeCard` follow-up).
 */
function closeActiveCardCore(snap: SessionSnapshot, outcome: "revealed" | "cancelled"): MutatorResult {
  const active = snap.activeCard;
  if (!active) return { ok: false, error: "No active card" };
  if (outcome === "revealed") {
    const board = boardForTarget(snap, { boardKind: active.board, roundIndex: active.roundIndex });
    if (board) {
      const row = board.revealed[active.rowIndex];
      if (row && active.colIndex < row.length) row[active.colIndex] = true;
    }
  }
  snap.activeCard = null;
  return { ok: true };
}

/**
 * Set `activeCard` for a target cell, normalizing kinds and running each
 * kind's `onOpen` hook in declared order. Caller is responsible for authority
 * and the "no card already open" check.
 */
function openCellCore(
  snap: SessionSnapshot,
  target: { boardKind: "round" | "finalTransition"; roundIndex?: RoundIndex; rowIndex: number; colIndex: number },
): MutatorResult {
  const board = boardForTarget(snap, target);
  if (!board) return { ok: false, error: "Invalid board selector" };
  if (target.rowIndex >= board.themes.length) return { ok: false, error: "Theme row out of range" };
  const row = board.questions[target.rowIndex];
  if (!row || target.colIndex >= row.length) return { ok: false, error: "Question column out of range" };
  const cell = row[target.colIndex]!;
  const revealedRow = board.revealed[target.rowIndex];
  if (revealedRow?.[target.colIndex]) return { ok: false, error: "Cell already revealed" };

  const cardKinds = cell.cardKinds ?? [];
  const pluginState: Record<string, unknown> = {};
  for (const k of cardKinds) pluginState[k] = {};
  const active: ActiveCard =
    target.boardKind === "round"
      ? {
          board: "round",
          roundIndex: target.roundIndex!,
          rowIndex: target.rowIndex,
          colIndex: target.colIndex,
          stage: "question",
          cardKinds: [...cardKinds],
          pluginState,
        }
      : {
          board: "finalTransition",
          rowIndex: target.rowIndex,
          colIndex: target.colIndex,
          stage: "question",
          cardKinds: [...cardKinds],
          pluginState,
        };
  snap.activeCard = active;

  let lastFollowUp: CardCtxFollowUp | null = null;
  for (const kind of cardKinds) {
    const def = pluginRegistry.getCardKind(kind);
    if (!def?.onOpen) continue;
    const cardCtx = makeCardCtx({
      snap,
      cardKind: kind,
      applyTransition: (to) => applyHostTransition(snap, to),
    });
    const result = def.onOpen(cardCtx);
    if (!result.ok) return result;
    const fu = cardCtx.drainPendingFollowUp();
    if (fu) {
      lastFollowUp = fu;
      break;
    }
  }
  if (lastFollowUp) return applyCardFollowUp(snap, lastFollowUp);
  return { ok: true };
}

function handleOpenQuizCell(ctx: HandlerCtx, ws: WebSocket, meta: ClientMeta, payload: unknown): void {
  const parsed = parseCellTarget(payload);
  if ("error" in parsed) {
    ctx.sendError(ws, parsed.error);
    return;
  }
  const result = ctx.store.mutate(meta.showId, (snap) => {
    if (effectiveParticipantRole(snap, meta) !== "host" && !actorIsCurrentTurnPlayer(snap, meta)) {
      return { ok: false, error: "Only host or current-turn player may open a card" };
    }
    if (parsed.boardKind === "round") {
      if (snap.phase.kind !== "round" || snap.phase.roundIndex !== parsed.roundIndex) {
        return { ok: false, error: "Round phase mismatch" };
      }
    } else if (parsed.boardKind === "finalTransition") {
      if (snap.phase.kind !== "final" && snap.phase.kind !== "round") {
        return { ok: false, error: "Cannot open final-transition card from this phase" };
      }
    }
    if (snap.activeCard) return { ok: false, error: "A card is already open" };
    return openCellCore(snap, parsed);
  });
  if (result.ok) ctx.broadcast(meta.showId, { type: "snapshot", payload: result.snapshot });
  else ctx.sendError(ws, result.error);
}

function handleHostAdvanceCardStage(ctx: HandlerCtx, ws: WebSocket, meta: ClientMeta, payload: unknown): void {
  if (meta.role !== "host") {
    ctx.sendError(ws, "Host only");
    return;
  }
  if (!isRecord(payload)) return;
  const to = payload["to"];
  if (to !== "answer") {
    ctx.sendError(ws, "Invalid stage target");
    return;
  }
  const result = ctx.store.mutate(meta.showId, (snap) => {
    const active = snap.activeCard;
    if (!active) return { ok: false, error: "No active card" };
    if (active.stage === "answer") return { ok: false, error: "Card already at answer stage" };
    active.stage = "answer";
    const hookResult = runCardKindHooks(snap, (def, cardCtx) => {
      if (!def.onAdvance) return { ok: true };
      return def.onAdvance("answer", cardCtx);
    });
    if (!hookResult.ok) return hookResult;
    return applyCardFollowUp(snap, hookResult.followUp);
  });
  if (result.ok) ctx.broadcast(meta.showId, { type: "snapshot", payload: result.snapshot });
  else ctx.sendError(ws, result.error);
}

function handleHostCloseQuizCell(ctx: HandlerCtx, ws: WebSocket, meta: ClientMeta, payload: unknown): void {
  if (meta.role !== "host") {
    ctx.sendError(ws, "Host only");
    return;
  }
  if (!isRecord(payload)) return;
  const outcome = payload["outcome"];
  if (outcome !== "revealed" && outcome !== "cancelled") {
    ctx.sendError(ws, "Invalid close outcome");
    return;
  }
  const result = ctx.store.mutate(meta.showId, (snap) => {
    if (!snap.activeCard) return { ok: false, error: "No active card" };
    const hookResult = runCardKindHooks(snap, (def, cardCtx) => {
      if (!def.onClose) return { ok: true };
      return def.onClose(outcome, cardCtx);
    });
    if (!hookResult.ok) return hookResult;
    const close = closeActiveCardCore(snap, outcome);
    if (!close.ok) return close;
    return applyCardFollowUp(snap, hookResult.followUp);
  });
  if (result.ok) ctx.broadcast(meta.showId, { type: "snapshot", payload: result.snapshot });
  else ctx.sendError(ws, result.error);
}

function handlePluginCardEvent(ctx: HandlerCtx, ws: WebSocket, meta: ClientMeta, payload: unknown): void {
  if (!isRecord(payload)) return;
  const cardKind = String(payload["cardKind"] ?? "").trim();
  const event = String(payload["event"] ?? "").trim();
  const eventPayload = payload["payload"] ?? null;
  if (!cardKind || !event) {
    ctx.sendError(ws, "plugin_card_event requires cardKind and event");
    return;
  }
  const def = pluginRegistry.getCardKind(cardKind);
  if (!def?.onCardEvent) {
    ctx.sendError(ws, `No event handler for cardKind "${cardKind}"`);
    return;
  }
  const handler = def.onCardEvent;
  const result = ctx.store.mutate(meta.showId, (snap) => {
    const actor: Actor = {
      participantId: meta.participantId,
      displayName: meta.displayName,
      role: effectiveParticipantRole(snap, meta),
    };
    const active = snap.activeCard;
    if (!active) return { ok: false, error: "No active card" };
    if (!active.cardKinds.includes(cardKind)) {
      return { ok: false, error: `cardKind "${cardKind}" not attached to the open card` };
    }
    const cardCtx = makeCardCtx({
      snap,
      cardKind,
      applyTransition: (to) => applyHostTransition(snap, to),
    });
    const hookResult = handler(event, eventPayload, actor, cardCtx);
    if (!hookResult.ok) return hookResult;
    return applyCardFollowUp(snap, cardCtx.drainPendingFollowUp());
  });
  if (result.ok) ctx.broadcast(meta.showId, { type: "snapshot", payload: result.snapshot });
  else ctx.sendError(ws, result.error);
}

export function routeInbound(
  ctx: HandlerCtx,
  ws: WebSocket,
  inbound: InboundMessage,
  connectShowId: string,
): void {
  const requireMeta = (): ClientMeta | null => {
    const meta = ctx.getMeta(ws);
    if (!meta) {
      ctx.sendError(ws, "Send join first");
      return null;
    }
    return meta;
  };

  switch (inbound.type) {
    case "join": {
      handleJoin(ctx, ws, connectShowId, inbound.payload);
      return;
    }
    case "chat": {
      const meta = requireMeta();
      if (!meta) return;
      handleChat(ctx, ws, meta, inbound.payload);
      return;
    }
    case "host_transition": {
      const meta = requireMeta();
      if (!meta) return;
      handleHostTransition(ctx, ws, meta, inbound.payload);
      return;
    }
    case "host_reset_session": {
      const meta = requireMeta();
      if (!meta) return;
      handleHostResetSession(ctx, ws, meta);
      return;
    }
    case "host_edit_quiz_theme": {
      const meta = requireMeta();
      if (!meta) return;
      handleHostEditQuizTheme(ctx, ws, meta, inbound.payload);
      return;
    }
    case "host_edit_quiz_question": {
      const meta = requireMeta();
      if (!meta) return;
      handleHostEditQuizQuestion(ctx, ws, meta, inbound.payload);
      return;
    }
    case "host_score_step": {
      const meta = requireMeta();
      if (!meta) return;
      handleHostScoreStep(ctx, ws, meta, inbound.payload);
      return;
    }
    case "host_set_score": {
      const meta = requireMeta();
      if (!meta) return;
      handleHostSetScore(ctx, ws, meta, inbound.payload);
      return;
    }
    case "host_advance_turn": {
      const meta = requireMeta();
      if (!meta) return;
      handleHostAdvanceTurn(ctx, ws, meta, inbound.payload);
      return;
    }
    case "host_reveal_quiz_cell": {
      const meta = requireMeta();
      if (!meta) return;
      handleHostRevealQuizCell(ctx, ws, meta, inbound.payload);
      return;
    }
    case "host_set_seat_name": {
      const meta = requireMeta();
      if (!meta) return;
      handleHostSetSeatName(ctx, ws, meta, inbound.payload);
      return;
    }
    case "plugin_event": {
      const meta = requireMeta();
      if (!meta) return;
      handlePluginEvent(ctx, ws, meta, inbound.payload);
      return;
    }
    case "open_quiz_cell": {
      const meta = requireMeta();
      if (!meta) return;
      handleOpenQuizCell(ctx, ws, meta, inbound.payload);
      return;
    }
    case "host_advance_card_stage": {
      const meta = requireMeta();
      if (!meta) return;
      handleHostAdvanceCardStage(ctx, ws, meta, inbound.payload);
      return;
    }
    case "host_close_quiz_cell": {
      const meta = requireMeta();
      if (!meta) return;
      handleHostCloseQuizCell(ctx, ws, meta, inbound.payload);
      return;
    }
    case "plugin_card_event": {
      const meta = requireMeta();
      if (!meta) return;
      handlePluginCardEvent(ctx, ws, meta, inbound.payload);
      return;
    }
    default:
      return;
  }
}
