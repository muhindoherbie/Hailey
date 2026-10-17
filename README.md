# Hailey

**Your personal AI assistant, companion and productivity agent.**
Hailey helps you think clearly, remember what matters, organise your responsibilities, learn continuously, manage your projects and get everyday work done — through one assistant that runs on a server you control.

It is an installable web app (PWA) for Windows and Android browsers, backed by a small Node.js server that keeps your data in one SQLite file.

---

## What Hailey can do

| Area | What works |
|---|---|
| **Home** | Greeting, local date/time, AI prompt with voice input, today's and overdue tasks, upcoming deadlines and reminders, active projects, quick actions, recent chats and work, a daily briefing and suggestions built **only from your saved data**. Widgets can be hidden and reordered. |
| **Chat** | Streaming replies with Markdown, code and tables; persistent history; search, rename, archive, delete; cancel and retry; file attachments; copy, read aloud, save as note; export chats to Markdown, Word or PDF; summarise a chat into memory. Shows which AI model is active. |
| **Tool-using agent** | 30 typed, validated tools: tasks, reminders, notes, projects and plans, memory, knowledge search, document reading, spreadsheet analysis, web research, file exports. Every action is logged. **Deletions always wait for your approval**; you can set any tool to *Allowed*, *Ask me first* or *Off*. |
| **Memory** | Long-term memory kept separate from chat history. Sensitive or inferred memories wait for your approval. View, edit, export, delete, clear by category, retention period, and a per-answer "used these memories" note. |
| **Tasks** | Priorities, due dates, subtasks, tags, categories, projects, recurrence, estimates, history; Today / Upcoming / Overdue / No date / Completed / Calendar views; natural-language quick add ("remind me tomorrow morning…") that **shows how it read the date and asks you to confirm**; carry overdue tasks forward. |
| **Reminders** | Scheduled on the server and delivered by web push even when the app is closed; quiet hours; retries; in-app notification centre. Morning briefing and evening review routines. |
| **Projects & workspaces** | Five starter workspaces (Personal, Pharmacy & business, Education & research, Software, General); projects with goals, milestones, decisions, risks, blockers, tasks, notes, documents, activity and progress; "Continue with Hailey" resumes a project with its context. |
| **Knowledge centre** | Markdown notes with folders, tags, pinning and links to tasks/projects/documents; uploads of **PDF (text-based), DOCX, TXT, MD, CSV, XLSX**; full-text search with page/section references; AI summaries and key points. |
| **Data analysis** | CSV/XLSX profiling: totals, means, medians, missing values, rankings, monthly trends, outliers, charts; downloadable reports (Word, PDF, Excel, Markdown). Calculations are done by code, and the method is explained. |
| **Research** | Live web search through SearXNG (free, self-hosted) or Brave Search, with numbered citations, a sources list, conflicts and gaps called out, follow-up questions, and "save as research note". It says plainly when search is not configured. |
| **Exports** | Real files generated from content: DOCX, PDF, XLSX, PPTX, CSV, Markdown. |
| **Voice** | Push-to-talk speech input and read-aloud replies, with a clear recording indicator; falls back to typing. |
| **Settings** | Profile and assistant style, AI provider/model/effort, usage and estimated costs, daily token limit, memory, permissions, notifications and routines, theme and text size, time zone and date format, voice, calendar feed, data export, signed-in devices, password, account deletion. |
| **Offline** | The app shell opens offline; notes, tasks, projects and the dashboard you have opened are readable offline (read-only). The app clearly says what needs a connection. |

### Honest limitations
- AI chat, research, sync and reminders need the server and an internet connection. Offline mode is read-only.
- Scanned PDFs (images) are not supported — there is no OCR. Old `.doc`/`.xls` files are not supported.
- Hailey cannot send email or messages, or edit Google/Outlook calendars. It offers a **read-only calendar feed** of your tasks instead.
- Push notifications on Windows arrive only while the browser is allowed to run in the background. On Android, install Hailey to the home screen for the most reliable delivery.
- Voice input uses your browser's speech service (Google in Chrome, Microsoft in Edge), so audio is processed by that company.

---

## Quick start on Windows (about 10 minutes)

You need **Node.js 24 or newer** — download the LTS installer from <https://nodejs.org> and keep the default options.

Open **PowerShell** in the folder where you want Hailey and run:

```bash
git clone https://github.com/muhindoherbie/hailey.git
```

