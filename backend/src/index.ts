import path from "node:path";
import http from "node:http";
import fs from "node:fs";
import { URL, fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { WebSocketServer, type WebSocket, type RawData } from "ws";
import type { Role } from "./session.js";
import { appendChat, applyHostTransition, createSessionStore, parsePhase } from "./session.js";
import { pluginRegistry } from "./pluginRegistry.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
dotenv.config({ path: path.join(backendRoot, ".env.local"), override: true });

const PORT = Number(process.env["PORT"] ?? "3847");
const HOST_SECRET = process.env["ADEPT_HOST_SECRET"]?.trim() ?? "";

type ClientMeta = {
  showId: string;
  participantId: string;
  displayName: string;
  role: Role;
};

type InboundMessage = {
  type: string;
  payload: unknown;
};

const store = createSessionStore();
const socketsByShow = new Map<string, Set<WebSocket>>();
const metaBySocket = new Map<WebSocket, ClientMeta>();

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function send(ws: WebSocket, payload: unknown): void {
  ws.send(JSON.stringify(payload));
}

function sendError(ws: WebSocket, message: string): void {
  send(ws, { type: "error", payload: { message } });
}

function room(showId: string): Set<WebSocket> {
  let s = socketsByShow.get(showId);
  if (!s) {
    s = new Set();
    socketsByShow.set(showId, s);
  }
  return s;
}

function broadcast(showId: string, payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const ws of room(showId)) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

function parseJson(raw: RawData): unknown {
  try {
    const t = raw.toString();
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

function parseInboundMessage(raw: RawData): InboundMessage | null {
  const msg = parseJson(raw);
  if (!isRecord(msg)) return null;
  const type = msg["type"];
  if (typeof type !== "string" || !type) return null;
  return { type, payload: msg["payload"] };
}

function isHostAuthorized(role: Role, hostSecret: string | undefined): boolean {
  if (role !== "host") return true;
  if (!HOST_SECRET) return true;
  return hostSecret === HOST_SECRET;
}

const THEME_ICON_DIR = path.join(backendRoot, "theme_icons");
fs.mkdirSync(THEME_ICON_DIR, { recursive: true });
const DATA_DIR = path.join(backendRoot, "data");

function contentTypeForExt(ext: string): string {
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

async function readJsonBody(req: http.IncomingMessage, maxBytes: number): Promise<unknown> {
  return await new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) {
        resolve({ __tooLarge: true });
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(text) as unknown);
      } catch {
        resolve(null);
      }
    });
  });
}

function parseImageDataUrl(
  dataUrl: string,
): { mime: string; bytes: Buffer; ext: string } | { error: string } {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl.trim());
  if (!m) return { error: "Invalid data URL" };
  const mime = m[1]!;
  const b64 = m[2]!;
  let ext = "";
  if (mime === "image/png") ext = ".png";
  else if (mime === "image/jpeg") ext = ".jpg";
  else if (mime === "image/webp") ext = ".webp";
  else if (mime === "image/gif") ext = ".gif";
  else return { error: `Unsupported mime: ${mime}` };
  try {
    const bytes = Buffer.from(b64, "base64");
    return { mime, bytes, ext };
  } catch {
    return { error: "Invalid base64 data" };
  }
}

