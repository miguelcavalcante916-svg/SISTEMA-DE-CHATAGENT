import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { DB } from '../../db/connection.js';
import { newId } from '../../lib/ids.js';
import { nowIso } from '../../lib/time.js';

/**
 * Contrato genérico de webhook. A ponte (ou qualquer provedor) envia:
 *   POST /api/webhooks/:provider
 *   X-Webhook-Timestamp: <segundos unix>
 *   X-Webhook-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
 */
export const WebhookEnvelopeSchema = z.object({
  event_id: z.string().min(1).max(200),
  type: z.enum(['message.received', 'message.status', 'connection.state']),
  timestamp: z.number().int().optional(),
  channel: z.enum(['whatsapp', 'simulator']).default('whatsapp'),
  from: z
    .object({
      id: z.string().min(1).max(120),
      phone: z.string().max(30).nullable().optional(),
      name: z.string().max(120).nullable().optional(),
    })
    .optional(),
  message: z
    .object({
      id: z.string().max(200).optional(),
      text: z.string().max(8000).default(''),
      type: z.string().max(40).default('chat'),
      timestamp: z.number().optional(),
    })
    .optional(),
  status: z
    .object({
      message_external_id: z.string().max(200),
      state: z.enum(['sent', 'delivered', 'read', 'failed']),
      error: z.string().max(500).nullable().optional(),
    })
    .optional(),
  connection: z
    .object({
      state: z.string().max(60),
      phone: z.string().max(30).nullable().optional(),
      details: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});
export type WebhookEnvelope = z.infer<typeof WebhookEnvelopeSchema>;

export function signWebhook(secret: string, timestamp: number, rawBody: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
}

export function verifyWebhookSignature(params: {
  secret: string;
  rawBody: string;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  maxAgeSeconds: number;
  now?: number;
}): { ok: boolean; reason?: string } {
  if (!params.secret) return { ok: false, reason: 'webhook_desabilitado' };
  if (!params.signatureHeader || !params.timestampHeader) return { ok: false, reason: 'cabecalhos_ausentes' };
  const ts = Number(params.timestampHeader);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'timestamp_invalido' };
  const now = params.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > params.maxAgeSeconds) return { ok: false, reason: 'fora_da_janela' };
  const expected = signWebhook(params.secret, ts, params.rawBody);
  const a = Buffer.from(expected);
  const b = Buffer.from(params.signatureHeader);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'assinatura_invalida' };
  return { ok: true };
}

/** Idempotência: registra o evento; devolve false se já foi recebido. */
export function registerWebhookEvent(db: DB, input: { provider: string; eventId: string; rawBody: string; signatureValid: boolean; businessId: string | null }): boolean {
  const hash = createHash('sha256').update(input.rawBody).digest('hex');
  try {
    db.prepare(
      `INSERT INTO webhook_events (id, provider, event_id, business_id, payload_hash, signature_valid, processed, received_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(newId(), input.provider, input.eventId, input.businessId, hash, input.signatureValid ? 1 : 0, nowIso());
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') return false;
    throw err;
  }
}

export function markWebhookProcessed(db: DB, provider: string, eventId: string, error: string | null): void {
  db.prepare('UPDATE webhook_events SET processed = ?, error = ? WHERE provider = ? AND event_id = ?').run(error ? 0 : 1, error, provider, eventId);
}
