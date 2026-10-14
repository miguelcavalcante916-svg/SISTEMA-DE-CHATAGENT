import { z } from 'zod';
import { parse } from '../../lib/validate.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM');

export const OpeningPeriodSchema = z.object({ open: hhmm, close: hhmm });
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const OpeningHoursSchema = z.object({
  mon: z.array(OpeningPeriodSchema).default([]),
  tue: z.array(OpeningPeriodSchema).default([]),
  wed: z.array(OpeningPeriodSchema).default([]),
  thu: z.array(OpeningPeriodSchema).default([]),
  fri: z.array(OpeningPeriodSchema).default([]),
  sat: z.array(OpeningPeriodSchema).default([]),
  sun: z.array(OpeningPeriodSchema).default([]),
});

export const PAYMENT_METHOD_IDS = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'vale_refeicao', 'outro'] as const;
export type PaymentMethodId = (typeof PAYMENT_METHOD_IDS)[number];

export const PaymentMethodSchema = z.object({
  id: z.enum(PAYMENT_METHOD_IDS),
  label: z.string().min(1).max(40),
  enabled: z.boolean().default(false),
});

export const PIX_KEY_TYPES = ['cpf', 'cnpj', 'email', 'phone', 'evp'] as const;
export type PixKeyType = (typeof PIX_KEY_TYPES)[number];

export const AddressSchema = z.object({
  street: z.string().max(120).default(''),
  number: z.string().max(20).default(''),
  complement: z.string().max(80).default(''),
  neighborhood: z.string().max(80).default(''),
  city: z.string().max(80).default(''),
  state: z.string().max(2).default(''),
  zip: z.string().max(12).default(''),
  reference: z.string().max(160).default(''),
});
export type Address = z.infer<typeof AddressSchema>;

export const ORDER_STATUSES = [
  'recebido',
  'confirmado',
  'em_preparo',
  'pronto',
  'saiu_para_entrega',
  'concluido',
  'cancelado',
] as const;

