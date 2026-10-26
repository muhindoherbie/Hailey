# Hailey 2.0 — Upgrade audit

Audit of `main` at `a45d788`, made by reading the code and running the repo's own checks. Nothing here relies on README claims alone.

## Architecture (verified)
| Layer | Implementation |
|---|---|
| Client | React 19 + TypeScript + Vite PWA (`src/`), lazy-loaded pages, custom router, Workbox service worker (`src/sw.ts`) |
| Server | Node ≥22.18 + Hono (`server/`), runs TypeScript directly via type stripping |
| Database | `node:sqlite` with WAL, file migrations in `server/db/migrations`, FTS5 search index (`services/indexer.ts`) |
| AI | `ProviderRegistry` (`server/ai/providers.ts`) holding Anthropic and one OpenAI-compatible adapter (Ollama, LM Studio, Groq, OpenRouter…); agent loop in `server/ai/agent.ts` |
| Tools | ~40 typed Zod tools in `server/tools/registry.ts`, risk levels `read` / `reversible` / `consequential`, approval queue in `actions` table |
| Scheduling | `services/scheduler.ts`: 30 s tick for reminders (claim → send → backoff retry → fail notice) and routines |
| Packaging | Electron Windows installer (`desktop/`), Android TWA (`android/`), Docker + Caddy (`deploy/`), GitHub Actions `ci.yml`, `release.yml`, `android-check.yml` |

## Working features (verified by tests or code)
Accounts and sessions (scrypt, hashed tokens, CSRF header and Origin check, CSP), per-user isolation (`tests/isolation.test.ts`), chat with streaming and cancellation, provider errors with kinds, token usage and cost accounting, daily token limit, memories with proposed/active states, sensitivity detection, retention and provenance (`source`, `source_ref`), tasks with subtasks, recurrence, estimates and natural-language dates, reminders with push and retry, projects and workspaces, notes, knowledge uploads (PDF/DOCX/XLSX/CSV/MD/TXT with byte sniffing), PDF/Word/Excel/PowerPoint export, dashboard with customisable widgets and data-grounded briefing and suggestions, read-only ICS calendar feed, web research providers, backup and restore scripts.

## Defects found and fixed in this branch
1. **Time-dependent failures.** `GET /api/reminders`, stale-project suggestions and the ICS feed compared ISO timestamps with SQLite `datetime('now', …)`. That uses the real wall clock instead of the app clock, and a different string format (`T` vs space). Two scheduler tests began failing on their own once the date passed their fixtures by 7 days. **Fixed.**
2. **Silent cloud fallback.** If the selected local model (Ollama) was not configured, `resolve()` quietly fell back to the next provider, which could be a cloud provider. **Fixed:** this now raises a visible error, and a new local-only mode was added.
3. **Approval integrity.** Approvals were already owner-bound and single-use (atomic `pending → approved` update), but had no payload hash and no expiry. **Fixed** with migration `002`.

## Incomplete or missing versus the 2.0 brief
| Area | Status |
|---|---|
| Automatic complexity- and cost-based model routing | Not present. Only one provider per user, plus a fallback. Needs ≥2 configured providers to matter. |
| Monthly usage limits | Only a daily limit existed. **Added** in this branch. |
| Provider connection test or health endpoint | Not present. Configuration is reported, not liveness. |
| Evening review, scheduled briefings | Routines exist. A dedicated evening review is not present. |
| Task dependencies, deadline-conflict detection | Not present. |
| External calendar (Google/Outlook) OAuth, Gmail, GitHub connectors | Not present. No credentials are available in this environment, so they were not built (rule: never invent a connection). |
| Offline writes (IndexedDB queue, replay, conflicts) | Not present. Offline is read-only cache (`lib/cache`). |
| Semantic memory search | Not present. FTS5 only. No measurement yet justifies embeddings. |
| Windows tray/startup-on-login, Android notification UX | Not audited at runtime (no Windows or Android device here). |

## Risks
- **Security:** consequential tools are limited to deletions and approved exports. No shell or code execution exists. Prompt injection is mitigated by untrusted-content tagging plus approvals. `npm audit` runs in CI.
- **Performance:** the main bundle is 348 kB (111 kB gzip). Pages are already code-split.
- **Data:** a single SQLite file; backups are a script, not scheduled by default.

## Compatibility
All changes are additive. Migration `002` adds nullable columns. Settings gain `ai.localOnly` (default `false`), which is parsed with a default, so stored settings stay valid. No env vars were renamed or removed.

## Test baseline (before changes)
`npm run typecheck` ✅ · `npm run build` ✅ · `npm test` ❌ **105/107** (2 reminder-scheduler tests, defect 1 above).
