# Hailey 2.0 — Implementation plan

Ordered by value ÷ risk. Each step is a separate reviewable commit, and runs `npm run check` before and after.

## Done in this branch
- [x] Phase 0: audit and test baseline (`HAILEY_2_UPGRADE_AUDIT.md`)
- [x] Fix the wall-clock and time-format bugs that broke reminders, the ICS feed and stale-project suggestions
- [x] Phase 10: bind approvals to the user, tool and arguments with a SHA-256 payload hash; 7-day expiry; tamper and expiry tests
- [x] Phase 1.1: privacy-safe routing. No silent local→cloud fallback; local-only mode in Settings → AI; routing tests
- [x] Phase 1.2: rolling 30-day (monthly) token limit in Settings → AI, enforced before each turn
- [x] Phase 1.2: provider connection test (`POST /api/ai/test`), showing latency and errors in Settings → AI
- [x] Phase 1.1: opt-in automatic model choice (local for sensitive and everyday turns, cloud for complex work), with the reason shown per reply
- [x] Phase 3/4: richer evening review (completed, still open, project progress, tomorrow's priorities); routine runs record `last_status`/`last_error`, and one failure no longer stops other routines
- [x] Phase 4: task dependencies (cycle-checked) and a workload view (`/api/tasks/workload`) flagging overloaded days and tasks due before what they depend on
- [x] Phase 8: offline task creation, task edits and completion, and note edits. Uses an IndexedDB queue, op-id idempotency, version checks with 409 conflicts, and a conflict review UI

- [x] Phase 5: "Continue with Hailey" on projects (already present in 1.x; verified)
- [x] Phase 6: read-only GitHub connector (`github_repo_summary`), `check_workload` tool, and documented interfaces for Google Calendar, Gmail, RxPOS and Tutor Companion (`HAILEY_2_INTEGRATIONS.md`)
- [x] Phase 7: optional Midnight palette (navy, emerald, cyan) in light and dark, meeting WCAG AA text contrast; Classic stays the default
- [x] Phase 8: offline project edits
- [x] Release prep: version 2.0.0, `docs/release-notes/v2.0.0.md` appended to the GitHub Release notes by `release.yml`

## Release steps (owner)
1. Merge the `hailey-2-upgrade` PR into `main` once CI is green.
2. Back up the live server (`npm run backup`), then update it. Migrations 002–005 run automatically on start.
3. Tag and push: `git tag v2.0.0 && git push origin v2.0.0`. `release.yml` builds and signs the Windows installer and the Android APK and publishes the release. It uses the existing `HAILEY_WIN_CERT_*` and Android signing secrets, so the signing identities are unchanged.

**Rollback:** reinstall 1.0.0. The 2.0 migrations only add columns and tables, which 1.0 ignores, so data stays readable. Restore the backup only if something else went wrong.

## Needs your input or credentials
- Google Calendar, Gmail, GitHub connectors: OAuth client IDs and secrets, plus a decision on hosting the redirect URL.
- RxPOS and Tutor Companion: document their APIs before writing interface stubs.
- Windows tray and startup-on-login: needs testing on a Windows machine.
- Whether Midnight should become the default palette (currently optional).
