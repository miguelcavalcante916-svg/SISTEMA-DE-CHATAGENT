import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse } from '../../lib/validate.js';
import { recordAudit } from '../audit/service.js';
import {
  CategoryInputSchema,
  OptionGroupInputSchema,
  ProductInputSchema,
  createCategory,
  createOptionGroup,
  createProduct,
  getCatalog,
  setOptionAvailability,
  setOptionGroupArchived,
  setProductArchived,
  setProductAvailability,
  setVariantAvailability,
  updateCategory,
  updateOptionGroup,
  updateProduct,
} from './service.js';

const AvailabilityBody = z.object({ isAvailable: z.boolean() });
const ArchiveBody = z.object({ archived: z.boolean() });

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;
  const audit = (request: { user: { businessId: string; id: string; name: string } | null; ip: string }, action: string, entityType: string, entityId: string, details?: Record<string, unknown>) =>
    recordAudit(db, {
      businessId: request.user!.businessId,
      userId: request.user!.id,
      userName: request.user!.name,
      action,
      entityType,
      entityId,
      details,
      ip: request.ip,
    });

  app.get('/api/catalog', async (request) => {
    const q = request.query as { includeArchived?: string };
    return getCatalog(db, request.user!.businessId, { includeArchived: q.includeArchived === '1' || q.includeArchived === 'true' });
  });

  // Categorias
  app.post('/api/catalog/categories', { config: { auth: 'admin' } }, async (request, reply) => {
    const body = parse(CategoryInputSchema, request.body);
    const category = createCategory(db, request.user!.businessId, body);
    audit(request, 'catalog.category_created', 'category', category.id, { name: category.name });
    reply.code(201);
    return { category };
  });
  app.patch('/api/catalog/categories/:id', { config: { auth: 'admin' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(CategoryInputSchema.partial(), request.body);
    const category = updateCategory(db, request.user!.businessId, id, body);
    audit(request, 'catalog.category_updated', 'category', id, body as Record<string, unknown>);
    return { category };
  });

  // Produtos
  app.post('/api/catalog/products', { config: { auth: 'admin' } }, async (request, reply) => {
    const body = parse(ProductInputSchema, request.body);
    const product = createProduct(db, request.user!.businessId, body);
    audit(request, 'catalog.product_created', 'product', product.id, { name: product.name, priceCents: product.priceCents });
    reply.code(201);
    return { product };
  });
  app.put('/api/catalog/products/:id', { config: { auth: 'admin' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(ProductInputSchema, request.body);
    const product = updateProduct(db, request.user!.businessId, id, body);
    audit(request, 'catalog.product_updated', 'product', id, { name: product.name, priceCents: product.priceCents });
    return { product };
  });
  // Disponibilidade pode ser alterada por atendentes (ex.: "acabou")
  app.patch('/api/catalog/products/:id/availability', async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(AvailabilityBody, request.body);
    const product = setProductAvailability(db, request.user!.businessId, id, body.isAvailable);
    audit(request, 'catalog.product_availability', 'product', id, { isAvailable: body.isAvailable });
    return { product };
  });
  app.patch('/api/catalog/variants/:id/availability', async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(AvailabilityBody, request.body);
    setVariantAvailability(db, request.user!.businessId, id, body.isAvailable);
    audit(request, 'catalog.variant_availability', 'variant', id, { isAvailable: body.isAvailable });
    return { ok: true };
  });
  app.patch('/api/catalog/options/:id/availability', async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(AvailabilityBody, request.body);
    setOptionAvailability(db, request.user!.businessId, id, body.isAvailable);
    audit(request, 'catalog.option_availability', 'option', id, { isAvailable: body.isAvailable });
    return { ok: true };
  });
  app.patch('/api/catalog/products/:id/archive', { config: { auth: 'admin' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(ArchiveBody, request.body);
    const product = setProductArchived(db, request.user!.businessId, id, body.archived);
    audit(request, 'catalog.product_archived', 'product', id, { archived: body.archived });
    return { product };
  });

  // Grupos de adicionais
  app.post('/api/catalog/option-groups', { config: { auth: 'admin' } }, async (request, reply) => {
    const body = parse(OptionGroupInputSchema, request.body);
    const group = createOptionGroup(db, request.user!.businessId, body);
    audit(request, 'catalog.option_group_created', 'option_group', group.id, { name: group.name });
    reply.code(201);
    return { group };
  });
  app.put('/api/catalog/option-groups/:id', { config: { auth: 'admin' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(OptionGroupInputSchema, request.body);
    const group = updateOptionGroup(db, request.user!.businessId, id, body);
    audit(request, 'catalog.option_group_updated', 'option_group', id, { name: group.name });
    return { group };
  });
  app.patch('/api/catalog/option-groups/:id/archive', { config: { auth: 'admin' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(ArchiveBody, request.body);
    const group = setOptionGroupArchived(db, request.user!.businessId, id, body.archived);
    audit(request, 'catalog.option_group_archived', 'option_group', id, { archived: body.archived });
    return { group };
  });
}
