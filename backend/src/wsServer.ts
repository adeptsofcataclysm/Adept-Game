import http from "node:http";
import { URL } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import type { Role, SessionStore } from "./session.js";
import { parseInboundMessage, routeInbound, type ClientMeta, type HandlerCtx } from "./wsHandlers.js";

export function attachWebsocket(
  server: http.Server,
  opts: {
    store: SessionStore;
    dataDir: string;
    isHostAuthorized: (role: Role, hostSecret: string | undefined) => boolean;
  },
): WebSocketServer {
  const wss = new WebSocketServer({ server });
  const socketsByShow = new Map<string, Set<WebSocket>>();
  const metaBySocket = new Map<WebSocket, ClientMeta>();

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

  const ctx: HandlerCtx = {
    store: opts.store,
    dataDir: opts.dataDir,
    broadcast,
    sendError,
    joinRoom: (showId, ws) => room(showId).add(ws),
    setMeta: (ws, meta) => metaBySocket.set(ws, meta),
    getMeta: (ws) => metaBySocket.get(ws),
    isHostAuthorized: opts.isHostAuthorized,
  };

  wss.on("connection", (ws, req) => {
    const connectUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const connectShowId = connectUrl.searchParams.get("showId")?.trim() || "default";

    ws.on("message", (raw) => {
      const inbound = parseInboundMessage(raw);
      if (!inbound) return;
      routeInbound(ctx, ws, inbound, connectShowId);
    });

    ws.on("close", () => {
      const m = metaBySocket.get(ws);
      if (m) room(m.showId).delete(ws);
      metaBySocket.delete(ws);
    });
  });

  return wss;
}
