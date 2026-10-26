# Hailey 2.0 — Test results

Environment: Linux, Node v22.22.0, `npm ci` from the lockfile. Every result below was produced by running the command.

| Point | `typecheck` | `build` | `npm test` |
|---|---|---|---|
| Baseline (`main` `a45d788`) | ✅ | ✅ | ❌ 105/107: 2 reminder-scheduler tests (wall-clock bug) |
| After clock fix | ✅ | — | ✅ 107/107 |
| After approval integrity | ✅ | — | ✅ 109/109 (+2: tampered payload → 409, expired → 410) |
| After local-only routing | ✅ | — | ✅ 113/113 (+4: `tests/routing.test.ts`) |
| After monthly limit (`npm run check`) | ✅ | ✅ main bundle 347.69 kB / 111.01 kB gzip (unchanged) | ✅ 114/114 |
| After connection test | ✅ | — | ✅ 116/116 |
| After evening review / routine failures | ✅ | — | ✅ 118/118 |
| After dependencies / workload (`npm run check`) | ✅ | ✅ | ✅ 120/120 |
| After offline sync (`npm run check`) | ✅ | ✅ main bundle 351.98 kB / 112.39 kB gzip (+1.4 kB gzip) | ✅ 126/126 (`tests/offline-sync.test.ts`: duplicate replay, per-user op ids, version conflict, retry after failure, CSRF and auth still enforced) |
| After auto-routing (`npm run check`) | ✅ | ✅ | ✅ 129/129 |

**Browser end-to-end test (Playwright + Chromium against the production build):** sign up, open Tasks, go offline, add a task. The "Waiting to sync 1 change" banner appeared, and the server was unreachable. After going back online the banner cleared, and the server held exactly one task, "Count stock offline". The script is in this session's scratchpad and is not committed.

Not run here: the Electron installer build, the Android APK build, other browser end-to-end journeys, and `npm audit` against the live advisory DB. CI covers the audit on push.
