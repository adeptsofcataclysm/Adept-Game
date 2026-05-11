import { getHttpBaseUrl } from "@/wsUrl";

export function resolveQuizAssetUrl(url: string): string {
  const u = url.trim();
  if (!u) return u;
  if (u.startsWith("http") || u.startsWith("//")) return u;
  return `${getHttpBaseUrl()}${u.startsWith("/") ? u : `/${u}`}`;
}

export function isVideoUrl(url: string) {
  return /\.(mp4|webm|ogg)$/i.test(url);
}
