import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedPizzaCatalog, type PizzaFixture } from '../../test/fixtures.js';
import { createAttendant, createTestApp, extractCookie, TEST_PASSWORD, type TestContext } from '../../test/helpers.js';
import { checkPaymentTransition, checkStatusTransition } from './state-machine.js';

let ctx: TestContext;
let fx: PizzaFixture;

beforeEach(async () => {
  ctx = await createTestApp();
  fx = await seedPizzaCatalog(ctx);
});
afterEach(async () => {
  await ctx.close();
});

const bigOrder = () => ({
  fulfillment: 'delivery',
  deliveryZoneId: fx.zoneId,
  discountCents: 200,
  paymentMethod: 'dinheiro',
  cashReceivedCents: 20000,
  customer: { name: 'Cliente Fictício', phone: '(11) 99999-0000' },
  address: { street: 'Rua Exemplo', number: '10', neighborhood: 'Centro' },
  customerConfirmed: true,
  items: [
    {
      productId: fx.pizzaId,
      variantId: fx.grandeId,
      quantity: 2,
      options: [{ optionId: fx.calabresaId }, { optionId: fx.portuguesaId }, { optionId: fx.catupiryId }, { optionId: fx.baconId, quantity: 2 }],
      notes: 'bem assada',
    },
    { productId: fx.refriId, quantity: 1 },
  ],
});

describe('cálculo de pedido no servidor', () => {
  it('1. calcula subtotal, adicionais (soma e maior valor), taxa, desconto, total e troco', async () => {
    const res = await ctx.admin({ method: 'POST', url: '/api/orders/quote', payload: bigOrder() });
    expect(res.statusCode).toBe(200);
    const q = res.json().quote;
    expect(q.ok).toBe(true);
    // sabores: max(500, 800) = 800; borda 600; bacon 2x300 = 600 => adicionais 2000; unitário grande 5000
    expect(q.items[0].optionsPriceCents).toBe(2000);
    expect(q.items[0].lineTotalCents).toBe((5000 + 2000) * 2);
    expect(q.subtotalCents).toBe(14000 + 1200);
    expect(q.discountCents).toBe(200);
    expect(q.deliveryFeeCents).toBe(500);
    expect(q.totalCents).toBe(15200 - 200 + 500);
    expect(q.changeCents).toBe(20000 - 15500);
  });

  it('2. ignora preços/totais enviados pelo cliente e usa o catálogo', async () => {
    const payload = {
      ...bigOrder(),
      totalCents: 1,
      subtotalCents: 1,
      items: bigOrder().items.map((i) => ({ ...i, unitPriceCents: 1, lineTotalCents: 1 })),
    };
    const res = await ctx.admin({ method: 'POST', url: '/api/orders', payload });
    expect(res.statusCode).toBe(201);
    expect(res.json().order.totalCents).toBe(15500);
    expect(res.json().order.items[0].unitPriceCents).toBe(5000);
  });

  it('rejeita produto indisponível, variante ausente e adicional fora dos limites', async () => {
    await ctx.admin({ method: 'PATCH', url: `/api/catalog/products/${fx.refriId}/availability`, payload: { isAvailable: false } });
    const res = await ctx.admin({
      method: 'POST',
      url: '/api/orders/quote',
      payload: {
        fulfillment: 'pickup',
        items: [
          { productId: fx.refriId, quantity: 1 },
          { productId: fx.pizzaId, quantity: 1, options: [] },
          { productId: fx.pizzaId, variantId: fx.mediaId, quantity: 1, options: [{ optionId: fx.mussarelaId }, { optionId: fx.calabresaId }, { optionId: fx.portuguesaId }] },
        ],
      },
    });
    const codes = res.json().quote.issues.map((i: { code: string }) => i.code);
    expect(codes).toContain('product_unavailable');
    expect(codes).toContain('variant_required');
    expect(codes).toContain('option_max');
  });

  it('exige confirmação explícita do cliente', async () => {
    const res = await ctx.admin({ method: 'POST', url: '/api/orders', payload: { ...bigOrder(), customerConfirmed: false } });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.details[0].code).toBe('confirmation_required');
  });
});

