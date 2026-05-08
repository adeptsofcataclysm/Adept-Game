const DEFAULT = "ws://127.0.0.1:3847";

/** `location.hostname` for IPv6 is like `::1` — URLs require brackets: `ws://[::1]:3847`. */
function wsHostForUrl(hostname: string): string {
  if (hostname.includes(":") && !hostname.startsWith("[")) {
    return `[${hostname}]`;
  }
  return hostname;
}

/**
 * When `VITE_WS_URL` is unset, connect to the session service on the **same host** as the SPA
 * (port 3847). Hard-coding `127.0.0.1` breaks if you open the app via `localhost`, another hostname,
 * or a LAN IP — the browser would open WS on the wrong machine.
 */
export function getWsBaseUrl(): string {
  const raw = import.meta.env.VITE_WS_URL?.trim();
  if (raw && raw.length > 0) return raw.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = wsHostForUrl(window.location.hostname);
    return `${proto}//${host}:3847`;
  }
  return DEFAULT;
}

/** HTTP base URL for the session service (same host/port as WS). */
export function getHttpBaseUrl(): string {
  const wsBase = getWsBaseUrl();
  if (wsBase.startsWith("wss://")) return `https://${wsBase.slice("wss://".length)}`;
  if (wsBase.startsWith("ws://")) return `http://${wsBase.slice("ws://".length)}`;
  return wsBase;
}

export function buildWsUrl(showId: string): string {
  const base = getWsBaseUrl();
  const u = new URL(base);
  u.searchParams.set("showId", showId);
  return u.href;
}
