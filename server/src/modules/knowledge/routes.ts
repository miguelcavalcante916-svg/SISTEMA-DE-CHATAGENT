import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse } from '../../lib/validate.js';
import { recordAudit } from '../audit/service.js';
import {
  approveSuggestion,
  createEntry,
  createSuggestion,
  deleteEntry,
  deleteSuggestion,
  EntryInputSchema,
  listEntries,
  listSuggestions,
  rejectSuggestion,
  setEntryActive,
  updateEntry,
} from './service.js';

export async function knowledgeRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;

  app.get('/api/knowledge', async (request) => ({ entries: listEntries(db, request.user!.businessId) }));

  app.post('/api/knowledge', { config: { auth: 'admin' } }, async (request, reply) => {
    const body = parse(EntryInputSchema, request.body);
    const entry = createEntry(db, request.user!.businessId, body, request.user!.id);
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'knowledge.created', entityType: 'knowledge', entityId: entry.id, details: { title: entry.title }, ip: request.ip });
    reply.code(201);
    return { entry };
  });

  app.put('/api/knowledge/:id', { config: { auth: 'admin' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(EntryInputSchema, request.body);
    const entry = updateEntry(db, request.user!.businessId, id, body, request.user!.id);
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'knowledge.updated', entityType: 'knowledge', entityId: id, ip: request.ip });
    return { entry };
  });

  app.patch('/api/knowledge/:id/active', { config: { auth: 'admin' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(z.object({ isActive: z.boolean() }), request.body);
    return { entry: setEntryActive(db, request.user!.businessId, id, body.isActive) };
  });

  app.delete('/api/knowledge/:id', { config: { auth: 'admin' } }, async (request) => {
    const { id } = request.params as { id: string };
    deleteEntry(db, request.user!.businessId, id);
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'knowledge.deleted', entityType: 'knowledge', entityId: id, ip: request.ip });
    return { ok: true };
  });

  app.get('/api/knowledge/suggestions', async (request) => {
    const q = parse(z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }), request.query);
    return { suggestions: listSuggestions(db, request.user!.businessId, q.status) };
  });

  app.post('/api/knowledge/suggestions', async (request, reply) => {
    const body = parse(
      z.object({ question: z.string().trim().min(2).max(1000), proposedAnswer: z.string().trim().max(4000).nullable().optional(), conversationId: z.string().nullable().optional() }),
      request.body,
    );
    const suggestion = createSuggestion(db, { businessId: request.user!.businessId, question: body.question, proposedAnswer: body.proposedAnswer ?? null, origin: 'manual', conversationId: body.conversationId ?? null });
    reply.code(201);
    return { suggestion };
  });

  app.post('/api/knowledge/suggestions/:id/approve', { config: { auth: 'admin' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(EntryInputSchema, request.body);
    const result = approveSuggestion(db, request.user!.businessId, id, request.user!.id, body);
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'knowledge.suggestion_approved', entityType: 'knowledge_suggestion', entityId: id, details: { entryId: result.entry.id }, ip: request.ip });
    return result;
  });

  app.post('/api/knowledge/suggestions/:id/reject', { config: { auth: 'admin' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(z.object({ note: z.string().max(300).nullable().optional() }), request.body ?? {});
    const suggestion = rejectSuggestion(db, request.user!.businessId, id, request.user!.id, body.note ?? null);
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'knowledge.suggestion_rejected', entityType: 'knowledge_suggestion', entityId: id, ip: request.ip });
    return { suggestion };
  });

  app.delete('/api/knowledge/suggestions/:id', { config: { auth: 'admin' } }, async (request) => {
    const { id } = request.params as { id: string };
    deleteSuggestion(db, request.user!.businessId, id);
    return { ok: true };
  });
}