describe('modalidades e endereço', () => {
  it('3. retirada sem endereço é aceita; entrega exige endereço e bairro atendido', async () => {
    const pickup = await ctx.admin({
      method: 'POST',
      url: '/api/orders',
      payload: { fulfillment: 'pickup', customer: { name: 'Ana' }, customerConfirmed: true, items: [{ productId: fx.refriId, quantity: 2 }] },
    });
    expect(pickup.statusCode).toBe(201);
    expect(pickup.json().order.address).toBeNull();
    expect(pickup.json().order.deliveryFeeCents).toBe(0);

    const noAddress = await ctx.admin({
      method: 'POST',
      url: '/api/orders',
      payload: { fulfillment: 'delivery', deliveryZoneId: fx.zoneId, customer: { name: 'Ana', phone: '11999990000' }, customerConfirmed: true, items: [{ productId: fx.refriId, quantity: 2 }] },
    });
    expect(noAddress.statusCode).toBe(422);
    expect(noAddress.json().error.details.map((d: { code: string }) => d.code)).toContain('address_required');

    const noZone = await ctx.admin({
      method: 'POST',
      url: '/api/orders',
      payload: {
        fulfillment: 'delivery',
        customer: { name: 'Ana', phone: '11999990000' },
        address: { street: 'Rua A', number: '1' },
        customerConfirmed: true,
        items: [{ productId: fx.refriId, quantity: 2 }],
      },
    });
    expect(noZone.statusCode).toBe(422);
    expect(noZone.json().error.details.map((d: { code: string }) => d.code)).toContain('zone_required');

    const belowMin = await ctx.admin({
      method: 'POST',
      url: '/api/orders/quote',
      payload: { fulfillment: 'delivery', deliveryZoneId: fx.zoneId, items: [{ productId: fx.refriId, quantity: 1 }] },
    });
    expect(belowMin.json().quote.issues.map((d: { code: string }) => d.code)).toContain('min_order');
  });

  it('modalidade desabilitada é recusada', async () => {
    await ctx.admin({ method: 'PATCH', url: '/api/business', payload: { settings: { fulfillment: { dineIn: false } } } });
    const res = await ctx.admin({
      method: 'POST',
      url: '/api/orders/quote',
      payload: { fulfillment: 'dine_in', items: [{ productId: fx.refriId, quantity: 1 }] },
    });
    expect(res.json().quote.issues.map((d: { code: string }) => d.code)).toContain('fulfillment_disabled');
  });
});

