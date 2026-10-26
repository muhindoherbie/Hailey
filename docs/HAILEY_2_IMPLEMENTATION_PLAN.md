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

## Next (no new credentials needed)
1. GitHub read-only connector for public repos (optional `GITHUB_TOKEN` for private ones): repository summary, open issues and PRs, recent releases, exposed as read tools.
2. Offline project updates (the server already supports versioned PATCH on projects).
3. "Continue with Hailey" on projects: start a chat seeded with the project's tasks, notes and memories.
4. A `check_workload` read tool so the assistant can use the workload and dependency data.

## Needs your input or credentials
- Google Calendar, Gmail, GitHub connectors: OAuth client IDs and secrets, plus a decision on hosting the redirect URL.
- RxPOS and Tutor Companion: document their APIs before writing interface stubs.
- Windows tray and startup-on-login: needs testing on a Windows machine.
- UI palette refresh (Phase 7): confirm whether to replace the current brand colours or add the navy/teal theme as an option.
