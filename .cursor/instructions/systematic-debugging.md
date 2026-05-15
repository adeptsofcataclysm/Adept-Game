# Systematic debugging

## Iron law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

## Phase 1 — Classify

- **Compile error** — full `tsc` / Vite error first.
- **WebSocket** — trace **`type`** / **`payload`**; confirm server validates and client matches.
- **State desync** — **`SessionSnapshot`** vs **`sessionTypes.ts`** vs UI assumptions.
- **Phase** — **`canTransition`** and **`ALLOWED`**; host auth and role.

## Phase 2 — Minimal change

- One hypothesis; smallest diff that tests it.

## Phase 3 — Verify

- Run **`npm run build`** (or workspace build) after TS-affecting fixes.
- For protocol bugs, describe end-to-end validation.

## Red flags

- Changing both backend and frontend snapshots without proving which side was wrong.
- Phase branches that skip **`applyHostTransition`**.
