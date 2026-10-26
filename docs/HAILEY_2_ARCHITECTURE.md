# Hailey 2.0 — Architecture notes

Hailey 2.0 keeps the 1.x architecture (React PWA, Hono, `node:sqlite`, provider registry, typed tool registry). This file records only what 2.0 adds.

## AI routing
`ProviderRegistry.resolve(settings.ai)` picks a provider in this order: the user's choice, then `DEFAULT_PROVIDER`, then any configured provider. Two rules apply:
- If `ai.localOnly` is set, only providers with `capabilities.local` are eligible.
- If the user chose a local provider and it is unavailable, the registry behaves as local-only. It never falls back to the cloud silently.

When nothing is eligible, a `ProviderError('unavailable')` names the permitted alternatives, and the chat UI shows it.

## Approval integrity
Each queued action (`actions.status = 'pending'`) stores:
- `payload_hash = sha256(userId \n tool \n validatedInputJson)`
- `expires_at = now + 7 days`

`approveAction` performs, in order:
1. An atomic owner-scoped `pending → approved` claim (single use).
2. An expiry check: past expiry, the action is cancelled and the API returns 410.
3. A hash check: on mismatch, the action fails and the API returns 409.
4. Re-validation of the input against the tool's schema.
5. Execution, with the result recorded on the row.

Rows created before migration 002 have NULL in both columns and are honoured as before.

## Automatic routing (opt-in)
`ProviderRegistry.route(settings.ai, signals)` runs only when `ai.autoRoute` is on, local-only mode is off, and both a tool-capable local provider and a cloud provider are configured. Otherwise it returns `resolve()` unchanged. The rules, in order:
1. A sensitive message (the memory sensitivity detector) goes to the local model.
2. History over 40k characters goes to the cloud model.
3. Attachments go to the cloud model.
4. A message over 600 characters, or with complex-task keywords, goes to the cloud model.
5. Anything else goes to the local model.

The reason is stored in the assistant message's `meta.route`.

## Offline writes
- **Client** (`src/lib/sync.ts`): `writeOrQueue()` sends a write with a fresh `X-Op-Id`. On a network failure it stores `{op id, user, method, path, body, entity, base updated_at}` in IndexedDB (`hailey-cache` v2, store `queue`). `syncQueue()` replays the queue in order on `online`, at startup and every 30 s. After a successful edit, later queued edits of the same record take the new `updated_at` as their base.
- **Server** (`offlineReplay` middleware, after auth and CSRF): `client_ops (user_id, op_id)` makes each op run at most once and replays the stored 2xx response. `X-Base-Version` on PATCH of tasks, notes or projects returns `409 version_conflict` with the current row when it is stale. Failed writes are not recorded. Rows older than 30 days are pruned.
- **Scope:** tasks (create, edit, complete, reopen) and notes (edit). Deletions, uploads and anything involving the AI or approvals stay online-only.
- **Limitation:** versions are `updated_at` timestamps with millisecond resolution. Two writes to the same record in the same millisecond would not be told apart.

## Dependencies and workload
`task_dependencies(task_id, depends_on_id, user_id)` is owner-scoped and cascades on delete. Adding a dependency walks the graph to refuse cycles. `GET /api/tasks/workload?days=&capacity=` sums open-task estimates per local day and lists tasks due before an open task they depend on.

## Routines
`routines.last_run_at`, `last_status` and `last_error` record each run. Each routine runs in its own try/catch, and a failure creates an in-app `action_failed` notification.
