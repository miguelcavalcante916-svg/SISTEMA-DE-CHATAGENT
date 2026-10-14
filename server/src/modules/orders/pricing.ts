import { z } from 'zod';
import type { Business } from '../business/service.js';
import { PAYMENT_METHOD_IDS } from '../business/settings.js';
import type { DeliveryZone } from '../business/zones.js';
import { isWithinAvailability, type CatalogSnapshot } from '../catalog/service.js';
import { FULFILLMENTS } from './types.js';

export const QuoteItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().nullable().optional(),
  quantity: z.number().int().min(1).max(99),
  notes: z.string().max(200).nullable().optional(),
  options: z
    .array(z.object({ optionId: z.string().min(1), quantity: z.number().int().min(1).max(20).default(1) }))
    .max(40)
    .default([]),
});
export type QuoteItemInput = z.infer<typeof QuoteItemSchema>;

export const QuoteInputSchema = z.object({
  items: z.array(QuoteItemSchema).min(1, 'Adicione pelo menos um item').max(50),
  fulfillment: z.enum(FULFILLMENTS),
  deliveryZoneId: z.string().nullable().optional(),
  discountCents: z.number().int().min(0).default(0),
  paymentMethod: z.enum(PAYMENT_METHOD_IDS).nullable().optional(),
  cashReceivedCents: z.number().int().min(0).nullable().optional(),
});
export type QuoteInput = z.infer<typeof QuoteInputSchema>;

export interface QuotedOption {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceCents: number;
  quantity: number;
}
export interface QuotedItem {
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  unitPriceCents: number;
  optionsPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  notes: string | null;
  options: QuotedOption[];
}
export interface QuoteIssue {
  code: string;
  message: string;
  itemIndex?: number;
}
export interface Quote {
  ok: boolean;
  issues: QuoteIssue[];
  items: QuotedItem[];
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  changeCents: number | null;
  deliveryZone: { id: string; name: string; feeCents: number } | null;
  minOrderCents: number;
  estimatedMinutes: number;
}

/**
 * Calcula o pedido no servidor a partir do catálogo vigente.
 * Nunca usa valores enviados pelo navegador ou pela IA.
 */
