export const ORDER_STATUSES = ['recebido', 'confirmado', 'em_preparo', 'pronto', 'saiu_para_entrega', 'concluido', 'cancelado'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['pendente', 'aguardando_pix', 'pago', 'falhou', 'reembolsado', 'nao_aplicavel'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const FULFILLMENTS = ['delivery', 'pickup', 'dine_in'] as const;
export type Fulfillment = (typeof FULFILLMENTS)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  recebido: 'Recebido',
  confirmado: 'Confirmado',
  em_preparo: 'Em preparo',
  pronto: 'Pronto',
  saiu_para_entrega: 'Saiu para entrega',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pendente: 'Pagamento pendente',
  aguardando_pix: 'Aguardando confirmação do Pix',
  pago: 'Pago',
  falhou: 'Pagamento falhou',
  reembolsado: 'Reembolsado',
  nao_aplicavel: 'Não se aplica',
};

export const FULFILLMENT_LABELS: Record<Fulfillment, string> = {
  delivery: 'Entrega',
  pickup: 'Retirada',
  dine_in: 'Consumo no local',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  vale_refeicao: 'Vale-refeição',
  outro: 'Outro',
};
