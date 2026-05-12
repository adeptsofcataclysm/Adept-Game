/**
 * Regenerates `data/rounds/quiz-pack.schema.json` fragments from the live
 * server plugin registry (`listRegisteredCardKindIds` + cardParams map schema).
 *
 * Run from repo root: `npm run gen:quiz-schema --workspace=backend`
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pluginRegistry } from "../src/pluginRegistry.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "../data/rounds/quiz-pack.schema.json");

const doc = JSON.parse(readFileSync(schemaPath, "utf8")) as {
  definitions?: Record<string, unknown>;
  [key: string]: unknown;
};

const keys = pluginRegistry.listRegisteredCardKindIds();
doc["x-registeredCardKinds"] = keys;
if (!doc.definitions) doc.definitions = {};
doc.definitions["RegisteredCardParamsMap"] = pluginRegistry.buildRegisteredCardParamsMapJsonSchema();

writeFileSync(schemaPath, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Updated ${schemaPath} (${keys.length} card kind(s)).`);