export function quoteOrder(params: {
  snapshot: CatalogSnapshot;
  business: Business;
  zones: DeliveryZone[];
  input: QuoteInput;
  now?: Date;
}): Quote {
  const { snapshot, business, zones, input } = params;
  const now = params.now ?? new Date();
  const issues: QuoteIssue[] = [];
  const items: QuotedItem[] = [];
  const s = business.settings;

  // Modalidade
  const fulfillmentEnabled =
    (input.fulfillment === 'delivery' && s.fulfillment.delivery) ||
    (input.fulfillment === 'pickup' && s.fulfillment.pickup) ||
    (input.fulfillment === 'dine_in' && s.fulfillment.dineIn);
  if (!fulfillmentEnabled) issues.push({ code: 'fulfillment_disabled', message: 'Essa modalidade não está habilitada pelo estabelecimento.' });

  let maxPrep = s.defaultPrepMinutes;

  input.items.forEach((it, idx) => {
    const product = snapshot.products.get(it.productId);
    if (!product || product.archivedAt) {
      issues.push({ code: 'product_not_found', message: 'Produto não encontrado no cardápio.', itemIndex: idx });
      return;
    }
    if (!product.isAvailable) {
      issues.push({ code: 'product_unavailable', message: `"${product.name}" está indisponível no momento.`, itemIndex: idx });
      return;
    }
    if (!isWithinAvailability(product.availability, business.timezone, now)) {
      issues.push({ code: 'product_out_of_window', message: `"${product.name}" não está disponível neste horário.`, itemIndex: idx });
      return;
    }
    if (product.prepMinutes && product.prepMinutes > maxPrep) maxPrep = product.prepMinutes;

    // Variante
    const activeVariants = product.variants.filter((v) => !v.archivedAt);
    let unitPrice = product.priceCents;
    let variantId: string | null = null;
    let variantName: string | null = null;
    if (activeVariants.length > 0) {
      const v = activeVariants.find((x) => x.id === it.variantId);
      if (!v) {
        issues.push({ code: 'variant_required', message: `Escolha o tamanho/variante de "${product.name}".`, itemIndex: idx });
        return;
      }
      if (!v.isAvailable) {
        issues.push({ code: 'variant_unavailable', message: `"${product.name} ${v.name}" está indisponível.`, itemIndex: idx });
        return;
      }
      unitPrice = v.priceCents;
      variantId = v.id;
      variantName = v.name;
    } else if (it.variantId) {
      issues.push({ code: 'variant_invalid', message: `"${product.name}" não possui variantes.`, itemIndex: idx });
      return;
    }

    // Adicionais: agrupa seleção por grupo vinculado
    const selected = new Map<string, number>();
    for (const o of it.options) selected.set(o.optionId, (selected.get(o.optionId) ?? 0) + o.quantity);
    const quotedOptions: QuotedOption[] = [];
    let optionsPrice = 0;
    const linkedGroups = product.optionGroupIds.map((gid) => snapshot.optionGroups.get(gid)).filter((g): g is NonNullable<typeof g> => Boolean(g) && !g!.archivedAt);
    const knownOptionIds = new Set<string>();
    for (const group of linkedGroups) {
      const chosen: QuotedOption[] = [];
      let count = 0;
      for (const opt of group.options) {
        if (opt.archivedAt) continue;
        knownOptionIds.add(opt.id);
        const qty = selected.get(opt.id);
        if (!qty) continue;
        if (!opt.isAvailable) {
          issues.push({ code: 'option_unavailable', message: `"${opt.name}" está indisponível.`, itemIndex: idx });
          continue;
        }
        if (qty > opt.maxQuantity) {
          issues.push({ code: 'option_quantity', message: `"${opt.name}" permite no máximo ${opt.maxQuantity}.`, itemIndex: idx });
          continue;
        }
        count += qty;
        chosen.push({ groupId: group.id, groupName: group.name, optionId: opt.id, optionName: opt.name, priceCents: opt.priceCents, quantity: qty });
      }
      if (count < group.minSelect) {
        issues.push({ code: 'option_min', message: `Escolha pelo menos ${group.minSelect} em "${group.name}" para "${product.name}".`, itemIndex: idx });
      }
      if (count > group.maxSelect) {
        issues.push({ code: 'option_max', message: `"${group.name}" permite no máximo ${group.maxSelect} para "${product.name}".`, itemIndex: idx });
      }
      if (chosen.length > 0) {
        let groupPrice = 0;
        if (group.pricingMode === 'sum') groupPrice = chosen.reduce((acc, c) => acc + c.priceCents * c.quantity, 0);
        else if (group.pricingMode === 'max') groupPrice = Math.max(...chosen.map((c) => c.priceCents));
        else {
          const total = chosen.reduce((acc, c) => acc + c.priceCents * c.quantity, 0);
          groupPrice = Math.round(total / Math.max(1, count));
        }
        optionsPrice += groupPrice;
        quotedOptions.push(...chosen);
      }
    }
    for (const optionId of selected.keys()) {
      if (!knownOptionIds.has(optionId)) {
        issues.push({ code: 'option_invalid', message: `Adicional inválido para "${product.name}".`, itemIndex: idx });
      }
    }
    if (it.notes && !product.allowNotes) {
      issues.push({ code: 'notes_not_allowed', message: `"${product.name}" não aceita observações.`, itemIndex: idx });
    }

    const lineTotal = (unitPrice + optionsPrice) * it.quantity;
    items.push({
      productId: product.id,
      productName: product.name,
      variantId,
      variantName,
      unitPriceCents: unitPrice,
      optionsPriceCents: optionsPrice,
      quantity: it.quantity,
      lineTotalCents: lineTotal,
      notes: it.notes?.trim() || null,
      options: quotedOptions,
    });
  });

  const subtotal = items.reduce((acc, i) => acc + i.lineTotalCents, 0);

  // Entrega
  let deliveryFee = 0;
  let zoneInfo: Quote['deliveryZone'] = null;
  let minOrder = s.minOrderCents;
  let estimated = maxPrep;
  if (input.fulfillment === 'delivery') {
    const activeZones = zones.filter((z) => z.isActive);
    if (activeZones.length > 0) {
      const zone = activeZones.find((z) => z.id === input.deliveryZoneId);
      if (!zone) issues.push({ code: 'zone_required', message: 'Informe o bairro/área de entrega atendida.' });
      else {
        deliveryFee = zone.feeCents;
        zoneInfo = { id: zone.id, name: zone.name, feeCents: zone.feeCents };
        minOrder = Math.max(minOrder, zone.minOrderCents);
        estimated += zone.estimatedMinutes ?? s.deliveryExtraMinutes;
      }
    } else {
      estimated += s.deliveryExtraMinutes;
    }
  }
  if (subtotal > 0 && subtotal < minOrder) {
    issues.push({ code: 'min_order', message: `Pedido mínimo de R$ ${(minOrder / 100).toFixed(2).replace('.', ',')} não atingido.` });
  }

  // Desconto e pagamento
  const discount = Math.min(input.discountCents, subtotal);
  if (input.discountCents > subtotal) issues.push({ code: 'discount_too_high', message: 'Desconto maior que o subtotal.' });
  const total = subtotal - discount + deliveryFee;

  let change: number | null = null;
  if (input.paymentMethod) {
    const method = s.paymentMethods.find((m) => m.id === input.paymentMethod);
    if (!method || !method.enabled) issues.push({ code: 'payment_method_disabled', message: 'Forma de pagamento não aceita pelo estabelecimento.' });
    if (input.paymentMethod === 'dinheiro' && input.cashReceivedCents != null) {
      if (input.cashReceivedCents < total) issues.push({ code: 'cash_insufficient', message: 'Valor em dinheiro menor que o total.' });
      else change = input.cashReceivedCents - total;
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    items,
    subtotalCents: subtotal,
    discountCents: discount,
    deliveryFeeCents: deliveryFee,
    totalCents: total,
    changeCents: change,
    deliveryZone: zoneInfo,
    minOrderCents: minOrder,
    estimatedMinutes: estimated,
  };
}
