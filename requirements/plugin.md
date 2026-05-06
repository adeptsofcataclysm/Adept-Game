## Where the flow is hardcoded today

The "spine" is a static graph in three places:

```39:58:c:\Users\Ilya_Nazarov\wow\game\Adept-Game\backend\src\phase.ts
/** Host-driven edges for the show spine + enter/exit mini-games over a round. */
const ALLOWED: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  /** Lobby includes "opening the show" (REQ-8); same phase, no separate `opening_show` kind. */
  ["lobby", new Set(["spectator_picks"])],
  ["spectator_picks", new Set(["round:1"])],
  ["round:1", new Set(["round:2", "mini_wheel:1", "mini_roulette:1"])],
  ["round:2", new Set(["story_video", "mini_wheel:2", "mini_roulette:2"])],
  ["round:3", new Set(["between_final", "mini_wheel:3", "mini_roulette:3"])],
  ["mini_wheel:1", new Set(["round:1"])],
  ["mini_wheel:2", new Set(["round:2"])],
  ["mini_wheel:3", new Set(["round:3"])],
  ["mini_roulette:1", new Set(["round:1"])],
  ["mini_roulette:2", new Set(["round:2"])],
  ["mini_roulette:3", new Set(["round:3"])],
  ["story_video", new Set(["donations"])],
  ["donations", new Set(["round:3"])],
  ["between_final", new Set(["final"])],
  ["final", new Set(["game_over"])],
  ["game_over", new Set()],
]);
```

The `Phase` union itself is closed (`backend/src/phase.ts:10–20`), `parsePhase`/`applyHostTransition` only know fixed kinds (`backend/src/session.ts:125–166`), and `SessionSnapshot` carries segment-specific fields like `donations.bySeat`, `openingShow`, `miniWheelPlaysByRound`, `spectatorPicks` (`backend/src/session.ts:28–54`).

On the client, `ShowPage.tsx` `switch`es on `phase.kind` for both labels and segment UI (e.g. donations form lives inline at `frontend/src/pages/ShowPage.tsx:160–188`), and `QuestionCell` is a single shape with no `cardKind` (`backend/src/quizData.ts:7–18`).

So "configurable transitions + configurable special cards" is really three changes layered together, plus a delivery story for the plugin itself.

**Decision (selected):** plugins ship as **signed first-party npm packages sourced from GitHub repositories**. No iframe, no untrusted upload UI, no server-side JS sandbox. See section 3.

---

## 1. Make the FSM data-driven (keep `round:1|2|3` as anchors)

Rule per `.cursor/rules/backend.mdc`: "Keep `round:1|2|3` as anchors — configurable segments sit between anchors, never replace them." So the design is **not** "throw away `ALLOWED`". It is "extend it, leave round nodes immutable":

- Add a phase variant for opaque segments, e.g.

```ts
| { kind: "plugin_segment"; id: string; pluginId: string }
```

  with state stored in a new generic field on the snapshot:

```ts
segmentState: Record<string, unknown>; // keyed by segment id; written only by the plugin's server-side handler
```

- Replace the static `ALLOWED` map with a **composition**:
  - a fixed core map for round and final edges (so legality of cell reveal cannot be broken by a plugin), plus
  - a per-show "flow config" loaded at session creation that adds edges only between anchors (`round:n -> plugin_segment:* -> round:n+1` style). Allowed edges are validated against a manifest that lists which slots a plugin may occupy (e.g. `after_r2`).
- `parsePhase` and `applyHostTransition` take the same plugin id route: validate kind/id against the registry, record segment counters generically (a `Record<string, number>` instead of `miniWheelPlaysByRound: [number, number, number]`).
- Backwards compatibility: today's hardcoded `story_video`, `donations`, `between_final` become **first-party "built-in" plugins** registered by the same registry, so there is exactly one transition path through the code.

Concrete files touched (Adept-Game): `backend/src/phase.ts`, `backend/src/session.ts`, `frontend/src/sessionTypes.ts` (must mirror — see the frontend rules file `.cursor/rules/frontend.mdc:14`).

Cross-repo concern: Node-Script has its own `AdeptsPhase`/`adepts-session-fsm.ts`. One source of truth is mandatory or you end up maintaining two FSMs and two `Phase` unions.

---

## 2. Make special question cards a registry, not a switch

Today `QuestionCell` has no kind; behavior for wheel/roulette/etc. is implied elsewhere. Two pieces:

