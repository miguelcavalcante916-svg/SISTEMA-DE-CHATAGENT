import type { DB } from '../../db/connection.js';
import { newId } from '../../lib/ids.js';
import { nowIso } from '../../lib/time.js';

export interface AuditInput {
  businessId: string | null;
  userId?: string | null;
  userName?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ip?: string;
}

export interface AuditRow {
  id: string;
  business_id: string | null;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details_json: string | null;
  ip: string | null;
  created_at: string;
}

/** Trilha de ações importantes. Nunca grave segredos em `details`. */
export function recordAudit(db: DB, input: AuditInput): void {
  db.prepare(
    `INSERT INTO audit_log (id, business_id, user_id, user_name, action, entity_type, entity_id, details_json, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    input.businessId,
    input.userId ?? null,
    input.userName ?? null,
    input.action,
    input.entityType ?? null,
    input.entityId ?? null,
    input.details ? JSON.stringify(input.details) : null,
    input.ip ?? null,
    nowIso(),
  );
}

export function listAudit(db: DB, businessId: string, limit = 200): AuditRow[] {
  return db
    .prepare('SELECT * FROM audit_log WHERE business_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(businessId, limit) as AuditRow[];
}
