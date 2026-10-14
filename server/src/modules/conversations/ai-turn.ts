import type { FastifyInstance } from 'fastify';
import { normalizeForMatch } from '../../lib/text.js';
import { nowIso } from '../../lib/time.js';
import { buildAgentContext, SYSTEM_PROMPT } from '../ai/prompt.js';
import type { AgentStructuredOutput } from '../ai/provider.js';
import { resolveAiProvider } from '../ai/routes.js';
import { formatBRL } from '../../lib/money.js';
import type { Business } from '../business/service.js';
import { PAYMENT_METHOD_IDS, type PaymentMethodId } from '../business/settings.js';
import { listZones } from '../business/zones.js';
import { getCatalog, type Catalog } from '../catalog/service.js';
import { createSuggestion, listApprovedEntries } from '../knowledge/service.js';
import type { Quote, QuoteItemInput } from '../orders/pricing.js';
import { createOrder, quoteForBusiness, type AddressInput } from '../orders/service.js';
import { FULFILLMENT_LABELS, PAYMENT_METHOD_LABELS } from '../orders/types.js';
import { sendOutbound } from './outbound.js';
import { saveDraft, setNeedsHuman, updateCustomer, type ConversationRow, type DraftState, type MessageDto, type MessageRow } from './service.js';

const AFFIRMATIVE = /^(sim|s|ss|isso|ok|okay|okey|certo|correto|confirmo|confirmar|confirma|confirmado|pode ser|pode fechar|pode|fecha|fechar|fechado|manda|pode mandar|bora|beleza|blz|positivo|exato|perfeito|isso mesmo|tudo certo|ta certo|ta bom|tá bom|tudo ok)\b[\s!.]*$/i;
const NEGATIVE = /^(n|nao|não|negativo|errado|muda|mudar|trocar|alterar|cancela|cancelar|espera|peraí|pera|ainda nao|ainda não)\b/i;

export function isAffirmative(text: string): boolean {
  return AFFIRMATIVE.test(normalizeForMatch(text));
}
export function isNegative(text: string): boolean {
  return NEGATIVE.test(normalizeForMatch(text));
}
export function matchesHandoffKeyword(text: string, keywords: string[]): boolean {
  const t = normalizeForMatch(text);
  return keywords.some((k) => k && t.includes(normalizeForMatch(k)));
}

/** Resumo oficial calculado pelo servidor (nunca pela IA). */
export function buildSummary(quote: Quote, draft: DraftState, business: Business): string {
  const lines: string[] = ['Resumo do pedido:'];
  for (const it of quote.items) {
    const opts = it.options.map((o) => o.optionName).join(', ');
    lines.push(`• ${it.quantity}x ${it.productName}${it.variantName ? ` (${it.variantName})` : ''}${opts ? ` + ${opts}` : ''} — ${formatBRL(it.lineTotalCents)}`);
  }
  lines.push(`Modalidade: ${draft.fulfillment ? FULFILLMENT_LABELS[draft.fulfillment] : '-'}`);
  if (draft.fulfillment === 'delivery' && draft.address) {
    lines.push(`Endereço: ${[draft.address.street, draft.address.number, draft.address.complement, draft.address.neighborhood].filter(Boolean).join(', ')}`);
    lines.push(`Taxa de entrega: ${formatBRL(quote.deliveryFeeCents)}`);
  }
  if (quote.discountCents > 0) lines.push(`Desconto: -${formatBRL(quote.discountCents)}`);
  lines.push(`Total: ${formatBRL(quote.totalCents)}`);
  lines.push(`Pagamento: ${draft.paymentMethod ? PAYMENT_METHOD_LABELS[draft.paymentMethod] ?? draft.paymentMethod : '-'}${draft.paymentMethod === 'dinheiro' && draft.cashReceivedCents ? ` (troco para ${formatBRL(draft.cashReceivedCents)})` : ''}`);
  lines.push(`Previsão: ${quote.estimatedMinutes} min`);
  lines.push('');
  lines.push(business.settings.messages.awaitingConfirmation);
  return lines.join('\n');
}

