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
