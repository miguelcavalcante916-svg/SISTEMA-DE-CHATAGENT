import { z } from 'zod';
import type { DB } from '../../db/connection.js';
import { badRequest, notFound, unprocessable } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import { parseJson } from '../../lib/json.js';
import { localParts, nowIso } from '../../lib/time.js';
import { WEEKDAYS } from '../business/settings.js';

// ---------- Tipos de linha ----------
interface CategoryRow {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: number;
  archived_at: string | null;
}
interface ProductRow {
  id: string;
  business_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  kind: 'simple' | 'combo';
  is_available: number;
  availability_json: string | null;
  allow_notes: number;
  notes_hint: string | null;
  prep_minutes: number | null;
  sort_order: number;
  archived_at: string | null;
}
interface VariantRow {
  id: string;
  product_id: string;
  name: string;
  price_cents: number;
  is_available: number;
  sort_order: number;
  archived_at: string | null;
}
interface GroupRow {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  min_select: number;
  max_select: number;
  pricing_mode: 'sum' | 'max' | 'average';
  sort_order: number;
  archived_at: string | null;
}
interface OptionRow {
  id: string;
  group_id: string;
  name: string;
  price_cents: number;
  is_available: number;
  max_quantity: number;
  sort_order: number;
  archived_at: string | null;
}

// ---------- DTOs ----------
export interface Availability {
  days?: (typeof WEEKDAYS)[number][];
  start?: string;
  end?: string;
}
export interface Category {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  archivedAt: string | null;
}
export interface Variant {
  id: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
  sortOrder: number;
  archivedAt: string | null;
}
export interface Option {
  id: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
  maxQuantity: number;
  sortOrder: number;
  archivedAt: string | null;
}
export interface OptionGroup {
  id: string;
  name: string;
  description: string | null;
  minSelect: number;
  maxSelect: number;
  pricingMode: 'sum' | 'max' | 'average';
  sortOrder: number;
  archivedAt: string | null;
  options: Option[];
}
export interface Product {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  kind: 'simple' | 'combo';
  isAvailable: boolean;
  availability: Availability | null;
  allowNotes: boolean;
  notesHint: string | null;
  prepMinutes: number | null;
  sortOrder: number;
  archivedAt: string | null;
  variants: Variant[];
  optionGroupIds: string[];
  comboItems: { productId: string; quantity: number }[];
}
export interface Catalog {
  categories: Category[];
  products: Product[];
  optionGroups: OptionGroup[];
}

// ---------- Esquemas de entrada ----------
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const name = z.string().trim().min(1, 'Nome obrigatório').max(80);
const price = z.number().int('Preço em centavos inteiros').min(0, 'Preço não pode ser negativo');

export const CategoryInputSchema = z.object({
  name,
  description: z.string().max(200).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export const AvailabilitySchema = z
  .object({
    days: z.array(z.enum(WEEKDAYS)).optional(),
    start: hhmm.optional(),
    end: hhmm.optional(),
  })
  .nullable();

export const VariantInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  priceCents: price,
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export const ProductInputSchema = z.object({
  categoryId: z.string().nullable().optional(),
  name,
  description: z.string().max(500).nullable().optional(),
  priceCents: price.default(0),
  imageUrl: z.string().max(500).nullable().optional(),
  kind: z.enum(['simple', 'combo']).default('simple'),
  isAvailable: z.boolean().default(true),
  availability: AvailabilitySchema.optional(),
  allowNotes: z.boolean().default(true),
  notesHint: z.string().max(120).nullable().optional(),
  prepMinutes: z.number().int().min(0).max(600).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  variants: z.array(VariantInputSchema).max(30).default([]),
  optionGroupIds: z.array(z.string()).max(20).default([]),
  comboItems: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1).max(20).default(1) })).max(20).default([]),
});
export type ProductInput = z.infer<typeof ProductInputSchema>;

export const OptionInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  priceCents: price.default(0),
  isAvailable: z.boolean().default(true),
  maxQuantity: z.number().int().min(1).max(20).default(1),
  sortOrder: z.number().int().min(0).default(0),
});

