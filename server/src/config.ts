import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Raiz do repositório (pasta que contém o package.json principal). */
export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const boolString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  DATABASE_PATH: z.string().min(1).default('./data/app.db'),
  BACKUP_DIR: z.string().min(1).default('./data/backups'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SESSION_COOKIE_SECURE: boolString,
  SESSION_TTL_HOURS: z.coerce.number().positive().default(168),
  OLLAMA_BASE_URL: z.url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().min(1).default('qwen2.5:7b'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  AI_MAX_REPLY_CHARS: z.coerce.number().int().positive().default(800),
  WEBHOOK_SECRET: z.string().default(''),
  WEBHOOK_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(300),
  WHATSAPP_PROVIDER: z.enum(['none', 'openwa']).default('none'),
  BRIDGE_TOKEN: z.string().default(''),
  WHATSAPP_SEND_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  host: string;
  port: number;
  databasePath: string;
  backupDir: string;
  logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  sessionCookieSecure: boolean;
  sessionTtlHours: number;
  ollamaBaseUrl: string;
  ollamaModel: string;
  aiTimeoutMs: number;
  aiMaxReplyChars: number;
  webhookSecret: string;
  webhookMaxAgeSeconds: number;
  whatsappProvider: 'none' | 'openwa';
  bridgeToken: string;
  whatsappSendEnabled: boolean;
  webDistDir: string;
}

function resolveFromRoot(p: string): string {
  if (p === ':memory:') return p;
  return path.isAbsolute(p) ? p : path.resolve(ROOT_DIR, p);
}

/** Carrega .env da raiz do repositório (se existir) sem dependências externas. */
export function loadDotEnv(file = path.join(ROOT_DIR, '.env')): void {
  try {
    process.loadEnvFile(file);
  } catch {
    // arquivo ausente: usa variáveis de ambiente / padrões
  }
}

export function loadConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  const parsed = EnvSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const msgs = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${msgs}`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    host: e.HOST,
    port: e.PORT,
    databasePath: resolveFromRoot(e.DATABASE_PATH),
    backupDir: resolveFromRoot(e.BACKUP_DIR),
    logLevel: e.LOG_LEVEL,
    sessionCookieSecure: e.SESSION_COOKIE_SECURE,
    sessionTtlHours: e.SESSION_TTL_HOURS,
    ollamaBaseUrl: e.OLLAMA_BASE_URL.replace(/\/+$/, ''),
    ollamaModel: e.OLLAMA_MODEL,
    aiTimeoutMs: e.AI_TIMEOUT_MS,
    aiMaxReplyChars: e.AI_MAX_REPLY_CHARS,
    webhookSecret: e.WEBHOOK_SECRET,
    webhookMaxAgeSeconds: e.WEBHOOK_MAX_AGE_SECONDS,
    whatsappProvider: e.WHATSAPP_PROVIDER,
    bridgeToken: e.BRIDGE_TOKEN,
    whatsappSendEnabled: e.WHATSAPP_SEND_ENABLED,
    webDistDir: path.join(ROOT_DIR, 'web', 'dist'),
  };
}
