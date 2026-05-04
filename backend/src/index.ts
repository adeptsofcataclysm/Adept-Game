import http from "node:http";
import { URL } from "node:url";
import { WebSocketServer, type WebSocket, type RawData } from "ws";
import type { Role } from "./session.js";
import { appendChat, applyHostTransition, createSessionStore, parsePhase } from "./session.js";

const PORT = Number(process.env["PORT"] ?? "3847");
const HOST_SECRET = process.env["ADEPT_HOST_SECRET"]?.trim() ?? "";

type ClientMeta = {
  showId: string;
  participantId: string;
  displayName: string;
  role: Role;
};

const store = createSessionStore();
const socketsByShow = new Map<string, Set<WebSocket>>();
const metaBySocket = new Map<WebSocket, ClientMeta>();

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
    const msg = parseJson(raw);
    if (!msg || typeof msg !== "object") return;
    const m = msg as Record<string, unknown>;
    const type = m["type"];
    const payload = m["payload"];

    if (type === "join") {
      if (!payload || typeof payload !== "object") return;
      const p = payload as Record<string, unknown>;
      const role = p["role"];
      const displayName = String(p["displayName"] ?? "").trim().slice(0, 64);
      const participantId = String(p["participantId"] ?? "").trim().slice(0, 128);
      const joinShowId = String(p["showId"] ?? connectShowId).trim().slice(0, 128) || connectShowId;
      const hostSecret =
        typeof p["hostSecret"] === "string" ? p["hostSecret"] : undefined;
      if (!displayName || !participantId) {
        ws.send(JSON.stringify({ type: "error", payload: { message: "displayName and participantId required" } }));
        return;
      }
      if (role !== "host" && role !== "player" && role !== "spectator") {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Invalid role" } }));
        return;
      }
      if (!isHostAuthorized(role, hostSecret)) {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Host authentication failed" } }));
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
      return;
    }

    const meta = metaBySocket.get(ws);
    if (!meta) {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Send join first" } }));
      return;
    }

    if (type === "chat") {
      if (!payload || typeof payload !== "object") {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Chat payload must be an object" } }));
        return;
      }
      const text = String((payload as Record<string, unknown>)["text"] ?? "");
      const r = store.mutate(meta.showId, (snap) =>
        appendChat(snap, meta.displayName, meta.role, text),
      );
      if (r.ok) broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
      else ws.send(JSON.stringify({ type: "error", payload: { message: r.error } }));
      return;
    }

    if (type === "host_transition") {
      if (meta.role !== "host") {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Host only" } }));
        return;
      }
      const to = parsePhase(payload);
      if (!to) {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Invalid phase payload" } }));
        return;
      }
      const r = store.mutate(meta.showId, (snap) => applyHostTransition(snap, to));
      if (r.ok) broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
      else ws.send(JSON.stringify({ type: "error", payload: { message: r.error } }));
      return;
    }

    if (type === "host_score_step") {
      if (meta.role !== "host") {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Host only" } }));
        return;
      }
      if (!payload || typeof payload !== "object") return;
      const p = payload as Record<string, unknown>;
      const seat = p["seatIndex"];
      const dir = p["direction"];
      if (typeof seat !== "number" || seat < 0 || seat > 4) return;
      if (dir !== "up" && dir !== "down") return;
      const delta = dir === "up" ? 100 : -100;
      const r = store.mutate(meta.showId, (snap) => {
        snap.scores[seat] = snap.scores[seat] + delta;
        return { ok: true };
      });
      if (r.ok) broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
      return;
    }

    if (type === "spectator_pick_bet") {
      if (meta.role !== "spectator") {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Spectators only" } }));
        return;
      }
      if (!payload || typeof payload !== "object") return;
      const seat = (payload as Record<string, unknown>)["seat"];
      if (seat !== 1 && seat !== 2 && seat !== 3 && seat !== 4 && seat !== 5) return;
      const r = store.mutate(meta.showId, (snap) => {
        if (snap.phase.kind !== "spectator_picks" || snap.spectatorPicks.locked) {
          return { ok: false, error: "Spectator picks not open" };
        }
        snap.spectatorPicks.bets[meta.participantId] = seat;
        return { ok: true };
      });
      if (r.ok) broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
      else ws.send(JSON.stringify({ type: "error", payload: { message: r.error } }));
      return;
    }

    if (type === "opening_show_mark_correct") {
      if (meta.role !== "host") {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Host only" } }));
        return;
      }
      if (!payload || typeof payload !== "object") return;
      const nick = String((payload as Record<string, unknown>)["spectatorKey"] ?? "").trim().slice(0, 64);
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
      else ws.send(JSON.stringify({ type: "error", payload: { message: r.error } }));
      return;
    }

    if (type === "opening_show_next_emoji") {
      if (meta.role !== "host") {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Host only" } }));
        return;
      }
      const r = store.mutate(meta.showId, (snap) => {
        if (snap.phase.kind !== "lobby") return { ok: false, error: "Opening the show runs in lobby" };
        snap.openingShow.emojiLineIndex = snap.openingShow.emojiLineIndex + 1;
        return { ok: true };
      });
      if (r.ok) broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
      else ws.send(JSON.stringify({ type: "error", payload: { message: r.error } }));
      return;
    }

    if (type === "player_donation") {
      if (meta.role !== "player") {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Players only" } }));
        return;
      }
      if (!payload || typeof payload !== "object") return;
      const p = payload as Record<string, unknown>;
      const amount = p["amount"];
      const seatIndex = p["seatIndex"];
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return;
      if (typeof seatIndex !== "number" || seatIndex < 0 || seatIndex > 4) return;
      const r = store.mutate(meta.showId, (snap) => {
        if (snap.phase.kind !== "donations") return { ok: false, error: "Donations not open" };
        const score = snap.scores[seatIndex];
        if (amount > score) return { ok: false, error: "Donation exceeds score" };
        snap.donations.bySeat[seatIndex] = amount;
        return { ok: true };
      });
      if (r.ok) broadcast(meta.showId, { type: "snapshot", payload: r.snapshot });
      else ws.send(JSON.stringify({ type: "error", payload: { message: r.error } }));
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