export const OptionGroupInputSchema = z
  .object({
    name,
    description: z.string().max(200).nullable().optional(),
    minSelect: z.number().int().min(0).max(50).default(0),
    maxSelect: z.number().int().min(1).max(50).default(1),
    pricingMode: z.enum(['sum', 'max', 'average']).default('sum'),
    sortOrder: z.number().int().min(0).max(9999).default(0),
    options: z.array(OptionInputSchema).max(80).default([]),
  })
  .refine((g) => g.minSelect <= g.maxSelect, { message: 'Mínimo não pode ser maior que o máximo', path: ['minSelect'] })
  .refine((g) => g.minSelect === 0 || g.options.some((o) => o.isAvailable), {
    message: 'Grupo obrigatório precisa de pelo menos uma opção disponível',
    path: ['options'],
  });
export type OptionGroupInput = z.infer<typeof OptionGroupInputSchema>;

// ---------- Leitura ----------
function rowToCategory(r: CategoryRow): Category {
  return { id: r.id, name: r.name, description: r.description, sortOrder: r.sort_order, isActive: r.is_active === 1, archivedAt: r.archived_at };
}
function rowToVariant(r: VariantRow): Variant {
  return { id: r.id, name: r.name, priceCents: r.price_cents, isAvailable: r.is_available === 1, sortOrder: r.sort_order, archivedAt: r.archived_at };
}
function rowToOption(r: OptionRow): Option {
  return {
    id: r.id,
    name: r.name,
    priceCents: r.price_cents,
    isAvailable: r.is_available === 1,
    maxQuantity: r.max_quantity,
    sortOrder: r.sort_order,
    archivedAt: r.archived_at,
  };
}

export function getCatalog(db: DB, businessId: string, opts: { includeArchived?: boolean } = {}): Catalog {
  const archivedFilter = opts.includeArchived ? '' : 'AND archived_at IS NULL';
  const categories = (
    db.prepare(`SELECT * FROM categories WHERE business_id = ? ${archivedFilter} ORDER BY sort_order, name`).all(businessId) as CategoryRow[]
  ).map(rowToCategory);

  const productRows = db
    .prepare(`SELECT * FROM products WHERE business_id = ? ${archivedFilter} ORDER BY sort_order, name`)
    .all(businessId) as ProductRow[];
  const variantRows = db
    .prepare(
      `SELECT v.* FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.business_id = ? ${opts.includeArchived ? '' : 'AND v.archived_at IS NULL'} ORDER BY v.sort_order, v.name`,
    )
    .all(businessId) as VariantRow[];
  const linkRows = db
    .prepare(
      `SELECT pog.product_id, pog.group_id FROM product_option_groups pog JOIN products p ON p.id = pog.product_id WHERE p.business_id = ? ORDER BY pog.sort_order`,
    )
    .all(businessId) as { product_id: string; group_id: string }[];
  const comboRows = db
    .prepare(
      `SELECT ci.combo_product_id, ci.component_product_id, ci.quantity FROM combo_items ci JOIN products p ON p.id = ci.combo_product_id WHERE p.business_id = ? ORDER BY ci.sort_order`,
    )
    .all(businessId) as { combo_product_id: string; component_product_id: string; quantity: number }[];

  const variantsByProduct = new Map<string, Variant[]>();
  for (const v of variantRows) {
    const list = variantsByProduct.get(v.product_id) ?? [];
    list.push(rowToVariant(v));
    variantsByProduct.set(v.product_id, list);
  }
  const groupsByProduct = new Map<string, string[]>();
  for (const l of linkRows) {
    const list = groupsByProduct.get(l.product_id) ?? [];
    list.push(l.group_id);
    groupsByProduct.set(l.product_id, list);
  }
  const combosByProduct = new Map<string, { productId: string; quantity: number }[]>();
  for (const c of comboRows) {
    const list = combosByProduct.get(c.combo_product_id) ?? [];
    list.push({ productId: c.component_product_id, quantity: c.quantity });
    combosByProduct.set(c.combo_product_id, list);
  }

  const products: Product[] = productRows.map((r) => ({
    id: r.id,
    categoryId: r.category_id,
    name: r.name,
    description: r.description,
    priceCents: r.price_cents,
    imageUrl: r.image_url,
    kind: r.kind,
    isAvailable: r.is_available === 1,
    availability: parseJson<Availability | null>(r.availability_json, null),
    allowNotes: r.allow_notes === 1,
    notesHint: r.notes_hint,
    prepMinutes: r.prep_minutes,
    sortOrder: r.sort_order,
    archivedAt: r.archived_at,
    variants: variantsByProduct.get(r.id) ?? [],
    optionGroupIds: groupsByProduct.get(r.id) ?? [],
    comboItems: combosByProduct.get(r.id) ?? [],
  }));

  const groupRows = db
    .prepare(`SELECT * FROM option_groups WHERE business_id = ? ${archivedFilter} ORDER BY sort_order, name`)
    .all(businessId) as GroupRow[];
  const optionRows = db
    .prepare(
      `SELECT o.* FROM options o JOIN option_groups g ON g.id = o.group_id WHERE g.business_id = ? ${opts.includeArchived ? '' : 'AND o.archived_at IS NULL'} ORDER BY o.sort_order, o.name`,
    )
    .all(businessId) as OptionRow[];
  const optionsByGroup = new Map<string, Option[]>();
  for (const o of optionRows) {
    const list = optionsByGroup.get(o.group_id) ?? [];
    list.push(rowToOption(o));
    optionsByGroup.set(o.group_id, list);
  }
  const optionGroups: OptionGroup[] = groupRows.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    minSelect: g.min_select,
    maxSelect: g.max_select,
    pricingMode: g.pricing_mode,
    sortOrder: g.sort_order,
    archivedAt: g.archived_at,
    options: optionsByGroup.get(g.id) ?? [],
  }));

  return { categories, products, optionGroups };
}