describe('5. transições de status', () => {
  it('máquina de estados pura', () => {
    expect(checkStatusTransition('recebido', 'em_preparo', 'pickup').ok).toBe(false);
    expect(checkStatusTransition('recebido', 'confirmado', 'pickup').ok).toBe(true);
    expect(checkStatusTransition('cancelado', 'em_preparo', 'pickup').ok).toBe(false);
    expect(checkStatusTransition('pronto', 'saiu_para_entrega', 'pickup').ok).toBe(false);
    expect(checkStatusTransition('pronto', 'concluido', 'delivery').ok).toBe(false);
    expect(checkStatusTransition('pronto', 'saiu_para_entrega', 'delivery').ok).toBe(true);
    expect(checkStatusTransition('concluido', 'cancelado', 'delivery').ok).toBe(false);
    expect(checkPaymentTransition('pago', 'pendente').ok).toBe(false);
    expect(checkPaymentTransition('aguardando_pix', 'pago').ok).toBe(true);
  });

  it('via API: fluxo válido, inválido e histórico com responsável', async () => {
    const created = await ctx.admin({ method: 'POST', url: '/api/orders', payload: bigOrder() });
    const id = created.json().order.id as string;
    const bad = await ctx.admin({ method: 'POST', url: `/api/orders/${id}/status`, payload: { status: 'pronto' } });
    expect(bad.statusCode).toBe(422);
    for (const status of ['confirmado', 'em_preparo', 'pronto']) {
      const r = await ctx.admin({ method: 'POST', url: `/api/orders/${id}/status`, payload: { status } });
      expect(r.statusCode).toBe(200);
    }
    const direct = await ctx.admin({ method: 'POST', url: `/api/orders/${id}/status`, payload: { status: 'concluido' } });
    expect(direct.statusCode).toBe(422); // entrega precisa sair para entrega
    await ctx.admin({ method: 'POST', url: `/api/orders/${id}/status`, payload: { status: 'saiu_para_entrega' } });
    const done = await ctx.admin({ method: 'POST', url: `/api/orders/${id}/status`, payload: { status: 'concluido' } });
    expect(done.statusCode).toBe(200);
    const events = done.json().order.events as { type: string; toValue: string; actorName: string }[];
    const statusEvents = events.filter((e) => e.type === 'status_change');
    expect(statusEvents.map((e) => e.toValue)).toEqual(['confirmado', 'em_preparo', 'pronto', 'saiu_para_entrega', 'concluido']);
    expect(statusEvents.every((e) => e.actorName === 'Admin Teste')).toBe(true);
    const reopen = await ctx.admin({ method: 'POST', url: `/api/orders/${id}/status`, payload: { status: 'em_preparo' } });
    expect(reopen.statusCode).toBe(422);
  });

  it('cancelado não volta para preparo', async () => {
    const created = await ctx.admin({ method: 'POST', url: '/api/orders', payload: bigOrder() });
    const id = created.json().order.id as string;
    const cancel = await ctx.admin({ method: 'POST', url: `/api/orders/${id}/status`, payload: { status: 'cancelado', cancelReason: 'Cliente desistiu' } });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().order.cancelReason).toBe('Cliente desistiu');
    const again = await ctx.admin({ method: 'POST', url: `/api/orders/${id}/status`, payload: { status: 'em_preparo' } });
    expect(again.statusCode).toBe(422);
  });
});

describe('6. status do pedido e do pagamento são independentes', () => {
  it('pedido concluído pode seguir com pagamento pendente; "pago" registra quem confirmou', async () => {
    const created = await ctx.admin({
      method: 'POST',
      url: '/api/orders',
      payload: { fulfillment: 'pickup', customer: { name: 'Bia' }, paymentMethod: 'dinheiro', customerConfirmed: true, items: [{ productId: fx.refriId, quantity: 2 }] },
    });
    const id = created.json().order.id as string;
    expect(created.json().order.paymentStatus).toBe('pendente');
    for (const status of ['confirmado', 'em_preparo', 'pronto', 'concluido']) {
      await ctx.admin({ method: 'POST', url: `/api/orders/${id}/status`, payload: { status } });
    }
    const after = await ctx.admin({ method: 'GET', url: `/api/orders/${id}` });
    expect(after.json().order.status).toBe('concluido');
    expect(after.json().order.paymentStatus).toBe('pendente');

    const paid = await ctx.admin({ method: 'POST', url: `/api/orders/${id}/payment`, payload: { paymentStatus: 'pago' } });
    expect(paid.statusCode).toBe(200);
    expect(paid.json().order.paymentStatus).toBe('pago');
    expect(paid.json().order.paidConfirmedByName).toBe('Admin Teste');
    expect(paid.json().order.paidConfirmedAt).toBeTruthy();
    expect(paid.json().order.status).toBe('concluido');
  });

  it('pedido Pix nasce "aguardando_pix" só com Pix configurado e válido', async () => {
    const before = await ctx.admin({
      method: 'POST',
      url: '/api/orders',
      payload: { fulfillment: 'pickup', customer: { name: 'Bia' }, paymentMethod: 'pix', customerConfirmed: true, items: [{ productId: fx.refriId, quantity: 2 }] },
    });
    expect(before.json().order.paymentStatus).toBe('pendente');

    await ctx.admin({
      method: 'PATCH',
      url: '/api/business',
      payload: { settings: { pix: { enabled: true, keyType: 'evp', key: '123e4567-e12b-12d1-a456-426655440000', receiverName: 'Pizzaria Teste', city: 'SAO PAULO' } } },
    });
    const after = await ctx.admin({
      method: 'POST',
      url: '/api/orders',
      payload: { fulfillment: 'pickup', customer: { name: 'Bia' }, paymentMethod: 'pix', customerConfirmed: true, items: [{ productId: fx.refriId, quantity: 2 }] },
    });
    expect(after.json().order.paymentStatus).toBe('aguardando_pix');
  });
});

