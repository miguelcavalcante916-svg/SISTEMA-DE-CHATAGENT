import { afterEach, describe, expect, it } from 'vitest';
import { createAttendant, createTestApp, extractCookie, TEST_PASSWORD, type TestContext } from '../../test/helpers.js';
import { hashPassword, validatePasswordPolicy, verifyPassword } from './password.js';

let ctx: TestContext;
afterEach(async () => {
  if (ctx) await ctx.close();
});

describe('senhas', () => {
  it('gera hash scrypt verificável e rejeita senha errada', () => {
    const hash = hashPassword('Minha-Senha-1');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('Minha-Senha-1', hash)).toBe(true);
    expect(verifyPassword('outra', hash)).toBe(false);
  });
  it('aplica política mínima', () => {
    expect(validatePasswordPolicy('curta')).not.toBeNull();
    expect(validatePasswordPolicy('12345678')).not.toBeNull();
    expect(validatePasswordPolicy('admin1234', 'admin1234')).not.toBeNull();
    expect(validatePasswordPolicy('Boa-Senha-2024')).toBeNull();
  });
});

describe('autenticação e permissões', () => {
  it('exige setup inicial uma única vez e bloqueia repetição', async () => {
    ctx = await createTestApp({ setup: false });
    const status = await ctx.app.inject({ method: 'GET', url: '/api/auth/status' });
    expect(status.json().needsSetup).toBe(true);

    const setup = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        business: { name: 'Lanchonete X', category: 'hamburgueria' },
        admin: { name: 'Dona Maria', username: 'maria', password: TEST_PASSWORD },
      },
    });
    expect(setup.statusCode).toBe(200);
    const cookie = extractCookie(setup);

    const again = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        business: { name: 'Outra', category: 'bar' },
        admin: { name: 'Invasor', username: 'invasor', password: TEST_PASSWORD },
      },
    });
    expect(again.statusCode).toBe(409);

    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.json().user.role).toBe('admin');
  });

  it('rejeita senha fraca no setup', async () => {
    ctx = await createTestApp({ setup: false });
    const setup = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        business: { name: 'Lanchonete X', category: 'hamburgueria' },
        admin: { name: 'Dona Maria', username: 'maria', password: '12345678' },
      },
    });
    expect(setup.statusCode).toBe(400);
  });

  it('bloqueia rotas sem sessão e distingue admin de atendente', async () => {
    ctx = await createTestApp();
    const anon = await ctx.app.inject({ method: 'GET', url: '/api/users' });
    expect(anon.statusCode).toBe(401);

    const attendantCookie = await createAttendant(ctx);
    const forbidden = await ctx.as(attendantCookie)({ method: 'GET', url: '/api/users' });
    expect(forbidden.statusCode).toBe(403);

    const allowed = await ctx.as(attendantCookie)({ method: 'GET', url: '/api/auth/me' });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().user.role).toBe('atendente');

    const list = await ctx.admin({ method: 'GET', url: '/api/users' });
    expect(list.statusCode).toBe(200);
    expect(list.json().users).toHaveLength(2);
  });

  it('login inválido, limite de tentativas e logout', async () => {
    ctx = await createTestApp();
    for (let i = 0; i < 10; i++) {
      const bad = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'errada-123' } });
      expect(bad.statusCode).toBe(401);
    }
    const blocked = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: TEST_PASSWORD } });
    expect(blocked.statusCode).toBe(429);

    const logout = await ctx.admin({ method: 'POST', url: '/api/auth/logout' });
    expect(logout.statusCode).toBe(200);
    const after = await ctx.admin({ method: 'GET', url: '/api/auth/me' });
    expect(after.statusCode).toBe(401);
  });

  it('troca de senha exige senha atual e invalida outras sessões', async () => {
    ctx = await createTestApp();
    const second = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: TEST_PASSWORD } });
    const secondCookie = extractCookie(second);

    const wrong = await ctx.admin({
      method: 'POST',
      url: '/api/auth/change-password',
      payload: { currentPassword: 'errada', newPassword: 'Nova-Senha-456' },
    });
    expect(wrong.statusCode).toBe(400);

    const ok = await ctx.admin({
      method: 'POST',
      url: '/api/auth/change-password',
      payload: { currentPassword: TEST_PASSWORD, newPassword: 'Nova-Senha-456' },
    });
    expect(ok.statusCode).toBe(200);

    const stillValid = await ctx.admin({ method: 'GET', url: '/api/auth/me' });
    expect(stillValid.statusCode).toBe(200);
    const invalidated = await ctx.as(secondCookie)({ method: 'GET', url: '/api/auth/me' });
    expect(invalidated.statusCode).toBe(401);
  });

  it('não permite remover o último administrador', async () => {
    ctx = await createTestApp();
    const res = await ctx.admin({ method: 'PATCH', url: `/api/users/${ctx.adminUserId}`, payload: { role: 'atendente' } });
    expect(res.statusCode).toBe(400);
  });

  it('bloqueia requisição mutável de origem diferente (CSRF)', async () => {
    ctx = await createTestApp();
    const res = await ctx.admin({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { origin: 'http://malicioso.example', host: '127.0.0.1:3333' },
      payload: { currentPassword: TEST_PASSWORD, newPassword: 'Nova-Senha-456' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('registra auditoria de login e setup', async () => {
    ctx = await createTestApp();
    const res = await ctx.admin({ method: 'GET', url: '/api/audit' });
    const actions = (res.json().entries as { action: string }[]).map((e) => e.action);
    expect(actions).toContain('setup.completed');
  });
});