/** Catálogo indexado para cálculo de pedidos. */
export interface CatalogSnapshot {
  products: Map<string, Product>;
  optionGroups: Map<string, OptionGroup>;
  categories: Map<string, Category>;
}

export function loadCatalogSnapshot(db: DB, businessId: string): CatalogSnapshot {
  const c = getCatalog(db, businessId);
  return {
    products: new Map(c.products.map((p) => [p.id, p])),
    optionGroups: new Map(c.optionGroups.map((g) => [g.id, g])),
    categories: new Map(c.categories.map((x) => [x.id, x])),
  };
}

/** Disponibilidade por janela de horário (opcional) no fuso do estabelecimento. */
export function isWithinAvailability(av: Availability | null, timeZone: string, now: Date): boolean {
  if (!av) return true;
  const parts = localParts(now, timeZone);
  if (av.days && av.days.length > 0 && !av.days.includes(parts.weekday)) return false;
  if (av.start && av.end) {
    const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    const start = toMin(av.start);
    const end = toMin(av.end);
    if (end > start) return parts.minutesOfDay >= start && parts.minutesOfDay < end;
    if (end < start) return parts.minutesOfDay >= start || parts.minutesOfDay < end;
  }
  return true;
}

// ---------- Escrita ----------
export function createCategory(db: DB, businessId: string, input: z.infer<typeof CategoryInputSchema>): Category {
  const now = nowIso();
  const id = newId();
  db.prepare(
    `INSERT INTO categories (id, business_id, name, description, sort_order, is_active, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(id, businessId, input.name, input.description ?? null, input.sortOrder ?? 0, input.isActive === false ? 0 : 1, now, now);
  return rowToCategory(db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow);
}

export function updateCategory(db: DB, businessId: string, id: string, input: Partial<z.infer<typeof CategoryInputSchema>>): Category {
  const row = db.prepare('SELECT * FROM categories WHERE id = ? AND business_id = ?').get(id, businessId) as CategoryRow | undefined;
  if (!row) throw notFound('Categoria não encontrada');
  db.prepare(
    `UPDATE categories SET name = ?, description = ?, sort_order = ?, is_active = ?, archived_at = ?, updated_at = ? WHERE id = ?`,
  ).run(
    input.name ?? row.name,
    input.description === undefined ? row.description : input.description,
    input.sortOrder ?? row.sort_order,
    input.isActive === undefined ? row.is_active : input.isActive ? 1 : 0,
    input.archived === undefined ? row.archived_at : input.archived ? (row.archived_at ?? nowIso()) : null,
    nowIso(),
    id,
  );
  return rowToCategory(db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow);
}

function assertGroupsBelong(db: DB, businessId: string, groupIds: string[]) {
  for (const gid of groupIds) {
    const g = db.prepare('SELECT 1 FROM option_groups WHERE id = ? AND business_id = ? AND archived_at IS NULL').get(gid, businessId);
    if (!g) throw unprocessable(`Grupo de adicionais inválido: ${gid}`);
  }
}

function assertCategoryBelongs(db: DB, businessId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const c = db.prepare('SELECT 1 FROM categories WHERE id = ? AND business_id = ?').get(categoryId, businessId);
  if (!c) throw unprocessable('Categoria inválida');
}

function validateProductInput(db: DB, businessId: string, input: ProductInput, selfId?: string) {
  assertCategoryBelongs(db, businessId, input.categoryId);
  assertGroupsBelong(db, businessId, input.optionGroupIds);
  const names = new Set<string>();
  for (const v of input.variants) {
    const key = v.name.toLowerCase();
    if (names.has(key)) throw unprocessable(`Variante repetida: ${v.name}`);
    names.add(key);
  }
  if (input.kind === 'combo') {
    if (input.comboItems.length === 0) throw unprocessable('Um combo precisa de pelo menos um item componente');
    for (const ci of input.comboItems) {
      if (ci.productId === selfId) throw unprocessable('Um combo não pode conter a si mesmo');
      const p = db
        .prepare("SELECT kind FROM products WHERE id = ? AND business_id = ? AND archived_at IS NULL")
        .get(ci.productId, businessId) as { kind: string } | undefined;
      if (!p) throw unprocessable('Item de combo inválido');
      if (p.kind === 'combo') throw unprocessable('Um combo não pode conter outro combo');
    }
  }
}

function writeVariants(db: DB, productId: string, variants: ProductInput['variants']) {
  const now = nowIso();
  const existing = db.prepare('SELECT id FROM product_variants WHERE product_id = ? AND archived_at IS NULL').all(productId) as { id: string }[];
  const keep = new Set<string>();
  variants.forEach((v, idx) => {
    if (v.id && existing.some((e) => e.id === v.id)) {
      db.prepare('UPDATE product_variants SET name = ?, price_cents = ?, is_available = ?, sort_order = ?, updated_at = ? WHERE id = ?').run(
        v.name,
        v.priceCents,
        v.isAvailable ? 1 : 0,
        v.sortOrder || idx,
        now,
        v.id,
      );
      keep.add(v.id);
    } else {
      const id = newId();
      db.prepare(
        'INSERT INTO product_variants (id, product_id, name, price_cents, is_available, sort_order, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)',
      ).run(id, productId, v.name, v.priceCents, v.isAvailable ? 1 : 0, v.sortOrder || idx, now, now);
      keep.add(id);
    }
  });
  for (const e of existing) {
    if (!keep.has(e.id)) db.prepare('UPDATE product_variants SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, e.id);
  }
}

function writeLinks(db: DB, productId: string, groupIds: string[], comboItems: ProductInput['comboItems']) {
  db.prepare('DELETE FROM product_option_groups WHERE product_id = ?').run(productId);
  groupIds.forEach((gid, idx) => {
    db.prepare('INSERT INTO product_option_groups (product_id, group_id, sort_order) VALUES (?, ?, ?)').run(productId, gid, idx);
  });
  db.prepare('DELETE FROM combo_items WHERE combo_product_id = ?').run(productId);
  comboItems.forEach((ci, idx) => {
    db.prepare('INSERT INTO combo_items (id, combo_product_id, component_product_id, quantity, sort_order) VALUES (?, ?, ?, ?, ?)').run(
      newId(),
      productId,
      ci.productId,
      ci.quantity,
      idx,
    );
  });
}

export function createProduct(db: DB, businessId: string, input: ProductInput): Product {
  validateProductInput(db, businessId, input);
  const now = nowIso();
  const id = newId();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO products (id, business_id, category_id, name, description, price_cents, image_url, kind, is_available, availability_json, allow_notes, notes_hint, prep_minutes, sort_order, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(
      id,
      businessId,
      input.categoryId ?? null,
      input.name,
      input.description ?? null,
      input.priceCents,
      input.imageUrl ?? null,
      input.kind,
      input.isAvailable ? 1 : 0,
      input.availability ? JSON.stringify(input.availability) : null,
      input.allowNotes ? 1 : 0,
      input.notesHint ?? null,
      input.prepMinutes ?? null,
      input.sortOrder,
      now,
      now,
    );
    writeVariants(db, id, input.variants);
    writeLinks(db, id, input.optionGroupIds, input.comboItems);
  })();
  return getProduct(db, businessId, id);
}

export function updateProduct(db: DB, businessId: string, id: string, input: ProductInput): Product {
  const row = db.prepare('SELECT * FROM products WHERE id = ? AND business_id = ?').get(id, businessId) as ProductRow | undefined;
  if (!row) throw notFound('Produto não encontrado');
  validateProductInput(db, businessId, input, id);
  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `UPDATE products SET category_id = ?, name = ?, description = ?, price_cents = ?, image_url = ?, kind = ?, is_available = ?, availability_json = ?, allow_notes = ?, notes_hint = ?, prep_minutes = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
    ).run(
      input.categoryId ?? null,
      input.name,
      input.description ?? null,
      input.priceCents,
      input.imageUrl ?? null,
      input.kind,
      input.isAvailable ? 1 : 0,
      input.availability ? JSON.stringify(input.availability) : null,
      input.allowNotes ? 1 : 0,
      input.notesHint ?? null,
      input.prepMinutes ?? null,
      input.sortOrder,
      now,
      id,
    );
    writeVariants(db, id, input.variants);
    writeLinks(db, id, input.optionGroupIds, input.comboItems);
  })();
  return getProduct(db, businessId, id);
}

