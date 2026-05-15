# Verification before completion

## Iron law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you did not run the proof command **in this session**, you cannot claim success.

## Gate

1. **Identify** the command that proves your claim.
2. **Run** it from the repo root (or the documented workspace) in this session.
3. **Read** exit code and errors; fix failures before claiming done.
4. **Then** state the claim and cite the command and outcome.

## Commands for this repo

| Claim | Command | Check |
| --- | --- | --- |
| Full build | `npm run build` | Exit code 0 |
| Backend compiles | `npm run build --workspace=backend` | Exit code 0 |
| Frontend builds | `npm run build --workspace=frontend` | Exit code 0 |

For runtime-only behavior, state what you verified manually; still run **`npm run build`** when TS or bundling may be affected.

## Red flags

- "Should work", "done" without a fresh build when code changed.
- Citing output you did not just produce in this turn.