- **Data**: add `cardKind: "standard" | string` (or `extension: { handlerId: string; params: unknown }`) to `QuestionCell`. JSON packs then *select* a handler without code changes per card, provided the handler is installed.
- **Server dispatch**: when the host opens/reveals/judges a cell, the WS handler in `backend/src/index.ts` looks up `handlers[cardKind]` instead of branching. The handler receives a narrow `Ctx` (read snapshot, request a phase transition through `applyHostTransition`, mutate scores via the same `host_score_step` semantics) and returns a mutator. Authority stays on the server (matches the rule "Mutate snapshots only via `store.mutate`").
- **Client UI**: split `QuestionModal` into a core shell (timer, reveal, host controls) + a slot for `<CardExtension cardKind={...} ctx={...} />`. The slot resolver is a registry keyed by `cardKind`. The default registry contains the built-in renderers (standard cell, wheel, roulette).

This is the part that buys you the most: every "we want a new card type next show" becomes "publish a plugin", not "patch the modal".

---

## 3. Plugin distribution — Option B with GitHub as the package source

Plugins are **vetted npm packages installed from GitHub repos**. They are linked into the build at install time, not loaded from arbitrary URLs at runtime. The operator (you) decides which repos are trusted; "upload" reduces to "merge a PR / pin a new tag".

### 3.1 Package shape

Each plugin is a normal npm package whose `package.json` has a custom field:

```json
{
  "name": "@adept-plugins/after-r2-charity",
  "version": "1.0.0",
  "main": "./dist/server.js",
  "exports": {
    ".":        "./dist/server.js",
    "./client": "./dist/client.js"
  },
  "peerDependencies": {
    "@adept/plugin-sdk": "^1.0.0"
  },
  "adept": {
    "pluginId": "after-r2-charity",
    "apiVersion": 1,
    "capabilities": {
      "segments": [{ "id": "after_r2_charity", "slot": "after:round:2", "next": "round:3" }],
      "cardKinds": ["donation_pulse"]
    }
  }
}
```

Two entry points, both code:

- `./dist/server.js` — exports `registerServer(registry)` which calls `registry.registerSegment(...)` and `registry.registerCardHandler(...)`. Runs **inside** the Node session service; can mutate snapshots only through the `Ctx` the registry hands it (same authority model as built-ins).
- `./dist/client.js` — exports `registerClient(registry)` which registers React components for the segment view and card extension slots. Runs **inside** the Vite/React bundle.

`@adept/plugin-sdk` is a tiny package living in this repo (`packages/plugin-sdk` or similar) that exports the `PluginRegistry`, `Ctx`, `SessionSnapshot`, and `Phase` types. Plugins import from it; the host app provides the implementations. Versioning is via `apiVersion` in the manifest plus the SDK's semver.

### 3.2 GitHub as the source

Install lines look like one of:

```jsonc
// pinned to an annotated tag — preferred for human-readable lockfile entries
"@adept-plugins/after-r2-charity": "github:adept-tv/plugin-after-r2-charity#v1.0.0",

// pinned to a commit SHA — strongest immutability
"@adept-plugins/after-r2-charity": "github:adept-tv/plugin-after-r2-charity#7c1a9e3c4d…",

// private repo via SSH (CI uses a deploy key)
"@adept-plugins/after-r2-charity": "git+ssh://git@github.com/adept-tv/plugin-after-r2-charity.git#v1.0.0"
```

`package-lock.json` then carries the resolved commit SHA, so reproducible builds are inherent. No registry credentials are needed for public repos; private plugins need a deploy key or PAT in CI.

### 3.3 Trust model

This is what makes Option B safe to load into the main bundle:

- **Allowlist of GitHub orgs/repos** lives in this repo, e.g. `requirements/plugin-allowlist.json`. The validator CLI (section 5, step 5) refuses to build if `package.json` resolves a `@adept-plugins/`* to a git URL outside the allowlist.
- **Pin by tag + commit SHA**, never by branch. Lockfile is committed.
- **Optional**: require GPG-signed annotated tags and verify them in CI (`git tag -v`). This is cheap to add later.
- **Code review**: every plugin update is a normal PR against this repo bumping the dependency line. Two-person review is the security perimeter, same as any other dependency.
- **Capability check**: even though plugin code is trusted, the `PluginRegistry` still rejects segment slots and card kinds the manifest did not declare. This catches typos and accidental scope creep, not malice.

### 3.4 Loading

