import type { FastifyInstance } from 'fastify';
import type { ConversationRow, MessageDto, MessageRow } from './service.js';
import { appendMessage, toMessageDto } from './service.js';

/**
 * Envia uma mensagem ao cliente pelo canal da conversa e registra no histórico.
 * Nunca envia nada real sem um provedor configurado para o canal; o simulador apenas registra.
 */
export async function sendOutbound(
  app: FastifyInstance,
  params: {
    conversation: ConversationRow;
    content: string;
    senderType: 'ai' | 'human' | 'system';
    senderUserId?: string | null;
    senderName?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<MessageDto> {
  const { db, providers } = app.ctx;
  const conv = params.conversation;
  const content = params.content.trim();
  let row: MessageRow;
  if (conv.channel === 'manual') {
    row = appendMessage(db, { conversationId: conv.id, direction: 'out', senderType: params.senderType, senderUserId: params.senderUserId ?? null, content, metadata: params.metadata ?? null, deliveryStatus: 'n/a' });
    return toMessageDto(row, params.senderName ?? null);
  }
  const provider = providers.messaging.get(conv.channel);
  if (!provider) {
    row = appendMessage(db, {
      conversationId: conv.id,
      direction: 'out',
      senderType: params.senderType,
      senderUserId: params.senderUserId ?? null,
      content,
      metadata: { ...(params.metadata ?? {}), error: 'canal_nao_configurado' },
      deliveryStatus: 'failed',
    });
    return toMessageDto(row, params.senderName ?? null);
  }
  // registra primeiro como "queued" para ter o id da mensagem; o provedor atualiza o status
  row = appendMessage(db, { conversationId: conv.id, direction: 'out', senderType: params.senderType, senderUserId: params.senderUserId ?? null, content, metadata: params.metadata ?? null, deliveryStatus: 'queued' });
  const result = await provider.send({
    businessId: conv.business_id,
    conversationId: conv.id,
    messageId: row.id,
    channel: conv.channel,
    to: conv.external_id ?? conv.customer_phone ?? '',
    content,
  });
  const metadata = { ...(params.metadata ?? {}), ...(result.error ? { error: result.error } : {}) };
  db.prepare('UPDATE messages SET delivery_status = ?, external_id = COALESCE(?, external_id), metadata_json = ? WHERE id = ?').run(
    result.status,
    result.externalId ?? null,
    Object.keys(metadata).length ? JSON.stringify(metadata) : null,
    row.id,
  );
  const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(row.id) as MessageRow;
  return toMessageDto(updated, params.senderName ?? null);
}
