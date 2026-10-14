import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAttendant, createTestApp, type TestContext } from '../../test/helpers.js';
import { isOpenNow, rowToBusiness, type Business } from './service.js';
import { defaultSettings } from './settings.js';

let ctx: TestContext;
beforeEach(async () => {
  ctx = await createTestApp();
});
afterEach(async () => {
  await ctx.close();
});

function fakeBusiness(overrides: Partial<Business['settings']>): Business {
  const row = {
    id: 'b',
    name: 'X',
    category: 'bar' as const,
    phone: null,
    contact_email: null,
    timezone: 'America/Sao_Paulo',
    settings_json: JSON.stringify({ ...defaultSettings(), ...overrides }),
    setup_completed: 1,
    data_reviewed_at: null,
    is_demo: 0,
    created_at: '',
    updated_at: '',
  };
  return rowToBusiness(row);
}

describe('horário de funcionamento', () => {
  it('respeita períodos, virada de meia-noite e dias fechados', () => {
    const b = fakeBusiness({
      openingHours: { ...defaultSettings().openingHours, fri: [{ open: '18:00', close: '02:00' }], sat: [{ open: '11:00', close: '15:00' }] },
      closedDates: ['2026-10-17'],
    });
    // sexta 16/10/2026 23:00 em São Paulo = 02:00Z de 17/10
    expect(isOpenNow(b, new Date('2026-10-17T02:00:00Z'))).toBe(true);
    // sábado 17/10 01:00 local (período da sexta atravessando a meia-noite) — mas 17/10 está em closedDates
    expect(isOpenNow(b, new Date('2026-10-17T04:00:00Z'))).toBe(false);
    // sábado 24/10 12:00 local
    expect(isOpenNow(b, new Date('2026-10-24T15:00:00Z'))).toBe(true);
    // sábado 24/10 16:00 local
    expect(isOpenNow(b, new Date('2026-10-24T19:00:00Z'))).toBe(false);
  });
});

describe('configuração do estabelecimento', () => {
  it('atendente vê chave Pix mascarada; admin vê completa', async () => {
    await ctx.admin({
      method: 'PATCH',
      url: '/api/business',
      payload: { settings: { pix: { enabled: true, keyType: 'email', key: 'financeiro@exemplo.com', receiverName: 'Pizzaria Teste', city: 'SAO PAULO' } } },
    });
    const admin = await ctx.admin({ method: 'GET', url: '/api/business' });
    expect(admin.json().business.settings.pix.key).toBe('financeiro@exemplo.com');
    const attendant = await createAttendant(ctx);
    const att = await ctx.as(attendant)({ method: 'GET', url: '/api/business' });
    expect(att.json().business.settings.pix.key).not.toContain('financeiro@');
    expect(att.json().business.pixKeyMasked).toBe(true);
    const patch = await ctx.as(attendant)({ method: 'PATCH', url: '/api/business', payload: { name: 'Hackeado' } });
    expect(patch.statusCode).toBe(403);
  });

  it('aplica perfil de categoria criando modelos sem preços reais', async () => {
    const res = await ctx.admin({ method: 'POST', url: '/api/business/apply-profile', payload: { category: 'pizzaria' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().createdCategories).toBeGreaterThan(0);
    const catalog = await ctx.admin({ method: 'GET', url: '/api/catalog' });
    const borda = catalog.json().optionGroups.find((g: { name: string }) => g.name === 'Borda recheada');
    expect(borda).toBeTruthy();
    expect(borda.options.every((o: { priceCents: number; isAvailable: boolean }) => o.priceCents === 0 && !o.isAvailable)).toBe(true);
    const again = await ctx.admin({ method: 'POST', url: '/api/business/apply-profile', payload: { category: 'pizzaria' } });
    expect(again.json().createdCategories).toBe(0);
  });

  it('não habilita IA antes da revisão de dados; revisão exige itens obrigatórios', async () => {
    const enable = await ctx.admin({ method: 'PATCH', url: '/api/business', payload: { settings: { ai: { enabled: true } } } });
    expect(enable.statusCode).toBe(400);
    const b = await ctx.admin({ method: 'GET', url: '/api/business' });
    expect(b.json().business.settings.ai.enabled).toBe(false);
    const review = await ctx.admin({ method: 'POST', url: '/api/business/review', payload: { reviewed: true } });
    expect(review.statusCode).toBe(400);
    const checklist = await ctx.admin({ method: 'GET', url: '/api/business/review' });
    expect(checklist.json().readyForAi).toBe(false);
    expect(checklist.json().items.find((i: { key: string }) => i.key === 'catalog').ok).toBe(false);
  });

  it('CRUD de bairros/áreas de entrega', async () => {
    const created = await ctx.admin({ method: 'POST', url: '/api/delivery-zones', payload: { name: 'Jardim', feeCents: 700, minOrderCents: 0 } });
    expect(created.statusCode).toBe(201);
    const id = created.json().zone.id as string;
    const upd = await ctx.admin({ method: 'PATCH', url: `/api/delivery-zones/${id}`, payload: { feeCents: 900 } });
    expect(upd.json().zone.feeCents).toBe(900);
    const neg = await ctx.admin({ method: 'PATCH', url: `/api/delivery-zones/${id}`, payload: { feeCents: -5 } });
    expect(neg.statusCode).toBe(400);
    const del = await ctx.admin({ method: 'DELETE', url: `/api/delivery-zones/${id}` });
    expect(del.statusCode).toBe(200);
    const list = await ctx.admin({ method: 'GET', url: '/api/delivery-zones' });
    expect(list.json().zones).toHaveLength(0);
  });
});
