import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { z } from 'zod';
import { parse } from '../../lib/validate.js';
import { getBusiness } from '../business/service.js';
import { getOrder } from '../orders/service.js';
import { PAYMENT_STATUS_LABELS } from '../orders/types.js';
import { buildStaticPixPayload } from './pix/brcode.js';
import { validatePixConfig } from './pix/validate.js';

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;

  /** Valida a configuração Pix atual e gera uma prévia de payload (sem valor). Admin. */
  app.get('/api/pix/config-check', { config: { auth: 'admin' } }, async (request) => {
    const business = getBusiness(db, request.user!.businessId);
    const pix = business.settings.pix;
    const validation = validatePixConfig(pix);
    let samplePayload: string | null = null;
    if (validation.ok && validation.normalizedKey) {
      samplePayload = buildStaticPixPayload({ key: validation.normalizedKey, receiverName: pix.receiverName, city: pix.city, amountCents: null, txid: 'TESTE' });
    }
    return { enabled: pix.enabled, validation, samplePayload, note: 'QR estático: não há conciliação automática. O pagamento permanece "aguardando confirmação" até uma pessoa conferir.' };
  });

  /** QR/payload Pix de um pedido já calculado. Só disponível com configuração válida e pedido não cancelado. */
  app.get('/api/orders/:id/pix', async (request) => {
    const { id } = request.params as { id: string };
    const q = parse(z.object({ format: z.enum(['svg', 'none']).optional() }), request.query);
    const business = getBusiness(db, request.user!.businessId);
    const order = getOrder(db, business.id, id);
    const pix = business.settings.pix;
    const base = {
      orderId: order.id,
      paymentStatus: order.paymentStatus,
      paymentStatusLabel: PAYMENT_STATUS_LABELS[order.paymentStatus],
      totalCents: order.totalCents,
      paidConfirmedByName: order.paidConfirmedByName,
      paidConfirmedAt: order.paidConfirmedAt,
      confirmationNote: 'O QR Pix não confirma pagamento. Marque como pago somente após conferir o recebimento.',
    };
    if (!pix.enabled) return { ...base, available: false, reason: 'Pix (QR) desabilitado nas configurações.' };
    const validation = validatePixConfig(pix);
    if (!validation.ok || !validation.normalizedKey) return { ...base, available: false, reason: `Configuração Pix inválida: ${validation.errors.join(' ')}` };
    if (order.status === 'cancelado') return { ...base, available: false, reason: 'Pedido cancelado.' };
    if (order.paymentStatus === 'pago' || order.paymentStatus === 'reembolsado') return { ...base, available: false, reason: `Pagamento já está como "${PAYMENT_STATUS_LABELS[order.paymentStatus]}".` };
    const txid = `PED${order.number}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 25);
    const payload = buildStaticPixPayload({
      key: validation.normalizedKey,
      receiverName: pix.receiverName,
      city: pix.city,
      amountCents: pix.includeAmount ? order.totalCents : null,
      txid,
    });
    const qrSvg = q.format === 'none' ? null : await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 256 });
    return {
      ...base,
      available: true,
      payload,
      qrSvg,
      amountIncluded: pix.includeAmount,
      receiverName: pix.receiverName,
      instructions: pix.instructions || null,
      keyType: pix.keyType,
      keyMasked: request.user!.role === 'admin' ? pix.key : undefined,
    };
  });
}
