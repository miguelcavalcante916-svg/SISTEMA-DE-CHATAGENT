import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedPizzaCatalog } from '../../test/fixtures.js';
import { createAttendant, createTestApp, type TestContext } from '../../test/helpers.js';
import { seedDemo } from '../../seed/demo.js';
import { openDatabase } from '../../db/connection.js';
import { runMigrations } from '../../db/migrate.js';
import { runRetention } from '../retention/service.js';
import { getBusiness } from '../business/service.js';

let ctx: TestContext;
let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'backup-test-'));
  ctx = await createTestApp({ env: { BACKUP_DIR: dir } });
  await seedPizzaCatalog(ctx);
});
afterEach(async () => {
  await ctx.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('backup e retenção', () => {
  it('cria backup verificado, lista, baixa e apaga; atendente não acessa', async () => {
    const created = await ctx.admin({ method: 'POST', url: '/api/backup' });
    expect(created.statusCode).toBe(201);
    const b = created.json().backup;
    expect(b.verification.ok).toBe(true);
    expect(b.verification.integrity).toBe('ok');
    expect(b.verification.tables.products).toBe(2);
    const list = await ctx.admin({ method: 'GET', url: '/api/backup' });
    expect(list.json().backups).toHaveLength(1);
    const dl = await ctx.admin({ method: 'GET', url: `/api/backup/${b.file}/download` });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBe(b.bytes);
    const bad = await ctx.admin({ method: 'GET', url: `/api/backup/..%2Fapp.db/download` });
    expect([400, 404]).toContain(bad.statusCode);
    const attendant = await createAttendant(ctx);
    expect((await ctx.as(attendant)({ method: 'GET', url: '/api/backup' })).statusCode).toBe(403);
    const del = await ctx.admin({ method: 'DELETE', url: `/api/backup/${b.file}` });
    expect(del.statusCode).toBe(200);
  });

  it('retenção apaga conversas antigas, anonimiza pedidos e remoção a pedido funciona', async () => {
    const db = ctx.app.ctx.db;
    const first = await ctx.admin({ method: 'POST', url: '/api/simulator/inbound', payload: { phone: '11955554444', name: 'Antigo', content: 'oi' } });
    const convId = first.json().conversation.id as string;
    const refri = (await ctx.admin({ method: 'GET', url: '/api/catalog' })).json().products.find((p: { name: string }) => p.name.startsWith('Refri')).id;
    const order = await ctx.admin({
      method: 'POST',
      url: '/api/orders',
      payload: { fulfillment: 'pickup', customer: { name: 'Antigo', phone: '11955554444' }, customerConfirmed: true, items: [{ productId: refri, quantity: 1 }] },
    });
    const orderId = order.json().order.id as string;
    for (const status of ['confirmado', 'em_preparo', 'pronto', 'concluido']) await ctx.admin({ method: 'POST', url: `/api/orders/${orderId}/status`, payload: { status } });
    // envelhece os registros artificialmente
    db.prepare("UPDATE conversations SET last_message_at = '2020-01-01T00:00:00.000Z', created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(convId);
    db.prepare("UPDATE orders SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(orderId);
    await ctx.admin({ method: 'PATCH', url: '/api/business', payload: { settings: { retention: { conversationDays: 30, personalDataDays: 60, auditDays: 0 } } } });
    const result = runRetention(db, getBusiness(db, ctx.businessId));
    expect(result.conversationsDeleted).toBe(1);
    expect(result.ordersAnonymized).toBe(1);
    const after = await ctx.admin({ method: 'GET', url: `/api/orders/${orderId}` });
    expect(after.json().order.customer.phone).toBe('');
    expect(after.json().order.customer.name).toContain('removidos');

    const second = await ctx.admin({ method: 'POST', url: '/api/simulator/inbound', payload: { phone: '11933332222', name: 'Pede Remoção', content: 'apaguem meus dados' } });
    expect(second.statusCode).toBe(200);
    const erase = await ctx.admin({ method: 'POST', url: '/api/privacy/erase', payload: { phone: '11933332222', confirm: true } });
    expect(erase.json().result.conversationsDeleted).toBe(1);
    const audit = await ctx.admin({ method: 'GET', url: '/api/audit' });
    const entry = audit.json().entries.find((e: { action: string }) => e.action === 'privacy.erased');
    expect(entry.details.phone).not.toContain('33332222');
  });

  it('seed de demonstração cria dados fictícios e recusa banco com usuários', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const r = seedDemo(db);
    expect(r.adminPassword).toMatch(/^Demo-/);
    const biz = db.prepare('SELECT name, is_demo FROM businesses').get() as { name: string; is_demo: number };
    expect(biz.name).toContain('DEMO');
    expect(biz.is_demo).toBe(1);
    expect(() => seedDemo(db)).toThrow();
    db.close();
    expect(() => seedDemo(ctx.app.ctx.db)).toThrow(/usuários/);
  });
});
