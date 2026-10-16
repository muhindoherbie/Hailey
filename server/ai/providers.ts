import type { AIProvider, ProviderInfo } from './types.ts';
import { ProviderError } from './types.ts';
import { AnthropicProvider, type Effort } from './anthropic.ts';
import { OpenAICompatProvider } from './openai-compat.ts';
import type { Config } from '../config.ts';

export interface AISettings {
  provider?: string;
  model?: string;
  effort?: Effort;
}

/** Holds every configured provider and resolves the one a user has selected. */
export class ProviderRegistry {
  private providers = new Map<string, AIProvider>();
  private defaultId: string | undefined;

  register(id: string, provider: AIProvider) {
    this.providers.set(id, provider);
  }

  setDefault(id: string | undefined) {
    this.defaultId = id;
  }

  list(): ProviderInfo[] {
    return [...this.providers.values()].map((p) => p.info());
  }

  /** Picks the user's chosen provider, falling back to the first configured one. */
  resolve(settings: AISettings = {}): AIProvider {
    const order = [settings.provider, this.defaultId, ...this.providers.keys()].filter(Boolean) as string[];
    for (const id of order) {
      const p = this.providers.get(id);
      if (p && p.info().configured) {
        if (p instanceof AnthropicProvider) return p.withSettings(id === settings.provider ? settings.model : undefined, settings.effort);
        return p;
      }
    }
    throw new ProviderError(
      'not_configured',
      'No AI provider is configured yet. Add ANTHROPIC_API_KEY or an OpenAI-compatible endpoint (such as Ollama) to the server’s .env file — see the README.',
    );
  }

  hasAny() {
    return this.list().some((p) => p.configured);
  }
}

export function createRegistry(config: Config): ProviderRegistry {
  const reg = new ProviderRegistry();
  reg.register('anthropic', new AnthropicProvider({ apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL }));
  reg.register(
    'openai_compat',
    new OpenAICompatProvider({
      baseUrl: config.OPENAI_COMPAT_BASE_URL,
      apiKey: config.OPENAI_COMPAT_API_KEY,
      model: config.OPENAI_COMPAT_MODEL,
      label: config.OPENAI_COMPAT_LABEL,
      tools: config.OPENAI_COMPAT_TOOLS === 'true',
      reasoningEffort: config.OPENAI_COMPAT_REASONING_EFFORT,
    }),
  );
  reg.setDefault(config.DEFAULT_PROVIDER);
  return reg;
}