export function setProductAvailability(db: DB, businessId: string, id: string, isAvailable: boolean): Product {
  const res = db.prepare('UPDATE products SET is_available = ?, updated_at = ? WHERE id = ? AND business_id = ?').run(isAvailable ? 1 : 0, nowIso(), id, businessId);
  if (res.changes === 0) throw notFound('Produto não encontrado');
  return getProduct(db, businessId, id);
}

export function setVariantAvailability(db: DB, businessId: string, variantId: string, isAvailable: boolean): void {
  const res = db
    .prepare(
      'UPDATE product_variants SET is_available = ?, updated_at = ? WHERE id = ? AND product_id IN (SELECT id FROM products WHERE business_id = ?)',
    )
    .run(isAvailable ? 1 : 0, nowIso(), variantId, businessId);
  if (res.changes === 0) throw notFound('Variante não encontrada');
}

export function setOptionAvailability(db: DB, businessId: string, optionId: string, isAvailable: boolean): void {
  const res = db
    .prepare('UPDATE options SET is_available = ?, updated_at = ? WHERE id = ? AND group_id IN (SELECT id FROM option_groups WHERE business_id = ?)')
    .run(isAvailable ? 1 : 0, nowIso(), optionId, businessId);
  if (res.changes === 0) throw notFound('Opção não encontrada');
}

