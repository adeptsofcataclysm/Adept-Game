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
  - segment: `spectator_bet` (runs before Round 1)
- `@adept-plugins/funeral` (pluginId `"funeral"`)
  - segments: `story_video` → `donations` (REQ-12) between `round:2` and `round:3`
- `@adept-plugins/final-round-selection` (pluginId `"final-round-selection"`)
  - segment: `between_final` (REQ-13 transition) between `round:3` and `final`

---

## 6) WebSocket interaction model for plugins

Plugins do not get new sockets. All interaction stays on the existing show WebSocket (ADR-2).

The host may send a `plugin_action` message that targets a specific segment:

- `{ pluginId, segmentId, action, payload }`

On the server:

- the registry resolves the segment’s `onAction` handler (if any),
- the handler runs inside the normal session mutation boundary,
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

