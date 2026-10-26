import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from '../server/ai/providers.ts';
import { ProviderError, type AIProvider } from '../server/ai/types.ts';

const fake = (id: string, configured: boolean, local: boolean): AIProvider => ({
  info: () => ({ id, label: id, model: 'm', configured, capabilities: { tools: true, streaming: true, local } }),
  chat: async () => { throw new Error('not used'); },
});

function registry(localUp: boolean) {
  const r = new ProviderRegistry();
  r.register('cloud', fake('cloud', true, false));
  r.register('ollama', fake('ollama', localUp, true));
  return r;
}

describe('provider routing privacy', () => {
  it('uses the chosen provider when it is available', () => {
    expect(registry(true).resolve({ provider: 'ollama' }).info().id).toBe('ollama');
    expect(registry(true).resolve({ provider: 'cloud' }).info().id).toBe('cloud');
  });

  it('never silently falls back from a chosen local model to the cloud', () => {
    expect(() => registry(false).resolve({ provider: 'ollama' })).toThrow(ProviderError);
    expect(() => registry(false).resolve({ provider: 'ollama' })).toThrow(/will not send this to a cloud provider/);
  });

  it('local-only mode restricts routing to local providers', () => {
    expect(registry(true).resolve({ provider: 'cloud', localOnly: true }).info().id).toBe('ollama');
    expect(() => registry(false).resolve({ localOnly: true })).toThrow(/No local model is available/);
  });

  it('keeps the existing fallback between configured providers otherwise', () => {
    expect(registry(false).resolve({}).info().id).toBe('cloud');
  });
});