interface Applied {
  rejected: string[];
}

/** Aplica as propostas da IA ao rascunho com validação determinística contra o catálogo e regras do estabelecimento. */
export function applyProposals(draft: DraftState, out: AgentStructuredOutput, catalog: Catalog, business: Business): Applied {
  const rejected: string[] = [];
  const products = new Map(catalog.products.filter((p) => !p.archivedAt).map((p) => [p.id, p]));
  const groups = new Map(catalog.optionGroups.map((g) => [g.id, g]));
  const ch = out.proposed_changes;

  if (ch.clear_items) draft.items = [];
  if (ch.remove_product_ids?.length) draft.items = draft.items.filter((it) => !ch.remove_product_ids!.includes(it.productId));

  for (const pi of out.proposed_items) {
    const product = products.get(pi.product_id);
    if (!product || !product.isAvailable) {
      rejected.push(`item desconhecido ou indisponível (${pi.product_id})`);
      continue;
    }
    const activeVariants = product.variants.filter((v) => v.isAvailable && !v.archivedAt);
    let variantId: string | null = null;
    if (activeVariants.length > 0) {
      const v = activeVariants.find((x) => x.id === pi.variant_id);
      if (!v) {
        rejected.push(`"${product.name}" precisa de tamanho/variante válida`);
        continue;
      }
      variantId = v.id;
    }
    const validOptionIds = new Set(product.optionGroupIds.flatMap((gid) => (groups.get(gid)?.options ?? []).filter((o) => o.isAvailable && !o.archivedAt).map((o) => o.id)));
    const options: QuoteItemInput['options'] = [];
    for (const oid of pi.option_ids) {
      if (validOptionIds.has(oid)) options.push({ optionId: oid, quantity: 1 });
      else rejected.push(`adicional desconhecido para "${product.name}" (${oid})`);
    }
    const item: QuoteItemInput = { productId: product.id, variantId, quantity: pi.quantity, notes: product.allowNotes ? pi.notes ?? null : null, options };
    const sameIdx = draft.items.findIndex((it) => it.productId === item.productId && it.variantId === item.variantId && JSON.stringify(it.options) === JSON.stringify(item.options) && (it.notes ?? null) === (item.notes ?? null));
    if (sameIdx >= 0) draft.items[sameIdx] = item; // a IA envia a quantidade total desejada
    else draft.items.push(item);
  }

  const f = business.settings.fulfillment;
  if (ch.fulfillment) {
    const enabled = (ch.fulfillment === 'delivery' && f.delivery) || (ch.fulfillment === 'pickup' && f.pickup) || (ch.fulfillment === 'dine_in' && f.dineIn);
    if (enabled) draft.fulfillment = ch.fulfillment;
    else rejected.push(`modalidade "${ch.fulfillment}" não habilitada`);
  }
  if (ch.address) {
    const prev = draft.address ?? { street: '', number: '', complement: '', neighborhood: '', city: '', reference: '' };
    const next: AddressInput = {
      street: ch.address.street ?? prev.street,
      number: ch.address.number ?? prev.number,
      complement: ch.address.complement ?? prev.complement,
      neighborhood: ch.address.neighborhood ?? prev.neighborhood,
      city: prev.city,
      reference: ch.address.reference ?? prev.reference,
    };
    draft.address = next;
  }
  if (ch.payment_method) {
    const id = normalizeForMatch(ch.payment_method).replace(/\s+/g, '_');
    const match = business.settings.paymentMethods.find((m) => m.enabled && (m.id === id || normalizeForMatch(m.label) === normalizeForMatch(ch.payment_method!)));
    const alias: Record<string, PaymentMethodId> = { cartao: 'cartao_credito', credito: 'cartao_credito', debito: 'cartao_debito', vr: 'vale_refeicao', va: 'vale_refeicao' };
    const resolved = match?.id ?? alias[id];
    if (resolved && (PAYMENT_METHOD_IDS as readonly string[]).includes(resolved) && business.settings.paymentMethods.some((m) => m.enabled && m.id === resolved)) draft.paymentMethod = resolved;
    else rejected.push(`forma de pagamento "${ch.payment_method}" não aceita`);
  }
  if (ch.cash_amount_cents != null) draft.cashReceivedCents = ch.cash_amount_cents;
  if (ch.customer_name) draft.customerName = ch.customer_name.slice(0, 80);
  return { rejected };
}

