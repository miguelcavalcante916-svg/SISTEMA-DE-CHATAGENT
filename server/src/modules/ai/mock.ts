import { nowIso } from '../../lib/time.js';
import type { AgentInput, AgentOutput, AIHealth, AIProvider } from './provider.js';

/** Provedor simulado para testes: devolve saídas roteirizadas, sem rede. */
export class MockAIProvider implements AIProvider {
  readonly name = 'mock';
  calls: AgentInput[] = [];
  private queue: Array<AgentOutput | ((input: AgentInput) => AgentOutput)> = [];

  constructor(private readonly fallback: AgentOutput = { kind: 'unavailable', reason: 'sem roteiro', latencyMs: 0 }) {}

  enqueue(...outputs: Array<AgentOutput | ((input: AgentInput) => AgentOutput)>): this {
    this.queue.push(...outputs);
    return this;
  }

  async checkHealth(): Promise<AIHealth> {
    return { provider: 'mock', configured: true, reachable: true, modelAvailable: true, baseUrl: null, model: 'mock', availableModels: ['mock'], error: null, checkedAt: nowIso() };
  }

  async generate(input: AgentInput): Promise<AgentOutput> {
    this.calls.push(input);
    const next = this.queue.shift();
    if (!next) return this.fallback;
    return typeof next === 'function' ? next(input) : next;
  }
}
