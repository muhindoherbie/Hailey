# Hailey 2.0 — Integrations

Hailey only reports a connection when one actually works. Every integration is read-only unless a write path goes through the approval queue (payload-bound, single-use, expiring).

| Integration | Status | What's needed |
|---|---|---|
| **GitHub** | ✅ Read-only: `github_repo_summary` tool (`server/services/github.ts`) | Nothing for public repos. `GITHUB_TOKEN` (fine-grained, read-only) for private ones. |
| **Calendar (read-only feed)** | ✅ Existing ICS feed of tasks | — |
| **Google Calendar** | ⏳ Interface defined below, not implemented | A Google Cloud OAuth client (ID, secret, redirect URL on your Hailey domain) |
| **Gmail** | ⏳ Interface defined below, not implemented | The same Google OAuth client with the Gmail scopes; Google verification for restricted scopes |
| **RxPOS** | ⏳ Interface defined below, not implemented | RxPOS API base URL, auth method and endpoint documentation |
| **Tutor Companion** | ⏳ Interface defined below, not implemented | The same as RxPOS |

## Connector contract (for future connectors)
Each connector lives in `server/services/<name>.ts` and is exposed to the agent only through typed tools in `server/tools/registry.ts`:
- **Read tools** use `risk: 'read'`. Their output is marked as untrusted third-party content, and the source is pushed to `ctx.sources`.
- **Write tools** use `risk: 'consequential'`. They are always queued for approval and can never be made automatic.
- **Credentials** live only in the server `.env` (or, for OAuth, in an encrypted per-user token table to be added with the first OAuth connector). They are never sent to the browser.
- **Failures** throw `ToolError` with a plain message. A connector never returns invented data.

## Google Calendar (planned)
- OAuth scopes: `calendar.readonly` by default, and `calendar.events` only after the user opts in to writes.
- Tools:
  - `calendar_list_events(from, to)` (read)
  - `calendar_free_busy(from, to)` (read)
  - `calendar_propose_event(title, start, end)` (consequential, so it needs approval before it is created)
  - `calendar_update_event(id, changes)` (consequential)
- Conflict detection: compare proposed events against `free_busy` and task due dates (reusing `tasks.workload`).
- Settings: connect, show sync status and last sync, revoke (deletes stored tokens and calls Google's revoke endpoint).

## Gmail (planned)
- Scopes: `gmail.readonly`, plus `gmail.compose` for drafts. Sending is never automatic.
- Tools:
  - `gmail_search(query)` (read; returns headers and snippets)
  - `gmail_read(id)` (read; untrusted content)
  - `gmail_create_draft(to, subject, body)` (consequential)
  - `gmail_send_draft(id)` (consequential)

## RxPOS (pharmacy business intelligence)
Hailey does not guess RxPOS endpoints. When the RxPOS API is documented, implement `server/services/rxpos.ts` against this interface:
```ts
interface RxPosConnector {
  salesSummary(range: { from: string; to: string }): Promise<{ total: number; currency: string; byDay: { date: string; total: number }[] }>;
  stockAlerts(): Promise<{ sku: string; name: string; onHand: number; reorderLevel: number; expiresOn?: string }[]>;
  topProducts(range: { from: string; to: string }, limit: number): Promise<{ sku: string; name: string; units: number; revenue: number }[]>;
}
```
Rules:
- Aggregate and product-level data only. No patient-identifiable data is requested or sent to AI providers.
- If a future endpoint could return patient data, it must be stripped server-side, and it must be processed only by a local model (local-only mode) unless the user explicitly authorises otherwise.

## Tutor Companion (academic productivity)
```ts
interface TutorCompanionConnector {
  upcomingClasses(range: { from: string; to: string }): Promise<{ id: string; course: string; start: string; end: string; room?: string }[]>;
  assignmentsDue(range: { from: string; to: string }): Promise<{ id: string; course: string; title: string; due: string; submitted: number; enrolled: number }[]>;
}
```
Rules: return aggregate counts only, never individual student records or grades, unless they are processed locally under the same safeguards as RxPOS.
