import type { FastifyInstance } from 'fastify';
import { getBusiness } from '../business/service.js';
import type { ChannelId } from '../messaging/provider.js';
import { normalizePhone } from '../orders/service.js';
import { runAgent } from './agent.js';
import { appendMessage, findOrCreateConversation, getConversation, hasMessageWithExternalId, type ConversationDto, type MessageDto } from './service.js';

export interface InboundInput {
  businessId: string;
  channel: ChannelId;
  externalId: string;
  customerPhone: string | null;
  customerName: string | null;
  content: string;
  externalMessageId?: string | null;
}

/** Ponto único de entrada de mensagens de clientes (simulador, webhooks, ponte WhatsApp). */
export async function handleInbound(app: FastifyInstance, input: InboundInput): Promise<{ conversation: ConversationDto; replies: MessageDto[]; ignored?: string }> {
  const { db } = app.ctx;
  const business = getBusiness(db, input.businessId);
  if (input.channel === 'whatsapp' && !business.settings.channels.whatsapp) {
    app.log.warn({ channel: input.channel }, 'mensagem recebida em canal desabilitado; ignorada');
    const conv = findOrCreateConversation(db, { businessId: business.id, channel: input.channel, externalId: input.externalId, customerPhone: input.customerPhone ? normalizePhone(input.customerPhone) : null, customerName: input.customerName });
    return { conversation: getConversation(db, business.id, conv.id), replies: [], ignored: 'canal_desabilitado' };
  }
  const conversation = findOrCreateConversation(db, {
    businessId: business.id,
    channel: input.channel,
    externalId: input.externalId,
    customerPhone: input.customerPhone ? normalizePhone(input.customerPhone) : null,
    customerName: input.customerName,
  });
  if (input.externalMessageId && hasMessageWithExternalId(db, conversation.id, input.externalMessageId)) {
    return { conversation: getConversation(db, business.id, conversation.id), replies: [], ignored: 'duplicada' };
  }
  const content = input.content.trim().slice(0, 4000);
  const message = appendMessage(db, {
    conversationId: conversation.id,
    direction: 'in',
    senderType: 'customer',
    content,
    externalId: input.externalMessageId ?? null,
    deliveryStatus: 'n/a',
  });
  const replies = await runAgent(app, business, conversation.id, message);
  return { conversation: getConversation(db, business.id, conversation.id), replies };
}
