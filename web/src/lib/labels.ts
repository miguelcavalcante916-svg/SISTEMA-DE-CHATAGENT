import type { Fulfillment, OrderStatus, PaymentMethodId, PaymentStatus } from '../api/types';

export const ORDER_STATUSES: OrderStatus[] = ['recebido', 'confirmado', 'em_preparo', 'pronto', 'saiu_para_entrega', 'concluido', 'cancelado'];
export const ACTIVE_STATUSES: OrderStatus[] = ['recebido', 'confirmado', 'em_preparo', 'pronto', 'saiu_para_entrega'];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  recebido: 'Recebido',
  confirmado: 'Confirmado',
  em_preparo: 'Em preparo',
  pronto: 'Pronto',
  saiu_para_entrega: 'Saiu para entrega',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};
export const ORDER_STATUS_ICON: Record<OrderStatus, string> = {
  recebido: '📥',
  confirmado: '✅',
  em_preparo: '👨‍🍳',
  pronto: '🛎️',
  saiu_para_entrega: '🛵',
  concluido: '🏁',
  cancelado: '✖️',
};
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pendente: 'Pagamento pendente',
  aguardando_pix: 'Aguardando confirmação do Pix',
  pago: 'Pago',
  falhou: 'Pagamento falhou',
  reembolsado: 'Reembolsado',
  nao_aplicavel: 'Pagamento não se aplica',
};
export const PAYMENT_STATUS_ICON: Record<PaymentStatus, string> = {
  pendente: '⏳',
  aguardando_pix: '⏳',
  pago: '💰',
  falhou: '⚠️',
  reembolsado: '↩️',
  nao_aplicavel: '—',
};
export const FULFILLMENT_LABEL: Record<Fulfillment, string> = { delivery: 'Entrega', pickup: 'Retirada', dine_in: 'No local' };
export const FULFILLMENT_ICON: Record<Fulfillment, string> = { delivery: '🛵', pickup: '🛍️', dine_in: '🍽️' };
export const PAYMENT_METHOD_LABEL: Record<PaymentMethodId, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  vale_refeicao: 'Vale-refeição',
  outro: 'Outro',
};
export const CATEGORY_LABEL: Record<string, string> = {
  pizzaria: 'Pizzaria',
  hamburgueria: 'Hamburgueria',
  acaiteria: 'Açaíteria',
  sorveteria: 'Sorveteria',
  churrascaria: 'Churrascaria',
  bar: 'Bar',
  outro: 'Outro',
};
export const WEEKDAY_LABEL: Record<string, string> = { mon: 'Segunda', tue: 'Terça', wed: 'Quarta', thu: 'Quinta', fri: 'Sexta', sat: 'Sábado', sun: 'Domingo' };
export const CHANNEL_LABEL: Record<string, string> = { simulator: 'Simulador', whatsapp: 'WhatsApp', manual: 'Manual' };
export const ORIGIN_LABEL = (origin: string) => (origin === 'manual' ? 'Painel' : origin.startsWith('conversation:') ? `Conversa (${CHANNEL_LABEL[origin.split(':')[1] ?? ''] ?? origin})` : origin);