```bash
cd hailey
```

```bash
npm install
```

```bash
npm run setup
```

`npm run setup` creates your private `.env` file and generates push-notification keys. Now connect an AI model (next section), then:

```bash
npm run build
```

```bash
npm start
```

Open <http://localhost:8787>, create your account, then set `ALLOW_SIGNUP=false` in `.env` and restart so nobody else can sign up.

> Everything except AI chat works without an AI model: tasks, reminders, notes, projects, documents, spreadsheet analysis and memory.

---

## Connect an AI model

Edit `.env` (in Notepad) and fill in **one** of the options below, then restart Hailey. **Keys stay on the server** — they are never sent to the browser, and `.env` is excluded from Git. Never paste keys into code, chats or GitHub.

### Option A — Claude (best quality, pay per use)
1. Create an account at <https://console.anthropic.com>, add credit, and **set a monthly spend limit** under *Limits*.
2. Create an API key and put it in `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-opus-5-5
   ```
3. In Hailey → Settings → AI you can switch between **Haiku** (cheapest), **Sonnet** and **Opus** (most capable) at any time, and set the thinking effort.

### Option B — Free local model with Ollama (private, no per-use cost)
1. Install Ollama from <https://ollama.com> and download a model, for example:
   ```bash
   ollama pull qwen3:8b
   ```
2. In `.env`:
   ```
   OPENAI_COMPAT_BASE_URL=http://localhost:11434/v1
   OPENAI_COMPAT_MODEL=qwen3:8b
   OPENAI_COMPAT_LABEL=Local model (Ollama)
   ```
