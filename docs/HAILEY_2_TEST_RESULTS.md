# Hailey 2.0 — Test results

Environment: Linux, Node v22.22.0, `npm ci` from the lockfile. Every result below was produced by running the command.

| Point | `typecheck` | `build` | `npm test` |
|---|---|---|---|
| Baseline (`main` `a45d788`) | ✅ | ✅ | ❌ 105/107: 2 reminder-scheduler tests (wall-clock bug) |
| After clock fix | ✅ | — | ✅ 107/107 |
| After approval integrity | ✅ | — | ✅ 109/109 (+2: tampered payload → 409, expired → 410) |
| After local-only routing | ✅ | — | ✅ 113/113 (+4: `tests/routing.test.ts`) |
| After monthly limit (`npm run check`) | ✅ | ✅ main bundle 347.69 kB / 111.01 kB gzip (unchanged) | ✅ 114/114 |

Not run here: the Electron installer build, the Android APK build, browser end-to-end tests, and `npm audit` against the live advisory DB. CI covers the audit on push.
