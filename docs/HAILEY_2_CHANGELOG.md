# Hailey 2.0 — Changelog

## Unreleased (branch `hailey-2-upgrade`)
- **Fix:** reminders list, ICS feed and stale-project suggestions used the SQLite wall clock and a mismatched timestamp format; they now use the app clock and ISO strings.
- **Security:** queued approvals are bound to a payload hash and expire after 7 days (migration `002_action_integrity.sql`, additive).
- **Privacy:** no silent fallback from a chosen local model to a cloud provider; new *Local-only mode* in Settings → AI.
- **Feature:** monthly (rolling 30-day) token limit in Settings → AI.
- **Feature:** AI provider connection test in Settings → AI.
- **Feature:** opt-in automatic model choice between local and cloud models; the reason is shown on each reply.
- **Feature:** richer evening review; routines record last run status and errors (migration `003`).
- **Feature:** task dependencies and workload/deadline-conflict warnings (migration `004`).
- **Feature:** offline editing of tasks and notes, with a sync queue, idempotent replay and conflict review (migration `005`).
- **Docs:** Hailey 2.0 audit, architecture, plan, security review and test results.
