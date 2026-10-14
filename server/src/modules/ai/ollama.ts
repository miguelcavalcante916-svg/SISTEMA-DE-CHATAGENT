import { nowIso } from '../../lib/time.js';
import { AGENT_OUTPUT_JSON_SCHEMA, AgentStructuredOutputSchema, type AgentInput, type AgentOutput, type AIHealth, type AIProvider, type AIProviderSettings } from './provider.js';

const MAX_RAW_CHARS = 20_000;

type FetchLike = typeof fetch;

/**
 * Adaptador para Ollama local (/api/chat com `format` = JSON Schema).
 * Nunca executa nada sugerido pelo modelo; devolve apenas texto/JSON validado.
 */
export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';

  constructor(
    private readonly settings: AIProviderSettings,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  configure(partial: Partial<AIProviderSettings>): AIProvider {
    return new OllamaProvider({ ...this.settings, ...partial }, this.fetchImpl);
  }

  get currentSettings(): AIProviderSettings {
    return this.settings;
  }

  async checkHealth(): Promise<AIHealth> {
    const base: AIHealth = {
      provider: this.name,
      configured: Boolean(this.settings.baseUrl && this.settings.model),
      reachable: false,
      modelAvailable: false,
      baseUrl: this.settings.baseUrl,
      model: this.settings.model,
      availableModels: [],
      error: null,
      checkedAt: nowIso(),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await this.fetchImpl(`${this.settings.baseUrl}/api/tags`, { signal: controller.signal });
      if (!res.ok) return { ...base, error: `Ollama respondeu ${res.status}` };
      const data = (await res.json()) as { models?: { name?: string; model?: string }[] };
      const names = (data.models ?? []).map((m) => m.name ?? m.model ?? '').filter(Boolean);
      const wanted = this.settings.model;
      const modelAvailable = names.some((n) => n === wanted || n === `${wanted}:latest` || n.split(':')[0] === wanted.split(':')[0] && (wanted.includes(':') ? n === wanted : true));
      return { ...base, reachable: true, modelAvailable, availableModels: names, error: modelAvailable ? null : `Modelo "${wanted}" não encontrado. Execute: ollama pull ${wanted}` };
    } catch (err) {
      return { ...base, error: `Não foi possível conectar ao Ollama em ${this.settings.baseUrl}: ${(err as Error).name === 'AbortError' ? 'tempo esgotado' : (err as Error).message}` };
    } finally {
      clearTimeout(timer);
    }
  }

  async generate(input: AgentInput, signal?: AbortSignal): Promise<AgentOutput> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);
    signal?.addEventListener('abort', () => controller.abort());
    const messages = [
      { role: 'system', content: `${input.systemPrompt}\n\n${input.context}` },
      ...input.history.map((h) => ({ role: h.role === 'customer' ? 'user' : h.role === 'assistant' ? 'assistant' : 'system', content: h.content })),
      { role: 'user', content: input.customerMessage },
    ];
    try {
      const res = await this.fetchImpl(`${this.settings.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.settings.model,
          messages,
          stream: false,
          format: AGENT_OUTPUT_JSON_SCHEMA,
          options: { temperature: input.temperature, num_predict: 700 },
          keep_alive: '10m',
        }),
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { kind: 'unavailable', reason: `Ollama respondeu ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`, latencyMs };
      }
      const data = (await res.json()) as { message?: { content?: string }; model?: string };
      const raw = String(data.message?.content ?? '');
      if (!raw.trim()) return { kind: 'unavailable', reason: 'resposta vazia do modelo', latencyMs };
      if (raw.length > MAX_RAW_CHARS) return { kind: 'text', text: raw.slice(0, 500), raw: raw.slice(0, MAX_RAW_CHARS), model: data.model ?? this.settings.model, latencyMs, reason: 'resposta excede o tamanho máximo' };
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        return { kind: 'text', text: raw.slice(0, input.maxReplyChars), raw, model: data.model ?? this.settings.model, latencyMs, reason: 'JSON inválido' };
      }
      const parsed = AgentStructuredOutputSchema.safeParse(parsedJson);
      if (!parsed.success) {
        return { kind: 'text', text: typeof (parsedJson as { reply?: unknown })?.reply === 'string' ? String((parsedJson as { reply: string }).reply).slice(0, input.maxReplyChars) : raw.slice(0, input.maxReplyChars), raw, model: data.model ?? this.settings.model, latencyMs, reason: `estrutura inválida: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}` };
      }
      return { kind: 'structured', data: parsed.data, raw, model: data.model ?? this.settings.model, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const e = err as Error;
      return { kind: 'unavailable', reason: e.name === 'AbortError' ? `tempo esgotado após ${this.settings.timeoutMs} ms` : e.message, latencyMs };
    } finally {
      clearTimeout(timer);
    }
  }
}
