import type { AgentInput, AgentOutput, AIHealth, AIProvider, AIProviderSettings } from './provider.js';
import { nowIso } from '../../lib/time.js';

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  constructor(private settings: AIProviderSettings) {}
  async checkHealth(): Promise<AIHealth> {
    return {
      provider: this.name,
      configured: true,
      reachable: false,
      modelAvailable: false,
      baseUrl: this.settings.baseUrl,
      model: this.settings.model,
      availableModels: [],
      error: 'não implementado',
      checkedAt: nowIso(),
    };
  }
  async generate(_input: AgentInput): Promise<AgentOutput> {
    return { kind: 'unavailable', reason: 'não implementado', latencyMs: 0 };
  }
}
