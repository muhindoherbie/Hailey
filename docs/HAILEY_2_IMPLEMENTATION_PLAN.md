# Hailey 2.0 — Implementation plan

Ordered by value ÷ risk. Each step is a separate reviewable commit, and runs `npm run check` before and after.

## Done in this branch
- [x] Phase 0: audit and test baseline (`HAILEY_2_UPGRADE_AUDIT.md`)
- [x] Fix the wall-clock and time-format bugs that broke reminders, the ICS feed and stale-project suggestions
- [x] Phase 10: bind approvals to the user, tool and arguments with a SHA-256 payload hash; 7-day expiry; tamper and expiry tests
- [x] Phase 1.1: privacy-safe routing. No silent local→cloud fallback; local-only mode in Settings → AI; routing tests
- [x] Phase 1.2: rolling 30-day (monthly) token limit in Settings → AI, enforced before each turn

## Next (highest value, no new credentials needed)
1. **Provider health check:** `POST /api/ai/test` performs a 1-token call per provider and shows latency and errors in Settings → AI.
2. **Evening review routine:** reuse `buildOverview` and the routine scheduler. Completed vs unfinished tasks come from real rows only.
3. **Task dependencies:** additive `task_dependencies` table and a blocked-by badge. Deadline-conflict warning when the summed estimates for a day exceed working hours.
4. **Offline write queue (Phase 8):** IndexedDB op log with client `op_id` and `If-Match: updated_at` version checks. The server dedupes on `op_id` and returns 409 on version mismatch. Tasks and notes come first, and replays go through the same auth and approval paths.
5. **Rule-based routing:** route by tool need, context size and local-only. Only useful once two providers are configured.

## Needs your input or credentials
- Google Calendar, Gmail, GitHub connectors: OAuth client IDs and secrets, plus a decision on hosting the redirect URL.
- RxPOS and Tutor Companion: document their APIs before writing interface stubs.
- Windows tray and startup-on-login: needs testing on a Windows machine.
- UI palette refresh (Phase 7): confirm whether to replace the current brand colours or add the navy/teal theme as an option.
