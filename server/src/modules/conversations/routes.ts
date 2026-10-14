import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { recordAudit } from '../audit/service.js';
import { getBusiness } from '../business/service.js';
import { createSuggestion } from '../knowledge/service.js';
import { createOrder, CreateOrderSchema, normalizePhone, type OrderDto } from '../orders/service.js';
import type { OrderStatus } from '../orders/types.js';
import { sendOutbound } from './outbound.js';
import {
  closeConversation,
  createManualConversation,
  getConversation,
  getConversationRow,
  listConversations,
  markRead,
  parseDraft,
  releaseToAi,
  reopenConversation,
  saveDraft,
  takeOver,
  updateCustomer,
} from './service.js';

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  const { db, events } = app.ctx;
  const userOf = (request: { user: { id: string; name: string } | null }) => ({ id: request.user!.id, name: request.user!.name });

  app.get('/api/conversations', async (request) => {
    const q = parse(
      z.object({
        status: z.enum(['open', 'closed', 'all']).optional(),
        needsHuman: z.enum(['0', '1']).optional(),
        channel: z.string().max(20).optional(),
        q: z.string().max(80).optional(),
      }),
      request.query,
    );
    const conversations = listConversations(db, request.user!.businessId, { status: q.status, needsHuman: q.needsHuman === '1', channel: q.channel, q: q.q });
    const needsHumanCount = conversations.filter((c) => c.needsHuman && c.status === 'open').length;
    return { conversations, needsHumanCount };
  });

  app.get('/api/conversations/:id', async (request) => {
    const { id } = request.params as { id: string };
    markRead(db, request.user!.businessId, id);
    return { conversation: getConversation(db, request.user!.businessId, id) };
  });

  app.post('/api/conversations', async (request, reply) => {
    const body = parse(z.object({ customerName: z.string().trim().max(80).nullable().optional(), customerPhone: z.string().trim().max(30).nullable().optional() }), request.body);
    const row = createManualConversation(db, request.user!.businessId, { customerName: body.customerName ?? null, customerPhone: body.customerPhone ? normalizePhone(body.customerPhone) : null }, userOf(request));
    reply.code(201);
    return { conversation: getConversation(db, request.user!.businessId, row.id) };
  });

  /** Resposta humana ao cliente. */
  app.post('/api/conversations/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = parse(z.object({ content: z.string().trim().min(1).max(4000) }), request.body);
    const conv = getConversationRow(db, request.user!.businessId, id);
    if (conv.status === 'closed') throw badRequest('Conversa encerrada. Reabra para responder.');
    const message = await sendOutbound(app, { conversation: conv, content: body.content, senderType: 'human', senderUserId: request.user!.id, senderName: request.user!.name });
    // Ao responder, a pessoa está atendendo: não deixa a IA responder em paralelo.
    if (conv.mode !== 'human') takeOver(db, conv.business_id, conv.id, userOf(request));
    db.prepare('UPDATE conversations SET needs_human = 0, needs_human_reason = NULL WHERE id = ?').run(conv.id);
    reply.code(201);
    return { message, conversation: getConversation(db, request.user!.businessId, id) };
  });

  app.post('/api/conversations/:id/takeover', async (request) => {
    const { id } = request.params as { id: string };
    takeOver(db, request.user!.businessId, id, userOf(request));
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'conversation.takeover', entityType: 'conversation', entityId: id, ip: request.ip });
    return { conversation: getConversation(db, request.user!.businessId, id) };
  });

  app.post('/api/conversations/:id/release', async (request) => {
    const { id } = request.params as { id: string };
    releaseToAi(db, request.user!.businessId, id, userOf(request));
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'conversation.release', entityType: 'conversation', entityId: id, ip: request.ip });
    return { conversation: getConversation(db, request.user!.businessId, id) };
  });

  app.post('/api/conversations/:id/close', async (request) => {
    const { id } = request.params as { id: string };
    closeConversation(db, request.user!.businessId, id, userOf(request));
    return { conversation: getConversation(db, request.user!.businessId, id) };
  });

  app.post('/api/conversations/:id/reopen', async (request) => {
    const { id } = request.params as { id: string };
    reopenConversation(db, request.user!.businessId, id);
    return { conversation: getConversation(db, request.user!.businessId, id) };
  });

  app.patch('/api/conversations/:id/customer', async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(z.object({ name: z.string().trim().max(80).nullable().optional(), phone: z.string().trim().max(30).nullable().optional() }), request.body);
    getConversationRow(db, request.user!.businessId, id);
    updateCustomer(db, id, { name: body.name, phone: body.phone === undefined ? undefined : body.phone ? normalizePhone(body.phone) : null });
    return { conversation: getConversation(db, request.user!.businessId, id) };
  });

  /** Cria o pedido a partir da conversa (atendente confirma que o cliente aprovou o resumo). */
  app.post('/api/conversations/:id/order', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = parse(CreateOrderSchema, request.body);
    const business = getBusiness(db, request.user!.businessId);
    const conv = getConversationRow(db, business.id, id);
    const order = createOrder(db, {
      business,
      input: body,
      actor: { type: 'user', userId: request.user!.id, name: request.user!.name },
      origin: `conversation:${conv.channel}`,
      conversationId: conv.id,
    });
    const draft = parseDraft(conv.draft_json);
    draft.items = [];
    draft.awaitingConfirmation = false;
    draft.summaryPresentedAt = null;
    draft.lastOrderId = order.id;
    saveDraft(db, conv.id, draft);
    if (!conv.customer_phone && body.customer.phone) updateCustomer(db, conv.id, { phone: normalizePhone(body.customer.phone) });
    if (!conv.customer_name && body.customer.name) updateCustomer(db, conv.id, { name: body.customer.name });
    const text = business.settings.messages.orderConfirmed.replace('{numero}', `#${order.number}`);
    await sendOutbound(app, { conversation: conv, content: text, senderType: 'human', senderUserId: request.user!.id, senderName: request.user!.name, metadata: { orderId: order.id } });
    recordAudit(db, { businessId: business.id, userId: request.user!.id, userName: request.user!.name, action: 'order.created', entityType: 'order', entityId: order.id, details: { number: order.number, fromConversation: conv.id }, ip: request.ip });
    events.emit('order.created', { businessId: business.id, order, actor: { type: 'user', userId: request.user!.id, name: request.user!.name } });
    reply.code(201);
    return { order, conversation: getConversation(db, business.id, id) };
  });

  /** Atendente registra uma correção/resposta para virar conhecimento (após revisão). */
  app.post('/api/conversations/:id/suggest-knowledge', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = parse(z.object({ question: z.string().trim().min(2).max(1000), answer: z.string().trim().min(2).max(4000) }), request.body);
    getConversationRow(db, request.user!.businessId, id);
    const suggestion = createSuggestion(db, { businessId: request.user!.businessId, question: body.question, proposedAnswer: body.answer, origin: 'human_correction', conversationId: id });
    reply.code(201);
    return { suggestion };
  });

  // Notificação de status ao cliente: só quando canal configurado, envio habilitado e mudança explícita por pessoa.
  events.on('order.status_changed', (payload: { businessId: string; order: OrderDto; to: OrderStatus; actor: { type: string } }) => {
    void (async () => {
      try {
        if (payload.actor.type !== 'user') return;
        const business = getBusiness(db, payload.businessId);
        const n = business.settings.notifications;
        if (!n.enabled || !n.statuses.includes(payload.to) || !payload.order.conversationId) return;
        const conv = getConversationRow(db, business.id, payload.order.conversationId);
        if (conv.channel === 'manual') return;
        if (conv.channel === 'whatsapp' && !business.settings.channels.whatsapp) return;
        const template = business.settings.messages.statusTemplates[payload.to as keyof typeof business.settings.messages.statusTemplates];
        if (!template) return;
        await sendOutbound(app, { conversation: conv, content: template.replace('{numero}', `#${payload.order.number}`), senderType: 'system', metadata: { orderId: payload.order.id, status: payload.to } });
      } catch (err) {
        app.log.warn({ err }, 'falha ao notificar cliente sobre status');
      }
    })();
  });
}
