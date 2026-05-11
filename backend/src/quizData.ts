import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RoundIndex } from "./phase.js";

/** Matches persisted quiz JSON. */
export type QuestionCell = {
  text: string;
  questionUrl: string;
  answerText: string;
  answerUrl: string;
  splashUrl?: string;
  splashVariant?: "spiral" | "dedFly";
  splashAudioUrl?: string;
  splashDismissHostOnly?: boolean;
  headerUrl?: string;
  headerCornerUrl?: string;
};

export type RoundPackJson = {
  themes: string[];
  /** Optional icon URL per theme row (same length as `themes`). */
  themeIcons?: (string | null)[];
  questions: QuestionCell[][];
};

export type RoundBoardRuntime = {
  themes: string[];
  themeIcons?: (string | null)[];
  questions: QuestionCell[][];
  revealed: boolean[][];
  pointValues: number[][];
};

/** Round pack JSON files (`round-1.json` …) live under `backend/data/rounds/`. */
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "rounds");

const STANDARD_FIVE = [100, 200, 300, 400, 500];

function validatePack(pack: RoundPackJson, fileLabel: string): void {
  if (!Array.isArray(pack.themes) || pack.themes.length === 0) {
    throw new Error(`${fileLabel}: themes[] required`);
  }
  if (typeof pack.themeIcons !== "undefined") {
    if (!Array.isArray(pack.themeIcons) || pack.themeIcons.length !== pack.themes.length) {
      throw new Error(`${fileLabel}: themeIcons[] must match themes length`);
    }
  }
  if (!Array.isArray(pack.questions) || pack.questions.length !== pack.themes.length) {
    throw new Error(`${fileLabel}: questions[][] must match themes length`);
  }
  const firstLen = pack.questions[0]?.length;
  if (typeof firstLen !== "number" || firstLen < 1) {
    throw new Error(`${fileLabel}: first questions row invalid`);
  }
  for (let i = 0; i < pack.questions.length; i++) {
    const row = pack.questions[i];
    if (!Array.isArray(row) || row.length !== firstLen) {
      throw new Error(`${fileLabel}: questions row ${i} length mismatch`);
    }
  }
}

function pointRowForWidth(width: number): number[] {
  if (width === 5) return [...STANDARD_FIVE];
  return Array.from({ length: width }, (_, i) => (i + 1) * 100);
}

function parsePackJson(raw: string, fileLabel: string): RoundPackJson {
  const j = JSON.parse(raw) as unknown;
  if (!j || typeof j !== "object") throw new Error(`${fileLabel}: invalid JSON`);
  const o = j as Record<string, unknown>;
  if (!Array.isArray(o["themes"]) || !Array.isArray(o["questions"])) {
    throw new Error(`${fileLabel}: themes and questions required`);
  }
  return j as RoundPackJson;
}

export function loadRoundBoardFile(roundFile: 1 | 2 | 3 | 4): RoundBoardRuntime {
  const fileName = `round-${roundFile}.json`;
  const filePath = join(DATA_DIR, fileName);
  const pack = parsePackJson(readFileSync(filePath, "utf8"), fileName);
  validatePack(pack, fileName);

  const revealed = pack.themes.map((_, ri) => pack.questions[ri]!.map(() => false));
  const pointValues = pack.themes.map((_, ri) => {
    const w = pack.questions[ri]!.length;
    return pointRowForWidth(w);
  });

  return {
    themes: pack.themes,
    themeIcons: pack.themeIcons,
    questions: pack.questions,
    revealed,
    pointValues,
  };
}

export function loadRoundBoard(round: RoundIndex): RoundBoardRuntime {
  return loadRoundBoardFile(round);
}
