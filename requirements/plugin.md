## Plugins — current contract (segments + client views)

This document describes the **current** plugin model implemented by the Adept-Game repositories. It is intentionally higher-level than code, but it is **repo-specific** (unlike `architecture.md`, which is product architecture).

### What is a plugin?

A plugin is an npm package that can contribute:

- **Segments**: extra steps in the show flow that sit **between anchor phases** (lobby, round:1|2|3, final).
- **Client views**: React components that render a segment.
- **(Optional) actions**: a server-side handler invoked through the existing WebSocket to mutate `segmentState` and/or request a transition.

The authoritative server remains the sole owner of session truth (REQ-15.1): plugin UI never mutates state directly.

---

## 1) Phase and FSM model

**Anchor phases** are fixed:

- `lobby`
- `round:1`, `round:2`, `round:3`
- `final`

Everything else is modeled as:

- `plugin_segment:<pluginId>:<segmentId>` (wire key)
- `Phase = { kind: "plugin_segment"; pluginId: string; id: string }` (typed snapshot)

The FSM is composed from:

- a **core** immutable edge map that only contains anchor → anchor edges (so the show spine always works), plus
- **extra edges** contributed at startup by the plugin registry.

This is what allows “optional” between-round transitions: if no segment exists for a slot, the core anchor hop remains legal.

---

## 2) Session snapshot: `segmentState`

All plugin-owned state lives under:

- `segmentState: Record<string, unknown>`

Convention:

- The key is usually the **segment id** (e.g. `"donations"`), and the value is a plugin-defined JSON-like object.
- A segment’s client view reads from `snapshot.segmentState[key]`.
- The server is responsible for validating writes (type guards / bounds checks).

---

## 3) Plugin package shape (Adept-Game-Plugins)

Plugins live in the `Adept-Game-Plugins` repo under `packages/*`.

Each plugin package exports **two entry points**:

- `.` (server): `registerServer(registry)`
- `./client` (client): `registerClient(registry)`

Example (conceptual):

```json
{
  "name": "@adept-plugins/funeral",
  "type": "module",
  "main": "./dist/server.js",
  "exports": {
    ".": "./dist/server.js",
    "./client": "./dist/client.js"
  },
  "peerDependencies": {
    "@adept/plugin-sdk": "^1.0.0",
    "react": "^18.0.0"
  },
  "adept": {
    "pluginId": "funeral",
    "apiVersion": 1,
    "capabilities": {
      "segments": [{ "id": "story_video" }, { "id": "donations" }],
      "cardKinds": []
    }
  }
}
```

The `adept` manifest is the metadata used for future validation/discovery; the current host wiring is explicit (see §4–§5).

---

## 4) How plugins are wired into Adept-Game (today)

**Install**: Adept-Game depends on plugin packages via file dependencies:

- `@adept-plugins/*`: `"file:../Adept-Game-Plugins/packages/<name>"`

**Server registration**: the Node session service imports each plugin’s server entry and calls `registerServer(...)` during boot.

**Client registration**: the SPA imports each plugin’s `./client` entry in a single “barrel” and calls `registerClient(...)` at bundle time.

This keeps the runtime simple and deterministic (no runtime downloads; no iframe integration).

---

## 5) Current first-party plugins (examples)

These plugins are first-party packages living in `Adept-Game-Plugins` and registered by the host:

- `@adept-plugins/spectator-bet` (pluginId `"spectator-bet"`)
  - segment: `spectator_bet` (runs before Round 1; REQ-9.1–9.3 — seat picks stored in `segmentState.spectator_bet`)
  - REQ-9.4 (winners after three rounds) is a **separate** first-party plugin package, not this one; it shall read finalized `scores` and the `bets` map written here (contract TBD when that plugin is added).
- `@adept-plugins/funeral` (pluginId `"funeral"`)
  - segments: `story_video` → `donations` (REQ-12) between `round:2` and `round:3`
- `@adept-plugins/final-round-selection` (pluginId `"final-round-selection"`)
  - segment: `between_final` (REQ-13 transition) between `round:3` and `final`

---

## 6) WebSocket interaction model for plugins

Plugins do not get new sockets. All interaction stays on the existing show WebSocket (ADR-2).

Any actor (host / player / spectator) can send a `plugin_event` message that targets a specific segment:

- `{ pluginId, segmentId, event, payload }`

Card-plugin events use a parallel scoped message (see §10):