/** Resolve o bairro pelo texto do endereço (nome do bairro contido no nome da zona ou vice-versa). */
function resolveZone(draft: DraftState, business: Business, app: FastifyInstance): void {
  if (draft.fulfillment !== 'delivery') {
    draft.deliveryZoneId = null;
    return;
  }
  const zones = listZones(app.ctx.db, business.id, { activeOnly: true });
  if (zones.length === 0) return;
  const n = normalizeForMatch(draft.address?.neighborhood ?? '');
  if (!n) {
    draft.deliveryZoneId = null;
    return;
  }
  const zone = zones.find((z) => normalizeForMatch(z.name) === n) ?? zones.find((z) => n.includes(normalizeForMatch(z.name)) || normalizeForMatch(z.name).includes(n));
  draft.deliveryZoneId = zone?.id ?? null;
}

function missingFields(draft: DraftState, business: Business): string[] {
  const missing: string[] = [];
  if (draft.items.length === 0) missing.push('itens do pedido');
  if (!draft.fulfillment) missing.push('modalidade (entrega, retirada ou local)');
  if (draft.fulfillment === 'delivery') {
    if (!draft.address?.street) missing.push('endereço de entrega (rua e número)');
    else if (!draft.address.number && !draft.address.reference) missing.push('número ou ponto de referência');
    if (!draft.address?.neighborhood) missing.push('bairro');
    else if (listZones(app_db_holder.db!, business.id, { activeOnly: true }).length > 0 && !draft.deliveryZoneId) missing.push('bairro dentro da área atendida');
  }
  if (!draft.paymentMethod) missing.push('forma de pagamento');
  if (!draft.customerName && draft.fulfillment !== 'dine_in') missing.push('seu nome');
  return missing;
}
// pequeno "holder" para evitar passar o db por todas as funções puras acima
const app_db_holder: { db: import('../../db/connection.js').DB | null } = { db: null };

function sanitizeReply(text: string, max: number): string {
  let t = text.replace(/```[\s\S]*?```/g, '').replace(/\s{3,}/g, '\n\n').trim();
  if (t.length > max) t = `${t.slice(0, max - 1)}…`;
  return t;
}