- **Build time**: `npm install` resolves git deps, builds them as part of the workspace. The host app discovers plugins by globbing `node_modules/@adept-plugins/*/package.json` and reading the `adept` field at startup (server) and at bundle time (client). No dynamic `import()` from URLs.
- **Runtime registration**: on session-service boot, iterate plugins, call `registerServer(registry)`. On Vite build, a small barrel file (`frontend/src/plugins/index.ts`, generated by a prebuild script) imports each plugin's `./client` entry and calls `registerClient(registry)`.
- **No iframe, no `postMessage` bridge.** Plugin React components mount directly inside `<PluginSegmentHost />` and `<CardExtensionHost />` slots. They receive props typed by the SDK and call `ctx.send({ type, payload })` which forwards to the existing WebSocket from `useSessionWs`.

### 3.5 What "upload" looks like operationally

1. Plugin author opens a PR on the plugin repo, tags `v1.2.3`.
2. Operator opens a PR on Adept-Game bumping `package.json` + lockfile to that tag (or commit SHA).
3. CI builds, runs the validator CLI (graph reachability + capability check), runs tests.
4. Merge → deploy. The new segment/card kind is now selectable in show JSON packs.

There is no "upload UI". That is the explicit cost of choosing Option B; the explicit benefit is no untrusted JS in the host bundle and no runtime fetch.

---

## 4. WS protocol additions (small, narrow)

Add two new server-validated message types in `backend/src/index.ts`:

- `plugin_action` → `{ pluginId, segmentId, action, payload }`. Server looks up the plugin's registered handler, runs it inside `store.mutate`, broadcasts snapshot. Mirrors how `host_transition` works today (`backend/src/index.ts:142–156`).
- `request_transition` → existing `host_transition` already does this; the only change is that `parsePhase` now also accepts `plugin_segment`.

No new socket per plugin — keep ADR-2 ("one channel per show").

---

## 5. Order of work, scoped to be the smallest useful slice

1. **Contract + types**: add `plugin_segment` to `Phase`, add `segmentState` to `SessionSnapshot`, mirror in `frontend/src/sessionTypes.ts`. *No behavior change yet.*
2. **Core registry**: a `PluginRegistry` (in `backend/src/`) and a parallel client registry that own segment definitions and card-kind handlers. Re-implement `donations`/`story_video`/`between_final` as registered built-ins so legacy `Phase` kinds and the new `plugin_segment` go through one path.
3. **Plugin SDK package**: extract the `Phase`, `SessionSnapshot`, `Ctx`, `PluginRegistry` types (and the WS message contract) into `packages/plugin-sdk` published from this monorepo. Plugins depend on this exact version.
4. **Discovery + registration**: server boot iterates `node_modules/@adept-plugins/`* and calls `registerServer`; a Vite prebuild script generates a client barrel that imports each plugin's `./client` entry. Manifest's `capabilities` is enforced by the registry on registration.
5. **Validator + allowlist CLI**: a script that (a) loads each plugin's manifest, (b) checks the resolved git URL is on the allowlist, (c) asserts the resulting transition graph is reachable end-to-end (no dead ends, no skipped rounds), (d) optionally verifies signed tags. Runs in CI on every PR.
6. **Unify with Node-Script**: extract the FSM/registry into `packages/plugin-sdk` (or a sibling) so both Adept-Game and Node-Script consume one source of truth. Otherwise step 2 introduces a second drift point.

Steps 1–3 are doable without any plugin existing and immediately make the system pluggable in-tree (built-ins go through the registry). 4–5 buy the GitHub-sourced extension story. 6 is non-negotiable if both repos remain in production.

---

## 6. Things I would explicitly *not* do

- Do not make `round:n` itself pluggable. Cell-reveal authority and per-round counters are the kind of state you do not want a plugin touching.
- Do not let plugin UI mutate `scores`/`revealed` directly. Always go through a server action; the rule already forbids client write paths (`.cursor/rules/backend.mdc` — "All phase changes go through `applyHostTransition` → `canTransition`").
- Do not load plugins by URL at runtime. Option B's whole point is that the dependency tree is pinned in the lockfile.
- Do not allow git refs that are branches (e.g. `#main`). Only annotated tags or commit SHAs. The validator CLI rejects floating refs.
- Do not skip the manifest capability check just because the code is trusted. It is the cheapest defense against a plugin accidentally registering a segment slot it never declared.
- Do not introduce per-plugin sockets. Keep ADR-2.

---

Open questions to lock down before step 1 lands:

1. **SDK location** — does `@adept/plugin-sdk` live in Adept-Game (and Node-Script consumes it via git dep), in Node-Script (reverse), or in a new shared repo? This decides who owns the canonical `Phase` and `SessionSnapshot`.
2. **Public vs private plugin repos** — if any plugin is private, CI needs a deploy key or fine-grained PAT; that decision affects the dev setup doc, not the code.
3. **Signed tags** — turn this on from day one or defer until you have an external contributor? Cheaper to wire in now.

