import { formatBRL } from '../../lib/money.js';
import { formatDateTime } from '../../lib/time.js';
import { wrapText } from '../../lib/text.js';
import type { Business } from '../business/service.js';
import type { OrderDto } from '../orders/service.js';
import { FULFILLMENT_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '../orders/types.js';

export interface ReceiptOptionLine {
  name: string;
  priceCents: number;
  quantity: number;
}
export interface ReceiptItem {
  quantity: number;
  name: string;
  variant: string | null;
  unitPriceCents: number;
  optionsPriceCents: number;
  lineTotalCents: number;
  options: ReceiptOptionLine[];
  notes: string | null;
}

/** Comprovante interno de pedido. NÃO é documento fiscal. */
export interface ReceiptModel {
  kind: 'order' | 'test';
  title: string;
  disclaimer: string;
  businessName: string;
  businessPhone: string | null;
  headerText: string | null;
  footerText: string | null;
  orderNumber: string;
  createdAt: string;
  printedAt: string;
  reprint: boolean;
  printedBy: string | null;
  fulfillment: string;
  customerName: string | null;
  customerPhone: string | null;
  addressLines: string[];
  tableLabel: string | null;
  items: ReceiptItem[];
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  paymentMethod: string | null;
  paymentStatus: string;
  cashReceivedCents: number | null;
  changeCents: number | null;
  customerNotes: string | null;
  deliveryNotes: string | null;
  estimatedMinutes: number | null;
  origin: string;
}

export const RECEIPT_DISCLAIMER = 'Comprovante interno de pedido. Não é documento fiscal.';

export function formatPhoneBR(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  const local = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}

export function buildReceiptModel(
  order: OrderDto,
  business: Business,
  opts: { reprint: boolean; printedBy: string | null; now?: Date },
): ReceiptModel {
  const tz = business.timezone;
  const now = opts.now ?? new Date();
  const addressLines: string[] = [];
  if (order.fulfillment === 'delivery' && order.address) {
    const a = order.address;
    const line1 = [a.street, a.number].filter(Boolean).join(', ');
    if (line1) addressLines.push(line1);
    if (a.complement) addressLines.push(a.complement);
    const line3 = [a.neighborhood, a.city].filter(Boolean).join(' - ');
    if (line3) addressLines.push(line3);
    if (a.reference) addressLines.push(`Ref.: ${a.reference}`);
    if (order.deliveryZone?.name && !a.neighborhood) addressLines.push(`Área: ${order.deliveryZone.name}`);
  }
  return {
    kind: 'order',
    title: 'COMPROVANTE DE PEDIDO',
    disclaimer: RECEIPT_DISCLAIMER,
    businessName: business.name,
    businessPhone: business.phone,
    headerText: business.settings.printer.headerText || null,
    footerText: business.settings.printer.footerText || null,
    orderNumber: `#${order.number}`,
    createdAt: formatDateTime(order.createdAt, tz),
    printedAt: formatDateTime(now.toISOString(), tz),
    reprint: opts.reprint,
    printedBy: opts.printedBy,
    fulfillment: FULFILLMENT_LABELS[order.fulfillment],
    customerName: order.customer.name || null,
    customerPhone: formatPhoneBR(order.customer.phone || null),
    addressLines,
    tableLabel: order.tableLabel,
    items: order.items.map((it) => ({
      quantity: it.quantity,
      name: it.productName,
      variant: it.variantName,
      unitPriceCents: it.unitPriceCents,
      optionsPriceCents: it.optionsPriceCents,
      lineTotalCents: it.lineTotalCents,
      options: it.options.map((o) => ({ name: o.optionName, priceCents: o.priceCents, quantity: o.quantity })),
      notes: it.notes,
    })),
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    deliveryFeeCents: order.deliveryFeeCents,
    totalCents: order.totalCents,
    paymentMethod: order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod : null,
    paymentStatus: PAYMENT_STATUS_LABELS[order.paymentStatus],
    cashReceivedCents: order.cashReceivedCents,
    changeCents: order.changeCents,
    customerNotes: order.customerNotes,
    deliveryNotes: order.deliveryNotes,
    estimatedMinutes: order.estimatedMinutes,
    origin: order.origin === 'manual' ? 'Atendimento manual' : order.origin.startsWith('conversation') ? 'Conversa' : order.origin,
  };
}

export function buildTestReceipt(business: Business, printedBy: string | null, now: Date = new Date()): ReceiptModel {
  const tz = business.timezone;
  return {
    kind: 'test',
    title: 'TESTE DE IMPRESSÃO',
    disclaimer: RECEIPT_DISCLAIMER,
    businessName: business.name,
    businessPhone: business.phone,
    headerText: business.settings.printer.headerText || null,
    footerText: business.settings.printer.footerText || null,
    orderNumber: '#TESTE',
    createdAt: formatDateTime(now.toISOString(), tz),
    printedAt: formatDateTime(now.toISOString(), tz),
    reprint: false,
    printedBy,
    fulfillment: 'Retirada',
    customerName: 'Cliente de Teste (fictício)',
    customerPhone: '(00) 00000-0000',
    addressLines: [],
    tableLabel: null,
    items: [
      { quantity: 1, name: 'Item de teste com acentuação: ação, pão, café', variant: 'Médio', unitPriceCents: 1234, optionsPriceCents: 100, lineTotalCents: 1334, options: [{ name: 'Adicional de teste', priceCents: 100, quantity: 1 }], notes: 'Observação de teste' },
    ],
    subtotalCents: 1334,
    discountCents: 0,
    deliveryFeeCents: 0,
    totalCents: 1334,
    paymentMethod: 'Dinheiro',
    paymentStatus: PAYMENT_STATUS_LABELS.pendente,
    cashReceivedCents: 2000,
    changeCents: 666,
    customerNotes: null,
    deliveryNotes: null,
    estimatedMinutes: null,
    origin: 'Teste',
  };
}

export const COLS_80MM = 48;
export const COLS_58MM = 32;

export function colsForPaper(paperWidthMm: 80 | 58): number {
  return paperWidthMm === 58 ? COLS_58MM : COLS_80MM;
}

function center(text: string, cols: number): string[] {
  return wrapText(text, cols).map((line) => {
    const pad = Math.max(0, Math.floor((cols - line.length) / 2));
    return `${' '.repeat(pad)}${line}`;
  });
}

function kv(label: string, value: string, cols: number): string {
  const space = cols - label.length - value.length;
  if (space >= 1) return `${label}${' '.repeat(space)}${value}`;
  // não cabe na mesma linha: valor alinhado à direita na linha seguinte
  return `${label}\n${' '.repeat(Math.max(0, cols - value.length))}${value}`;
}

/** Renderiza o comprovante em texto monoespaçado (uma linha por elemento do array). */
export function renderReceiptText(m: ReceiptModel, cols: number): string[] {
  const out: string[] = [];
  const rule = '-'.repeat(cols);
  const push = (s: string) => {
    for (const part of s.split('\n')) out.push(...(part.length > cols ? wrapText(part, cols) : [part]));
  };

  out.push(...center(m.businessName.toUpperCase(), cols));
  if (m.businessPhone) out.push(...center(m.businessPhone, cols));
  if (m.headerText) out.push(...center(m.headerText, cols));
  out.push(rule);
  out.push(...center(m.title, cols));
  if (m.reprint) {
    out.push(...center('*** REIMPRESSÃO ***', cols));
    out.push(...center(`${m.printedBy ?? 'usuário desconhecido'} - ${m.printedAt}`, cols));
  }
  out.push(rule);
  out.push(...center(`PEDIDO ${m.orderNumber}`, cols));
  push(kv('Data/hora:', m.createdAt, cols));
  push(kv('Modalidade:', m.fulfillment, cols));
  if (m.tableLabel) push(kv('Mesa:', m.tableLabel, cols));
  if (m.estimatedMinutes != null) push(kv('Previsão:', `${m.estimatedMinutes} min`, cols));
  push(kv('Origem:', m.origin, cols));
  out.push(rule);
  if (m.customerName) push(`Cliente: ${m.customerName}`);
  if (m.customerPhone) push(`Telefone: ${m.customerPhone}`);
  if (m.addressLines.length > 0) {
    out.push('Entrega em:');
    for (const l of m.addressLines) push(`  ${l}`);
  }
  if (m.deliveryNotes) push(`Obs. entrega: ${m.deliveryNotes}`);
  out.push(rule);
  out.push('ITENS');
  for (const it of m.items) {
    const label = `${it.quantity}x ${it.name}${it.variant ? ` (${it.variant})` : ''}`;
    push(kv(label, formatBRL(it.lineTotalCents), cols));
    if (it.quantity > 1 || it.optionsPriceCents > 0) {
      push(`   ${formatBRL(it.unitPriceCents)} un.${it.optionsPriceCents > 0 ? ` + ${formatBRL(it.optionsPriceCents)} adicionais` : ''}`);
    }
    for (const o of it.options) {
      push(`   + ${o.quantity > 1 ? `${o.quantity}x ` : ''}${o.name}${o.priceCents > 0 ? ` (${formatBRL(o.priceCents)})` : ''}`);
    }
    if (it.notes) push(`   Obs: ${it.notes}`);
  }
  out.push(rule);
  push(kv('Subtotal:', formatBRL(m.subtotalCents), cols));
  if (m.discountCents > 0) push(kv('Desconto:', `-${formatBRL(m.discountCents)}`, cols));
  if (m.deliveryFeeCents > 0) push(kv('Taxa de entrega:', formatBRL(m.deliveryFeeCents), cols));
  push(kv('TOTAL:', formatBRL(m.totalCents), cols));
  out.push(rule);
  push(kv('Pagamento:', m.paymentMethod ?? 'não informado', cols));
  push(kv('Status pgto:', m.paymentStatus, cols));
  if (m.cashReceivedCents != null) push(kv('Recebido:', formatBRL(m.cashReceivedCents), cols));
  if (m.changeCents != null) push(kv('Troco:', formatBRL(m.changeCents), cols));
  if (m.customerNotes) {
    out.push(rule);
    push(`Obs. do cliente: ${m.customerNotes}`);
  }
  out.push(rule);
  if (m.footerText) out.push(...center(m.footerText, cols));
  for (const part of m.disclaimer.split(/(?<=\.)\s+/)) out.push(...center(part, cols));
  out.push(...center(`Impresso em ${m.printedAt}`, cols));
  return out;
}
