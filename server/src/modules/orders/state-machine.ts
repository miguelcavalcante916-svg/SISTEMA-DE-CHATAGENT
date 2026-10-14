import type { Fulfillment, OrderStatus, PaymentStatus } from './types.js';

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  recebido: ['confirmado', 'cancelado'],
  confirmado: ['em_preparo', 'cancelado'],
  em_preparo: ['pronto', 'cancelado'],
  pronto: ['saiu_para_entrega', 'concluido', 'cancelado'],
  saiu_para_entrega: ['concluido', 'cancelado'],
  concluido: [],
  cancelado: [],
};

export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pendente: ['aguardando_pix', 'pago', 'falhou', 'nao_aplicavel'],
  aguardando_pix: ['pago', 'falhou', 'pendente'],
  pago: ['reembolsado'],
  falhou: ['pendente', 'aguardando_pix', 'pago'],
  reembolsado: [],
  nao_aplicavel: ['pendente'],
};

export interface TransitionCheck {
  ok: boolean;
  reason?: string;
}

export function checkStatusTransition(from: OrderStatus, to: OrderStatus, fulfillment: Fulfillment): TransitionCheck {
  if (from === to) return { ok: false, reason: 'O pedido já está nesse status.' };
  if (!ORDER_TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: `Não é possível mudar de "${from}" para "${to}".` };
  }
  if (to === 'saiu_para_entrega' && fulfillment !== 'delivery') {
    return { ok: false, reason: 'Somente pedidos de entrega saem para entrega.' };
  }
  if (from === 'pronto' && to === 'concluido' && fulfillment === 'delivery') {
    return { ok: false, reason: 'Pedido de entrega precisa passar por "saiu para entrega" antes de concluir.' };
  }
  return { ok: true };
}

export function checkPaymentTransition(from: PaymentStatus, to: PaymentStatus): TransitionCheck {
  if (from === to) return { ok: false, reason: 'O pagamento já está nesse status.' };
  if (!PAYMENT_TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: `Não é possível mudar pagamento de "${from}" para "${to}".` };
  }
  return { ok: true };
}

export function nextStatusOptions(from: OrderStatus, fulfillment: Fulfillment): OrderStatus[] {
  return ORDER_TRANSITIONS[from].filter((to) => checkStatusTransition(from, to, fulfillment).ok);
}