export function setProductArchived(db: DB, businessId: string, id: string, archived: boolean): Product {
  const res = db
    .prepare('UPDATE products SET archived_at = CASE WHEN ? THEN COALESCE(archived_at, ?) ELSE NULL END, updated_at = ? WHERE id = ? AND business_id = ?')
    .run(archived ? 1 : 0, nowIso(), nowIso(), id, businessId);
  if (res.changes === 0) throw notFound('Produto não encontrado');
  return getProduct(db, businessId, id);
}

export function getProduct(db: DB, businessId: string, id: string): Product {
  const catalog = getCatalog(db, businessId, { includeArchived: true });
  const p = catalog.products.find((x) => x.id === id);
  if (!p) throw notFound('Produto não encontrado');
  // variantes arquivadas ficam fora da resposta
  return { ...p, variants: p.variants.filter((v) => !v.archivedAt) };
}

export function createOptionGroup(db: DB, businessId: string, input: OptionGroupInput): OptionGroup {
  const now = nowIso();
  const id = newId();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO option_groups (id, business_id, name, description, min_select, max_select, pricing_mode, sort_order, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(id, businessId, input.name, input.description ?? null, input.minSelect, input.maxSelect, input.pricingMode, input.sortOrder, now, now);
    writeOptions(db, id, input.options);
  })();
  return getOptionGroup(db, businessId, id);
}