export async function runAiTurn(app: FastifyInstance, business: Business, conv: ConversationRow, draft: DraftState, inbound: MessageRow): Promise<MessageDto[]> {
  const { db, config } = app.ctx;
  app_db_holder.db = db;
  const s = business.settings;
  const text = inbound.content;
  const replies: MessageDto[] = [];
  const say = async (content: string, senderType: 'ai' | 'system', metadata?: Record<string, unknown>) => {
    let full = content;
    if (!draft.privacyNoticeSentAt && s.messages.privacyNotice.trim()) {
      full = `${content}\n\n${s.messages.privacyNotice.trim()}`;
      draft.privacyNoticeSentAt = nowIso();
    }
    replies.push(await sendOutbound(app, { conversation: conv, content: full, senderType, metadata: metadata ?? null }));
  };
  const handoff = async (reason: string, preface?: string) => {
    setNeedsHuman(db, conv.id, true, reason);
    await say(preface ? `${preface}\n\n${s.messages.handoff}` : s.messages.handoff, 'system', { auto: 'handoff', reason });
    saveDraft(db, conv.id, draft);
    return replies;
  };

  // 1) Pedido explícito de pessoa (determinístico)
  if (matchesHandoffKeyword(text, s.handoff.keywords)) return handoff('Cliente pediu atendimento humano');

  // 2) Confirmação pendente: só o cliente, com resposta afirmativa, fecha o pedido
  if (draft.awaitingConfirmation) {
    if (isAffirmative(text)) {
      const result = tryCreateOrder(app, business, conv, draft);
      if (result.ok) {
        await say(s.messages.orderConfirmed.replace('{numero}', `#${result.order.number}`), 'system', { orderId: result.order.id });
        app.ctx.events.emit('order.created', { businessId: business.id, order: result.order, actor: { type: 'customer' } });
        saveDraft(db, conv.id, draft);
        return replies;
      }
      draft.awaitingConfirmation = false;
      return handoff('Falha ao criar pedido confirmado', `Não consegui registrar o pedido: ${result.issues.join('; ')}.`);
    }
    if (isNegative(text)) {
      draft.awaitingConfirmation = false;
      draft.summaryPresentedAt = null;
    }
  }

  // 3) Chama a IA com contexto aprovado
  const catalog = getCatalog(db, business.id);
  const zones = listZones(db, business.id, { activeOnly: true });
  const knowledge = listApprovedEntries(db, business.id);
  const context = buildAgentContext({ business, catalog, zones, knowledge, draft });
  const history = (
    db.prepare("SELECT direction, sender_type, content FROM messages WHERE conversation_id = ? AND id <> ? AND (metadata_json IS NULL OR metadata_json NOT LIKE '%\"internal\":true%') ORDER BY created_at DESC LIMIT 12").all(conv.id, inbound.id) as {
      direction: 'in' | 'out';
      sender_type: string;
      content: string;
    }[]
  )
    .reverse()
    .map((m) => ({ role: m.direction === 'in' ? ('customer' as const) : ('assistant' as const), content: m.content.slice(0, 1500) }));

  const provider = resolveAiProvider(app, business);
  const output = await provider.generate({ systemPrompt: SYSTEM_PROMPT, context, history, customerMessage: text.slice(0, 2000), maxReplyChars: config.aiMaxReplyChars, temperature: s.ai.temperature });

  if (output.kind !== 'structured') {
    // Resposta segura: não cria pedido, não inventa; transfere.
    createSuggestion(db, { businessId: business.id, question: text, origin: 'ai_unavailable', conversationId: conv.id, messageId: inbound.id });
    app.log.warn({ conversationId: conv.id, kind: output.kind, reason: 'reason' in output ? output.reason : null }, 'IA indisponível ou resposta não validada');
    setNeedsHuman(db, conv.id, true, output.kind === 'unavailable' ? `IA indisponível: ${output.reason}` : `Resposta da IA não validada: ${output.reason}`);
    await say(s.messages.aiUnavailable, 'system', { auto: 'ai_unavailable', kind: output.kind });
    saveDraft(db, conv.id, draft);
    return replies;
  }

  const data = output.data;
  const meta = { intent: data.intent, confidence: data.confidence, model: output.model, latencyMs: output.latencyMs, needsHuman: data.needs_human };
  const { rejected } = applyProposals(draft, data, catalog, business);
  resolveZone(draft, business, app);
  if (draft.customerName && !conv.customer_name) updateCustomer(db, conv.id, { name: draft.customerName });

  let reply = sanitizeReply(data.reply, config.aiMaxReplyChars);
  if (data.unanswered_question) {
    createSuggestion(db, { businessId: business.id, question: data.unanswered_question, origin: 'unanswered', conversationId: conv.id, messageId: inbound.id });
  }

  // 4) Transferência por decisão/incerteza da IA
  if (data.needs_human || data.intent === 'handoff' || data.confidence < s.handoff.confidenceThreshold) {
    if (data.confidence < s.handoff.confidenceThreshold && !data.unanswered_question) {
      createSuggestion(db, { businessId: business.id, question: text, proposedAnswer: reply, origin: 'low_confidence', conversationId: conv.id, messageId: inbound.id });
    }
    replies.push(await sendOutbound(app, { conversation: conv, content: reply, senderType: 'ai', metadata: meta }));
    return handoff(data.needs_human ? 'IA solicitou atendimento humano' : `Confiança baixa (${data.confidence.toFixed(2)})`);
  }

  // 5) Fechamento: resumo oficial e pedido de confirmação
  const wantsToFinalize = data.intent === 'order_finalize' || data.intent === 'confirm';
  if (wantsToFinalize && draft.items.length > 0) {
    const missing = missingFields(draft, business);
    if (missing.length === 0) {
      const quote = quoteForBusiness(db, business, draftToQuoteInput(draft));
      if (quote.ok) {
        draft.awaitingConfirmation = true;
        draft.summaryPresentedAt = nowIso();
        reply = `${reply}\n\n${buildSummary(quote, draft, business)}`;
      } else {
        reply = `${reply}\n\nAntes de fechar, preciso ajustar: ${quote.issues.map((i) => i.message).join(' ')}`;
      }
    } else {
      reply = `${reply}\n\nPara fechar o pedido ainda preciso de: ${missing.join(', ')}.`;
    }
  } else if (draft.items.length > 0) {
    // valida itens a cada passo para avisar indisponibilidade cedo
    const quote = quoteForBusiness(db, business, { ...draftToQuoteInput(draft), fulfillment: draft.fulfillment ?? 'pickup', paymentMethod: null });
    const itemIssues = quote.issues.filter((i) => i.itemIndex !== undefined);
    if (itemIssues.length) reply = `${reply}\n\nObservação: ${itemIssues.map((i) => i.message).join(' ')}`;
  }
  if (rejected.length) app.log.info({ conversationId: conv.id, rejected }, 'propostas da IA rejeitadas pelas regras');

  saveDraft(db, conv.id, draft);
  await say(reply, 'ai', { ...meta, rejected: rejected.length ? rejected : undefined });
  saveDraft(db, conv.id, draft);
  return replies;
}