describe('11. isolamento de dados por estabelecimento', () => {
  it('usuário de outro estabelecimento não vê pedidos nem catálogo', async () => {
    const created = await ctx.admin({ method: 'POST', url: '/api/orders', payload: bigOrder() });
    const orderId = created.json().order.id as string;

    // segundo estabelecimento inserido diretamente (a instalação é de um só; simulamos para testar o filtro)
    const db = ctx.app.ctx.db;
    const { hashPassword } = await import('../auth/password.js');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO businesses (id, name, category, timezone, settings_json, setup_completed, is_demo, created_at, updated_at) VALUES ('b2', 'Outro Bar', 'bar', 'America/Sao_Paulo', '{}', 1, 0, ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO users (id, business_id, name, username, password_hash, role, is_active, must_change_password, created_at, updated_at) VALUES ('u2', 'b2', 'Outro Admin', 'outro', ?, 'admin', 1, 0, ?, ?)`,
    ).run(hashPassword(TEST_PASSWORD), now, now);
    const login = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'outro', password: TEST_PASSWORD } });
    const other = ctx.as(extractCookie(login));

    const list = await other({ method: 'GET', url: '/api/orders' });
    expect(list.json().orders).toHaveLength(0);
    const detail = await other({ method: 'GET', url: `/api/orders/${orderId}` });
    expect(detail.statusCode).toBe(404);
    const catalog = await other({ method: 'GET', url: '/api/catalog' });
    expect(catalog.json().products).toHaveLength(0);
    const status = await other({ method: 'POST', url: `/api/orders/${orderId}/status`, payload: { status: 'confirmado' } });
    expect(status.statusCode).toBe(404);
    const quote = await other({ method: 'POST', url: '/api/orders/quote', payload: { fulfillment: 'pickup', items: [{ productId: fx.refriId, quantity: 1 }] } });
    expect(quote.json().quote.issues.map((d: { code: string }) => d.code)).toContain('product_not_found');
  });
});

describe('listagem, busca e edição', () => {
  it('lista ativos, busca por número/nome/telefone e edita itens recalculando', async () => {
    const created = await ctx.admin({ method: 'POST', url: '/api/orders', payload: bigOrder() });
    const order = created.json().order;
    const list = await ctx.admin({ method: 'GET', url: '/api/orders' });
    expect(list.json().orders).toHaveLength(1);
    expect(list.json().counts.recebido).toBe(1);

    const byNumber = await ctx.admin({ method: 'GET', url: `/api/orders?q=${order.number}` });
    expect(byNumber.json().orders).toHaveLength(1);
    const byPhone = await ctx.admin({ method: 'GET', url: `/api/orders?q=99999` });
    expect(byPhone.json().orders).toHaveLength(1);
    const byName = await ctx.admin({ method: 'GET', url: `/api/orders?q=Fict` });
    expect(byName.json().orders).toHaveLength(1);
    const none = await ctx.admin({ method: 'GET', url: `/api/orders?q=inexistente` });
    expect(none.json().orders).toHaveLength(0);

    const attendant = await createAttendant(ctx);
    const edited = await ctx.as(attendant)({
      method: 'PUT',
      url: `/api/orders/${order.id}`,
      payload: { ...bigOrder(), items: [{ productId: fx.refriId, quantity: 3 }], discountCents: 0 },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().order.totalCents).toBe(3600 + 500);
    expect(edited.json().order.events.some((e: { type: string }) => e.type === 'edited')).toBe(true);
  });
});
