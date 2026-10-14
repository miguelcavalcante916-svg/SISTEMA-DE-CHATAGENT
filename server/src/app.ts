import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { AppConfig } from './config.js';
import type { AppContext, ProviderRegistry } from './context.js';
import { openDatabase, type DB } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { ZodError } from 'zod';
import { AppError } from './lib/errors.js';
import { LoginRateLimiter } from './modules/auth/rate-limit.js';
import { authenticateRequest, authRoutes } from './modules/auth/routes.js';
import { auditRoutes } from './modules/audit/routes.js';
import { businessRoutes } from './modules/business/routes.js';
import { catalogRoutes } from './modules/catalog/routes.js';
import { orderRoutes } from './modules/orders/routes.js';
import { printingRoutes } from './modules/printing/routes.js';
import { conversationRoutes } from './modules/conversations/routes.js';
import { messagingRoutes } from './modules/messaging/routes.js';
import { knowledgeRoutes } from './modules/knowledge/routes.js';
import { aiRoutes } from './modules/ai/routes.js';
import { paymentRoutes } from './modules/payments/routes.js';
import { backupRoutes } from './modules/backup/routes.js';
import { retentionRoutes } from './modules/retention/routes.js';
import { createDefaultProviders } from './providers.js';
import { EventEmitter } from 'node:events';

export interface BuildAppOptions {
  config: AppConfig;
  db?: DB;
  logger?: boolean;
  providers?: Partial<ProviderRegistry>;
}

export type App = FastifyInstance;

export async function buildApp(options: BuildAppOptions): Promise<App> {
  const { config } = options;
  const db = options.db ?? openDatabase(config.databasePath);
  runMigrations(db);

  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
              censor: '[oculto]',
            },
            ...(config.isProduction
              ? {}
              : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }),
          },
    trustProxy: false,
    bodyLimit: 1024 * 1024,
  });

  const providers = createDefaultProviders(config, db, options.providers);
  const ctx: AppContext = { db, config, loginLimiter: new LoginRateLimiter(), providers, events: new EventEmitter() };
  app.decorate('ctx', ctx);
  app.decorateRequest('user', null);
  app.decorateRequest('sessionToken', null);
  app.decorateRequest('sessionTokenHash', null);

  await app.register(cookie, { hook: 'onRequest' });

  // Mantém o corpo bruto apenas para rotas de webhook (validação de assinatura HMAC)
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (request.url.startsWith('/api/webhooks/')) request.rawBody = text;
    if (text.trim() === '') {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      e.statusCode = 400;
      done(e, undefined);
    }
  });

  // Cabeçalhos de segurança básicos
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Cache-Control', request.url.startsWith('/api/') ? 'no-store' : reply.getHeader('Cache-Control') ?? 'no-cache');
    if (!request.url.startsWith('/api/') && config.isProduction) {
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
      );
    }
  });

  // Proteção CSRF simples: métodos mutáveis precisam vir da mesma origem (quando o navegador envia Origin)
  app.addHook('onRequest', async (request) => {
    if (!request.url.startsWith('/api/')) return;
    if (request.url.startsWith('/api/webhooks/')) return; // validados por assinatura HMAC
    const method = request.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
    const origin = request.headers.origin;
    if (!origin) return;
    const host = request.headers.host;
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!host || originHost !== host) {
      throw new AppError(403, 'bad_origin', 'Origem da requisição não permitida');
    }
  });

  app.addHook('onRequest', async (request) => {
    if (!request.url.startsWith('/api/')) return;
    await authenticateRequest(app, request);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details ?? null } });
      return;
    }
    if (error instanceof ZodError) {
      // Rede de segurança: qualquer validação zod que escape do helper parse() ainda responde 400.
      reply.code(400).send({
        error: { code: 'validation_error', message: 'Dados inválidos', details: error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })) },
      });
      return;
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      reply.code(statusCode).send({ error: { code: 'request_error', message: (error as Error).message, details: null } });
      return;
    }
    request.log.error({ err: error }, 'erro não tratado');
    reply.code(500).send({ error: { code: 'internal_error', message: 'Erro interno. Tente novamente.', details: null } });
  });

  await app.register(authRoutes);
  await app.register(auditRoutes);
  await app.register(businessRoutes);
  await app.register(catalogRoutes);
  await app.register(orderRoutes);
  await app.register(printingRoutes);
  await app.register(conversationRoutes);
  await app.register(messagingRoutes);
  await app.register(knowledgeRoutes);
  await app.register(aiRoutes);
  await app.register(paymentRoutes);
  await app.register(backupRoutes);
  await app.register(retentionRoutes);

  // Interface web compilada (produção). Em desenvolvimento o Vite serve o frontend.
  const indexHtml = path.join(config.webDistDir, 'index.html');
  const hasWeb = existsSync(indexHtml);
  if (hasWeb) {
    // wildcard (padrão) resolve arquivos a cada requisição: um novo build do painel passa a ser servido sem reiniciar
    await app.register(fastifyStatic, { root: config.webDistDir, prefix: '/', index: ['index.html'] });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      reply.code(404).send({ error: { code: 'not_found', message: 'Rota não encontrada', details: null } });
      return;
    }
    const pathname = request.url.split('?')[0] ?? '';
    const looksLikeFile = /\.[a-z0-9]{2,8}$/i.test(pathname);
    if (hasWeb && request.method === 'GET' && !looksLikeFile) {
      reply.type('text/html').sendFile('index.html');
      return;
    }
    if (looksLikeFile) {
      reply.code(404).type('text/plain').send('Arquivo não encontrado');
      return;
    }
    reply.code(404).type('text/plain').send('Interface web não compilada. Execute `npm run build` ou use `npm run dev`.');
  });

  app.addHook('onClose', async () => {
    db.close();
  });

  return app;
}
