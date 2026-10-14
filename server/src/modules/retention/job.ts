import type { FastifyInstance } from 'fastify';
import { rowToBusiness, type BusinessRow } from '../business/service.js';
import { purgeExpiredSessions } from '../auth/session.js';
import { runRetention, type RetentionResult } from './service.js';

export const lastRetentionRuns = new Map<string, RetentionResult>();

export function runRetentionForAll(app: FastifyInstance): RetentionResult[] {
  const rows = app.ctx.db.prepare('SELECT * FROM businesses').all() as BusinessRow[];
  const results: RetentionResult[] = [];
  for (const row of rows) {
    const business = rowToBusiness(row);
    const r = runRetention(app.ctx.db, business);
    lastRetentionRuns.set(business.id, r);
    results.push(r);
  }
  purgeExpiredSessions(app.ctx.db);
  return results;
}

/** Executa a retenção ao iniciar (após 15 s) e a cada 24 h. */
export function startRetentionJob(app: FastifyInstance): () => void {
  const run = () => {
    try {
      const results = runRetentionForAll(app);
      const total = results.reduce((acc, r) => acc + r.conversationsDeleted + r.ordersAnonymized + r.auditDeleted, 0);
      if (total > 0) app.log.info({ results }, 'retenção aplicada');
    } catch (err) {
      app.log.error({ err }, 'falha na rotina de retenção');
    }
  };
  const first = setTimeout(run, 15_000);
  const interval = setInterval(run, 24 * 3600_000);
  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
}