export const BusinessSettingsSchema = z.object({
  address: AddressSchema.prefault({}),
  openingHours: OpeningHoursSchema.prefault({}),
  closedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
  channels: z
    .object({
      manual: z.boolean().default(true),
      simulator: z.boolean().default(true),
      whatsapp: z.boolean().default(false),
    })
    .prefault({}),
  fulfillment: z
    .object({
      delivery: z.boolean().default(true),
      pickup: z.boolean().default(true),
      dineIn: z.boolean().default(false),
      reservations: z.boolean().default(false),
    })
    .prefault({}),
  paymentMethods: z.array(PaymentMethodSchema).default([
    { id: 'pix', label: 'Pix', enabled: true },
    { id: 'dinheiro', label: 'Dinheiro', enabled: true },
    { id: 'cartao_credito', label: 'Cartão de crédito (na entrega/balcão)', enabled: false },
    { id: 'cartao_debito', label: 'Cartão de débito (na entrega/balcão)', enabled: false },
    { id: 'vale_refeicao', label: 'Vale-refeição', enabled: false },
    { id: 'outro', label: 'Outro', enabled: false },
  ]),
  minOrderCents: z.number().int().min(0).default(0),
  defaultPrepMinutes: z.number().int().min(0).max(600).default(30),
  deliveryExtraMinutes: z.number().int().min(0).max(600).default(20),
  pix: z
    .object({
      enabled: z.boolean().default(false),
      keyType: z.enum(PIX_KEY_TYPES).nullable().default(null),
      key: z.string().max(77).default(''),
      receiverName: z.string().max(25).default(''),
      city: z.string().max(15).default(''),
      includeAmount: z.boolean().default(true),
      instructions: z.string().max(500).default(''),
    })
    .prefault({}),
  printer: z
    .object({
      provider: z.enum(['browser', 'escpos_network']).default('browser'),
      paperWidthMm: z.union([z.literal(80), z.literal(58)]).default(80),
      copies: z.number().int().min(1).max(5).default(1),
      cut: z.boolean().default(true),
      host: z.string().max(100).default(''),
      port: z.number().int().min(1).max(65535).default(9100),
      encoding: z.enum(['cp1252', 'ascii']).default('cp1252'),
      codepageCommand: z.number().int().min(0).max(255).nullable().default(16),
      headerText: z.string().max(200).default(''),
      footerText: z.string().max(200).default('Obrigado pela preferência!'),
      autoPrintOnCreate: z.boolean().default(false),
    })
    .prefault({}),
  handoff: z
    .object({
      policy: z
        .string()
        .max(1000)
        .default('Transferir para atendimento humano quando o cliente pedir, quando houver reclamação ou quando a IA não tiver certeza.'),
      keywords: z.array(z.string().min(1).max(40)).default(['atendente', 'humano', 'pessoa', 'falar com alguém', 'reclamação']),
      confidenceThreshold: z.number().min(0).max(1).default(0.6),
    })
    .prefault({}),
  messages: z
    .object({
      greeting: z.string().max(500).default('Olá! Bem-vindo(a). Posso ajudar com o cardápio e anotar seu pedido.'),
      closed: z.string().max(500).default('No momento estamos fechados. Deixe sua mensagem que respondemos quando abrirmos.'),
      privacyNotice: z
        .string()
        .max(800)
        .default(
          'Usamos seu nome, telefone e endereço apenas para atender e entregar seu pedido. Você pode pedir a remoção dos seus dados a qualquer momento.',
        ),
      awaitingConfirmation: z.string().max(300).default('Confere? Responda SIM para confirmar ou diga o que deseja alterar.'),
      orderConfirmed: z.string().max(300).default('Pedido confirmado! Número {numero}. Avisamos quando houver novidades.'),
      handoff: z.string().max(300).default('Vou chamar uma pessoa da equipe para continuar seu atendimento. Um momento.'),
      aiUnavailable: z
        .string()
        .max(300)
        .default('Recebemos sua mensagem. Um atendente vai responder em instantes.'),
      statusTemplates: z
        .object({
          confirmado: z.string().max(300).default('Seu pedido {numero} foi confirmado.'),
          em_preparo: z.string().max(300).default('Seu pedido {numero} está em preparo.'),
          pronto: z.string().max(300).default('Seu pedido {numero} está pronto.'),
          saiu_para_entrega: z.string().max(300).default('Seu pedido {numero} saiu para entrega.'),
          concluido: z.string().max(300).default('Pedido {numero} concluído. Obrigado!'),
          cancelado: z.string().max(300).default('Seu pedido {numero} foi cancelado.'),
        })
        .prefault({}),
    })
    .prefault({}),
  notifications: z
    .object({
      enabled: z.boolean().default(false),
      statuses: z.array(z.enum(ORDER_STATUSES)).default(['confirmado', 'pronto', 'saiu_para_entrega', 'cancelado']),
    })
    .prefault({}),
  retention: z
    .object({
      conversationDays: z.number().int().min(0).max(3650).default(90),
      personalDataDays: z.number().int().min(0).max(3650).default(365),
      auditDays: z.number().int().min(0).max(3650).default(365),
    })
    .prefault({}),
  ai: z
    .object({
      enabled: z.boolean().default(false),
      baseUrl: z.url().nullable().default(null),
      model: z.string().max(100).nullable().default(null),
      temperature: z.number().min(0).max(1).default(0.2),
      maxCatalogItems: z.number().int().min(10).max(300).default(80),
    })
    .prefault({}),
});

export type BusinessSettings = z.infer<typeof BusinessSettingsSchema>;

export function defaultSettings(): BusinessSettings {
  return BusinessSettingsSchema.parse({});
}

/** Faz merge raso de seções e revalida (entrada parcial vinda do painel). */
export function mergeSettings(current: BusinessSettings, patch: unknown): BusinessSettings {
  const p = (patch ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(p)) {
    const cur = (current as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      merged[k] = { ...(cur as Record<string, unknown>), ...(v as Record<string, unknown>) };
    } else {
      merged[k] = v;
    }
  }
  // Valores inválidos vindos do cliente viram 400 com detalhes, nunca 500.
  return parse(BusinessSettingsSchema, merged);
}
