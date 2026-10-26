# Hailey 2.0 — Security review

The baseline controls are documented in `docs/SECURITY.md` and were verified in code: scrypt, hashed session tokens, the CSRF header and Origin check, CSP, rate limits, Zod validation, upload byte sniffing, per-user query scoping with isolation tests, and the absence of any shell or code execution.

## Changes in 2.0
| Control | Before | After |
|---|---|---|
| Approval bound to exact arguments | Stored input was re-validated, but not integrity-checked | SHA-256 payload hash checked at approval (409 on mismatch) |
| Approval expiry | None | 7 days (410, then cancelled) |
| Cloud egress when a local model is chosen | Silent fallback to a cloud provider possible | Blocked with an explicit error; optional local-only mode |
| Auto-routing | — | Opt-in; sensitive messages are kept local; local-only mode overrides it |
| Offline replay | — | Replays use the same session, CSRF, Zod validation and owner scoping; op ids are per user; queued ops are tagged with the user and only replayed for that user; deletions and AI actions are never queued; the queue is cleared on sign-out |
| Routine failures | Silent, and could skip other users' routines | Recorded per routine and notified |
| Connection test | — | Sends a fixed prompt with no user data; rate-limited (6/min) |

## Remaining risks
- Prompt injection: mitigated, not eliminated. Approvals stay the backstop.
- `npm audit` was not run here against the live advisory DB. CI runs it on push.
- There is no at-rest encryption of the SQLite file. This relies on OS and disk protections; backups should go to encrypted storage.
