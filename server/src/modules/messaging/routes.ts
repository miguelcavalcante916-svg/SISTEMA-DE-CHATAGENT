import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError, unauthorized } from '../../lib/errors.js';
import { nowIso } from '../../lib/time.js';
import { parse } from '../../lib/validate.js';
import { getBusiness } from '../business/service.js';
import { handleInbound } from '../conversations/inbound.js';
import { markWebhookProcessed, registerWebhookEvent, verifyWebhookSignature, WebhookEnvelopeSchema } from './webhooks.js';

function singleBusinessId(app: FastifyInstance): string | null {
  // MVP: uma instalação atende um estabelecimento. A primeira linha é o destino dos canais externos.
  const row = app.ctx.db.prepare('SELECT id FROM businesses ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;
  return row?.id ?? null;
}

function requireBridgeToken(app: FastifyInstance, request: FastifyRequest): void {
  const token = app.ctx.config.bridgeToken;
  const given = request.headers['x-bridge-token'];
  if (!token || typeof given !== 'string') throw unauthorized('Ponte não autorizada');
  const a = Buffer.from(token);
  const b = Buffer.from(given);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw unauthorized('Ponte não autorizada');
}

export async function messagingRoutes(app: FastifyInstance): Promise<void> {
  const { db, config, providers } = app.ctx;

  app.get('/api/messaging/status', async (request) => {
    const business = getBusiness(db, request.user!.businessId);
    const channels = await Promise.all(providers.messaging.all().map((p) => p.status()));
    return {
      channels: channels.map((c) => ({ ...c, enabledForBusiness: c.channel === 'simulator' ? business.settings.channels.simulator : business.settings.channels.whatsapp })),
      webhooksEnabled: Boolean(config.webhookSecret),
      whatsappProvider: config.whatsappProvider,
      bridgeConfigured: Boolean(config.bridgeToken),
      sendEnabled: config.whatsappSendEnabled,
    };
  });

  /** Simulador: envia uma mensagem "como cliente" sem nenhum canal real. */
  app.post('/api/simulator/inbound', async (request) => {
    const body = parse(
      z.object({ phone: z.string().trim().min(8).max(30), name: z.string().trim().max(80).nullable().optional(), content: z.string().trim().min(1).max(4000) }),
      request.body,
    );
    const business = getBusiness(db, request.user!.businessId);
    if (!business.settings.channels.simulator) throw new AppError(400, 'simulator_disabled', 'O simulador está desabilitado nas configurações.');
    const digits = body.phone.replace(/\D/g, '');
    return handleInbound(app, {
      businessId: business.id,
      channel: 'simulator',
      externalId: `sim:${digits}`,
      customerPhone: digits,
      customerName: body.name ?? null,
      content: body.content,
    });
  });

  /** Webhook genérico com assinatura HMAC, janela de tempo e idempotência. */
  app.post('/api/webhooks/:provider', { config: { auth: 'public' } }, async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (!['openwa', 'simulator'].includes(provider)) throw new AppError(404, 'unknown_provider', 'Provedor desconhecido');
    const rawBody = request.rawBody ?? '';
    const verification = verifyWebhookSignature({
      secret: config.webhookSecret,
      rawBody,
      signatureHeader: request.headers['x-webhook-signature'] as string | undefined,
      timestampHeader: request.headers['x-webhook-timestamp'] as string | undefined,
      maxAgeSeconds: config.webhookMaxAgeSeconds,
    });
    if (!verification.ok) {
      request.log.warn({ provider, reason: verification.reason }, 'webhook rejeitado');
      throw new AppError(401, 'invalid_signature', 'Assinatura do webhook inválida');
    }
    const envelope = parse(WebhookEnvelopeSchema, request.body);
    const businessId = singleBusinessId(app);
    const fresh = registerWebhookEvent(db, { provider, eventId: envelope.event_id, rawBody, signatureValid: true, businessId });
    if (!fresh) {
      reply.code(200);
      return { ok: true, duplicate: true };
    }
    try {
      if (envelope.type === 'message.received') {
        if (!businessId) throw new Error('nenhum estabelecimento configurado');
        if (!envelope.from || !envelope.message) throw new Error('payload incompleto');
        const channel = provider === 'simulator' ? 'simulator' : 'whatsapp';
        const result = await handleInbound(app, {
          businessId,
          channel,
          externalId: envelope.from.id,
          customerPhone: envelope.from.phone ?? envelope.from.id.split('@')[0] ?? null,
          customerName: envelope.from.name ?? null,
          content: envelope.message.text || `[${envelope.message.type}]`,
          externalMessageId: envelope.message.id ?? envelope.event_id,
        });
        markWebhookProcessed(db, provider, envelope.event_id, null);
        return { ok: true, conversationId: result.conversation.id, replies: result.replies.length, ignored: result.ignored ?? null };
      }
      if (envelope.type === 'message.status' && envelope.status) {
        db.prepare('UPDATE messages SET delivery_status = ? WHERE external_id = ?').run(envelope.status.state === 'failed' ? 'failed' : 'sent', envelope.status.message_external_id);
        markWebhookProcessed(db, provider, envelope.event_id, null);
        return { ok: true };
      }
      if (envelope.type === 'connection.state' && envelope.connection) {
        upsertBridgeStatus(app, provider, envelope.connection.state, { phone: envelope.connection.phone ?? null, ...(envelope.connection.details ?? {}) });
        markWebhookProcessed(db, provider, envelope.event_id, null);
        return { ok: true };
      }
      markWebhookProcessed(db, provider, envelope.event_id, 'tipo sem tratamento');
      return { ok: true, ignored: 'tipo' };
    } catch (err) {
      markWebhookProcessed(db, provider, envelope.event_id, (err as Error).message);
      request.log.error({ err, provider }, 'erro ao processar webhook');
      throw new AppError(500, 'webhook_error', 'Erro ao processar webhook');
    }
  });

  // ---- Endpoints usados pela ponte (token dedicado) ----
  app.post('/api/bridge/heartbeat', { config: { auth: 'public' } }, async (request) => {
    requireBridgeToken(app, request);
    const body = parse(z.object({ provider: z.string().max(40).default('openwa'), state: z.string().max(60), details: z.record(z.string(), z.unknown()).optional() }), request.body);
    upsertBridgeStatus(app, body.provider, body.state, body.details ?? {});
    return { ok: true, sendEnabled: config.whatsappSendEnabled };
  });

  app.get('/api/bridge/outbox', { config: { auth: 'public' } }, async (request) => {
    requireBridgeToken(app, request);
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(50).optional() }), request.query);
    const rows = db
      .prepare("SELECT id, recipient, content, created_at FROM outbound_queue WHERE channel = 'whatsapp' AND status = 'queued' ORDER BY created_at ASC LIMIT ?")
      .all(q.limit ?? 20) as { id: string; recipient: string; content: string; created_at: string }[];
    if (rows.length > 0) {
      const ph = rows.map(() => '?').join(',');
      db.prepare(`UPDATE outbound_queue SET status = 'sending', attempts = attempts + 1, updated_at = ? WHERE id IN (${ph})`).run(nowIso(), ...rows.map((r) => r.id));
    }
    return { messages: rows.map((r) => ({ id: r.id, to: r.recipient, text: r.content, createdAt: r.created_at })), sendEnabled: config.whatsappSendEnabled };
  });

  app.post('/api/bridge/outbox/:id/ack', { config: { auth: 'public' } }, async (request) => {
    requireBridgeToken(app, request);
    const { id } = request.params as { id: string };
    const body = parse(z.object({ status: z.enum(['sent', 'failed']), externalId: z.string().max(200).nullable().optional(), error: z.string().max(500).nullable().optional() }), request.body);
    const row = db.prepare('SELECT * FROM outbound_queue WHERE id = ?').get(id) as { id: string; message_id: string | null; attempts: number } | undefined;
    if (!row) throw new AppError(404, 'not_found', 'Mensagem não encontrada na fila');
    const now = nowIso();
    const finalStatus = body.status === 'failed' && row.attempts < 3 ? 'queued' : body.status;
    db.prepare('UPDATE outbound_queue SET status = ?, external_id = ?, error = ?, updated_at = ?, sent_at = ? WHERE id = ?').run(finalStatus, body.externalId ?? null, body.error ?? null, now, body.status === 'sent' ? now : null, id);
    if (row.message_id) {
      db.prepare('UPDATE messages SET delivery_status = ?, external_id = COALESCE(?, external_id) WHERE id = ?').run(finalStatus === 'queued' ? 'queued' : body.status, body.externalId ?? null, row.message_id);
    }
    return { ok: true, status: finalStatus };
  });
}

function upsertBridgeStatus(app: FastifyInstance, provider: string, state: string, details: Record<string, unknown>) {
  app.ctx.db
    .prepare(
      `INSERT INTO bridge_status (channel, provider, state, details_json, last_heartbeat_at) VALUES ('whatsapp', ?, ?, ?, ?)
       ON CONFLICT(channel) DO UPDATE SET provider = excluded.provider, state = excluded.state, details_json = excluded.details_json, last_heartbeat_at = excluded.last_heartbeat_at`,
    )
    .run(provider, state, JSON.stringify(details), nowIso());
}
