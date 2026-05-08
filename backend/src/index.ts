import path from "node:path";
import http from "node:http";
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

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
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
