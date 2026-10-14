import type { FastifyInstance } from 'fastify';
import { parseJson } from '../../lib/json.js';
import { listAudit } from './service.js';

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/audit', { config: { auth: 'admin' } }, async (request) => {
    const q = request.query as { limit?: string };
    const limit = Math.min(500, Math.max(1, Number(q.limit ?? 200) || 200));
    const rows = listAudit(app.ctx.db, request.user!.businessId, limit);
    return {
      entries: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        details: parseJson<Record<string, unknown> | null>(r.details_json, null),
        ip: r.ip,
        createdAt: r.created_at,
      })),
    };
  });
}
