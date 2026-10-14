import { z } from 'zod';
import type { DB } from '../../db/connection.js';
import { notFound } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import { nowIso } from '../../lib/time.js';

export interface DeliveryZone {
  id: string;
  name: string;
  feeCents: number;
  minOrderCents: number;
  estimatedMinutes: number | null;
  isActive: boolean;
  sortOrder: number;
}

interface ZoneRow {
  id: string;
  business_id: string;
  name: string;
  fee_cents: number;
  min_order_cents: number;
  estimated_minutes: number | null;
  is_active: number;
  sort_order: number;
}

export const ZoneInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  feeCents: z.number().int().min(0).default(0),
  minOrderCents: z.number().int().min(0).default(0),
  estimatedMinutes: z.number().int().min(0).max(600).nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

const toDto = (r: ZoneRow): DeliveryZone => ({
  id: r.id,
  name: r.name,
  feeCents: r.fee_cents,
  minOrderCents: r.min_order_cents,
  estimatedMinutes: r.estimated_minutes,
  isActive: r.is_active === 1,
  sortOrder: r.sort_order,
});

export function listZones(db: DB, businessId: string, opts: { activeOnly?: boolean } = {}): DeliveryZone[] {
  const rows = db
    .prepare(`SELECT * FROM delivery_zones WHERE business_id = ? ${opts.activeOnly ? 'AND is_active = 1' : ''} ORDER BY sort_order, name`)
    .all(businessId) as ZoneRow[];
  return rows.map(toDto);
}

export function createZone(db: DB, businessId: string, input: z.infer<typeof ZoneInputSchema>): DeliveryZone {
  const now = nowIso();
  const id = newId();
  db.prepare(
    `INSERT INTO delivery_zones (id, business_id, name, fee_cents, min_order_cents, estimated_minutes, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, businessId, input.name, input.feeCents, input.minOrderCents, input.estimatedMinutes ?? null, input.isActive ? 1 : 0, input.sortOrder, now, now);
  return toDto(db.prepare('SELECT * FROM delivery_zones WHERE id = ?').get(id) as ZoneRow);
}

export function updateZone(db: DB, businessId: string, id: string, input: Partial<z.infer<typeof ZoneInputSchema>>): DeliveryZone {
  const row = db.prepare('SELECT * FROM delivery_zones WHERE id = ? AND business_id = ?').get(id, businessId) as ZoneRow | undefined;
  if (!row) throw notFound('Bairro/área não encontrada');
  db.prepare(
    `UPDATE delivery_zones SET name = ?, fee_cents = ?, min_order_cents = ?, estimated_minutes = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
  ).run(
    input.name ?? row.name,
    input.feeCents ?? row.fee_cents,
    input.minOrderCents ?? row.min_order_cents,
    input.estimatedMinutes === undefined ? row.estimated_minutes : input.estimatedMinutes,
    input.isActive === undefined ? row.is_active : input.isActive ? 1 : 0,
    input.sortOrder ?? row.sort_order,
    nowIso(),
    id,
  );
  return toDto(db.prepare('SELECT * FROM delivery_zones WHERE id = ?').get(id) as ZoneRow);
}

export function deleteZone(db: DB, businessId: string, id: string): void {
  // Pedidos antigos mantêm o nome da área (delivery_zone_name); a FK vira NULL.
  const res = db.prepare('DELETE FROM delivery_zones WHERE id = ? AND business_id = ?').run(id, businessId);
  if (res.changes === 0) throw notFound('Bairro/área não encontrada');
}
