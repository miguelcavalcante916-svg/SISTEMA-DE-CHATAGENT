import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedPizzaCatalog, type PizzaFixture } from '../../test/fixtures.js';
import { createTestApp, type TestContext } from '../../test/helpers.js';
import { encodeEscPos, encodeText, sendToNetworkPrinter } from './escpos.js';
import { buildTestReceipt, renderReceiptText, type ReceiptModel } from './receipt.js';
import { getBusiness } from '../business/service.js';

let ctx: TestContext;
let fx: PizzaFixture;
beforeEach(async () => {
  ctx = await createTestApp();
  fx = await seedPizzaCatalog(ctx);
});
afterEach(async () => {
  await ctx.close();
});

async function createOrder(extra: Record<string, unknown> = {}) {
  const res = await ctx.admin({
    method: 'POST',
    url: '/api/orders',
    payload: {
      fulfillment: 'delivery',
      deliveryZoneId: fx.zoneId,
      paymentMethod: 'dinheiro',
      cashReceivedCents: 10000,
      customer: { name: 'José da Conceição', phone: '11988887777' },
      address: { street: 'Rua das Acácias', number: '123', complement: 'Apto 45', neighborhood: 'Centro', reference: 'Próximo à padaria' },
      customerConfirmed: true,
      deliveryNotes: 'Interfone quebrado, ligar ao chegar',
      customerNotes: 'Sem cebola, por favor',
      items: [
        { productId: fx.pizzaId, variantId: fx.grandeId, quantity: 1, options: [{ optionId: fx.calabresaId }, { optionId: fx.catupiryId }], notes: 'bem assada' },
        { productId: fx.refriId, quantity: 2 },
      ],
      ...extra,
    },
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json().order;
}

describe('8. comprovante interno', () => {
  it('contém todos os dados do pedido, respeita a largura e não se apresenta como nota fiscal', async () => {
    const order = await createOrder();
    const res = await ctx.admin({ method: 'GET', url: `/api/orders/${order.id}/receipt?width=80` });
    expect(res.statusCode).toBe(200);
    const text: string[] = res.json().text;
    const joined = text.join('\n');
    expect(text.every((l) => l.length <= 48)).toBe(true);
    for (const expected of [
      'PIZZARIA TESTE',
      `PEDIDO #${order.number}`,
      'Entrega',
      'José da Conceição',
      '(11) 98888-7777',
      'Rua das Acácias, 123',
      'Apto 45',
      'Próximo à padaria',
      '1x Pizza (Grande)',
      '+ Calabresa',
      '+ Catupiry',
      'Obs: bem assada',
      '2x Refrigerante 2L',
      'Subtotal:',
      'Taxa de entrega:',
      'TOTAL:',
      'R$ 24,00',
      'Dinheiro',
      'Pagamento pendente',
      'Troco:',
      'Interfone quebrado',
      'Sem cebola',
      'Não é documento fiscal',
    ]) {
      expect(joined, `faltou: ${expected}`).toContain(expected);
    }
    expect(joined.toUpperCase()).not.toContain('NOTA FISCAL');
    expect(joined).not.toContain('REIMPRESSÃO');
    expect(res.json().receipt.reprint).toBe(false);
  });

  it('omite campos opcionais (retirada sem endereço, sem troco, sem desconto)', async () => {
    const res = await ctx.admin({
      method: 'POST',
      url: '/api/orders',
      payload: { fulfillment: 'pickup', paymentMethod: 'pix', customer: { name: 'Ana' }, customerConfirmed: true, items: [{ productId: fx.refriId, quantity: 1 }] },
    });
    const order = res.json().order;
    const receipt = await ctx.admin({ method: 'GET', url: `/api/orders/${order.id}/receipt?width=58` });
    const text: string[] = receipt.json().text;
    const joined = text.join('\n');
    expect(text.every((l) => l.length <= 32)).toBe(true);
    expect(joined).not.toContain('Entrega em:');
    expect(joined).not.toContain('Troco:');
    expect(joined).not.toContain('Desconto:');
    expect(joined).not.toContain('Taxa de entrega:');
    expect(joined).not.toContain('Telefone:');
    expect(joined).toContain('Retirada');
    expect(joined).toContain('Pix');
  });

  it('reimpressão é identificada com usuário, data e hora', async () => {
    const order = await createOrder();
    const first = await ctx.admin({ method: 'POST', url: `/api/orders/${order.id}/print`, payload: {} });
    expect(first.statusCode).toBe(200);
    expect(first.json().mode).toBe('browser');
    expect(first.json().receipt.reprint).toBe(false);
    expect(first.json().order.printCount).toBe(1);

    const second = await ctx.admin({ method: 'POST', url: `/api/orders/${order.id}/print`, payload: {} });
    expect(second.json().receipt.reprint).toBe(true);
    expect(second.json().receipt.printedBy).toBe('Admin Teste');
    const joined = (second.json().text as string[]).join('\n');
    expect(joined).toContain('*** REIMPRESSÃO ***');
    expect(joined).toContain('Admin Teste');
    expect(second.json().order.printCount).toBe(2);
    const events = second.json().order.events as { type: string; note: string }[];
    expect(events.filter((e) => e.type === 'printed')).toHaveLength(2);
    expect(events.some((e) => e.note === 'REIMPRESSÃO')).toBe(true);
  });

  it('quebra palavras longas e preserva acentos e valores monetários', () => {
    const business = getBusiness(ctx.app.ctx.db, ctx.businessId);
    const model: ReceiptModel = {
      ...buildTestReceipt(business, 'Tester'),
      items: [
        {
          quantity: 1,
          name: 'Supercalifragilisticexpialidocious-de-frango-com-catupiry-e-requeijão',
          variant: null,
          unitPriceCents: 123456,
          optionsPriceCents: 0,
          lineTotalCents: 123456,
          options: [],
          notes: null,
        },
      ],
      subtotalCents: 123456,
      totalCents: 123456,
      cashReceivedCents: null,
      changeCents: null,
    };
    const lines = renderReceiptText(model, 32);
    expect(lines.every((l) => l.length <= 32)).toBe(true);
    const joined = lines.join('\n');
    expect(joined).toContain('R$ 1.234,56');
    expect(joined).toContain('requeijão');
    expect(joined).toContain('ação, pão, café'.slice(0, 4));
  });
});

describe('ESC/POS', () => {
  it('codifica acentos em CP1252 e remove em ASCII', () => {
    const cp = encodeText('ação é pão', 'cp1252');
    expect(cp[0]).toBe(0x61); // a
    expect(cp[1]).toBe(0xe7); // ç
    expect(cp[2]).toBe(0xe3); // ã
    const ascii = encodeText('ação é pão', 'ascii');
    expect(ascii.toString('latin1')).toBe('acao e pao');
  });

  it('gera inicialização, tabela de caracteres, corte e envia por TCP', async () => {
    const business = getBusiness(ctx.app.ctx.db, ctx.businessId);
    const model = buildTestReceipt(business, 'Tester');
    const bytes = encodeEscPos(model, { paperWidthMm: 80, cut: true, encoding: 'cp1252', codepageCommand: 16 });
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0x1b, 0x40]));
    expect(bytes.subarray(2, 5)).toEqual(Buffer.from([0x1b, 0x74, 16]));
    expect(bytes.subarray(bytes.length - 4)).toEqual(Buffer.from([0x1d, 0x56, 0x42, 0x00]));
    expect(bytes.toString('latin1')).toContain('TESTE DE IMPRESS');

    const received: Buffer[] = [];
    const server = net.createServer((socket) => socket.on('data', (d) => received.push(d)));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as net.AddressInfo).port;
    const sent = await sendToNetworkPrinter('127.0.0.1', port, bytes, 2000);
    await new Promise((r) => setTimeout(r, 50));
    server.close();
    expect(sent).toBe(bytes.length);
    expect(Buffer.concat(received).equals(bytes)).toBe(true);
  });

  it('falha com mensagem clara quando a impressora de rede não responde', async () => {
    await ctx.admin({
      method: 'PATCH',
      url: '/api/business',
      payload: { settings: { printer: { provider: 'escpos_network', host: '127.0.0.1', port: 1 } } },
    });
    const status = await ctx.admin({ method: 'GET', url: '/api/printer/status' });
    expect(status.json().check.ok).toBe(false);
    const test = await ctx.admin({ method: 'POST', url: '/api/printer/test' });
    expect(test.statusCode).toBe(200);
    expect(test.json().result.status).toBe('failed');
    expect(test.json().result.error).toContain('127.0.0.1:1');
  });
});
