import path from "node:path";
import fs from "node:fs";
import type { RawData } from "ws";
import type { WebSocket } from "ws";
import type { Phase } from "./phase.js";
import { pluginRegistry } from "./pluginRegistry.js";
import type { Participant, Role, SessionStore } from "./session.js";
import { appendChat, applyHostTransition, parsePhase } from "./session.js";

export type ClientMeta = {
  showId: string;
  participantId: string;
  displayName: string;
  role: Role;
};

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

  row[args.colIndex] = {
    ...(cell as Record<string, unknown>),
    text: args.questionText,
    questionUrl: args.questionUrl,
    answerText: args.answerText,
    answerUrl: args.answerUrl,
  };
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
        pr.role = role;
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
  const r = ctx.store.mutate(meta.showId, (snap) => appendChat(snap, meta.displayName, meta.role, text));
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
      });
      if (!persist.ok) {
        ctx.sendError(ws, `Persist failed: ${persist.error}`);
      }
    }
    ctx.broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
  } else ctx.sendError(ws, r.error);
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
      role: meta.role,
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
    default:
      return;
  }
}
