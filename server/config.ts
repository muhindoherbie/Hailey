import { z } from 'zod';

/**
 * Server configuration, read from environment variables only.
 * Secrets (API keys, VAPID private key) live here and never reach the browser.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(8787),
  HOST: z.string().default('127.0.0.1'),
  PUBLIC_URL: z.string().default('http://localhost:8787'),
  DATA_DIR: z.string().default('./data'),
  ALLOW_SIGNUP: z.enum(['true', 'false']).default('true'),
  MAX_USERS: z.coerce.number().int().default(5),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),

  // AI providers — configure one or more. The user picks the active one in Settings.
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  OPENAI_COMPAT_BASE_URL: z.string().optional(),   // e.g. http://localhost:11434/v1 for Ollama
  OPENAI_COMPAT_API_KEY: z.string().optional(),
  OPENAI_COMPAT_MODEL: z.string().optional(),
  OPENAI_COMPAT_LABEL: z.string().default('Local / OpenAI-compatible'),
  OPENAI_COMPAT_TOOLS: z.enum(['true', 'false']).default('true'),
  /** Sent as reasoning_effort, e.g. 'none' to turn off slow thinking on local models. */
  OPENAI_COMPAT_REASONING_EFFORT: z.string().max(20).optional(),
  DEFAULT_PROVIDER: z.enum(['anthropic', 'openai_compat']).optional(),

  // Web research
  SEARXNG_URL: z.string().optional(),
  BRAVE_SEARCH_API_KEY: z.string().optional(),

  // Web push (generate with `npm run setup`)
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),

  MAX_UPLOAD_MB: z.coerce.number().default(15),
  DAILY_TOKEN_LIMIT: z.coerce.number().int().default(400000),
});

export type Config = z.infer<typeof schema> & {
  allowSignup: boolean;
  trustProxy: boolean;
  isProd: boolean;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = schema.parse(cleaned);
  return {
    ...parsed,
    allowSignup: parsed.ALLOW_SIGNUP === 'true',
    trustProxy: parsed.TRUST_PROXY === 'true',
    isProd: parsed.NODE_ENV === 'production',
  };
}
