# Adept-Game — Agent workflow (Cursor IDE)

This repo uses **custom subagents** under [`.cursor/agents/`](.cursor/agents/) so the Agent can delegate with isolated context. Session scratch artifacts live in **`.cursor/session/`** (see [`.cursor/docs/session-artifact-templates.md`](.cursor/docs/session-artifact-templates.md) for shapes).

## How to run the pipeline locally

1. Open **Cursor Agent**.
2. Start with **`/orchestrator`** and your goal (and REQ ids if applicable).
3. The orchestrator creates **`.cursor/session/feature-context.md`**, then delegates **`/backend-developer`**, **`/frontend-developer`**, and **`/code-reviewer`** in order.
4. Single-stage runs: **`/backend-developer`**, **`/frontend-developer`**, **`/code-reviewer`**.

## Where instructions live

| Use | Location |
| --- | --- |
| Stack + requirements index | [`.cursor/project-instructions.md`](.cursor/project-instructions.md) (includes **`requirements/architecture.md`**, **`plugin.md`**, **`vision.md`**) |
| Backend invariants | [`.cursor/rules/backend.mdc`](.cursor/rules/backend.mdc) |
| Frontend patterns | [`.cursor/rules/frontend.mdc`](.cursor/rules/frontend.mdc) |
| Discipline / verify / debug | [`.cursor/instructions/`](.cursor/instructions/) |
| Session file templates | [`.cursor/docs/session-artifact-templates.md`](.cursor/docs/session-artifact-templates.md) |

Subagents in **`.cursor/agents/`** are what Cursor loads for **`/name`** routing.