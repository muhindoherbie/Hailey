# Running costs

Hailey is designed to run for **free** (local model + your own PC) or for a few dollars a month. Nothing in Hailey buys or provisions paid services; any cost comes from accounts you choose to create. Free tiers change — check each provider's current terms.

## Summary

| Item | Free option | Typical paid option |
|---|---|---|
| Hosting | Your PC (reminders only while it's on) | Small VPS ≈ US$4–6/month |
| Database & file storage | SQLite on the same machine — free | Included in the VPS disk |
| AI model | Ollama local model — free (needs a capable PC) | Claude API, pay per token (see below) |
| Web search | Self-hosted SearXNG — free | Brave Search API (free tier, then paid) |
| Push notifications | Web Push via browser vendors — free | — |
| HTTPS access from phone | Tailscale or Cloudflare Tunnel — free | — |
| Domain name | Not required | ≈ US$10–15/year if you want one |

## AI cost estimates (Claude)

Measured from Hailey's own request shape: each chat request sends about **5,200 tokens** of fixed instructions and tool definitions, plus the conversation so far and any retrieved memories. A typical message averages roughly **10,000 input tokens and 500 output tokens** across its requests (more when Hailey uses tools or you attach documents).

Prompt caching is enabled, so the fixed part and earlier history are billed at the much lower cache-read rate on follow-up messages within a few minutes. The figures below **ignore caching** and are therefore upper estimates.

Prices (Anthropic list prices, October 2026, per million tokens — verify on Anthropic's pricing page):

| Model | Input | Output | ≈ per message | ≈ per month at 40 messages/day |
|---|---|---|---|---|
| Claude Haiku 5.5 | $0.10 | $0.50 | $0.0013 | ≈ $1.50 |
| Claude Sonnet 5.5 | $2.00 | $10.00 | $0.025 | ≈ $30 |
| Claude Opus 5.5 | $4.00 | $20.00 | $0.05 | ≈ $60 |

Opus is Hailey's default model because it is the most capable; **switching to Haiku in Settings → AI cuts the cost by roughly 40×**, and Sonnet halves it. Lower "thinking effort" also reduces output tokens.

Document summaries and research syntheses are separate, single requests (typically 5–30k input tokens depending on document length).

## Controlling and monitoring spend
1. **Set a hard monthly limit in the Anthropic Console** (Settings → Limits). This is the real safety net.
2. Set Hailey's **daily token limit** (Settings → AI, or `DAILY_TOKEN_LIMIT` in `.env`). Hailey stops sending AI requests for that user once the 24-hour total is reached.
3. Watch **Settings → AI → Usage**: tokens per day, per model and an estimated cost. Estimates use list prices and approximate cache rates; the provider's billing page is authoritative.
4. Prefer a local model for routine use and Claude for harder tasks — you can switch providers in Settings at any time.

## Local model hardware (Ollama)
- 7–8B models (e.g. `qwen3:8b`): about 8 GB free RAM, 16 GB total recommended; a GPU with 8 GB VRAM makes replies fast. CPU-only works but is slow.
- 3–4B models: run on most recent laptops but follow tool instructions less reliably.
- The model must run on a machine the Hailey server can reach; if Hailey runs on a VPS, a local model on your home PC is usually not reachable.