function tryPersistRoundPackEdit(args: {
  roundFile: 1 | 2 | 3 | 4;
  rowIndex: number;
  themeText: string;
  iconUrl: string | null;
}): { ok: true } | { ok: false; error: string } {
  const fileName = `round-${args.roundFile}.json`;
  const filePath = path.join(DATA_DIR, fileName);
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
    icons = Array.from({ length: themes.length }, (_, i) => (Array.isArray(o["themeIcons"]) ? (icons?.[i] ?? null) : null));
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

const server = http.createServer((req, res) => {
  // Dev-friendly CORS so the Vite app (different origin) can call the session service.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url?.startsWith("/theme_icons/") && req.method === "GET") {
    const rel = req.url.slice("/theme_icons/".length);
    const safe = path.basename(rel);
    const filePath = path.join(THEME_ICON_DIR, safe);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypeForExt(ext),
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  if (req.url === "/api/upload-theme-icon" && req.method === "POST") {
    void (async () => {
      const body = await readJsonBody(req, 350_000);
      if (!body || typeof body !== "object") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON body" }));
        return;
      }
      const o = body as Record<string, unknown>;
      if (o["__tooLarge"]) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Payload too large" }));
        return;
      }

      const hostSecret = typeof o["hostSecret"] === "string" ? o["hostSecret"] : undefined;
      if (!isHostAuthorized("host", hostSecret)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Host authentication failed" }));
        return;
      }

      const dataUrl = String(o["dataUrl"] ?? "");
      const parsed = parseImageDataUrl(dataUrl);
      if ("error" in parsed) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: parsed.error }));
        return;
      }
      if (parsed.bytes.length > 250_000) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Image too large" }));
        return;
      }

      const fileName = `theme-${Date.now()}-${Math.random().toString(16).slice(2)}${parsed.ext}`;
      const outPath = path.join(THEME_ICON_DIR, fileName);
      fs.writeFileSync(outPath, parsed.bytes);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, url: `/theme_icons/${fileName}` }));
    })();
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const connectUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const connectShowId = connectUrl.searchParams.get("showId")?.trim() || "default";

  // Do not send a snapshot before `join`: the client would show state while this socket has no
  // `metaBySocket` entry, so `chat` would fail with "Send join first" until join is processed.

  ws.on("message", (raw) => {
    const inbound = parseInboundMessage(raw);
    if (!inbound) return;

    const requireMeta = (): ClientMeta | null => {
      const meta = metaBySocket.get(ws);
      if (!meta) {
        sendError(ws, "Send join first");
        return null;
      }
      return meta;
    };

    const handleJoin = (payload: unknown): void => {
      if (!isRecord(payload)) return;
      const role = payload["role"];
      const displayName = String(payload["displayName"] ?? "").trim().slice(0, 64);
      const participantId = String(payload["participantId"] ?? "").trim().slice(0, 128);
      const joinShowId =
        String(payload["showId"] ?? connectShowId).trim().slice(0, 128) || connectShowId;
      const hostSecret = typeof payload["hostSecret"] === "string" ? payload["hostSecret"] : undefined;

      if (!displayName || !participantId) {
        sendError(ws, "displayName and participantId required");
        return;
      }
      if (role !== "host" && role !== "player" && role !== "spectator") {
        sendError(ws, "Invalid role");
        return;
      }
      if (!isHostAuthorized(role, hostSecret)) {
        sendError(ws, "Host authentication failed");
        return;
      }

      metaBySocket.set(ws, { showId: joinShowId, participantId, displayName, role });
      room(joinShowId).add(ws);

      const result = store.mutate(joinShowId, (snap) => {
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
        return { ok: true };
      });

      if (result.ok) {
        // Full snapshot (including chat history) to everyone in the room, including this join.
        broadcast(joinShowId, { type: "snapshot", payload: result.snapshot });
      }
    };

    const handleChat = (meta: ClientMeta, payload: unknown): void => {
      if (!isRecord(payload)) {
        sendError(ws, "Chat payload must be an object");
        return;
      }
      const text = String(payload["text"] ?? "");
      const r = store.mutate(meta.showId, (snap) => appendChat(snap, meta.displayName, meta.role, text));
      if (r.ok) broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
      else sendError(ws, r.error);
    };

    const handleHostTransition = (meta: ClientMeta, payload: unknown): void => {
      if (meta.role !== "host") {
        sendError(ws, "Host only");
        return;
      }
      const to = parsePhase(payload);
      if (!to) {
        sendError(ws, "Invalid phase payload");
        return;
      }
      const r = store.mutate(meta.showId, (snap) => applyHostTransition(snap, to));
      if (r.ok) broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
      else sendError(ws, r.error);
    };

    const handleHostEditQuizTheme = (meta: ClientMeta, payload: unknown): void => {
      if (meta.role !== "host") {
        sendError(ws, "Host only");
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
        sendError(ws, "Theme text required");
        return;
      }

      let iconUrl: string | null = null;
      if (typeof iconUrlRaw === "string") {
        const trimmed = iconUrlRaw.trim();
        if (trimmed.length > 200_000) {
          sendError(ws, "Icon payload too large");
          return;
        }
        iconUrl = trimmed || null;
      } else if (iconUrlRaw === null || typeof iconUrlRaw === "undefined") {
        iconUrl = null;
      } else {
        return;
      }

      const r = store.mutate(meta.showId, (snap) => {
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
          const persist = tryPersistRoundPackEdit({ roundFile, rowIndex, themeText, iconUrl });
          if (!persist.ok) {
            // Do not block gameplay; just surface a warning to the host.
            sendError(ws, `Persist failed: ${persist.error}`);
          }
        }
        broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
      }
      else sendError(ws, r.error);
    };

    const handleHostScoreStep = (meta: ClientMeta, payload: unknown): void => {
      if (meta.role !== "host") {
        sendError(ws, "Host only");
        return;
      }
      if (!isRecord(payload)) return;
      const seatIndex = payload["seatIndex"];
      const direction = payload["direction"];
      if (typeof seatIndex !== "number" || seatIndex < 0 || seatIndex > 4) return;
      if (direction !== "up" && direction !== "down") return;

      const delta = direction === "up" ? 100 : -100;
      const r = store.mutate(meta.showId, (snap) => {
        snap.scores[seatIndex] = snap.scores[seatIndex] + delta;
        return { ok: true };
      });
      if (r.ok) broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
    };

    const handleOpeningShowMarkCorrect = (meta: ClientMeta, payload: unknown): void => {
      if (meta.role !== "host") {
        sendError(ws, "Host only");
        return;
      }
      if (!isRecord(payload)) return;
      const nick = String(payload["spectatorKey"] ?? "").trim().slice(0, 64);
      if (!nick) return;

      const r = store.mutate(meta.showId, (snap) => {
        if (snap.phase.kind !== "lobby") {
          return { ok: false, error: "Opening the show runs in lobby" };
        }
        const cur = snap.openingShow.spectatorCorrectCounts[nick] ?? 0;
        snap.openingShow.spectatorCorrectCounts[nick] = cur + 1;
        return { ok: true };
      });
      if (r.ok) broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
      else sendError(ws, r.error);
    };

    const handleOpeningShowNextEmoji = (meta: ClientMeta): void => {
      if (meta.role !== "host") {
        sendError(ws, "Host only");
        return;
      }
      const r = store.mutate(meta.showId, (snap) => {
        if (snap.phase.kind !== "lobby") return { ok: false, error: "Opening the show runs in lobby" };
        snap.openingShow.emojiLineIndex = snap.openingShow.emojiLineIndex + 1;
        return { ok: true };
      });
      if (r.ok) broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
      else sendError(ws, r.error);
    };

    const handlePluginEvent = (meta: ClientMeta, payload: unknown): void => {
      if (!isRecord(payload)) return;
      const pluginId = String(payload["pluginId"] ?? "").trim();
      const segmentId = String(payload["segmentId"] ?? "").trim();
      const event = String(payload["event"] ?? "").trim();
      const eventPayload = payload["payload"] ?? null;

      if (!pluginId || !segmentId || !event) {
        sendError(ws, "plugin_event requires pluginId, segmentId, event");
        return;
      }

      const def = pluginRegistry.getSegmentDef(pluginId, segmentId);
      if (!def?.onEvent) {
        sendError(ws, `No event handler for plugin ${pluginId}:${segmentId}`);
        return;
      }

      const handler = def.onEvent;
      const result = store.mutate(meta.showId, (snap) => {
        const actor = {
          participantId: meta.participantId,
          displayName: meta.displayName,
          role: meta.role,
        } as const;
        const ctx = {
          snapshot: snap,
          requestTransition: (to: import("./phase.js").Phase) => applyHostTransition(snap, to),
          setSegmentState: (key: string, value: unknown) => {
            snap.segmentState[key] = value;
          },
        };
        return handler(event, eventPayload, actor, ctx);
      });

      if (result.ok) broadcast(meta.showId, { type: "snapshot", payload: result.snapshot });
      else sendError(ws, result.error);
    };

    switch (inbound.type) {
      case "join": {
        handleJoin(inbound.payload);
        return;
      }
      case "chat": {
        const meta = requireMeta();
        if (!meta) return;
        handleChat(meta, inbound.payload);
        return;
      }
      case "host_transition": {
        const meta = requireMeta();
        if (!meta) return;
        handleHostTransition(meta, inbound.payload);
        return;
      }
      case "host_edit_quiz_theme": {
        const meta = requireMeta();
        if (!meta) return;
        handleHostEditQuizTheme(meta, inbound.payload);
        return;
      }
      case "host_score_step": {
        const meta = requireMeta();
        if (!meta) return;
        handleHostScoreStep(meta, inbound.payload);
        return;
      }
      case "opening_show_mark_correct": {
        const meta = requireMeta();
        if (!meta) return;
        handleOpeningShowMarkCorrect(meta, inbound.payload);
        return;
      }
      case "opening_show_next_emoji": {
        const meta = requireMeta();
        if (!meta) return;
        handleOpeningShowNextEmoji(meta);
        return;
      }
      case "plugin_event": {
        const meta = requireMeta();
        if (!meta) return;
        handlePluginEvent(meta, inbound.payload);
        return;
      }
      default:
        return;
    }
  });

  ws.on("close", () => {
    const m = metaBySocket.get(ws);
    if (m) room(m.showId).delete(ws);
    metaBySocket.delete(ws);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const hostHint = HOST_SECRET ? "ADEPT_HOST_SECRET is set" : "ADEPT_HOST_SECRET unset (host joins without secret)";
  console.log(`session service http://127.0.0.1:${PORT}/health  ws 0.0.0.0:${PORT} ?showId=…  ${hostHint}`);
});
