import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parse } from '../../lib/validate.js';
import { recordAudit } from '../audit/service.js';
import { getBusiness } from '../business/service.js';
import { QuoteInputSchema } from './pricing.js';
import {
  changeOrderStatus,
  changePaymentStatus,
  createOrder,
  CreateOrderSchema,
  getOrder,
  listOrders,
  quoteForBusiness,
  updateOrder,
  updateOrderNotes,
  UpdateOrderSchema,
  type Actor,
} from './service.js';
import { FULFILLMENTS, ORDER_STATUSES, PAYMENT_STATUSES } from './types.js';

const ListQuery = z.object({
  scope: z.enum(['active', 'all']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.string().optional(),
  fulfillment: z.enum(FULFILLMENTS).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  q: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const StatusBody = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().max(300).nullable().optional(),
  cancelReason: z.string().max(300).nullable().optional(),
});
const PaymentBody = z.object({ paymentStatus: z.enum(PAYMENT_STATUSES), note: z.string().max(300).nullable().optional() });
const NotesBody = z.object({
  internalNotes: z.string().max(500).nullable().optional(),
  deliveryNotes: z.string().max(300).nullable().optional(),
  estimatedMinutes: z.number().int().min(0).max(600).nullable().optional(),
});

export function actorFrom(request: FastifyRequest): Actor {
  return { type: 'user', userId: request.user!.id, name: request.user!.name };
}

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  const { db, events } = app.ctx;

  app.get('/api/orders', async (request) => {
    const q = parse(ListQuery, request.query);
    const business = getBusiness(db, request.user!.businessId);
    const statuses = q.status
      ? (q.status.split(',').filter((s): s is (typeof ORDER_STATUSES)[number] => (ORDER_STATUSES as readonly string[]).includes(s)))
      : undefined;
    return listOrders(db, business, { ...q, statuses });
  });

  app.get('/api/orders/:id', async (request) => {
    const { id } = request.params as { id: string };
    return { order: getOrder(db, request.user!.businessId, id) };
  });

  app.post('/api/orders/quote', async (request) => {
    const body = parse(QuoteInputSchema, request.body);
    const business = getBusiness(db, request.user!.businessId);
    return { quote: quoteForBusiness(db, business, body) };
  });

  app.post('/api/orders', async (request, reply) => {
    const body = parse(CreateOrderSchema, request.body);
    const business = getBusiness(db, request.user!.businessId);
    const order = createOrder(db, { business, input: body, actor: actorFrom(request), origin: 'manual' });
    recordAudit(db, {
      businessId: business.id,
      userId: request.user!.id,
      userName: request.user!.name,
      action: 'order.created',
      entityType: 'order',
      entityId: order.id,
      details: { number: order.number, totalCents: order.totalCents, fulfillment: order.fulfillment },
      ip: request.ip,
    });
    events.emit('order.created', { businessId: business.id, order, actor: actorFrom(request) });
    reply.code(201);
    return { order };
  });

  app.put('/api/orders/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(UpdateOrderSchema, request.body);
    const business = getBusiness(db, request.user!.businessId);
    const order = updateOrder(db, { business, orderId: id, input: body, actor: actorFrom(request) });
    recordAudit(db, { businessId: business.id, userId: request.user!.id, userName: request.user!.name, action: 'order.updated', entityType: 'order', entityId: id, details: { totalCents: order.totalCents }, ip: request.ip });
    return { order };
  });

  app.post('/api/orders/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(StatusBody, request.body);
    const order = changeOrderStatus(db, {
      businessId: request.user!.businessId,
      orderId: id,
      to: body.status,
      actor: actorFrom(request),
      note: body.note,
      cancelReason: body.cancelReason,
      events,
    });
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'order.status_changed', entityType: 'order', entityId: id, details: { to: body.status }, ip: request.ip });
    return { order };
  });

  app.post('/api/orders/:id/payment', async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(PaymentBody, request.body);
    const order = changePaymentStatus(db, {
      businessId: request.user!.businessId,
      orderId: id,
      to: body.paymentStatus,
      actor: actorFrom(request),
      note: body.note,
      events,
    });
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'order.payment_changed', entityType: 'order', entityId: id, details: { to: body.paymentStatus }, ip: request.ip });
    return { order };
  });

  app.patch('/api/orders/:id/notes', async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(NotesBody, request.body);
    const order = updateOrderNotes(db, { businessId: request.user!.businessId, orderId: id, actor: actorFrom(request), ...body });
    return { order };
  });
}
