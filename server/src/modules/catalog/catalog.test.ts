import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAttendant, createTestApp, type TestContext } from '../../test/helpers.js';

let ctx: TestContext;
beforeEach(async () => {
  ctx = await createTestApp();
});
afterEach(async () => {
  await ctx.close();
});

describe('catálogo', () => {
  it('valida preço negativo, nome obrigatório e consistência de adicionais', async () => {
    const neg = await ctx.admin({ method: 'POST', url: '/api/catalog/products', payload: { name: 'X', priceCents: -1 } });
    expect(neg.statusCode).toBe(400);
    const noName = await ctx.admin({ method: 'POST', url: '/api/catalog/products', payload: { name: '  ', priceCents: 100 } });
    expect(noName.statusCode).toBe(400);
    const badGroup = await ctx.admin({
      method: 'POST',
      url: '/api/catalog/option-groups',
      payload: { name: 'G', minSelect: 3, maxSelect: 1, options: [{ name: 'a' }] },
    });
    expect(badGroup.statusCode).toBe(400);
    const requiredWithoutOptions = await ctx.admin({
      method: 'POST',
      url: '/api/catalog/option-groups',
      payload: { name: 'G', minSelect: 1, maxSelect: 1, options: [{ name: 'a', isAvailable: false }] },
    });
    expect(requiredWithoutOptions.statusCode).toBe(400);
    const unknownGroup = await ctx.admin({ method: 'POST', url: '/api/catalog/products', payload: { name: 'P', priceCents: 100, optionGroupIds: ['nao-existe'] } });
    expect(unknownGroup.statusCode).toBe(422);
    const comboEmpty = await ctx.admin({ method: 'POST', url: '/api/catalog/products', payload: { name: 'Combo', priceCents: 100, kind: 'combo' } });
    expect(comboEmpty.statusCode).toBe(422);
  });

  it('cria, arquiva e marca indisponível; atendente só altera disponibilidade', async () => {
    const p = await ctx.admin({ method: 'POST', url: '/api/catalog/products', payload: { name: 'Água', priceCents: 400 } });
    expect(p.statusCode).toBe(201);
    const id = p.json().product.id as string;
    const attendant = await createAttendant(ctx);
    const forbidden = await ctx.as(attendant)({ method: 'PUT', url: `/api/catalog/products/${id}`, payload: { name: 'Água', priceCents: 1 } });
    expect(forbidden.statusCode).toBe(403);
    const toggled = await ctx.as(attendant)({ method: 'PATCH', url: `/api/catalog/products/${id}/availability`, payload: { isAvailable: false } });
    expect(toggled.statusCode).toBe(200);
    expect(toggled.json().product.isAvailable).toBe(false);
    const archived = await ctx.admin({ method: 'PATCH', url: `/api/catalog/products/${id}/archive`, payload: { archived: true } });
    expect(archived.statusCode).toBe(200);
    const list = await ctx.admin({ method: 'GET', url: '/api/catalog' });
    expect(list.json().products).toHaveLength(0);
    const withArchived = await ctx.admin({ method: 'GET', url: '/api/catalog?includeArchived=1' });
    expect(withArchived.json().products).toHaveLength(1);
  });

  it('combo com componentes e variantes atualizadas sem perder histórico', async () => {
    const a = await ctx.admin({ method: 'POST', url: '/api/catalog/products', payload: { name: 'Lanche', priceCents: 2000 } });
    const b = await ctx.admin({ method: 'POST', url: '/api/catalog/products', payload: { name: 'Batata', priceCents: 1000, variants: [{ name: 'P', priceCents: 800 }, { name: 'G', priceCents: 1200 }] } });
    const combo = await ctx.admin({
      method: 'POST',
      url: '/api/catalog/products',
      payload: { name: 'Combo 1', priceCents: 2500, kind: 'combo', comboItems: [{ productId: a.json().product.id, quantity: 1 }, { productId: b.json().product.id, quantity: 1 }] },
    });
    expect(combo.statusCode).toBe(201);
    expect(combo.json().product.comboItems).toHaveLength(2);

    const batata = b.json().product;
    const upd = await ctx.admin({
      method: 'PUT',
      url: `/api/catalog/products/${batata.id}`,
      payload: { name: 'Batata', priceCents: 1000, variants: [{ id: batata.variants[0].id, name: 'P', priceCents: 900 }, { name: 'M', priceCents: 1000 }] },
    });
    expect(upd.statusCode).toBe(200);
    const names = upd.json().product.variants.map((v: { name: string }) => v.name).sort();
    expect(names).toEqual(['M', 'P']);
  });
});
