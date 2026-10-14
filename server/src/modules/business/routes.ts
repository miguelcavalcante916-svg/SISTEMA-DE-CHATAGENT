import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { recordAudit } from '../audit/service.js';
import { createCategory, createOptionGroup, getCatalog } from '../catalog/service.js';
import { BUSINESS_CATEGORIES } from './categories.js';
import { PROFILES } from './profiles.js';
import { buildReviewChecklist } from './review.js';
import { getBusiness, markDataReviewed, toBusinessDto, updateBusiness, UpdateBusinessSchema } from './service.js';
import { createZone, deleteZone, listZones, updateZone, ZoneInputSchema } from './zones.js';

export async function businessRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;

  app.get('/api/business', async (request) => {
    const user = request.user!;
    const b = getBusiness(db, user.businessId);
    return { business: toBusinessDto(b, { revealSecrets: user.role === 'admin' }) };
  });

  app.patch('/api/business', { config: { auth: 'admin' } }, async (request) => {
    const user = request.user!;
    const body = parse(UpdateBusinessSchema, request.body);
    const before = getBusiness(db, user.businessId);
    const b = updateBusiness(db, user.businessId, body);
    // Não permite ligar a IA sem a etapa de revisão de dados
    if (b.settings.ai.enabled && !before.settings.ai.enabled) {
      const checklist = buildReviewChecklist(db, b);
      if (!checklist.readyForAi || !b.dataReviewedAt) {
        updateBusiness(db, user.businessId, { settings: { ai: { enabled: false } } });
        throw badRequest('Conclua a revisão de dados antes de habilitar o atendimento automático.', checklist.items.filter((i) => i.required && !i.ok));
      }
    }
    const changedSections = Object.keys(body.settings ?? {});
    recordAudit(db, {
      businessId: user.businessId,
      userId: user.id,
      userName: user.name,
      action: 'business.updated',
      entityType: 'business',
      entityId: b.id,
      details: { fields: Object.keys(body).filter((k) => k !== 'settings'), sections: changedSections },
      ip: request.ip,
    });
    return { business: toBusinessDto(b, { revealSecrets: true }) };
  });

  app.get('/api/business/review', async (request) => {
    const b = getBusiness(db, request.user!.businessId);
    return { ...buildReviewChecklist(db, b), dataReviewedAt: b.dataReviewedAt };
  });

  app.post('/api/business/review', { config: { auth: 'admin' } }, async (request) => {
    const user = request.user!;
    const body = parse(z.object({ reviewed: z.boolean() }), request.body);
    const current = getBusiness(db, user.businessId);
    if (body.reviewed) {
      const checklist = buildReviewChecklist(db, current);
      if (!checklist.readyForAi) throw badRequest('Há itens obrigatórios pendentes na revisão.', checklist.items.filter((i) => i.required && !i.ok));
    }
    const b = markDataReviewed(db, user.businessId, body.reviewed);
    if (!body.reviewed && b.settings.ai.enabled) updateBusiness(db, user.businessId, { settings: { ai: { enabled: false } } });
    recordAudit(db, { businessId: user.businessId, userId: user.id, userName: user.name, action: body.reviewed ? 'business.review_completed' : 'business.review_reopened', ip: request.ip });
    return { business: toBusinessDto(getBusiness(db, user.businessId), { revealSecrets: true }) };
  });

  app.get('/api/business/profiles', async () => {
    return { profiles: BUSINESS_CATEGORIES.map((c) => PROFILES[c]) };
  });

  /** Aplica um perfil: cria categorias e grupos sugeridos. Opções pagas ficam indisponíveis com preço zero até revisão. */
  app.post('/api/business/apply-profile', { config: { auth: 'admin' } }, async (request) => {
    const user = request.user!;
    const body = parse(z.object({ category: z.enum(BUSINESS_CATEGORIES) }), request.body);
    const profile = PROFILES[body.category];
    const existing = getCatalog(db, user.businessId, { includeArchived: true });
    const existingCategoryNames = new Set(existing.categories.map((c) => c.name.toLowerCase()));
    const existingGroupNames = new Set(existing.optionGroups.map((g) => g.name.toLowerCase()));
    let createdCategories = 0;
    let createdGroups = 0;
    db.transaction(() => {
      profile.categories.forEach((name, idx) => {
        if (existingCategoryNames.has(name.toLowerCase())) return;
        createCategory(db, user.businessId, { name, sortOrder: idx });
        createdCategories += 1;
      });
      profile.optionGroups.forEach((g, idx) => {
        if (existingGroupNames.has(g.name.toLowerCase())) return;
        createOptionGroup(db, user.businessId, {
          name: g.name,
          description: g.description ?? 'Modelo sugerido pelo perfil: revise nomes, preços e disponibilidade.',
          minSelect: g.options.length === 0 ? 0 : g.minSelect,
          maxSelect: g.maxSelect,
          pricingMode: g.pricingMode,
          sortOrder: idx,
          options: g.options.map((name, oi) => ({ name, priceCents: 0, isAvailable: !g.paid, maxQuantity: 1, sortOrder: oi })),
        });
        createdGroups += 1;
      });
      updateBusiness(db, user.businessId, {
        category: body.category,
        settings: { fulfillment: { ...profile.fulfillment } },
      });
    })();
    recordAudit(db, {
      businessId: user.businessId,
      userId: user.id,
      userName: user.name,
      action: 'business.profile_applied',
      details: { category: body.category, createdCategories, createdGroups },
      ip: request.ip,
    });
    return { createdCategories, createdGroups, reviewNotes: profile.reviewNotes, business: toBusinessDto(getBusiness(db, user.businessId), { revealSecrets: true }) };
  });

  // ---- Bairros / áreas de entrega ----
  app.get('/api/delivery-zones', async (request) => {
    return { zones: listZones(db, request.user!.businessId) };
  });
  app.post('/api/delivery-zones', { config: { auth: 'admin' } }, async (request, reply) => {
    const body = parse(ZoneInputSchema, request.body);
    const zone = createZone(db, request.user!.businessId, body);
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'zone.created', entityType: 'delivery_zone', entityId: zone.id, details: { name: zone.name, feeCents: zone.feeCents }, ip: request.ip });
    reply.code(201);
    return { zone };
  });
  app.patch('/api/delivery-zones/:id', { config: { auth: 'admin' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(ZoneInputSchema.partial(), request.body);
    const zone = updateZone(db, request.user!.businessId, id, body);
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'zone.updated', entityType: 'delivery_zone', entityId: id, details: body as Record<string, unknown>, ip: request.ip });
    return { zone };
  });
  app.delete('/api/delivery-zones/:id', { config: { auth: 'admin' } }, async (request) => {
    const { id } = request.params as { id: string };
    deleteZone(db, request.user!.businessId, id);
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'zone.deleted', entityType: 'delivery_zone', entityId: id, ip: request.ip });
    return { ok: true };
  });
}
