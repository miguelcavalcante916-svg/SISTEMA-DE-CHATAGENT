import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedPizzaCatalog, type PizzaFixture } from '../../test/fixtures.js';
import { createAttendant, createTestApp, type TestContext } from '../../test/helpers.js';
import { buildStaticPixPayload, parseTlv, validatePixPayloadCrc } from './pix/brcode.js';
import { crc16ccitt } from './pix/crc16.js';
import { validatePixConfig } from './pix/validate.js';

describe('BR Code Pix', () => {
  it('CRC-16/CCITT-FALSE confere com vetores conhecidos', () => {
    expect(crc16ccitt('123456789')).toBe('29B1');
  });

  it('reproduz o exemplo do Manual de Padrões para Iniciação do Pix (BCB)', () => {
    const payload = buildStaticPixPayload({ key: '123e4567-e12b-12d1-a456-426655440000', receiverName: 'Fulano de Tal', city: 'BRASILIA', txid: null });
    expect(payload).toBe('00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D');
    expect(validatePixPayloadCrc(payload)).toBe(true);
  });

  it('inclui valor, txid e remove acentos; campos respeitam limites', () => {
    const payload = buildStaticPixPayload({ key: 'financeiro@exemplo.com', receiverName: 'Padaria São João Ltda ME 12345', city: 'São José dos Campos', amountCents: 1234, txid: 'PED-42' });
    const tlv = parseTlv(payload);
    expect(tlv['54']).toBe('12.34');
    expect(tlv['59']).toBe('Padaria Sao Joao Ltda ME ');
    expect(tlv['59']!.length).toBeLessThanOrEqual(25);
    expect(tlv['60']).toBe('Sao Jose dos Ca');
    expect(parseTlv(tlv['62']!)['05']).toBe('PED42');
    expect(parseTlv(tlv['26']!)['01']).toBe('financeiro@exemplo.com');
    expect(validatePixPayloadCrc(payload)).toBe(true);
    expect(validatePixPayloadCrc(`${payload.slice(0, -1)}0`)).toBe(payload.endsWith('0'));
  });

  it('valida tipos de chave', () => {
    const base = { enabled: true, includeAmount: true, instructions: '', receiverName: 'Loja', city: 'Cidade' };
    expect(validatePixConfig({ ...base, keyType: 'cpf', key: '123.456.789-09' }).normalizedKey).toBe('12345678909');
    expect(validatePixConfig({ ...base, keyType: 'cpf', key: '123' }).ok).toBe(false);
    expect(validatePixConfig({ ...base, keyType: 'phone', key: '(11) 99999-8888' }).normalizedKey).toBe('+5511999998888');
    expect(validatePixConfig({ ...base, keyType: 'email', key: 'nao-e-email' }).ok).toBe(false);
    expect(validatePixConfig({ ...base, keyType: 'evp', key: 'abc' }).ok).toBe(false);
    expect(validatePixConfig({ ...base, keyType: null, key: '' }).errors.length).toBeGreaterThan(0);
  });
});

describe('7. QR Pix por pedido', () => {
  let ctx: TestContext;
  let fx: PizzaFixture;
  beforeEach(async () => {
    ctx = await createTestApp();
    fx = await seedPizzaCatalog(ctx);
  });
  afterEach(async () => {
    await ctx.close();
  });

  const createPixOrder = async () => {
    const res = await ctx.admin({
      method: 'POST',
      url: '/api/orders',
      payload: { fulfillment: 'pickup', paymentMethod: 'pix', customer: { name: 'Cliente' }, customerConfirmed: true, items: [{ productId: fx.refriId, quantity: 2 }] },
    });
    return res.json().order;
  };

  it('fica desabilitado sem configuração válida e claramente pendente com configuração', async () => {
    const o1 = await createPixOrder();
    const off = await ctx.admin({ method: 'GET', url: `/api/orders/${o1.id}/pix` });
    expect(off.json().available).toBe(false);
    expect(off.json().reason).toContain('desabilitado');
    expect(off.json().paymentStatus).toBe('pendente');

    await ctx.admin({ method: 'PATCH', url: '/api/business', payload: { settings: { pix: { enabled: true, keyType: 'cpf', key: '123', receiverName: 'X', city: 'Y' } } } });
    const invalid = await ctx.admin({ method: 'GET', url: `/api/orders/${o1.id}/pix` });
    expect(invalid.json().available).toBe(false);
    expect(invalid.json().reason).toContain('inválida');
    const check = await ctx.admin({ method: 'GET', url: '/api/pix/config-check' });
    expect(check.json().validation.ok).toBe(false);

    await ctx.admin({
      method: 'PATCH',
      url: '/api/business',
      payload: { settings: { pix: { enabled: true, keyType: 'evp', key: '123e4567-e12b-12d1-a456-426655440000', receiverName: 'Pizzaria Teste', city: 'SAO PAULO', includeAmount: true } } },
    });
    const o2 = await createPixOrder();
    expect(o2.paymentStatus).toBe('aguardando_pix');
    const res = await ctx.admin({ method: 'GET', url: `/api/orders/${o2.id}/pix` });
    expect(res.json().available).toBe(true);
    expect(res.json().paymentStatus).toBe('aguardando_pix');
    expect(res.json().paymentStatusLabel).toContain('Aguardando');
    expect(validatePixPayloadCrc(res.json().payload)).toBe(true);
    expect(parseTlv(res.json().payload)['54']).toBe('24.00');
    expect(res.json().qrSvg).toContain('<svg');
    expect(res.json().confirmationNote).toContain('não confirma');

    const attendant = await createAttendant(ctx);
    const att = await ctx.as(attendant)({ method: 'GET', url: `/api/orders/${o2.id}/pix` });
    expect(att.json().keyMasked).toBeUndefined();
    expect(att.json().payload).toBeTruthy();

    const paid = await ctx.as(attendant)({ method: 'POST', url: `/api/orders/${o2.id}/payment`, payload: { paymentStatus: 'pago', note: 'Conferido no app do banco' } });
    expect(paid.json().order.paidConfirmedByName).toBe('Atendente');
    const after = await ctx.admin({ method: 'GET', url: `/api/orders/${o2.id}/pix` });
    expect(after.json().available).toBe(false);
    expect(after.json().reason).toContain('Pago');
  });
});
