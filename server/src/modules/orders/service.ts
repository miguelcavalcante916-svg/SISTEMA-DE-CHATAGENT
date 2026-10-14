import type { EventEmitter } from 'node:events';
import { z } from 'zod';
import type { DB } from '../../db/connection.js';
import { badRequest, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import { parseJson } from '../../lib/json.js';
import { onlyDigits } from '../../lib/text.js';
import { localDayRangeUtc, nowIso } from '../../lib/time.js';
import type { Business } from '../business/service.js';
import { listZones } from '../business/zones.js';
import { loadCatalogSnapshot } from '../catalog/service.js';
import { validatePixConfig } from '../payments/pix/validate.js';
import { quoteOrder, QuoteInputSchema, type Quote, type QuoteIssue } from './pricing.js';
import { checkPaymentTransition, checkStatusTransition, nextStatusOptions, PAYMENT_TRANSITIONS } from './state-machine.js';
import type { Fulfillment, OrderStatus, PaymentStatus } from './types.js';

export interface Actor {
  type: 'user' | 'system' | 'customer' | 'ai';
  userId?: string | null;
  name?: string | null;
}

export const AddressInputSchema = z.object({
  street: z.string().trim().max(120).default(''),
  number: z.string().trim().max(20).default(''),
  complement: z.string().trim().max(80).default(''),
  neighborhood: z.string().trim().max(80).default(''),
  city: z.string().trim().max(80).default(''),
  reference: z.string().trim().max(160).default(''),
});
export type AddressInput = z.infer<typeof AddressInputSchema>;

export const CreateOrderSchema = QuoteInputSchema.extend({
  customer: z
    .object({
      name: z.string().trim().max(80).default(''),
      phone: z.string().trim().max(30).default(''),
    })
    .prefault({}),
  address: AddressInputSchema.nullable().optional(),
  tableLabel: z.string().trim().max(30).nullable().optional(),
  customerNotes: z.string().max(500).nullable().optional(),
  internalNotes: z.string().max(500).nullable().optional(),
  deliveryNotes: z.string().max(300).nullable().optional(),
  estimatedMinutes: z.number().int().min(0).max(600).nullable().optional(),
  /** O cliente confirmou o resumo (itens, endereço, valor e pagamento). Obrigatório. */
  customerConfirmed: z.boolean(),
  initialStatus: z.enum(['recebido', 'confirmado']).default('recebido'),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

export const UpdateOrderSchema = CreateOrderSchema.omit({ customerConfirmed: true, initialStatus: true });
export type UpdateOrderInput = z.infer<typeof UpdateOrderSchema>;

export interface OrderItemDto {
  id: string;
  productId: string | null;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  unitPriceCents: number;
  optionsPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  notes: string | null;
  options: { groupName: string; optionName: string; priceCents: number; quantity: number }[];
}

export interface OrderEventDto {
  id: string;
  type: string;
  fromValue: string | null;
  toValue: string | null;
  actorType: string;
  actorName: string | null;
  note: string | null;
  createdAt: string;
}

export interface OrderDto {
  id: string;
  number: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  fulfillment: Fulfillment;
  customer: { name: string; phone: string };
  address: AddressInput | null;
  deliveryZone: { id: string | null; name: string } | null;
  tableLabel: string | null;
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  cashReceivedCents: number | null;
  changeCents: number | null;
  origin: string;
  conversationId: string | null;
  customerNotes: string | null;
  internalNotes: string | null;
  deliveryNotes: string | null;
  estimatedMinutes: number | null;
  customerConfirmedAt: string | null;
  createdByUserId: string | null;
  paidConfirmedByUserId: string | null;
  paidConfirmedByName: string | null;
  paidConfirmedAt: string | null;
  printCount: number;
  lastPrintedAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemDto[];
  events: OrderEventDto[];
  allowedStatuses: OrderStatus[];
  allowedPaymentStatuses: PaymentStatus[];
}

interface OrderRow {
  id: string;
  business_id: string;
  number: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string | null;
  fulfillment: Fulfillment;
  customer_name: string | null;
  customer_phone: string | null;
  address_json: string | null;
  delivery_zone_id: string | null;
  delivery_zone_name: string | null;
  table_label: string | null;
  subtotal_cents: number;
  discount_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  cash_received_cents: number | null;
  change_cents: number | null;
  origin: string;
  conversation_id: string | null;
  customer_notes: string | null;
  internal_notes: string | null;
  delivery_notes: string | null;
  estimated_minutes: number | null;
  customer_confirmed_at: string | null;
  created_by_user_id: string | null;
  paid_confirmed_by_user_id: string | null;
  paid_confirmed_at: string | null;
  print_count: number;
  last_printed_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  paid_confirmed_by_name?: string | null;
}

export function normalizePhone(phone: string): string {
  const d = onlyDigits(phone);
  if (!d) return '';
  if ((d.length === 10 || d.length === 11) && !d.startsWith('55')) return `55${d}`;
  return d;
}

function validateCustomerData(input: CreateOrderInput | UpdateOrderInput): QuoteIssue[] {
  const issues: QuoteIssue[] = [];
  const hasName = input.customer.name.trim().length > 0;
  const hasPhone = normalizePhone(input.customer.phone).length >= 10;
  if (input.fulfillment === 'delivery') {
    const a = input.address;
    if (!a || !a.street.trim()) issues.push({ code: 'address_required', message: 'Endereço de entrega é obrigatório (rua).' });
    else if (!a.number.trim() && !a.reference.trim()) issues.push({ code: 'address_number_required', message: 'Informe o número ou um ponto de referência.' });
    if (!hasName) issues.push({ code: 'customer_name_required', message: 'Nome do cliente é obrigatório para entrega.' });
    if (!hasPhone) issues.push({ code: 'customer_phone_required', message: 'Telefone do cliente é obrigatório para entrega.' });
  } else if (input.fulfillment === 'pickup') {
    if (!hasName && !hasPhone) issues.push({ code: 'customer_required', message: 'Informe nome ou telefone do cliente para retirada.' });
  } else if (!hasName && !input.tableLabel?.trim()) {
    issues.push({ code: 'table_or_name_required', message: 'Informe a mesa ou o nome do cliente.' });
  }
  return issues;
}

export function quoteForBusiness(db: DB, business: Business, input: z.infer<typeof QuoteInputSchema>, now?: Date): Quote {
  const snapshot = loadCatalogSnapshot(db, business.id);
  const zones = listZones(db, business.id, { activeOnly: true });
  return quoteOrder({ snapshot, business, zones, input, now });
}

function initialPaymentStatus(business: Business, method: string | null | undefined): PaymentStatus {
  if (method === 'pix') {
    const pix = business.settings.pix;
    if (pix.enabled && validatePixConfig(pix).ok) return 'aguardando_pix';
  }
  return 'pendente';
}

export function createOrder(
  db: DB,
  params: {
    business: Business;
    input: CreateOrderInput;
    actor: Actor;
    origin: string;
    conversationId?: string | null;
    now?: Date;
  },
): OrderDto {
  const { business, input, actor } = params;
  if (!input.customerConfirmed) {
    throw unprocessable('O cliente precisa confirmar o resumo do pedido antes da criação.', [
      { code: 'confirmation_required', message: 'Confirmação explícita do cliente é obrigatória.' },
    ]);
  }
  const quote = quoteForBusiness(db, business, input, params.now);
  const issues = [...quote.issues, ...validateCustomerData(input)];
  if (issues.length > 0) throw unprocessable('Não foi possível criar o pedido.', issues);

  const now = nowIso();
  const id = newId();
  const paymentStatus = initialPaymentStatus(business, input.paymentMethod);
  const address = input.fulfillment === 'delivery' ? input.address ?? null : null;

  db.transaction(() => {
    const next = (db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM orders WHERE business_id = ?').get(business.id) as { n: number }).n;
    db.prepare(
      `INSERT INTO orders (id, business_id, number, status, payment_status, payment_method, fulfillment, customer_name, customer_phone, address_json,
        delivery_zone_id, delivery_zone_name, table_label, subtotal_cents, discount_cents, delivery_fee_cents, total_cents, cash_received_cents, change_cents,
        origin, conversation_id, customer_notes, internal_notes, delivery_notes, estimated_minutes, customer_confirmed_at, created_by_user_id,
        paid_confirmed_by_user_id, paid_confirmed_at, print_count, last_printed_at, cancel_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, NULL, NULL, ?, ?)`,
    ).run(
      id,
      business.id,
      next,
      input.initialStatus,
      paymentStatus,
      input.paymentMethod ?? null,
      input.fulfillment,
      input.customer.name.trim() || null,
      normalizePhone(input.customer.phone) || null,
      address ? JSON.stringify(address) : null,
      quote.deliveryZone?.id ?? null,
      quote.deliveryZone?.name ?? null,
      input.tableLabel?.trim() || null,
      quote.subtotalCents,
      quote.discountCents,
      quote.deliveryFeeCents,
      quote.totalCents,
      input.paymentMethod === 'dinheiro' ? input.cashReceivedCents ?? null : null,
      quote.changeCents,
      params.origin,
      params.conversationId ?? null,
      input.customerNotes?.trim() || null,
      input.internalNotes?.trim() || null,
      input.deliveryNotes?.trim() || null,
      input.estimatedMinutes ?? quote.estimatedMinutes,
      now,
      actor.userId ?? null,
      now,
      now,
    );
    writeItems(db, id, quote);
    insertEvent(db, id, { type: 'created', fromValue: null, toValue: input.initialStatus, actor, note: `Pedido criado (${params.origin})` });
    if (paymentStatus === 'aguardando_pix') {
      insertEvent(db, id, { type: 'payment_change', fromValue: null, toValue: 'aguardando_pix', actor: { type: 'system' }, note: 'Pix: aguardando confirmação' });
    }
  })();
  return getOrder(db, business.id, id);
}

function writeItems(db: DB, orderId: string, quote: Quote) {
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);
  quote.items.forEach((it, idx) => {
    const itemId = newId();
    db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, product_name, variant_id, variant_name, unit_price_cents, options_price_cents, quantity, line_total_cents, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(itemId, orderId, it.productId, it.productName, it.variantId, it.variantName, it.unitPriceCents, it.optionsPriceCents, it.quantity, it.lineTotalCents, it.notes, idx);
    for (const o of it.options) {
      db.prepare(
        `INSERT INTO order_item_options (id, order_item_id, group_id, group_name, option_id, option_name, price_cents, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(newId(), itemId, o.groupId, o.groupName, o.optionId, o.optionName, o.priceCents, o.quantity);
    }
  });
}

function insertEvent(
  db: DB,
  orderId: string,
  e: { type: string; fromValue: string | null; toValue: string | null; actor: Actor; note?: string | null },
) {
  db.prepare(
    `INSERT INTO order_events (id, order_id, type, from_value, to_value, actor_type, actor_user_id, actor_name, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(newId(), orderId, e.type, e.fromValue, e.toValue, e.actor.type, e.actor.userId ?? null, e.actor.name ?? null, e.note ?? null, nowIso());
}

function loadItems(db: DB, orderIds: string[]): Map<string, OrderItemDto[]> {
  const map = new Map<string, OrderItemDto[]>();
  if (orderIds.length === 0) return map;
  const placeholders = orderIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY sort_order`)
    .all(...orderIds) as {
    id: string;
    order_id: string;
    product_id: string | null;
    product_name: string;
    variant_id: string | null;
    variant_name: string | null;
    unit_price_cents: number;
    options_price_cents: number;
    quantity: number;
    line_total_cents: number;
    notes: string | null;
  }[];
  const itemIds = rows.map((r) => r.id);
  const optionsByItem = new Map<string, OrderItemDto['options']>();
  if (itemIds.length > 0) {
    const ph = itemIds.map(() => '?').join(',');
    const optRows = db
      .prepare(`SELECT * FROM order_item_options WHERE order_item_id IN (${ph})`)
      .all(...itemIds) as { order_item_id: string; group_name: string; option_name: string; price_cents: number; quantity: number }[];
    for (const o of optRows) {
      const list = optionsByItem.get(o.order_item_id) ?? [];
      list.push({ groupName: o.group_name, optionName: o.option_name, priceCents: o.price_cents, quantity: o.quantity });
      optionsByItem.set(o.order_item_id, list);
    }
  }
  for (const r of rows) {
    const list = map.get(r.order_id) ?? [];
    list.push({
      id: r.id,
      productId: r.product_id,
      productName: r.product_name,
      variantId: r.variant_id,
      variantName: r.variant_name,
      unitPriceCents: r.unit_price_cents,
      optionsPriceCents: r.options_price_cents,
      quantity: r.quantity,
      lineTotalCents: r.line_total_cents,
      notes: r.notes,
      options: optionsByItem.get(r.id) ?? [],
    });
    map.set(r.order_id, list);
  }
  return map;
}

function rowToDto(row: OrderRow, items: OrderItemDto[], events: OrderEventDto[]): OrderDto {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    fulfillment: row.fulfillment,
    customer: { name: row.customer_name ?? '', phone: row.customer_phone ?? '' },
    address: parseJson<AddressInput | null>(row.address_json, null),
    deliveryZone: row.delivery_zone_name ? { id: row.delivery_zone_id, name: row.delivery_zone_name } : null,
    tableLabel: row.table_label,
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    deliveryFeeCents: row.delivery_fee_cents,
    totalCents: row.total_cents,
    cashReceivedCents: row.cash_received_cents,
    changeCents: row.change_cents,
    origin: row.origin,
    conversationId: row.conversation_id,
    customerNotes: row.customer_notes,
    internalNotes: row.internal_notes,
    deliveryNotes: row.delivery_notes,
    estimatedMinutes: row.estimated_minutes,
    customerConfirmedAt: row.customer_confirmed_at,
    createdByUserId: row.created_by_user_id,
    paidConfirmedByUserId: row.paid_confirmed_by_user_id,
    paidConfirmedByName: row.paid_confirmed_by_name ?? null,
    paidConfirmedAt: row.paid_confirmed_at,
    printCount: row.print_count,
    lastPrintedAt: row.last_printed_at,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
    events,
    allowedStatuses: nextStatusOptions(row.status, row.fulfillment),
    allowedPaymentStatuses: PAYMENT_TRANSITIONS[row.payment_status],
  };
}

const SELECT_ORDER = `SELECT o.*, u.name AS paid_confirmed_by_name FROM orders o LEFT JOIN users u ON u.id = o.paid_confirmed_by_user_id`;

export function getOrder(db: DB, businessId: string, id: string): OrderDto {
  const row = db.prepare(`${SELECT_ORDER} WHERE o.id = ? AND o.business_id = ?`).get(id, businessId) as OrderRow | undefined;
  if (!row) throw notFound('Pedido não encontrado');
  const items = loadItems(db, [id]).get(id) ?? [];
  const events = (
    db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC').all(id) as {
      id: string;
      type: string;
      from_value: string | null;
      to_value: string | null;
      actor_type: string;
      actor_name: string | null;
      note: string | null;
      created_at: string;
    }[]
  ).map((e) => ({
    id: e.id,
    type: e.type,
    fromValue: e.from_value,
    toValue: e.to_value,
    actorType: e.actor_type,
    actorName: e.actor_name,
    note: e.note,
    createdAt: e.created_at,
  }));
  return rowToDto(row, items, events);
}

export interface ListOrdersFilters {
  scope?: 'active' | 'all';
  date?: string;
  statuses?: OrderStatus[];
  fulfillment?: Fulfillment;
  paymentStatus?: PaymentStatus;
  q?: string;
  limit?: number;
}

export function listOrders(db: DB, business: Business, f: ListOrdersFilters): { orders: OrderDto[]; counts: Record<string, number> } {
  const where: string[] = ['o.business_id = ?'];
  const args: unknown[] = [business.id];
  if (f.date) {
    const r = localDayRangeUtc(f.date, business.timezone);
    where.push('o.created_at >= ? AND o.created_at < ?');
    args.push(r.startIso, r.endIso);
  }
  if (f.statuses && f.statuses.length > 0) {
    where.push(`o.status IN (${f.statuses.map(() => '?').join(',')})`);
    args.push(...f.statuses);
  } else if ((f.scope ?? 'active') === 'active' && !f.date && !f.q) {
    where.push("o.status NOT IN ('concluido', 'cancelado')");
  }
  if (f.fulfillment) {
    where.push('o.fulfillment = ?');
    args.push(f.fulfillment);
  }
  if (f.paymentStatus) {
    where.push('o.payment_status = ?');
    args.push(f.paymentStatus);
  }
  if (f.q && f.q.trim()) {
    const q = f.q.trim();
    const digits = onlyDigits(q);
    const parts: string[] = ['o.customer_name LIKE ?'];
    args.push(`%${q}%`);
    if (digits) {
      parts.push('o.customer_phone LIKE ?');
      args.push(`%${digits}%`);
      if (/^\d+$/.test(q)) {
        parts.push('o.number = ?');
        args.push(Number(q));
      }
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  const limit = Math.min(500, Math.max(1, f.limit ?? 200));
  const rows = db
    .prepare(`${SELECT_ORDER} WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC LIMIT ?`)
    .all(...args, limit) as OrderRow[];
  const items = loadItems(
    db,
    rows.map((r) => r.id),
  );
  const orders = rows.map((r) => rowToDto(r, items.get(r.id) ?? [], []));
  const countRows = db
    .prepare(`SELECT status, COUNT(*) AS c FROM orders WHERE business_id = ? AND status NOT IN ('concluido','cancelado') GROUP BY status`)
    .all(business.id) as { status: string; c: number }[];
  const counts: Record<string, number> = {};
  for (const c of countRows) counts[c.status] = c.c;
  counts.aguardando_pix = (
    db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE business_id = ? AND payment_status = 'aguardando_pix' AND status NOT IN ('concluido','cancelado')`).get(business.id) as { c: number }
  ).c;
  return { orders, counts };
}

export function changeOrderStatus(
  db: DB,
  params: { businessId: string; orderId: string; to: OrderStatus; actor: Actor; note?: string | null; cancelReason?: string | null; events?: EventEmitter },
): OrderDto {
  const row = db.prepare('SELECT * FROM orders WHERE id = ? AND business_id = ?').get(params.orderId, params.businessId) as OrderRow | undefined;
  if (!row) throw notFound('Pedido não encontrado');
  const check = checkStatusTransition(row.status, params.to, row.fulfillment);
  if (!check.ok) throw unprocessable(check.reason ?? 'Transição inválida', [{ code: 'invalid_transition', message: check.reason }]);
  if (params.to === 'cancelado' && params.actor.type !== 'user') {
    // cancelamento automático não é permitido; só pessoa
    throw forbidden('Somente uma pessoa pode cancelar um pedido.');
  }
  db.transaction(() => {
    db.prepare('UPDATE orders SET status = ?, cancel_reason = ?, updated_at = ? WHERE id = ?').run(
      params.to,
      params.to === 'cancelado' ? params.cancelReason?.trim() || params.note?.trim() || null : row.cancel_reason,
      nowIso(),
      row.id,
    );
    insertEvent(db, row.id, { type: 'status_change', fromValue: row.status, toValue: params.to, actor: params.actor, note: params.note ?? null });
  })();
  const dto = getOrder(db, params.businessId, row.id);
  params.events?.emit('order.status_changed', { businessId: params.businessId, order: dto, from: row.status, to: params.to, actor: params.actor });
  return dto;
}

export function changePaymentStatus(
  db: DB,
  params: { businessId: string; orderId: string; to: PaymentStatus; actor: Actor; note?: string | null; events?: EventEmitter },
): OrderDto {
  const row = db.prepare('SELECT * FROM orders WHERE id = ? AND business_id = ?').get(params.orderId, params.businessId) as OrderRow | undefined;
  if (!row) throw notFound('Pedido não encontrado');
  const check = checkPaymentTransition(row.payment_status, params.to);
  if (!check.ok) throw unprocessable(check.reason ?? 'Transição inválida', [{ code: 'invalid_transition', message: check.reason }]);
  if (params.to === 'pago' && params.actor.type !== 'user') {
    // No MVP, "pago" é sempre conferência manual de uma pessoa (sem integração bancária verificada).
    throw forbidden('A confirmação de pagamento deve ser feita por uma pessoa.');
  }
  const now = nowIso();
  db.transaction(() => {
    if (params.to === 'pago') {
      db.prepare('UPDATE orders SET payment_status = ?, paid_confirmed_by_user_id = ?, paid_confirmed_at = ?, updated_at = ? WHERE id = ?').run(
        params.to,
        params.actor.userId ?? null,
        now,
        now,
        row.id,
      );
    } else {
      db.prepare('UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?').run(params.to, now, row.id);
    }
    insertEvent(db, row.id, { type: 'payment_change', fromValue: row.payment_status, toValue: params.to, actor: params.actor, note: params.note ?? null });
  })();
  const dto = getOrder(db, params.businessId, row.id);
  params.events?.emit('order.payment_changed', { businessId: params.businessId, order: dto, from: row.payment_status, to: params.to, actor: params.actor });
  return dto;
}

export function updateOrder(
  db: DB,
  params: { business: Business; orderId: string; input: UpdateOrderInput; actor: Actor },
): OrderDto {
  const { business, input, actor } = params;
  const row = db.prepare('SELECT * FROM orders WHERE id = ? AND business_id = ?').get(params.orderId, business.id) as OrderRow | undefined;
  if (!row) throw notFound('Pedido não encontrado');
  if (!['recebido', 'confirmado'].includes(row.status)) {
    throw badRequest('Só é possível editar itens de pedidos recebidos ou confirmados.');
  }
  const quote = quoteForBusiness(db, business, input);
  const issues = [...quote.issues, ...validateCustomerData(input)];
  if (issues.length > 0) throw unprocessable('Não foi possível atualizar o pedido.', issues);
  const address = input.fulfillment === 'delivery' ? input.address ?? null : null;
  const paymentChanged = (input.paymentMethod ?? null) !== row.payment_method;
  const newPaymentStatus = paymentChanged && ['pendente', 'aguardando_pix'].includes(row.payment_status) ? initialPaymentStatus(business, input.paymentMethod) : row.payment_status;
  db.transaction(() => {
    db.prepare(
      `UPDATE orders SET payment_method = ?, payment_status = ?, fulfillment = ?, customer_name = ?, customer_phone = ?, address_json = ?, delivery_zone_id = ?, delivery_zone_name = ?, table_label = ?,
        subtotal_cents = ?, discount_cents = ?, delivery_fee_cents = ?, total_cents = ?, cash_received_cents = ?, change_cents = ?, customer_notes = ?, internal_notes = ?, delivery_notes = ?, estimated_minutes = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.paymentMethod ?? null,
      newPaymentStatus,
      input.fulfillment,
      input.customer.name.trim() || null,
      normalizePhone(input.customer.phone) || null,
      address ? JSON.stringify(address) : null,
      quote.deliveryZone?.id ?? null,
      quote.deliveryZone?.name ?? null,
      input.tableLabel?.trim() || null,
      quote.subtotalCents,
      quote.discountCents,
      quote.deliveryFeeCents,
      quote.totalCents,
      input.paymentMethod === 'dinheiro' ? input.cashReceivedCents ?? null : null,
      quote.changeCents,
      input.customerNotes?.trim() || null,
      input.internalNotes?.trim() || null,
      input.deliveryNotes?.trim() || null,
      input.estimatedMinutes ?? row.estimated_minutes,
      nowIso(),
      row.id,
    );
    writeItems(db, row.id, quote);
    insertEvent(db, row.id, {
      type: 'edited',
      fromValue: String(row.total_cents),
      toValue: String(quote.totalCents),
      actor,
      note: `Pedido editado: ${quote.items.length} item(ns), total ${(quote.totalCents / 100).toFixed(2)}`,
    });
    if (newPaymentStatus !== row.payment_status) {
      insertEvent(db, row.id, { type: 'payment_change', fromValue: row.payment_status, toValue: newPaymentStatus, actor: { type: 'system' }, note: 'Forma de pagamento alterada' });
    }
  })();
  return getOrder(db, business.id, row.id);
}

export function updateOrderNotes(
  db: DB,
  params: { businessId: string; orderId: string; actor: Actor; internalNotes?: string | null; deliveryNotes?: string | null; estimatedMinutes?: number | null },
): OrderDto {
  const row = db.prepare('SELECT * FROM orders WHERE id = ? AND business_id = ?').get(params.orderId, params.businessId) as OrderRow | undefined;
  if (!row) throw notFound('Pedido não encontrado');
  db.prepare('UPDATE orders SET internal_notes = ?, delivery_notes = ?, estimated_minutes = ?, updated_at = ? WHERE id = ?').run(
    params.internalNotes === undefined ? row.internal_notes : params.internalNotes,
    params.deliveryNotes === undefined ? row.delivery_notes : params.deliveryNotes,
    params.estimatedMinutes === undefined ? row.estimated_minutes : params.estimatedMinutes,
    nowIso(),
    row.id,
  );
  insertEvent(db, row.id, { type: 'note', fromValue: null, toValue: null, actor: params.actor, note: 'Observações internas atualizadas' });
  return getOrder(db, params.businessId, row.id);
}

export function recordPrint(
  db: DB,
  params: { businessId: string; orderId: string; reprint: boolean; actor: Actor; provider: string; status: 'done' | 'failed' | 'browser'; copies: number; error?: string | null },
): OrderDto {
  const row = db.prepare('SELECT * FROM orders WHERE id = ? AND business_id = ?').get(params.orderId, params.businessId) as OrderRow | undefined;
  if (!row) throw notFound('Pedido não encontrado');
  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO print_jobs (id, business_id, order_id, kind, provider, status, copies, error, user_id, user_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId(), params.businessId, row.id, params.reprint ? 'reprint' : 'order', params.provider, params.status, params.copies, params.error ?? null, params.actor.userId ?? null, params.actor.name ?? null, now);
    if (params.status !== 'failed') {
      db.prepare('UPDATE orders SET print_count = print_count + 1, last_printed_at = ?, updated_at = ? WHERE id = ?').run(now, now, row.id);
    }
    insertEvent(db, row.id, {
      type: 'printed',
      fromValue: null,
      toValue: params.status,
      actor: params.actor,
      note: params.status === 'failed' ? `Falha na impressão: ${params.error ?? ''}` : params.reprint ? 'REIMPRESSÃO' : 'Impressão do comprovante',
    });
  })();
  return getOrder(db, params.businessId, row.id);
}
