import type { DB } from '../../db/connection.js';
import { addDays, nowIso } from '../../lib/time.js';
import type { Business } from '../business/service.js';
import { normalizePhone } from '../orders/service.js';

export interface RetentionResult {
  businessId: string;
  conversationsDeleted: number;
  ordersAnonymized: number;
  auditDeleted: number;
  suggestionsDeleted: number;
  ranAt: string;
}

const ANON_NAME = 'Cliente (dados removidos)';

/** Aplica a política de retenção configurada pelo estabelecimento. */
export function runRetention(db: DB, business: Business, now: string = nowIso()): RetentionResult {
  const r = business.settings.retention;
  const result: RetentionResult = { businessId: business.id, conversationsDeleted: 0, ordersAnonymized: 0, auditDeleted: 0, suggestionsDeleted: 0, ranAt: now };
  db.transaction(() => {
    if (r.conversationDays > 0) {
      const cutoff = addDays(now, -r.conversationDays);
      const del = db.prepare(
        `DELETE FROM conversations WHERE business_id = ? AND ((status = 'closed' AND closed_at < ?) OR (status = 'open' AND COALESCE(last_message_at, created_at) < ?))`,
      ).run(business.id, cutoff, cutoff);
      result.conversationsDeleted = del.changes;
      const sug = db.prepare("DELETE FROM knowledge_suggestions WHERE business_id = ? AND status <> 'pending' AND created_at < ?").run(business.id, cutoff);
      result.suggestionsDeleted = sug.changes;
    }
    if (r.personalDataDays > 0) {
      const cutoff = addDays(now, -r.personalDataDays);
      const upd = db.prepare(
        `UPDATE orders SET customer_name = ?, customer_phone = NULL, address_json = NULL, delivery_notes = NULL, customer_notes = NULL, updated_at = ?
         WHERE business_id = ? AND created_at < ? AND status IN ('concluido', 'cancelado') AND customer_phone IS NOT NULL`,
      ).run(ANON_NAME, now, business.id, cutoff);
      result.ordersAnonymized = upd.changes;
    }
    if (r.auditDays > 0) {
      const cutoff = addDays(now, -r.auditDays);
      result.auditDeleted = db.prepare('DELETE FROM audit_log WHERE business_id = ? AND created_at < ?').run(business.id, cutoff).changes;
    }
  })();
  return result;
}

/** Remoção a pedido do cliente: anonimiza pedidos e apaga conversas do telefone informado. */
export function eraseCustomerData(db: DB, businessId: string, phone: string): { ordersAnonymized: number; conversationsDeleted: number } {
  const digits = normalizePhone(phone);
  if (!digits) return { ordersAnonymized: 0, conversationsDeleted: 0 };
  return db.transaction(() => {
    const orders = db
      .prepare(`UPDATE orders SET customer_name = ?, customer_phone = NULL, address_json = NULL, delivery_notes = NULL, customer_notes = NULL, updated_at = ? WHERE business_id = ? AND customer_phone = ?`)
      .run(ANON_NAME, nowIso(), businessId, digits).changes;
    const conversations = db
      .prepare(`DELETE FROM conversations WHERE business_id = ? AND (customer_phone = ? OR external_id LIKE ?)`)
      .run(businessId, digits, `%${digits}%`).changes;
    return { ordersAnonymized: orders, conversationsDeleted: conversations };
  })();
}