function draftToQuoteInput(draft: DraftState) {
  return {
    items: draft.items,
    fulfillment: draft.fulfillment ?? 'pickup',
    deliveryZoneId: draft.deliveryZoneId,
    discountCents: 0,
    paymentMethod: draft.paymentMethod,
    cashReceivedCents: draft.paymentMethod === 'dinheiro' ? draft.cashReceivedCents : null,
  };
}

function tryCreateOrder(app: FastifyInstance, business: Business, conv: ConversationRow, draft: DraftState): { ok: true; order: import('../orders/service.js').OrderDto } | { ok: false; issues: string[] } {
  try {
    const order = createOrder(app.ctx.db, {
      business,
      input: {
        ...draftToQuoteInput(draft),
        fulfillment: draft.fulfillment ?? 'pickup',
        customer: { name: draft.customerName ?? conv.customer_name ?? '', phone: conv.customer_phone ?? '' },
        address: draft.address,
        tableLabel: null,
        customerNotes: null,
        internalNotes: null,
        deliveryNotes: null,
        estimatedMinutes: null,
        customerConfirmed: true,
        initialStatus: 'recebido',
      },
      actor: { type: 'customer', name: draft.customerName ?? conv.customer_name ?? 'cliente' },
      origin: `conversation:${conv.channel}`,
      conversationId: conv.id,
    });
    draft.items = [];
    draft.awaitingConfirmation = false;
    draft.summaryPresentedAt = null;
    draft.lastOrderId = order.id;
    return { ok: true, order };
  } catch (err) {
    const details = (err as { details?: { message: string }[] }).details;
    return { ok: false, issues: details?.map((d) => d.message) ?? [(err as Error).message] };
  }
}
