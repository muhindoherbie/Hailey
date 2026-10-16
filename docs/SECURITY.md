# Security and privacy

This describes how Hailey protects your data and where its limits are. No review can guarantee complete security; treat this as a description of the measures in place, not a promise.

## Accounts and sessions
- Passwords are hashed with **scrypt** (random salt per password) and never stored or logged in plain text. Login errors are identical for unknown emails and wrong passwords, and a dummy hash is checked for unknown emails to avoid timing leaks.
- Sessions use a random 256-bit token in an **HttpOnly, SameSite=Lax** cookie (also `Secure` over HTTPS). Only a SHA-256 hash of the token is stored, so a copied database cannot be used to hijack sessions. Sessions expire after 30 days, logout deletes them server-side, and changing your password signs out every other device.
- Sign-up can be closed (`ALLOW_SIGNUP=false`) and is capped by `MAX_USERS`.

## Authorisation and data isolation
- Every private API route requires a session. Every query on private data filters by the signed-in user's id; reading, changing or deleting another user's record returns *not found*. Cross-user references (e.g. putting your task in someone else's project) are rejected. Search, exports and tools are scoped the same way. These rules are covered by automated tests (`tests/isolation.test.ts`).
- Workspaces are for organisation only — they are not a security boundary.

## Request protections
- **CSRF:** state-changing requests must carry a custom `X-Hailey` header (which browsers will not send cross-site without CORS, and Hailey grants no CORS), and any `Origin` header must match the server.
- **Security headers:** strict Content-Security-Policy (`script-src 'self'`, no frames, no plugins), `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy, and HSTS in production.
- **Rate limits:** sign-in/sign-up (20 per 15 minutes per IP), chat (20 per minute per user), uploads, research and an overall API limit.
- **Input validation:** all inputs are validated with zod schemas and size limits; JSON bodies are capped at 2 MB and uploads at `MAX_UPLOAD_MB`.
- **Errors:** clients get short, safe messages; stack traces and internals are only logged on the server.

## Files
- Only PDF, DOCX, TXT, MD, CSV and XLSX are accepted, and the file's actual bytes must match its extension (e.g. a renamed `.exe` is rejected). File names are sanitised. Files are stored outside the web root, named by random id.
- Downloads are always sent as attachments with `application/octet-stream`, so uploaded content is never rendered by the browser.
- Spreadsheets are read as values only: **formulas are never evaluated and macros are never run**. Exported CSV/XLSX cells that start with `=`, `+`, `-` or `@` are prefixed to prevent spreadsheet formula injection.
- Hailey never executes uploaded code or model-generated code or shell commands.

## The AI agent
- Hailey acts only through a fixed registry of narrow, typed tools; there is no general computer, file-system, shell or browser access.
- Every tool call is validated against its schema on the server before running. Tools run as the signed-in user and cannot reach other users' data.
- **Consequential actions (deletions) are always queued** and run only after you approve them in the app, exactly once. You can switch any tool to *Ask me first* or *Off*; settings refuse to make consequential tools automatic.
- Routines only produce summaries and notifications; they do not take actions.
- Content from documents, web pages and search results is marked as untrusted, and the model is instructed not to follow instructions found inside it. This reduces, but cannot fully eliminate, prompt-injection risk — which is why consequential actions still require your approval.
- The action history records what each action did (summary, tool, result status), not the full conversation.
- Chat Markdown is sanitised with DOMPurify; images, forms, frames and inline styles are stripped, and links open with `noopener noreferrer`.

## Secrets
- API keys and VAPID keys live only in the server's `.env` file (git-ignored) and environment. They are never sent to the browser, included in the client bundle, or returned by any API.
- The calendar feed uses a random token; only its hash is stored, and you can revoke or rotate it.

## What leaves your server
- **AI provider:** the conversation, retrieved memories and the text of attached documents are sent to the AI provider you configure. With a local model (Ollama) nothing leaves your machine.
- **Web search:** your research query goes to SearXNG (and from there to search engines) or to Brave.
- **Push notifications:** notification text passes through the browser vendor's push service, encrypted end-to-end per the Web Push standard.
- **Voice input:** processed by your browser's speech service.

## Retention and deletion
- Deleting a task, note, document, conversation or memory removes it from the database and the search index; deleted documents' files are removed from disk.
- Memories can have a retention period and are deleted automatically when they expire.
- *Delete account* removes the user row and, through cascading deletes, every record, plus the user's upload and export folders.
- Backups you made earlier still contain deleted data — delete old backups if that matters.
- The offline cache on each device is cleared when you sign out.

## Dependencies
- `npm audit` runs in CI and fails on high-severity production issues. Known remaining advisory at the time of writing: `sprintf-js` (moderate) via `mammoth`'s command-line argument parser. Hailey only calls `mammoth.extractRawText` and never runs mammoth's CLI, so the vulnerable code path is not reachable. `uuid` and `image-size` are pinned to patched versions via `overrides`.

## Your responsibilities when hosting
- Serve Hailey over HTTPS (Tailscale, Cloudflare Tunnel, or a reverse proxy) — never expose plain HTTP to the internet.
- Close sign-ups after creating your account, use a strong unique password, keep Node and dependencies updated, and keep off-machine backups.
