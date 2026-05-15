# Session artifact templates (`.cursor/session/`)

Keep each file short. Replace `{…}` placeholders.

## `feature-context.md`

```markdown
# Feature context

## Goal
- …

## Requirements
- REQ-…: …
- (If relevant) Architecture / plugin sections: … (`requirements/architecture.md`, `requirements/plugin.md`)

## Scope
- Backend / frontend / both
- Plugins involved (if any)

## Constraints
- …

## Open questions
- …
```

## `backend.md`

```markdown
# Backend implementation

## Summary
- …

## Files touched
- `backend/src/…` — …

## Protocol / snapshot
- WS types: …
- Snapshot changes: …
- `sessionTypes.ts` updated: yes / no

## REQ coverage
- REQ-…: …

## Verification
- Command: `…`
- Result: …
```

## `frontend.md`

```markdown
# Frontend implementation

## Summary
- …

## Files touched
- `frontend/src/…` — …

## UX / routing
- …

## REQ coverage
- REQ-…: …

## Verification
- Command: `…`
- Result: …
```

## `review.md`

```markdown
# Code review

## Status: PASS | FAIL

## Summary
- Risk: Low | Medium | High
- Blocking issues: N

## Blocking issues
| # | File | Finding | Suggested fix |
|---|------|---------|---------------|
| 1 | … | … | … |

## Non-blocking notes
- …

## REQ checklist
| REQ | Met | Notes |
|-----|-----|-------|
| REQ-… | Yes / No | … |
```
