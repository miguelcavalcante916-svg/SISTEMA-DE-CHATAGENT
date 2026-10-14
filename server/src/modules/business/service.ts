import { z } from 'zod';
import type { DB } from '../../db/connection.js';
import { newId } from '../../lib/ids.js';
import { parseJson } from '../../lib/json.js';
import { maskPixKey } from '../../lib/pii.js';
import { isValidTimeZone, localParts, nowIso } from '../../lib/time.js';
import { notFound } from '../../lib/errors.js';
import { BUSINESS_CATEGORIES, type BusinessCategory } from './categories.js';
import { BusinessSettingsSchema, defaultSettings, mergeSettings, type BusinessSettings } from './settings.js';

export interface BusinessRow {
  id: string;
  name: string;
  category: BusinessCategory;
  phone: string | null;
  contact_email: string | null;
  timezone: string;
  settings_json: string;
  setup_completed: number;
  data_reviewed_at: string | null;
  is_demo: number;
  created_at: string;
  updated_at: string;
}

export interface Business {
  id: string;
  name: string;
  category: BusinessCategory;
  phone: string | null;
  contactEmail: string | null;
  timezone: string;
  settings: BusinessSettings;
  setupCompleted: boolean;
  dataReviewedAt: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export function rowToBusiness(row: BusinessRow): Business {
  const parsed = BusinessSettingsSchema.safeParse(parseJson(row.settings_json, {}));
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    phone: row.phone,
    contactEmail: row.contact_email,
    timezone: row.timezone,
    settings: parsed.success ? parsed.data : defaultSettings(),
    setupCompleted: row.setup_completed === 1,
    dataReviewedAt: row.data_reviewed_at,
    isDemo: row.is_demo === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getBusiness(db: DB, id: string): Business {
  const row = db.prepare('SELECT * FROM businesses WHERE id = ?').get(id) as BusinessRow | undefined;
  if (!row) throw notFound('Estabelecimento não encontrado');
  return rowToBusiness(row);
}

export function countBusinesses(db: DB): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM businesses').get() as { c: number }).c;
}

export const CreateBusinessSchema = z.object({
  name: z.string().trim().min(2).max(80),
  category: z.enum(BUSINESS_CATEGORIES),
  timezone: z.string().refine(isValidTimeZone, 'Fuso horário inválido').default('America/Sao_Paulo'),
  phone: z.string().trim().max(30).optional(),
  isDemo: z.boolean().optional(),
});

export function createBusiness(db: DB, input: z.infer<typeof CreateBusinessSchema>): Business {
  const now = nowIso();
  const id = newId();
  db.prepare(
    `INSERT INTO businesses (id, name, category, phone, contact_email, timezone, settings_json, setup_completed, data_reviewed_at, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, 0, NULL, ?, ?, ?)`,
  ).run(id, input.name, input.category, input.phone ?? null, input.timezone, JSON.stringify(defaultSettings()), input.isDemo ? 1 : 0, now, now);
  return getBusiness(db, id);
}

export const UpdateBusinessSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  category: z.enum(BUSINESS_CATEGORIES).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  contactEmail: z.email().max(120).nullable().optional(),
  timezone: z.string().refine(isValidTimeZone, 'Fuso horário inválido').optional(),
  setupCompleted: z.boolean().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export function updateBusiness(db: DB, id: string, patch: z.infer<typeof UpdateBusinessSchema>): Business {
  const current = getBusiness(db, id);
  const settings = patch.settings ? mergeSettings(current.settings, patch.settings) : current.settings;
  db.prepare(
    `UPDATE businesses SET name = ?, category = ?, phone = ?, contact_email = ?, timezone = ?, settings_json = ?, setup_completed = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    patch.name ?? current.name,
    patch.category ?? current.category,
    patch.phone === undefined ? current.phone : patch.phone,
    patch.contactEmail === undefined ? current.contactEmail : patch.contactEmail,
    patch.timezone ?? current.timezone,
    JSON.stringify(settings),
    patch.setupCompleted === undefined ? (current.setupCompleted ? 1 : 0) : patch.setupCompleted ? 1 : 0,
    nowIso(),
    id,
  );
  return getBusiness(db, id);
}

export function markDataReviewed(db: DB, id: string, reviewed: boolean): Business {
  db.prepare('UPDATE businesses SET data_reviewed_at = ?, updated_at = ? WHERE id = ?').run(
    reviewed ? nowIso() : null,
    nowIso(),
    id,
  );
  return getBusiness(db, id);
}

/** Representação para o painel. Usuários sem permissão não veem a chave Pix completa. */
export function toBusinessDto(b: Business, opts: { revealSecrets: boolean }) {
  const settings: BusinessSettings = structuredClone(b.settings);
  if (!opts.revealSecrets && settings.pix.key) {
    settings.pix.key = maskPixKey(settings.pix.key, settings.pix.keyType ?? 'evp');
  }
  return {
    id: b.id,
    name: b.name,
    category: b.category,
    phone: b.phone,
    contactEmail: b.contactEmail,
    timezone: b.timezone,
    settings,
    setupCompleted: b.setupCompleted,
    dataReviewedAt: b.dataReviewedAt,
    isDemo: b.isDemo,
    pixKeyMasked: !opts.revealSecrets,
    openNow: isOpenNow(b),
  };
}

/** Verifica se está aberto agora conforme horários e dias fechados, no fuso do estabelecimento. */
export function isOpenNow(b: Business, now: Date = new Date()): boolean {
  const parts = localParts(now, b.timezone);
  if (b.settings.closedDates.includes(parts.date)) return false;
  const periods = b.settings.openingHours[parts.weekday] ?? [];
  const toMin = (hhmm: string) => {
    const [h = '0', m = '0'] = hhmm.split(':');
    return Number(h) * 60 + Number(m);
  };
  for (const p of periods) {
    const open = toMin(p.open);
    const close = toMin(p.close);
    if (close > open) {
      if (parts.minutesOfDay >= open && parts.minutesOfDay < close) return true;
    } else if (close < open) {
      // período que atravessa a meia-noite (ex.: 18:00–02:00)
      if (parts.minutesOfDay >= open || parts.minutesOfDay < close) return true;
    } else if (open === 0 && close === 0) {
      return true; // 00:00–00:00 = 24h
    }
  }
  return false;
}
