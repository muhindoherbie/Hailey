# Hailey 2.0 — Changelog

## Unreleased (branch `hailey-2-upgrade`)
- **Fix:** reminders list, ICS feed and stale-project suggestions used the SQLite wall clock and a mismatched timestamp format; they now use the app clock and ISO strings.
- **Security:** queued approvals are bound to a payload hash and expire after 7 days (migration `002_action_integrity.sql`, additive).
- **Privacy:** no silent fallback from a chosen local model to a cloud provider; new *Local-only mode* in Settings → AI.
- **Feature:** monthly (rolling 30-day) token limit in Settings → AI.
- **Docs:** Hailey 2.0 audit, architecture, plan, security review and test results.
