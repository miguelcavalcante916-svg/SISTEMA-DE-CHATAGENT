import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { recordAudit } from '../audit/service.js';
import { getBusiness, type Business } from '../business/service.js';
import { getOrder, recordPrint, type OrderDto } from '../orders/service.js';
import type { PrintOptions } from './provider.js';
import { buildReceiptModel, buildTestReceipt, colsForPaper, renderReceiptText } from './receipt.js';

export function printOptionsFor(business: Business): PrintOptions {
  const p = business.settings.printer;
  return {
    copies: p.copies,
    paperWidthMm: p.paperWidthMm,
    cut: p.cut,
    encoding: p.encoding,
    codepageCommand: p.codepageCommand,
    host: p.host || undefined,
    port: p.port,
  };
}

export async function printingRoutes(app: FastifyInstance): Promise<void> {
  const { db, providers, events } = app.ctx;

  const actor = (request: FastifyRequest) => ({ type: 'user' as const, userId: request.user!.id, name: request.user!.name });

  app.get('/api/printer/status', async (request) => {
    const business = getBusiness(db, request.user!.businessId);
    const provider = providers.printers.get(business.settings.printer.provider);
    const options = printOptionsFor(business);
    const check = provider ? await provider.check(options) : { ok: false, message: 'Provedor de impressão desconhecido' };
    return {
      provider: business.settings.printer.provider,
      providerName: provider?.name ?? null,
      options: { ...options, host: options.host ?? '' },
      check,
      available: providers.printers.all().map((p) => ({ id: p.id, name: p.name })),
    };
  });

  app.post('/api/printer/test', async (request) => {
    const business = getBusiness(db, request.user!.businessId);
    const provider = providers.printers.get(business.settings.printer.provider);
    if (!provider) throw badRequest('Provedor de impressão não configurado');
    const options = printOptionsFor(business);
    const receipt = buildTestReceipt(business, request.user!.name);
    const result = await provider.print(receipt, options);
    db.prepare(
      `INSERT INTO print_jobs (id, business_id, order_id, kind, provider, status, copies, error, user_id, user_name, created_at) VALUES (?, ?, NULL, 'test', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      business.id,
      provider.id,
      result.status,
      options.copies,
      result.status === 'failed' ? result.error : null,
      request.user!.id,
      request.user!.name,
      new Date().toISOString(),
    );
    return { result, receipt, text: renderReceiptText(receipt, colsForPaper(options.paperWidthMm)), paperWidthMm: options.paperWidthMm };
  });

  /** Modelo do comprovante para o layout HTML (não registra impressão). */
  app.get('/api/orders/:id/receipt', async (request) => {
    const { id } = request.params as { id: string };
    const q = parse(z.object({ reprint: z.enum(['0', '1']).optional(), width: z.enum(['80', '58']).optional() }), request.query);
    const business = getBusiness(db, request.user!.businessId);
    const order = getOrder(db, business.id, id);
    const reprint = q.reprint === '1' || order.printCount > 0;
    const receipt = buildReceiptModel(order, business, { reprint, printedBy: request.user!.name });
    const width = q.width ? (Number(q.width) as 80 | 58) : business.settings.printer.paperWidthMm;
    return { receipt, text: renderReceiptText(receipt, colsForPaper(width)), paperWidthMm: width, copies: business.settings.printer.copies };
  });

  /** Imprime (ESC/POS) ou prepara impressão pelo navegador, registrando quem/quando e se é reimpressão. */
  app.post('/api/orders/:id/print', async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(z.object({ copies: z.number().int().min(1).max(5).optional() }), request.body ?? {});
    const business = getBusiness(db, request.user!.businessId);
    const order = getOrder(db, business.id, id);
    const reprint = order.printCount > 0;
    const provider = providers.printers.get(business.settings.printer.provider);
    if (!provider) throw badRequest('Provedor de impressão não configurado');
    const options = { ...printOptionsFor(business), copies: body.copies ?? business.settings.printer.copies };
    const receipt = buildReceiptModel(order, business, { reprint, printedBy: request.user!.name });
    const result = await provider.print(receipt, options);
    const updated = recordPrint(db, {
      businessId: business.id,
      orderId: id,
      reprint,
      actor: actor(request),
      provider: provider.id,
      status: result.status,
      copies: options.copies,
      error: result.status === 'failed' ? result.error : null,
    });
    recordAudit(db, {
      businessId: business.id,
      userId: request.user!.id,
      userName: request.user!.name,
      action: reprint ? 'order.reprinted' : 'order.printed',
      entityType: 'order',
      entityId: id,
      details: { provider: provider.id, status: result.status },
      ip: request.ip,
    });
    return {
      mode: result.status === 'browser' ? 'browser' : 'escpos',
      result,
      receipt,
      text: renderReceiptText(receipt, colsForPaper(options.paperWidthMm)),
      paperWidthMm: options.paperWidthMm,
      copies: options.copies,
      order: updated,
    };
  });

  // Impressão automática ao criar pedido (somente ESC/POS; o navegador exige ação do usuário)
  events.on('order.created', (payload: { businessId: string; order: OrderDto }) => {
    void (async () => {
      try {
        const business = getBusiness(db, payload.businessId);
        const p = business.settings.printer;
        if (!p.autoPrintOnCreate || p.provider !== 'escpos_network') return;
        const provider = providers.printers.get(p.provider);
        if (!provider) return;
        const receipt = buildReceiptModel(payload.order, business, { reprint: false, printedBy: 'automático' });
        const result = await provider.print(receipt, printOptionsFor(business));
        recordPrint(db, {
          businessId: business.id,
          orderId: payload.order.id,
          reprint: false,
          actor: { type: 'system', name: 'impressão automática' },
          provider: provider.id,
          status: result.status,
          copies: p.copies,
          error: result.status === 'failed' ? result.error : null,
        });
      } catch (err) {
        app.log.warn({ err }, 'falha na impressão automática');
      }
    })();
  });
}
