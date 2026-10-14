import type { DB } from '../../db/connection.js';
import { newId } from '../../lib/ids.js';
import { parseJson } from '../../lib/json.js';
import { nowIso } from '../../lib/time.js';
import type { ChannelStatus, MessagingProvider, OutboundMessage, SendResult } from './provider.js';

const HEARTBEAT_STALE_MS = 90_000;

/**
 * WhatsApp via ponte open-wa (processo separado em integrations/whatsapp-openwa).
 * Este provedor NÃO fala com o WhatsApp: ele enfileira a mensagem; a ponte busca a fila e envia.
 * Aviso: open-wa automatiza o WhatsApp Web (não oficial). Veja docs/INTEGRACOES.md.
 */
export class OpenWaQueueProvider implements MessagingProvider {
  readonly channel = 'whatsapp' as const;
  readonly name = 'WhatsApp (open-wa, não oficial)';

  constructor(
    private readonly db: DB,
    private readonly opts: { sendEnabled: boolean; bridgeConfigured: boolean },
  ) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    if (!this.opts.bridgeConfigured) return { status: 'failed', error: 'Ponte WhatsApp não configurada (BRIDGE_TOKEN vazio).' };
    if (!this.opts.sendEnabled) {
      return { status: 'failed', error: 'Envio real desabilitado (WHATSAPP_SEND_ENABLED=false). Mensagem não enviada.' };
    }
    const to = message.to.includes('@') ? message.to : `${message.to.replace(/\D/g, '')}@c.us`;
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO outbound_queue (id, business_id, channel, conversation_id, message_id, recipient, content, status, attempts, created_at, updated_at)
         VALUES (?, ?, 'whatsapp', ?, ?, ?, ?, 'queued', 0, ?, ?)`,
      )
      .run(newId(), message.businessId, message.conversationId, message.messageId, to, message.content, now, now);
    return { status: 'queued' };
  }

  async status(): Promise<ChannelStatus> {
    const row = this.db.prepare("SELECT * FROM bridge_status WHERE channel = 'whatsapp'").get() as
      | { provider: string; state: string; details_json: string | null; last_heartbeat_at: string }
      | undefined;
    const fresh = row ? Date.now() - new Date(row.last_heartbeat_at).getTime() < HEARTBEAT_STALE_MS : false;
    const queued = (this.db.prepare("SELECT COUNT(*) AS c FROM outbound_queue WHERE channel = 'whatsapp' AND status = 'queued'").get() as { c: number }).c;
    return {
      channel: 'whatsapp',
      provider: this.name,
      configured: this.opts.bridgeConfigured,
      connected: fresh && row?.state === 'CONNECTED',
      sendEnabled: this.opts.sendEnabled,
      details: {
        bridgeState: row?.state ?? 'sem_heartbeat',
        lastHeartbeatAt: row?.last_heartbeat_at ?? null,
        heartbeatFresh: fresh,
        queued,
        ...(row ? parseJson<Record<string, unknown>>(row.details_json, {}) : {}),
      },
    };
  }
}
