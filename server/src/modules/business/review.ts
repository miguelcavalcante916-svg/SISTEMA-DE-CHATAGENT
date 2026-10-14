import type { DB } from '../../db/connection.js';
import { getCatalog } from '../catalog/service.js';
import type { Business } from './service.js';
import { listZones } from './zones.js';
import { validatePixConfig } from '../payments/pix/validate.js';

export interface ChecklistItem {
  key: string;
  label: string;
  ok: boolean;
  required: boolean;
  hint: string;
}

/** Etapa de revisão de dados antes de habilitar atendimento automático. */
export function buildReviewChecklist(db: DB, b: Business): { items: ChecklistItem[]; readyForAi: boolean } {
  const s = b.settings;
  const catalog = getCatalog(db, b.id);
  const zones = listZones(db, b.id, { activeOnly: true });
  const sellable = catalog.products.filter(
    (p) => p.isAvailable && (p.priceCents > 0 || p.variants.some((v) => v.isAvailable && v.priceCents > 0)),
  );
  const zeroPricedPaidOptions = catalog.optionGroups.flatMap((g) => g.options.filter((o) => !o.isAvailable && o.priceCents === 0));
  const hasHours = Object.values(s.openingHours).some((periods) => periods.length > 0);
  const anyPayment = s.paymentMethods.some((m) => m.enabled);
  const anyFulfillment = s.fulfillment.delivery || s.fulfillment.pickup || s.fulfillment.dineIn;
  const pix = s.paymentMethods.find((m) => m.id === 'pix')?.enabled ? validatePixConfig(s.pix) : { ok: true, errors: [] as string[] };

  const items: ChecklistItem[] = [
    { key: 'name', label: 'Nome e categoria do estabelecimento', ok: b.name.trim().length >= 2, required: true, hint: 'Configurações › Estabelecimento' },
    { key: 'hours', label: 'Horários de funcionamento cadastrados', ok: hasHours, required: true, hint: 'Configurações › Horários' },
    { key: 'fulfillment', label: 'Pelo menos uma modalidade (entrega, retirada ou local)', ok: anyFulfillment, required: true, hint: 'Configurações › Modalidades' },
    {
      key: 'zones',
      label: 'Bairros/áreas de entrega com taxa (se entrega habilitada)',
      ok: !s.fulfillment.delivery || zones.length > 0,
      required: true,
      hint: 'Configurações › Taxas de entrega',
    },
    { key: 'payments', label: 'Formas de pagamento aceitas', ok: anyPayment, required: true, hint: 'Configurações › Pagamentos' },
    { key: 'pix', label: 'Dados Pix válidos (se Pix habilitado)', ok: pix.ok, required: true, hint: pix.errors.join(' ') || 'Configurações › Pix' },
    { key: 'catalog', label: 'Pelo menos um produto disponível com preço', ok: sellable.length > 0, required: true, hint: 'Catálogo' },
    {
      key: 'paidOptions',
      label: 'Adicionais sugeridos pelo perfil revisados (preço e disponibilidade)',
      ok: zeroPricedPaidOptions.length === 0,
      required: false,
      hint: zeroPricedPaidOptions.length ? `${zeroPricedPaidOptions.length} opção(ões) indisponíveis com preço zero` : 'Catálogo › Adicionais',
    },
    { key: 'privacy', label: 'Aviso de privacidade definido', ok: s.messages.privacyNotice.trim().length > 20, required: true, hint: 'Configurações › Mensagens' },
    { key: 'handoff', label: 'Política de transferência para humano definida', ok: s.handoff.policy.trim().length > 10, required: false, hint: 'Configurações › Atendimento' },
    { key: 'printer', label: 'Impressora configurada e testada', ok: s.printer.provider === 'browser' || Boolean(s.printer.host), required: false, hint: 'Impressora' },
  ];
  const readyForAi = items.filter((i) => i.required).every((i) => i.ok);
  return { items, readyForAi };
}
