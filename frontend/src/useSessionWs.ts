import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatLine, Role, SessionSnapshot } from "@/sessionTypes";
import { buildWsUrl } from "@/wsUrl";
import { getDisplayName, getOrCreateParticipantId } from "@/storage";

function isRole(x: unknown): x is Role {
  return x === "host" || x === "player" || x === "spectator";
}

/** Coerce server JSON so chat lines always render (stable React keys, valid roles). */
function normalizeChat(raw: unknown): ChatLine[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.map((item, index) => {
    if (!item || typeof item !== "object") {
      return {
        id: `bad-${index}-${Date.now()}`,
        atMs: 0,
        fromDisplayName: "?",
        fromRole: "spectator",
        text: "",
      };
    }
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id.length > 0 ? o.id : `chat-${index}-${Number(o.atMs) || 0}`;
    const fromRole = isRole(o.fromRole) ? o.fromRole : "spectator";
    return {
      id,
      atMs: typeof o.atMs === "number" && Number.isFinite(o.atMs) ? o.atMs : 0,
      fromDisplayName: String(o.fromDisplayName ?? ""),
      fromRole,
      text: String(o.text ?? ""),
    };
  });
}

type WsOpts = {
  showId: string;
  role: Role;
  hostSecret?: string;
  enabled: boolean;
};

export function useSessionWs(opts: WsOpts): {
  snapshot: SessionSnapshot | null;
  lastError: string | null;
  connected: boolean;
  send: (msg: unknown) => void;
} {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  /** Outbound messages (e.g. chat) sent before OPEN or dropped by send(); flushed after join. */
  const pendingOutboundRef = useRef<unknown[]>([]);

  useEffect(() => {
    if (!opts.enabled) return;

    const u = buildWsUrl(opts.showId);
    const ws = new WebSocket(u);
    wsRef.current = ws;

    const flushPendingOutbound = () => {
      const w = wsRef.current;
      if (!w || w.readyState !== WebSocket.OPEN) return;
      const q = pendingOutboundRef.current;
      while (q.length > 0) {
        const m = q.shift();
        try {
          w.send(JSON.stringify(m));
        } catch {
          q.unshift(m);
          setLastError("Не удалось отправить сообщение. Проверьте соединение и попробуйте снова.");
          break;
        }
      }
    };

    ws.onopen = () => {
      setConnected(true);
      setLastError(null);
      try {
        ws.send(
          JSON.stringify({
            type: "join",
            payload: {
              showId: opts.showId,
              role: opts.role,
              displayName: getDisplayName() || (opts.role === "host" ? "Host" : "Guest"),
              participantId: getOrCreateParticipantId(),
              hostSecret: opts.hostSecret,
            },
          }),
        );
      } catch {
        setLastError("Не удалось отправить join на сервер.");
      }
      queueMicrotask(flushPendingOutbound);
    };

    ws.onmessage = (ev) => {
      void (async () => {
        let text: string;
        if (typeof ev.data === "string") text = ev.data;
        else if (ev.data instanceof Blob) text = await ev.data.text();
        else if (ev.data instanceof ArrayBuffer) text = new TextDecoder().decode(ev.data);
        else return;

        try {
          const msg = JSON.parse(text) as { type?: string; payload?: unknown };
          if (msg.type === "snapshot" && msg.payload && typeof msg.payload === "object") {
            const p = msg.payload as SessionSnapshot;
            setLastError(null);
            setSnapshot({
              ...p,
              chat: normalizeChat(p.chat),
              onlineParticipantIds: Array.isArray(p.onlineParticipantIds) ? p.onlineParticipantIds : [],
            });
            queueMicrotask(flushPendingOutbound);
          }
          if (msg.type === "error")
            setLastError((msg.payload as { message?: string })?.message ?? "Server error");
        } catch {
          /* ignore malformed */
        }
      })();
    };

    ws.onerror = () => setLastError("WebSocket error");
    ws.onclose = () => {
      // React Strict Mode (dev): the first socket’s `close` can fire after the second socket is
      // already in `wsRef`. Never clear the ref for a stale instance — that would break `send()`.
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setConnected(false);
    };

    return () => {
      pendingOutboundRef.current = [];
      ws.close();
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [opts.showId, opts.role, opts.hostSecret, opts.enabled]);

  const send = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      pendingOutboundRef.current.push(msg);
      return;
    }
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      pendingOutboundRef.current.push(msg);
      setLastError("Не удалось отправить сообщение. Проверьте соединение и попробуйте снова.");
    }
  }, []);

  return { snapshot, lastError, connected, send };
}
