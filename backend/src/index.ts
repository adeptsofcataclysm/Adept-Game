import path from "node:path";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { Role } from "./session.js";
import { createSessionStore } from "./session.js";
import { attachWebsocket } from "./wsServer.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendRoot, ".env") });
dotenv.config({ path: path.join(backendRoot, ".env.local"), override: true });

const PORT = Number(process.env["PORT"] ?? "3847");
const HOST_SECRET = process.env["ADEPT_HOST_SECRET"]?.trim() ?? "";

const store = createSessionStore();

function isHostAuthorized(role: Role, hostSecret: string | undefined): boolean {
  if (role !== "host") return true;
  if (!HOST_SECRET) return true;
  return hostSecret === HOST_SECRET;
}

/** User-generated and shipped assets under `backend/data/<type>/`. */
const DATA_ROOT = path.join(backendRoot, "data");
const THEME_ICON_DIR = path.join(DATA_ROOT, "theme_icons");
const QUIZ_MEDIA_DIR = path.join(DATA_ROOT, "quiz_media");
const LOBBY_SLIDES_DIR = path.join(DATA_ROOT, "lobby");
const ROUNDS_DATA_DIR = path.join(DATA_ROOT, "rounds");

function lobbySlideSortKey(name: string): { primary: number; secondary: string } {
  const m = /(\d+)/.exec(name);
  return { primary: m ? Number(m[1]) : Number.MAX_SAFE_INTEGER, secondary: name };
}

/** Image filenames under `data/lobby/`, ordered by the first integer in the name (slide2 before slide10). */
function sortLobbySlideFiles(names: string[]): string[] {
  const image = /\.(png|jpe?g|webp|gif)$/i;
  return names.filter((n) => image.test(n)).sort((a, b) => {
    const ka = lobbySlideSortKey(a);
    const kb = lobbySlideSortKey(b);
    if (ka.primary !== kb.primary) return ka.primary - kb.primary;
    return ka.secondary.localeCompare(kb.secondary, undefined, { sensitivity: "base" });
  });
}

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
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".ogg":
      return "video/ogg";
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

  if (req.url?.startsWith("/quiz_media/") && req.method === "GET") {
    const rel = req.url.slice("/quiz_media/".length);
    const safe = path.basename(rel);
    const filePath = path.join(QUIZ_MEDIA_DIR, safe);
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

  if (req.url === "/api/lobby-slides" && req.method === "GET") {
    try {
      fs.mkdirSync(LOBBY_SLIDES_DIR, { recursive: true });
      const names = sortLobbySlideFiles(fs.readdirSync(LOBBY_SLIDES_DIR));
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ slides: names }));
    } catch {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ slides: [] as string[], error: "list_failed" }));
    }
    return;
  }

  if (req.url?.startsWith("/lobby/") && req.method === "GET") {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    const rel = pathname.slice("/lobby/".length);
    const safe = path.basename(rel);
    const filePath = path.join(LOBBY_SLIDES_DIR, safe);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypeForExt(ext),
      "Cache-Control": "public, max-age=3600",
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

  if (req.url === "/api/upload-quiz-media" && req.method === "POST") {
    void (async () => {
      const body = await readJsonBody(req, 2_600_000);
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
      if (parsed.bytes.length > 1_800_000) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Image too large" }));
        return;
      }

      const fileName = `quiz-${Date.now()}-${Math.random().toString(16).slice(2)}${parsed.ext}`;
      const outPath = path.join(QUIZ_MEDIA_DIR, fileName);
      fs.writeFileSync(outPath, parsed.bytes);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, url: `/quiz_media/${fileName}` }));
    })();
    return;
  }
  res.writeHead(404);
  res.end();
});

attachWebsocket(server, { store, dataDir: ROUNDS_DATA_DIR, isHostAuthorized });

server.listen(PORT, "0.0.0.0", () => {
  const hostHint = HOST_SECRET ? "ADEPT_HOST_SECRET is set" : "ADEPT_HOST_SECRET unset (host joins without secret)";
  console.log(`session service http://127.0.0.1:${PORT}/health  ws 0.0.0.0:${PORT} ?showId=…  ${hostHint}`);
});
