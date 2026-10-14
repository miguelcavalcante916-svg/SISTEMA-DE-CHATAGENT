import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse } from '../../lib/validate.js';
import { getBusiness, type Business } from '../business/service.js';
import { listZones } from '../business/zones.js';
import { getCatalog } from '../catalog/service.js';
import { emptyDraft } from '../conversations/service.js';
import { listApprovedEntries } from '../knowledge/service.js';
import { buildAgentContext, SYSTEM_PROMPT } from './prompt.js';
import type { AIProvider } from './provider.js';

/** Provedor efetivo para o estabelecimento (endereço/modelo do painel sobrescrevem o .env). */
export function resolveAiProvider(app: FastifyInstance, business: Business): AIProvider {
  const base = app.ctx.providers.ai;
  const override: Record<string, unknown> = {};
  if (business.settings.ai.baseUrl) override.baseUrl = business.settings.ai.baseUrl;
  if (business.settings.ai.model) override.model = business.settings.ai.model;
  const configurable = base as AIProvider & { configure?: (p: Record<string, unknown>) => AIProvider };
  return Object.keys(override).length && configurable.configure ? configurable.configure(override) : base;
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app.ctx;

  app.get('/api/ai/status', async (request) => {
    const business = getBusiness(db, request.user!.businessId);
    const provider = resolveAiProvider(app, business);
    const health = await provider.checkHealth();
    return {
      health,
      settings: { ...business.settings.ai, effectiveBaseUrl: business.settings.ai.baseUrl ?? config.ollamaBaseUrl, effectiveModel: business.settings.ai.model ?? config.ollamaModel, timeoutMs: config.aiTimeoutMs },
      dataReviewedAt: business.dataReviewedAt,
      ready: health.reachable && health.modelAvailable && business.settings.ai.enabled && Boolean(business.dataReviewedAt),
    };
  });

  /** Teste de diagnóstico: envia uma mensagem fictícia ao modelo com o contexto real, sem gravar conversa. */
  app.post('/api/ai/test', { config: { auth: 'admin' } }, async (request) => {
    const body = parse(z.object({ message: z.string().trim().min(1).max(500).default('Olá! Vocês estão abertos? O que tem no cardápio?') }), request.body ?? {});
    const business = getBusiness(db, request.user!.businessId);
    const provider = resolveAiProvider(app, business);
    const context = buildAgentContext({ business, catalog: getCatalog(db, business.id), zones: listZones(db, business.id, { activeOnly: true }), knowledge: listApprovedEntries(db, business.id), draft: emptyDraft() });
    const output = await provider.generate({ systemPrompt: SYSTEM_PROMPT, context, history: [], customerMessage: body.message, maxReplyChars: config.aiMaxReplyChars, temperature: business.settings.ai.temperature });
    return { output, contextChars: context.length };
  });
}
