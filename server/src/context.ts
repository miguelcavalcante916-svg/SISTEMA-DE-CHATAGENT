import type { EventEmitter } from 'node:events';
import type { DB } from './db/connection.js';
import type { AppConfig } from './config.js';
import type { LoginRateLimiter } from './modules/auth/rate-limit.js';
import type { AuthUser } from './modules/auth/types.js';

/** Dependências compartilhadas pelas rotas. Provedores externos são injetáveis (testes/simulação). */
export interface AppContext {
  db: DB;
  config: AppConfig;
  loginLimiter: LoginRateLimiter;
  // Preenchidos nas fases seguintes (IA, mensageria, impressão) — ver app.ts
  providers: ProviderRegistry;
  /** Eventos internos (ex.: 'order.status_changed') para notificações e integrações. */
  events: EventEmitter;
}

export interface ProviderRegistry {
  ai: import('./modules/ai/provider.js').AIProvider;
  messaging: import('./modules/messaging/provider.js').MessagingRegistry;
  printers: import('./modules/printing/provider.js').PrinterRegistry;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
  interface FastifyRequest {
    user: AuthUser | null;
    sessionToken: string | null;
    sessionTokenHash: string | null;
    rawBody?: string;
  }
  interface FastifyContextConfig {
    auth?: 'public' | 'user' | 'admin';
  }
}
