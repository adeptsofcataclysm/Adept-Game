# Adept-Game

Greenfield **Node session service** + **Vite React SPA** for the Adepts-style show, aligned with:

- `requirements/vision.md`
- `requirements/requirements.md`
- `requirements/architecture.md`

No code is copied from other repositories.

## Quiz content (JSON)

Themes and questions for **rounds 1–3** load from `backend/data/round-1.json` … `round-3.json` at session startup (see `backend/src/quizData.ts`). The initial files were taken from the legacy defaults under `Node-Script/artifacts/api-server/src/lib/default-adepts-quiz-board-*.json`.

**`round-4.json`** is loaded into every session as **`finalTransitionBoard`**: it is the board data for the **transition to Final** and **Final** phases (`between_final`, `final`, REQ-13). The SPA shows this board instead of a main-round grid while those phases are active.

The session service allows **multiple Wheel and Roulette mini-games per main round** (same phase edges `round` ↔ `mini_wheel` / `mini_roulette` repeated). Snapshots expose **`miniWheelPlaysByRound`** and **`miniRoulettePlaysByRound`** (counts per rounds 1–3).

## Prerequisites

- Node.js **22** (or current LTS)
- npm **10+**

## Install

```bash
cd Adept-Game
npm install
```

## Run (two terminals)

### 1. Session service (WebSocket + minimal HTTP health)**

```bash
cd Adept-Game
npm run dev:backend
```

Optional: `set ADEPT_HOST_SECRET=your-secret` (Windows) before starting so Host joins must send the same secret.

### 2. SPA (Vite)**

```bash
cd Adept-Game
npm run dev:frontend
```

Open the URL Vite prints (default `http://127.0.0.1:5173`).

Optional: create `frontend/.env.local`:

```bash
VITE_WS_URL=ws://127.0.0.1:3847
```

## Routes (REQ-14, ADR-3)

| Path | Purpose |
| --- | --- |
| `/` | Name entry (viewer onboarding → Spectator) |
| `/show` | Main room: chat (left), board preview, phase, Spectator picks / donations when active |
| `/admin` | Host: phase transitions, score ±100, opening-show helpers |

Add `?showId=myshow` to `/show` or `/admin` to separate logical rooms (default `default`).

## Build

```bash
npm run build
```

Compiles the backend to `backend/dist/` and the frontend to `frontend/dist/`. Start compiled backend with `npm run start --workspace=backend` after `npm run build --workspace=backend`.
