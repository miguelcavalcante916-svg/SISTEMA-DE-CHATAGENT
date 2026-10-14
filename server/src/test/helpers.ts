import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp, type App } from '../app.js';
import { loadConfig } from '../config.js';
import type { ProviderRegistry } from '../context.js';

export interface TestContext {
  app: App;
  /** cookie de sessão do administrador criado no setup */
  adminCookie: string;
  businessId: string;
  adminUserId: string;
  /** requisição autenticada */
  as: (cookie: string) => (opts: InjectOptions) => Promise<LightMyRequestResponse>;
  admin: (opts: InjectOptions) => Promise<LightMyRequestResponse>;
  close: () => Promise<void>;
}

export const TEST_PASSWORD = 'Senha-Forte-123';

export function extractCookie(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) throw new Error('resposta sem cookie de sessão');
  return header.split(';')[0]!;
}

export async function createTestApp(opts: {
  providers?: Partial<ProviderRegistry>;
  env?: Record<string, string>;
  setup?: boolean;
  category?: string;
} = {}): Promise<TestContext> {
  const config = loadConfig({
    DATABASE_PATH: ':memory:',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
    WEBHOOK_SECRET: 'segredo-de-teste',
    ...opts.env,
  });
  const app = await buildApp({ config, logger: false, providers: opts.providers });
  await app.ready();

  let adminCookie = '';
  let businessId = '';
  let adminUserId = '';
  if (opts.setup !== false) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        business: { name: 'Pizzaria Teste', category: opts.category ?? 'pizzaria', timezone: 'America/Sao_Paulo' },
        admin: { name: 'Admin Teste', username: 'admin', password: TEST_PASSWORD },
      },
    });
    if (res.statusCode !== 200) throw new Error(`setup falhou: ${res.statusCode} ${res.body}`);
    adminCookie = extractCookie(res);
    const body = res.json() as { user: { id: string; businessId: string } };
    businessId = body.user.businessId;
    adminUserId = body.user.id;
  }

  const as = (cookie: string) => (o: InjectOptions) =>
    app.inject({ ...o, headers: { ...(o.headers ?? {}), cookie } });

  return {
    app,
    adminCookie,
    businessId,
    adminUserId,
    as,
    admin: as(adminCookie),
    close: () => app.close(),
  };
}

/** Cria um usuário atendente e devolve o cookie de sessão dele. */
export async function createAttendant(ctx: TestContext, username = 'atendente1'): Promise<string> {
  const created = await ctx.admin({
    method: 'POST',
    url: '/api/users',
    payload: { name: 'Atendente', username, password: TEST_PASSWORD, role: 'atendente' },
  });
  if (created.statusCode !== 201) throw new Error(`criar atendente falhou: ${created.body}`);
  const login = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password: TEST_PASSWORD } });
  return extractCookie(login);
}
