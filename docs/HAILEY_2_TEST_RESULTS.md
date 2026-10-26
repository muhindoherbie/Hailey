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
| After GitHub connector / workload tool | ✅ | — | ✅ 134/134 (`tests/integrations.test.ts`) |
| After Midnight palette (`npm run check`) | ✅ | ✅ main bundle 352.09 kB / 112.41 kB gzip, CSS 34.74 kB / 11.42 kB gzip | ✅ 134/134 |

**Other checks run:**
- **Desktop bundle:** `node scripts/bundle-server.mjs`, then the bundled `server.mjs` was started the way the Electron smoke test does. Results: health ok, page 200, signup 201, idempotent task create 201, workload 200. Migrations 001–005 applied.
- **Upgrade from 1.0:** a database created with only `001_init.sql` and holding a task, a pending action and a routine was reopened with the 2.0 code. Migrations 002–005 applied, the data was kept, the legacy pending action has NULL hash and expiry (still approvable), and the new tables exist.
- **Midnight palette screenshots** (desktop dark, desktop light, 390 px mobile) were reviewed. Contrast measured: secondary text 6.45:1, tertiary 5.16:1, brand button 5.84:1 (dark), 5.47:1 (light).
- **Release notes step** from `release.yml` was run locally in bash, and `release.yml` parsed as YAML.

**Browser end-to-end test (Playwright + Chromium against the production build):** sign up, open Tasks, go offline, add a task. The "Waiting to sync 1 change" banner appeared, and the server was unreachable. After going back online the banner cleared, and the server held exactly one task, "Count stock offline". The script is in this session's scratchpad and is not committed.

Not run here: the Electron installer build and its smoke test under Electron (Windows-only), the Android APK build, other browser end-to-end journeys, and `npm audit` against the live advisory DB. CI covers the audit on push.