export function updateOptionGroup(db: DB, businessId: string, id: string, input: OptionGroupInput): OptionGroup {
  const row = db.prepare('SELECT * FROM option_groups WHERE id = ? AND business_id = ?').get(id, businessId) as GroupRow | undefined;
  if (!row) throw notFound('Grupo não encontrado');
  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `UPDATE option_groups SET name = ?, description = ?, min_select = ?, max_select = ?, pricing_mode = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
    ).run(input.name, input.description ?? null, input.minSelect, input.maxSelect, input.pricingMode, input.sortOrder, now, id);
    writeOptions(db, id, input.options);
  })();
  return getOptionGroup(db, businessId, id);
}

export function setOptionGroupArchived(db: DB, businessId: string, id: string, archived: boolean): OptionGroup {
  const res = db
    .prepare('UPDATE option_groups SET archived_at = CASE WHEN ? THEN COALESCE(archived_at, ?) ELSE NULL END, updated_at = ? WHERE id = ? AND business_id = ?')
    .run(archived ? 1 : 0, nowIso(), nowIso(), id, businessId);
  if (res.changes === 0) throw notFound('Grupo não encontrado');
  if (archived) db.prepare('DELETE FROM product_option_groups WHERE group_id = ?').run(id);
  return getOptionGroup(db, businessId, id);
}

function writeOptions(db: DB, groupId: string, options: OptionGroupInput['options']) {
  const now = nowIso();
  const existing = db.prepare('SELECT id FROM options WHERE group_id = ? AND archived_at IS NULL').all(groupId) as { id: string }[];
  const keep = new Set<string>();
  const seen = new Set<string>();
  options.forEach((o, idx) => {
    const key = o.name.toLowerCase();
    if (seen.has(key)) throw badRequest(`Opção repetida: ${o.name}`);
    seen.add(key);
    if (o.id && existing.some((e) => e.id === o.id)) {
      db.prepare('UPDATE options SET name = ?, price_cents = ?, is_available = ?, max_quantity = ?, sort_order = ?, updated_at = ? WHERE id = ?').run(
        o.name,
        o.priceCents,
        o.isAvailable ? 1 : 0,
        o.maxQuantity,
        o.sortOrder || idx,
        now,
        o.id,
      );
      keep.add(o.id);
    } else {
      const id = newId();
      db.prepare(
        'INSERT INTO options (id, group_id, name, price_cents, is_available, max_quantity, sort_order, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)',
      ).run(id, groupId, o.name, o.priceCents, o.isAvailable ? 1 : 0, o.maxQuantity, o.sortOrder || idx, now, now);
      keep.add(id);
    }
  });
  for (const e of existing) {
    if (!keep.has(e.id)) db.prepare('UPDATE options SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, e.id);
  }
}

export function getOptionGroup(db: DB, businessId: string, id: string): OptionGroup {
  const catalog = getCatalog(db, businessId, { includeArchived: true });
  const g = catalog.optionGroups.find((x) => x.id === id);
  if (!g) throw notFound('Grupo não encontrado');
  return { ...g, options: g.options.filter((o) => !o.archivedAt) };
}