3. **Give the model a big enough context window (important).** Hailey's instructions and tools take about 5,000 tokens, but Ollama defaults to 4,096 on PCs without a large GPU — the start of the prompt would be cut off and tools would misbehave. Set it once in PowerShell, then quit Ollama from the system tray and start it again:
   ```bash
   setx OLLAMA_CONTEXT_LENGTH 16384
   ```
   (Or use the context-length slider in the Ollama app's settings.) More context uses more RAM: 16K suits a 4B model on a 16 GB laptop.
4. **On a laptop without a strong GPU,** choose a small *non-thinking* model. Tested on an i7-1255U laptop with 16 GB RAM and no dedicated GPU:
   ```
   OPENAI_COMPAT_MODEL=qwen3:4b-instruct
   OPENAI_COMPAT_TOOLSET=core
   ```
   - `qwen3:4b` (the "thinking" version) took over a minute per reply and could not turn thinking off — prefer `qwen3:4b-instruct`. For thinking models that support it, `OPENAI_COMPAT_REASONING_EFFORT=none` turns thinking off.
   - Keep the model loaded between messages so its prompt cache survives: `setx OLLAMA_KEEP_ALIVE 30m`, then restart Ollama. The first message after loading took about 2 minutes; later replies started in roughly 4–30 seconds.
   - `OPENAI_COMPAT_TOOLSET=core` sends 13 everyday tools instead of all 30, roughly halving the prompt.

   **What to expect from a 4B model:** fine for conversation, questions and simple reminders, but unreliable at actions — in testing it sometimes skipped saving a memory, guessed ids, or claimed it had scheduled something it hadn't. Hailey checks for this: a reply that claims an action no tool performed gets a visible *"Not actually saved"* warning, and an explicit "remember that…" request that wasn't saved says so. For dependable task, reminder and memory handling, use Claude (Haiku 5.5 costs about US$1–2/month for typical personal use) or a larger local model on a PC with a capable GPU.

   Hardware: an 8B model needs about 8 GB of free RAM (16 GB total recommended) and runs much faster with a recent GPU. Smaller models (e.g. 3–4B) work on modest PCs but are weaker at using tools; if tool calls fail, set `OPENAI_COMPAT_TOOLS=false` for plain chat. Check what is loaded and its context size with `ollama ps`.

### Option C — Other OpenAI-compatible services
Groq, OpenRouter, Google Gemini's OpenAI-compatible endpoint and similar services work with the same three `OPENAI_COMPAT_*` settings. Many have free tiers with rate limits; check each provider's current terms.

---

## Web research (optional)
- **SearXNG (free, self-hosted):** with Docker installed, run `docker compose --profile search up -d` and set `SEARXNG_URL=http://searxng:8080` (or `http://localhost:8888` if you run it separately). Change the `secret_key` in `deploy/searxng/settings.yml` first.
- **Brave Search API:** sign up at <https://brave.com/search/api/> (free tier with a monthly limit) and set `BRAVE_SEARCH_API_KEY`.

Without either, Research tells you it is unavailable — Hailey never pretends to have browsed.

---

## Use Hailey on your Android phone

Service workers and push notifications need **HTTPS**. Pick one:

1. **Tailscale (free, private — recommended for one person).** Install Tailscale on your PC and phone and sign in to both with the same account. On the PC, run `tailscale serve --bg 8787`. Open the `https://<pc-name>.<tailnet>.ts.net` address on your phone, set `PUBLIC_URL` to that address in `.env`, and restart Hailey. Only your own devices can reach it.
2. **Cloudflare Tunnel (free, public URL).** Gives Hailey an HTTPS address on the internet. Keep `ALLOW_SIGNUP=false` and use a strong password. Set `TRUST_PROXY=true` and `PUBLIC_URL` to the tunnel address.

Then on the phone: open the address in Chrome → menu ⋮ → **Install app** (or *Add to Home screen*). In Hailey → Settings → Notifications, tap **Enable on this device** and **Send test**.

On Windows, Chrome or Edge offer **Install Hailey** from the address bar.

---

## Windows app and Android app (GitHub Releases)

Each release on the repository's **Releases** page has two downloads, built by GitHub Actions (`.github/workflows/release.yml`) whenever a tag such as `v1.0.1` is pushed:

- **`Hailey-Setup-<version>.exe` (Windows).** A desktop app (Electron) that runs the Hailey server inside itself — no Node.js or commands needed. It opens Hailey in its own window and stays in the system tray so reminders keep working. Settings (AI keys, `PUBLIC_URL`) live in `%APPDATA%\Hailey\hailey.env`; open it from the tray menu → *Edit settings*, then choose *Restart Hailey*. Data is stored in `%APPDATA%\Hailey\data`. The tray menu can also **turn on phone access** by starting your ngrok tunnel (ngrok must be installed in `%LOCALAPPDATA%\ngrok` and connected to your account). The installer is not code-signed, so Windows SmartScreen asks you to confirm: *More info → Run anyway*. Don't run the desktop app and `npm start` at the same time — they share port 8787.
- **`Hailey-<version>.apk` (Android).** A Trusted Web Activity that opens your Hailey address (the `HAILEY_URL` repository variable) full-screen, with Hailey's notifications appearing as app notifications. Install it by opening the file on the phone and allowing *Install unknown apps* for your browser. Your PC must be running Hailey with phone access on. For the full-screen view without an address bar, the server must publish `/.well-known/assetlinks.json` — set `ANDROID_PACKAGE_NAME=app.hailey.twa` and `ANDROID_CERT_SHA256` (the signing certificate fingerprint) in `.env`. If verification fails, the app still works with a thin address bar.

**Android signing key.** The APK is signed in GitHub Actions with a key stored in the encrypted secrets `HAILEY_KEYSTORE_B64` and `HAILEY_KEYSTORE_PASSWORD`. Keep an offline backup of the key file — every future APK must be signed with the same key, or Android will refuse to update the installed app.

To publish a new version:
```bash
git tag v1.0.1
```
```bash
git push origin v1.0.1
```

## Always-on server (phone works with the PC off)

`deploy/oracle/docker-compose.yml` runs Hailey and its ngrok tunnel on any Linux server with Docker (tested on an Oracle Cloud Always Free Ampere VM, Ubuntu 24.04). No ports need opening: the tunnel connects outward.

1. Create the VM with your SSH public key, install Docker (`sudo apt install docker.io docker-compose-v2`), and add your user to the `docker` group.
2. On the server, in `~/hailey-app/deploy/oracle/`, create three private files (`chmod 600`): `hailey.env` (your Hailey settings), `ngrok.env` (`NGROK_AUTHTOKEN=…`) and `.env` (`PUBLIC_URL=https://….ngrok-free.dev`).
3. Create the data folder for the container user: `mkdir ~/hailey-data && sudo chown 1000:1000 ~/hailey-data`.
4. From your PC: `HAILEY_SERVER=ubuntu@<ip> HAILEY_SSH_KEY=<key> scripts/deploy-server.sh` uploads the current commit and starts everything. Run it again to update.
5. Daily backups: a cron job runs `docker compose exec -T hailey node scripts/backup.ts /data/backups` (14 kept). Copy them off the server now and then.

Only one copy of Hailey may use the ngrok address at a time, so when the server runs it, set `HAILEY_REMOTE_URL=https://….ngrok-free.dev` in the Windows app's settings (`%APPDATA%\Hailey\hailey.env`). The desktop app then opens the cloud Hailey instead of running its own.

## Keeping Hailey running (hosting)

Reminders and routines are sent by the server, so **the server must be running** for them to arrive on time.

| Option | Cost | Good for | Notes |
|---|---|---|---|
| Your Windows PC + Tailscale | Free | Starting out | Reminders stop when the PC sleeps or is off. |
| A small always-on PC (old laptop, mini-PC, Raspberry Pi 5) | Electricity only | Reliable, private | Run with Docker (`docker compose up -d`) or `npm start` as a service. |
| A small cloud VPS (e.g. ~US$4–6/month) | Low, fixed | Always on, anywhere | Use `docker compose up -d` behind Caddy/Traefik or a Cloudflare Tunnel for HTTPS. |
| Oracle Cloud "Always Free" VM | Free (card required to sign up) | Always on | Free-tier terms and availability change; not guaranteed. |

Free "sleeping" app hosts (that shut down when idle) are **not suitable**: reminders would be missed.

With Docker on a server:

```bash
docker compose up -d --build
```

---

## Backups and restore

```bash
npm run backup
```
Creates `backups/hailey-<date>/` containing a consistent copy of the database (safe while Hailey is running), your uploads and exports, verified with an integrity check. The 14 newest backups are kept (`BACKUP_KEEP` to change). Copy the `backups` folder to another drive or cloud storage regularly — a backup on the same disk does not protect against disk failure.

To restore, **stop Hailey first**, then:
```bash
npm run restore -- backups/hailey-2026-10-16T08-00-00-000
```
Your current data is moved to a `pre-restore-…` folder rather than deleted.

Windows Task Scheduler can run `npm run backup` daily. On Docker, back up the `hailey-data` volume.

**Account recovery:** there is no email-based password reset (Hailey sends no email). If you forget your password, someone with access to the server can create a new account, or you can restore from a backup. Keep your password in a password manager.

---

## Development

```bash
npm run dev
```
Starts the API (port 8787, auto-restart) and the Vite dev server (<http://localhost:5173>). Service worker and push are only active in the production build (`npm run build && npm start`).

| Command | What it does |
|---|---|
| `npm test` | Runs the automated test suite (Vitest). Run `npm run build` first so the PWA checks run too. |
| `npm run typecheck` | Type-checks server and client. |
| `npm run check` | Typecheck + build + tests. |

### Architecture

```
src/            React PWA (Vite). Pages, components, offline cache (IndexedDB), service worker (src/sw.ts)
server/
  index.ts      Entry: config, database, providers, scheduler, HTTP server
  app.ts        Hono app: security headers, CSRF, rate limits, routes, static PWA
  routes/       auth, data (tasks/notes/projects/memory/settings/actions…), chat (SSE), files, research/push/calendar
  ai/           Provider interface; Claude adapter (official SDK); OpenAI-compatible adapter; agent loop
  tools/        Tool registry: typed schemas (zod), risk levels, permission policy, approval queue
  services/     tasks, memory, knowledge, documents, spreadsheets, exporters, search, push, scheduler, briefing, time
  db/           node:sqlite wrapper and SQL migrations (FTS5 full-text search)
tests/          Vitest suites with a scripted fake AI provider
scripts/        setup, backup, restore, icon generator, dev runner
```

Key design choices:
- **No native modules.** SQLite comes from Node's built-in `node:sqlite`, so installation works on Windows without build tools.
- **Provider-neutral AI.** `server/ai/types.ts` defines the interface. Claude uses the official SDK with adaptive thinking, streaming, prompt caching and server-side refusal fallback; any OpenAI-compatible endpoint (including local Ollama) uses the second adapter.
- **Stable prompt prefix.** Each conversation's system prompt and tool list are frozen when it starts; per-turn context (time, memories, attachments) goes into the user message. This keeps prompt caching effective and replays history unchanged.
- **Approvals are enforced on the server**, not by the model: consequential tools are only queued, and an approved action runs exactly once.

See [docs/SECURITY.md](docs/SECURITY.md) and [docs/COSTS.md](docs/COSTS.md).
