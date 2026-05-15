# Adept-Game — project instructions for agents

## Overview

Monorepo **`adept-game`**: authoritative **Node session service** (`backend/`) plus **Vite + React + React Router** SPA (`frontend/`). Normative **SHALL** statements live in **`requirements/requirements.md`**. Optional mini-game packages are linked from root **`package.json`** via `file:../Adept-Game-Plugins/...`.

## Layout

| Path | Role |
| --- | --- |
| `backend/src/` | WebSocket server, session store, phase FSM, quiz data, handlers |
| `backend/data/` | Quiz packs, media, lobby assets |
| `frontend/src/` | App entry, pages, hooks (`useSessionWs`), UI, plugin hosts |
| `frontend/src/sessionTypes.ts` | Client snapshot shape — keep aligned with backend |

## Requirements and design docs

Read **`requirements/requirements.md`** for normative **REQ-*** statements. Use the others when the task matches the scope in the right column:

| Document | Role | When to read |
| --- | --- | --- |
| `requirements/requirements.md` | Testable **SHALL** (REQ-1–REQ-15) | Always for behavior and acceptance |
| `requirements/vision.md` | Product intent and glossary | Ambiguous wording, naming, UX intent |
| `requirements/architecture.md` | ADRs (Node, WebSocket, SPA), logical flows — *product* architecture, not this repo’s file layout | FSM boundaries, transport, host/session rules, stack expectations |
| `requirements/plugin.md` | **Repo-specific** plugin model: segments, `segmentState`, registry, client views | Plugin packages, `pluginRegistry`, segment phases, plugin hosts, segment actions |

If **`architecture.md`** and **`plugin.md`** disagree with code, treat **`plugin.md`** as the contract for the **implemented** plugin system; treat **`architecture.md`** + **`requirements.md`** for product-level decisions. Escalate conflicts to the user.

## Commands (repo root)

| Goal | Command |
| --- | --- |
| Build both workspaces | `npm run build` |
| Dev backend | `npm run dev:backend` |
| Dev frontend | `npm run dev:frontend` |
| Backend compile | `npm run build --workspace=backend` |
| Frontend build | `npm run build --workspace=frontend` |

## Backend (summary)

- Mutate session only through **`store.mutate(showId, fn)`**.
- Inbound WS: **`{ type, payload }`** — validate and narrow **`payload`** from `unknown`.
- After successful mutation, broadcast **`{ type: "snapshot", payload }`** to the room.
- Enforce **host / player / spectator** gates and **`ADEPT_HOST_SECRET`** for host auth (see `.cursor/rules/backend.mdc`).
- Phase changes: **`applyHostTransition`** / **`canTransition`** / **`ALLOWED` in `phase.ts`** — consistent with **`requirements/architecture.md`** (ADR / FSM intent) and **`requirements/plugin.md`** when segments are involved.
- TypeScript: **NodeNext ESM**; local imports use **`.js` extension** in source.
- When **`SessionSnapshot`** changes, update **`frontend/src/sessionTypes.ts`**.

## Frontend (summary)

- **Game truth** comes from the WebSocket snapshot; UI is a projection.
- Follow **`useSessionWs.ts`**, **`ShowPage.tsx`**, **`frontend/src/plugins/`**.
- For plugin UI and segment wiring, align with **`requirements/plugin.md`**.

## Common mistakes

- **`SessionSnapshot`** and **`sessionTypes.ts`** drifting apart.
- Mutating state without **`store.mutate`** or skipping snapshot broadcast.
- Host-only actions without **`isHostAuthorized`** / role checks.
- New phases without updating **`phase.ts`**.