- `plugin_card_event`: `{ cardKind, event, payload }`

On the server:

- the registry resolves the segment’s `onEvent` handler (or the card kind’s `onCardEvent`),
- the handler runs inside the normal session mutation boundary,
- handler-supplied authority checks (`actor.role === "host"`, current-turn player, etc.) gate the mutation,
- the server broadcasts the updated snapshot.

---

## 7) How to add a new plugin (checklist)

1. Create a new package under `Adept-Game-Plugins/packages/<your-plugin>/`.
2. Implement `src/server.ts` with `registerServer(registry)` and register one or more segments.
3. Implement `src/client.tsx` with `registerClient(registry)` and register segment views.
4. Add the dependency to `Adept-Game/package.json`.
5. Register the plugin on:
   - server: `backend/src/pluginRegistry.ts`
   - client: `frontend/src/plugins/index.ts`

---

## 8) Plugin UI layout slots (main / rail / full screen)

A segment can contribute up to **three** client-side React views:

- **Main** (`registerSegmentView`) — rendered in the main column when the show is in that `plugin_segment`.
- **Rail** (`registerSegmentRailView`) — optional; rendered in the host **right rail** column (`adepts-show-rail-col`) alongside the main view.
- **Full screen** (`registerSegmentFullScreenView`) — optional; **replaces the entire `ShowPage` UI** (no header, no chat/columns, no players panel).

### Precedence rules

- If a **full-screen** view is registered for the active segment, it takes precedence and the host renders **only** that view.
- Otherwise, the host renders the **main** view, and additionally renders the **rail** view when present.

---

## 9) Planned improvements (not required for correctness)

- **Generated client plugin barrel**: generate `frontend/src/plugins/index.ts` by discovering installed `@adept-plugins/*` packages.
- **Plugin validator**: check plugin manifests (edges are reachable; no illegal anchor replacements; no floating git refs when using git dependencies).
- **`quiz-pack.schema.json`** (`backend/data/rounds/`): JSON Schema for pack authoring. The `definitions.RegisteredCardParamsMap` fragment and top-level `x-registeredCardKinds` are regenerated from the live server registry with `npm run gen:quiz-schema --workspace=backend` (run after adding or renaming card plugins).

---

## 10) Question-card plugins (apiVersion 2)

Segment plugins live **between** rounds; card plugins live **inside** a round, attached to individual question cells.

A card plugin may:

1. Inject pre- and post-reveal actions inside the standard question card flow:
   open card → optional pre-reveal action → reveal answer → optional post-reveal action → close.
2. Replace the modal **body** with a custom React view while keeping the host’s standard header / award footer.
3. Replace the entire game field with a card-triggered mini-game.

Crucially, the card layer is **orthogonal to `phase`**: opening a card never changes `phase`. Players still see themselves as being in `round:N` for the duration of the card, even when a full-screen card mini-game is rendered.

### 10.1 Modes

Each `cardKind` declares exactly one mode:

| mode             | scope                              | composition rules                                  |
|------------------|------------------------------------|----------------------------------------------------|
| `in_card`        | renders pre/post-reveal slots      | any number of `in_card` kinds may stack            |
| `replace_card`   | replaces the modal **body**        | at most one per cell; coexists with `in_card`      |
| `replace_field`  | replaces the whole `ShowPage`      | at most one per cell; coexists with `in_card`      |

The conflict-resolution rule: a cell cannot declare both `replace_card` and `replace_field`. Multiple `replace_*` kinds of the same mode are also rejected. These checks run at pack load (server boot) and on every `host_edit_quiz_question`.

### 10.2 Data model

Each `QuestionCell` may carry:

- `cardKinds?: string[]` — kinds attached to this cell, in declared order.
- `cardParams?: Record<cardKind, unknown>` — per-kind parameters validated by `validateParams`.

Legacy `cardKind: "x"` and `cardParams: { … }` (single-kind cells) are normalized to the canonical record form at parse time.

### 10.3 Server-authoritative card lifecycle

`SessionSnapshot.activeCard` is the single source of truth for the open card:

```ts
type ActiveCard = {
  board: "round" | "finalTransition";
  roundIndex?: 1 | 2 | 3;
  rowIndex: number;
  colIndex: number;
  stage: "question" | "answer";
  cardKinds: string[];
  pluginState: Record<string, unknown>; // ephemeral per-kind buckets
};
```

Promoting the card to the snapshot is what makes plugin actions (and the card itself) synchronized across host, players, and spectators.

