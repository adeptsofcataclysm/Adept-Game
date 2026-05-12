import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RoundIndex } from "./phase.js";
import { pluginRegistry } from "./pluginRegistry.js";
import type { CardMode } from "./pluginRegistry.js";

/** Matches persisted quiz JSON (normalized form). */
export type QuestionCell = {
  text: string;
  questionUrl: string;
  answerText: string;
  answerUrl: string;
  /**
   * Normalized card-plugin kinds attached to this cell. Authors may use either
   * `cardKind: "x"` or `cardKinds: ["x", "y"]` on disk; the loader normalizes
   * to `cardKinds[]`. Cells without any kind take the standard quiz flow.
   */
  cardKinds?: string[];
  /**
   * Per-kind handler parameters, keyed by `cardKind`. Authors may also use a
   * single-object form when only one kind is declared; the loader normalizes
   * to the `Record<cardKind, unknown>` form.
   */
  cardParams?: Record<string, unknown>;
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

/**
 * Result of normalizing a cell's authoring form (legacy single-string vs
 * canonical arrays/records) into the runtime shape, with each kind's
 * `cardParams` already passed through its plugin's `validateParams`.
 */
export type NormalizedCardKinds = {
  cardKinds: string[];
  cardParams: Record<string, unknown>;
};

export type NormalizeError = { ok: false; error: string };
export type NormalizeOk = { ok: true; value: NormalizedCardKinds };

/**
 * Normalize and validate the `cardKinds` / `cardParams` slots on a single
 * cell-like input (used by both pack load and `host_edit_quiz_question`).
 *
 * Pipeline:
 *   1. Normalize: accept legacy `cardKind: "x"` and `cardParams: {...}`.
 *   2. Look up every kind in `pluginRegistry.getCardKind(kind)`.
 *   3. Enforce conflict rules: at most one replace_field, at most one
 *      replace_card, no replace_field+replace_card.
 *   4. For each kind, call plugin's `validateParams(rawParams)` (when supplied)
 *      and replace the params slot with the validated value.
 *
 * Returns the normalized form (empty arrays when the cell has no kinds).
 */
export function normalizeAndValidateCardKinds(input: {
  cardKind?: unknown;
  cardKinds?: unknown;
  cardParams?: unknown;
}): NormalizeOk | NormalizeError {
  const rawList: unknown = input.cardKinds ?? (input.cardKind ? [input.cardKind] : undefined);
  if (rawList == null) return { ok: true, value: { cardKinds: [], cardParams: {} } };
  if (!Array.isArray(rawList)) {
    return { ok: false, error: "cardKinds must be a string array" };
  }
  const kinds: string[] = [];
  for (const k of rawList) {
    if (typeof k !== "string" || !k.trim()) {
      return { ok: false, error: "cardKinds entries must be non-empty strings" };
    }
    if (kinds.includes(k)) {
      return { ok: false, error: `cardKind "${k}" listed twice on the same cell` };
    }
    kinds.push(k);
  }
  if (kinds.length === 0) return { ok: true, value: { cardKinds: [], cardParams: {} } };

  let paramsRecord: Record<string, unknown>;
  if (input.cardParams == null) {
    paramsRecord = {};
  } else if (typeof input.cardParams !== "object" || Array.isArray(input.cardParams)) {
    return { ok: false, error: "cardParams must be an object" };
  } else {
    const obj = input.cardParams as Record<string, unknown>;
    const keys = Object.keys(obj);
    const looksLikeRecord = kinds.length > 1 || keys.some((k) => kinds.includes(k));
    if (looksLikeRecord) {
      paramsRecord = { ...obj };
    } else if (kinds.length === 1) {
      paramsRecord = { [kinds[0]!]: obj };
    } else {
      paramsRecord = { ...obj };
    }
  }

  let replaceFieldCount = 0;
  let replaceCardCount = 0;
  const modes: Record<string, CardMode> = {};
  for (const kind of kinds) {
    const def = pluginRegistry.getCardKind(kind);
    if (!def) return { ok: false, error: `unknown cardKind "${kind}"` };
    modes[kind] = def.mode;
    if (def.mode === "replace_field") replaceFieldCount++;
    if (def.mode === "replace_card") replaceCardCount++;
  }
  if (replaceFieldCount > 1) {
    return { ok: false, error: "at most one replace_field cardKind per cell" };
  }
  if (replaceCardCount > 1) {
    return { ok: false, error: "at most one replace_card cardKind per cell" };
  }
  if (replaceFieldCount > 0 && replaceCardCount > 0) {
    return { ok: false, error: "replace_field and replace_card cannot coexist on the same cell" };
  }

  const validatedParams: Record<string, unknown> = {};
  for (const kind of kinds) {
    const def = pluginRegistry.getCardKind(kind)!;
    const raw = paramsRecord[kind];
    if (def.validateParams) {
      const r = def.validateParams(raw);
      if (!r.ok) return { ok: false, error: `cardParams for "${kind}" invalid: ${r.error}` };
      validatedParams[kind] = (r as { ok: true; value: unknown }).value;
    } else if (typeof raw !== "undefined") {
      validatedParams[kind] = raw;
    }
  }

  return { ok: true, value: { cardKinds: kinds, cardParams: validatedParams } };
}

function normalizePackCardKinds(pack: RoundPackJson, fileLabel: string): void {
  for (let r = 0; r < pack.questions.length; r++) {
    const row = pack.questions[r]!;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]!;
      const result = normalizeAndValidateCardKinds(cell);
      if (!result.ok) {
        throw new Error(`${fileLabel}: row ${r} col ${c}: ${result.error}`);
      }
      const { cardKinds, cardParams } = result.value;
      if (cardKinds.length > 0) {
        cell.cardKinds = cardKinds;
        cell.cardParams = cardParams;
      } else {
        delete (cell as Record<string, unknown>)["cardKinds"];
        delete (cell as Record<string, unknown>)["cardParams"];
      }
      delete (cell as Record<string, unknown>)["cardKind"];
    }
  }
}

export function loadRoundBoardFile(roundFile: 1 | 2 | 3 | 4): RoundBoardRuntime {
  const fileName = `round-${roundFile}.json`;
  const filePath = join(DATA_DIR, fileName);
  const pack = parsePackJson(readFileSync(filePath, "utf8"), fileName);
  validatePack(pack, fileName);
  normalizePackCardKinds(pack, fileName);

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
