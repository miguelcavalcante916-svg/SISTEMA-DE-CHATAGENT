import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { maskPhone } from '../../lib/pii.js';
import { parse } from '../../lib/validate.js';
import { recordAudit } from '../audit/service.js';
import { getBusiness } from '../business/service.js';
import { lastRetentionRuns } from './job.js';
import { eraseCustomerData, runRetention } from './service.js';

export async function retentionRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;

  app.get('/api/retention/status', { config: { auth: 'admin' } }, async (request) => {
    const business = getBusiness(db, request.user!.businessId);
    return { settings: business.settings.retention, lastRun: lastRetentionRuns.get(business.id) ?? null };
  });

  app.post('/api/retention/run', { config: { auth: 'admin' } }, async (request) => {
    const business = getBusiness(db, request.user!.businessId);
    const result = runRetention(db, business);
    lastRetentionRuns.set(business.id, result);
    recordAudit(db, { businessId: business.id, userId: request.user!.id, userName: request.user!.name, action: 'retention.run', details: { ...result }, ip: request.ip });
    return { result };
  });

  /** Direito de remoção: apaga conversas e anonimiza pedidos de um telefone. */
  app.post('/api/privacy/erase', { config: { auth: 'admin' } }, async (request) => {
    const body = parse(z.object({ phone: z.string().trim().min(8).max(30), confirm: z.literal(true) }), request.body);
    const result = eraseCustomerData(db, request.user!.businessId, body.phone);
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'privacy.erased', details: { phone: maskPhone(body.phone), ...result }, ip: request.ip });
    return { result };
  });
}