`activeCard` is intentionally **ephemeral** — never written to disk and reset to `null` on server boot / `host_reset_session`.

### 10.4 WebSocket protocol

- `open_quiz_cell` — host **or** the current-turn player; opens a cell, runs every kind’s `onOpen`, sets `activeCard`. Rejected when a card is already open or the cell is already revealed.
- `host_advance_card_stage` — host-only; flips `stage` from `question` to `answer` and runs every kind’s `onAdvance`.
- `host_close_quiz_cell` — host-only; runs every kind’s `onClose`, then marks `revealed[r][c] = true` (when `outcome === "revealed"`) and clears `activeCard`.
- `plugin_card_event` — any actor; routed to the open card’s matching kind’s `onCardEvent`. The server hard-guards that `activeCard` is non-null and `activeCard.cardKinds` contains the requested `cardKind`.

The legacy `host_reveal_quiz_cell` message still works (used by older flows) and additionally clears `activeCard` when it points at the same cell.

### 10.5 Server-side registration

Plugins call `registry.registerCardKind(def)` from `registerServer`. The host’s registry exposes:

```ts
type CardKindDefinition = {
  pluginId: string;
  cardKind: string;
  mode: "in_card" | "replace_card" | "replace_field";
  validateParams?: (raw: unknown) => { ok: true; value: P } | { ok: false; error: string };
  onOpen?:       (ctx: CardCtx) => MutatorResult;
  onAdvance?:    (to: "answer", ctx: CardCtx) => MutatorResult;
  onClose?:      (outcome: "revealed" | "cancelled", ctx: CardCtx) => MutatorResult;
  onCardEvent?:  (event: string, payload: unknown, actor: Actor, ctx: CardCtx) => MutatorResult;
};

type CardCtx = {
  readonly snapshot: SessionSnapshot;
  readonly cardParams: unknown;     // this kind’s validated params
  readonly pluginState: unknown;    // this kind’s bucket in activeCard.pluginState
  setPluginState(value: unknown): void;
  advanceCardStage(to: "answer"): MutatorResult;
  closeCard(outcome: "revealed" | "cancelled"): MutatorResult;
  openCellInstead(target: CardCellTarget): MutatorResult;
  requireHost(actor: Actor): MutatorResult;
};
```

`closeCard` / `openCellInstead` are recorded as *follow-ups* and applied after the hook returns — so the rest of a stacked kind chain still runs deterministically.

### 10.6 Client-side registration

Plugins call `registry.registerCardKindClient(cardKind, def)` from `registerClient`. The host’s client registry stores:

```ts
type CardKindClientDef = {
  label: string;                                // shown in the host edit picker
  description?: string;
  defaultParams?: () => unknown;                // seeded when host first selects the kind
  ParamsEditor?: ComponentType<CardParamsEditorProps>;
  PreRevealAction?:  ComponentType<CardActionProps>;
  PostRevealAction?: ComponentType<CardActionProps>;
  ModalView?:        ComponentType<CardModalProps>;       // replace_card body
  FullScreenView?:   ComponentType<CardFullScreenProps>;  // replace_field overlay
};
```

The snapshot also carries a manifest of registered kinds (`registeredCardKinds`), so the host edit UI can populate its picker without depending on plugin imports.

### 10.7 Rendering precedence on `ShowPage`

While `snapshot.activeCard` is non-null the precedence is:

1. Active `plugin_segment` `FullScreenView`            *(existing)*
2. `activeCard`’s `replace_field` `FullScreenView`     *(new)*
3. Normal round shell + standard `QuizQuestionModal`   *(existing)*

Inside the modal, when a `replace_card` `ModalView` is registered for any of the open card’s kinds, it replaces the standard question/answer pane; otherwise the standard pane renders and `PreRevealAction` / `PostRevealAction` slots from all `in_card` kinds render around it.

### 10.8 Host edit semantics

The host can edit `cardKinds[]` and `cardParams` on a cell, either while the card is open or from the closed board. `host_edit_quiz_question` runs the validation pipeline (normalize → lookup → conflict rules → `validateParams` per kind) and persists the result.

When the edited cell **is the currently-open card**, the server also syncs `activeCard`:

- kinds removed from the list lose their `pluginState` bucket,
- kinds added to the list gain an empty bucket,
- **no `onOpen` / `onClose` hook fires** — the host can cancel + re-open the card to re-run lifecycle hooks intentionally.

