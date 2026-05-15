# Implementation discipline

## Iron law

```
NO CODE WITHOUT UNDERSTANDING EXISTING PATTERNS FIRST
```

## Before writing code

1. **Read** the relevant existing modules (handlers, store, phase table, `useSessionWs`, target page).
2. Read **`.cursor/project-instructions.md`** and, for backend, **`.cursor/rules/backend.mdc`**.
3. Read **`requirements/requirements.md`** for **REQ-*** you implement or verify.
4. When reasoning about **session service design** (transport, authority, phase spine), use **`requirements/architecture.md`**.
5. When changing **plugins**, **segment phases**, **`segmentState`**, registry, or plugin hosts, read **`requirements/plugin.md`** and cross-check **`requirements/requirements.md`** (e.g. REQ-15).

## While implementing

- Prefer **small, verifiable edits** over large refactors unrelated to the task.
- Keep **session snapshot shape** consistent across **backend** and **`frontend/src/sessionTypes.ts`**.
- Extend the **phase FSM** (`phase.ts`) when adding transitions; do not bypass **`canTransition`**.

## Red flags — stop

- Changing snapshot types in one package only.
- Host-only paths without **`isHostAuthorized`** / role checks.
- New **`phase`** values without **`Phase` union**, **`phaseKey` / `parsePhase`**, and **`ALLOWED`** updates.
