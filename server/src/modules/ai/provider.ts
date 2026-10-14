import { z } from 'zod';

/** Entrada enviada ao provedor de IA: apenas dados aprovados do estabelecimento e estado da conversa. */
export interface AgentInput {
  systemPrompt: string;
  /** Contexto já serializado (estabelecimento, catálogo disponível, conhecimento aprovado, rascunho atual). */
  context: string;
  history: Array<{ role: 'customer' | 'assistant' | 'system'; content: string }>;
  customerMessage: string;
  /** Limite de caracteres da resposta ao cliente */
  maxReplyChars: number;
  temperature: number;
}

export const ProposedItemSchema = z.object({
  product_id: z.string().min(1).max(80),
  variant_id: z.string().max(80).nullable().optional(),
  quantity: z.number().int().min(1).max(50).default(1),
  option_ids: z.array(z.string().max(80)).max(30).default([]),
  notes: z.string().max(200).nullable().optional(),
});

export const AgentStructuredOutputSchema = z.object({
  intent: z.enum([
    'greeting',
    'question',
    'order_add',
    'order_change',
    'order_finalize',
    'confirm',
    'cancel',
    'handoff',
    'other',
  ]),
  reply: z.string().min(1).max(2000),
  proposed_items: z.array(ProposedItemSchema).max(30).default([]),
  proposed_changes: z
    .object({
      fulfillment: z.enum(['delivery', 'pickup', 'dine_in']).nullable().optional(),
      address: z
        .object({
          street: z.string().max(120).optional(),
          number: z.string().max(20).optional(),
          complement: z.string().max(80).optional(),
          neighborhood: z.string().max(80).optional(),
          reference: z.string().max(160).optional(),
        })
        .nullable()
        .optional(),
      payment_method: z.string().max(40).nullable().optional(),
      customer_name: z.string().max(80).nullable().optional(),
      cash_amount_cents: z.number().int().min(0).nullable().optional(),
      remove_product_ids: z.array(z.string().max(80)).max(30).optional(),
      clear_items: z.boolean().optional(),
    })
    .prefault({}),
  pending_fields: z.array(z.string().max(60)).max(20).default([]),
  confidence: z.number().min(0).max(1),
  needs_human: z.boolean().default(false),
  unanswered_question: z.string().max(500).nullable().optional(),
});
export type AgentStructuredOutput = z.infer<typeof AgentStructuredOutputSchema>;

/** JSON Schema equivalente, enviado ao Ollama em `format`. */
export const AGENT_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['greeting', 'question', 'order_add', 'order_change', 'order_finalize', 'confirm', 'cancel', 'handoff', 'other'],
    },
    reply: { type: 'string' },
    proposed_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          product_id: { type: 'string' },
          variant_id: { type: ['string', 'null'] },
          quantity: { type: 'integer' },
          option_ids: { type: 'array', items: { type: 'string' } },
          notes: { type: ['string', 'null'] },
        },
        required: ['product_id', 'quantity'],
      },
    },
    proposed_changes: {
      type: 'object',
      properties: {
        fulfillment: { type: ['string', 'null'], enum: ['delivery', 'pickup', 'dine_in', null] },
        address: {
          type: ['object', 'null'],
          properties: {
            street: { type: 'string' },
            number: { type: 'string' },
            complement: { type: 'string' },
            neighborhood: { type: 'string' },
            reference: { type: 'string' },
          },
        },
        payment_method: { type: ['string', 'null'] },
        customer_name: { type: ['string', 'null'] },
        cash_amount_cents: { type: ['integer', 'null'] },
        remove_product_ids: { type: 'array', items: { type: 'string' } },
        clear_items: { type: 'boolean' },
      },
    },
    pending_fields: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
    needs_human: { type: 'boolean' },
    unanswered_question: { type: ['string', 'null'] },
  },
  required: ['intent', 'reply', 'confidence', 'needs_human'],
} as const;

export type AgentOutput =
  | { kind: 'structured'; data: AgentStructuredOutput; raw: string; model: string; latencyMs: number }
  | { kind: 'text'; text: string; raw: string; model: string; latencyMs: number; reason: string }
  | { kind: 'unavailable'; reason: string; latencyMs: number };

export interface AIHealth {
  provider: string;
  configured: boolean;
  reachable: boolean;
  modelAvailable: boolean;
  baseUrl: string | null;
  model: string | null;
  availableModels: string[];
  error: string | null;
  checkedAt: string;
}

export interface AIProvider {
  readonly name: string;
  checkHealth(): Promise<AIHealth>;
  generate(input: AgentInput, signal?: AbortSignal): Promise<AgentOutput>;
}

export interface AIProviderSettings {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}
