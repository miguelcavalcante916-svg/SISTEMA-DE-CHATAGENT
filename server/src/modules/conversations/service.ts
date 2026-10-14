import type { DB } from '../../db/connection.js';
import { notFound } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import { parseJson } from '../../lib/json.js';
import { nowIso } from '../../lib/time.js';
import type { PaymentMethodId } from '../business/settings.js';
import type { ChannelId } from '../messaging/provider.js';
import type { QuoteItemInput } from '../orders/pricing.js';
import type { AddressInput } from '../orders/service.js';
import type { Fulfillment } from '../orders/types.js';

export interface DraftState {
  items: QuoteItemInput[];
  fulfillment: Fulfillment | null;
  address: AddressInput | null;
  deliveryZoneId: string | null;
  paymentMethod: PaymentMethodId | null;
  cashReceivedCents: number | null;
  customerName: string | null;
  awaitingConfirmation: boolean;
  summaryPresentedAt: string | null;
  lastOrderId: string | null;
  greeted: boolean;
  privacyNoticeSentAt: string | null;
}

export const emptyDraft = (): DraftState => ({
  items: [],
  fulfillment: null,
  address: null,
  deliveryZoneId: null,
  paymentMethod: null,
  cashReceivedCents: null,
  customerName: null,
  awaitingConfirmation: false,
  summaryPresentedAt: null,
  lastOrderId: null,
  greeted: false,
  privacyNoticeSentAt: null,
});

export interface ConversationRow {
  id: string;
  business_id: string;
  channel: ChannelId;
  external_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  mode: 'ai' | 'human';
  status: 'open' | 'closed';
  needs_human: number;
  needs_human_reason: string | null;
  assigned_user_id: string | null;
  taken_over_by_user_id: string | null;
  taken_over_at: string | null;
  draft_json: string;
  last_message_at: string | null;
  last_customer_message_at: string | null;
  unread_count: number;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  direction: 'in' | 'out';
  sender_type: 'customer' | 'ai' | 'human' | 'system';
  sender_user_id: string | null;
  content: string;
  metadata_json: string | null;
  external_id: string | null;
  delivery_status: 'n/a' | 'simulated' | 'queued' | 'sent' | 'failed';
  created_at: string;
}

export interface MessageDto {
  id: string;
  direction: 'in' | 'out';
  senderType: MessageRow['sender_type'];
  senderUserId: string | null;
  senderName: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  deliveryStatus: MessageRow['delivery_status'];
  createdAt: string;
}

export interface ConversationDto {
  id: string;
  channel: ChannelId;
  externalId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  mode: 'ai' | 'human';
  status: 'open' | 'closed';
  needsHuman: boolean;
  needsHumanReason: string | null;
  takenOverByUserId: string | null;
  takenOverByName: string | null;
  takenOverAt: string | null;
  draft: DraftState;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  closedAt: string | null;
  createdAt: string;
  messages: MessageDto[];
}

export function parseDraft(raw: string | null): DraftState {
  return { ...emptyDraft(), ...parseJson<Partial<DraftState>>(raw, {}) };
}

export function saveDraft(db: DB, conversationId: string, draft: DraftState): void {
  db.prepare('UPDATE conversations SET draft_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(draft), nowIso(), conversationId);
}

export function getConversationRow(db: DB, businessId: string, id: string): ConversationRow {
  const row = db.prepare('SELECT * FROM conversations WHERE id = ? AND business_id = ?').get(id, businessId) as ConversationRow | undefined;
  if (!row) throw notFound('Conversa não encontrada');
  return row;
}

export function findOrCreateConversation(
  db: DB,
  input: { businessId: string; channel: ChannelId; externalId: string | null; customerPhone: string | null; customerName: string | null },
): ConversationRow {
  const existing = input.externalId
    ? (db
        .prepare("SELECT * FROM conversations WHERE business_id = ? AND channel = ? AND external_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1")
        .get(input.businessId, input.channel, input.externalId) as ConversationRow | undefined)
    : undefined;
  if (existing) {
    if (input.customerName && !existing.customer_name) {
      db.prepare('UPDATE conversations SET customer_name = ? WHERE id = ?').run(input.customerName, existing.id);
      existing.customer_name = input.customerName;
    }
    return existing;
  }
  const now = nowIso();
  const id = newId();
  db.prepare(
    `INSERT INTO conversations (id, business_id, channel, external_id, customer_name, customer_phone, mode, status, needs_human, draft_json, unread_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'ai', 'open', 0, ?, 0, ?, ?)`,
  ).run(id, input.businessId, input.channel, input.externalId, input.customerName, input.customerPhone, JSON.stringify(emptyDraft()), now, now);
  return getConversationRow(db, input.businessId, id);
}

export function appendMessage(
  db: DB,
  input: {
    conversationId: string;
    direction: 'in' | 'out';
    senderType: MessageRow['sender_type'];
    senderUserId?: string | null;
    content: string;
    metadata?: Record<string, unknown> | null;
    externalId?: string | null;
    deliveryStatus?: MessageRow['delivery_status'];
  },
): MessageRow {
  const now = nowIso();
  const id = newId();
  db.prepare(
    `INSERT INTO messages (id, conversation_id, direction, sender_type, sender_user_id, content, metadata_json, external_id, delivery_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.conversationId,
    input.direction,
    input.senderType,
    input.senderUserId ?? null,
    input.content,
    input.metadata ? JSON.stringify(input.metadata) : null,
    input.externalId ?? null,
    input.deliveryStatus ?? 'n/a',
    now,
  );
  if (input.direction === 'in') {
    db.prepare('UPDATE conversations SET last_message_at = ?, last_customer_message_at = ?, unread_count = unread_count + 1, updated_at = ? WHERE id = ?').run(now, now, now, input.conversationId);
  } else {
    db.prepare('UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?').run(now, now, input.conversationId);
  }
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow;
}

export function hasMessageWithExternalId(db: DB, conversationId: string, externalId: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM messages WHERE conversation_id = ? AND external_id = ?').get(conversationId, externalId));
}

export function setNeedsHuman(db: DB, conversationId: string, needsHuman: boolean, reason: string | null): void {
  db.prepare('UPDATE conversations SET needs_human = ?, needs_human_reason = ?, updated_at = ? WHERE id = ?').run(needsHuman ? 1 : 0, reason, nowIso(), conversationId);
}

export function updateCustomer(db: DB, conversationId: string, patch: { name?: string | null; phone?: string | null }): void {
  const row = db.prepare('SELECT customer_name, customer_phone FROM conversations WHERE id = ?').get(conversationId) as { customer_name: string | null; customer_phone: string | null };
  db.prepare('UPDATE conversations SET customer_name = ?, customer_phone = ?, updated_at = ? WHERE id = ?').run(
    patch.name === undefined ? row.customer_name : patch.name,
    patch.phone === undefined ? row.customer_phone : patch.phone,
    nowIso(),
    conversationId,
  );
}

export function toMessageDto(r: MessageRow, senderName: string | null = null): MessageDto {
  return {
    id: r.id,
    direction: r.direction,
    senderType: r.sender_type,
    senderUserId: r.sender_user_id,
    senderName,
    content: r.content,
    metadata: parseJson<Record<string, unknown> | null>(r.metadata_json, null),
    deliveryStatus: r.delivery_status,
    createdAt: r.created_at,
  };
}

export function getConversation(db: DB, businessId: string, id: string): ConversationDto {
  const row = getConversationRow(db, businessId, id);
  const messages = db
    .prepare('SELECT m.*, u.name AS sender_name FROM messages m LEFT JOIN users u ON u.id = m.sender_user_id WHERE m.conversation_id = ? ORDER BY m.created_at ASC')
    .all(id) as (MessageRow & { sender_name: string | null })[];
  const takenBy = row.taken_over_by_user_id
    ? (db.prepare('SELECT name FROM users WHERE id = ?').get(row.taken_over_by_user_id) as { name: string } | undefined)?.name ?? null
    : null;
  return rowToDto(row, messages.map((m) => toMessageDto(m, m.sender_name)), takenBy, messages.at(-1)?.content ?? null);
}

function rowToDto(row: ConversationRow, messages: MessageDto[], takenOverByName: string | null, preview: string | null): ConversationDto {
  return {
    id: row.id,
    channel: row.channel,
    externalId: row.external_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    mode: row.mode,
    status: row.status,
    needsHuman: row.needs_human === 1,
    needsHumanReason: row.needs_human_reason,
    takenOverByUserId: row.taken_over_by_user_id,
    takenOverByName,
    takenOverAt: row.taken_over_at,
    draft: parseDraft(row.draft_json),
    lastMessageAt: row.last_message_at,
    lastMessagePreview: preview ? preview.slice(0, 120) : null,
    unreadCount: row.unread_count,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    messages,
  };
}

export function listConversations(
  db: DB,
  businessId: string,
  f: { status?: 'open' | 'closed' | 'all'; needsHuman?: boolean; channel?: string; q?: string },
): ConversationDto[] {
  const where = ['c.business_id = ?'];
  const args: unknown[] = [businessId];
  const status = f.status ?? 'open';
  if (status !== 'all') {
    where.push('c.status = ?');
    args.push(status);
  }
  if (f.needsHuman) where.push('c.needs_human = 1');
  if (f.channel) {
    where.push('c.channel = ?');
    args.push(f.channel);
  }
  if (f.q && f.q.trim()) {
    where.push('(c.customer_name LIKE ? OR c.customer_phone LIKE ?)');
    args.push(`%${f.q.trim()}%`, `%${f.q.replace(/\D/g, '')}%`);
  }
  const rows = db
    .prepare(
      `SELECT c.*, u.name AS taken_over_by_name,
         (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS preview
       FROM conversations c LEFT JOIN users u ON u.id = c.taken_over_by_user_id
       WHERE ${where.join(' AND ')} ORDER BY c.needs_human DESC, c.last_message_at DESC LIMIT 300`,
    )
    .all(...args) as (ConversationRow & { taken_over_by_name: string | null; preview: string | null })[];
  return rows.map((r) => rowToDto(r, [], r.taken_over_by_name, r.preview));
}

export function markRead(db: DB, businessId: string, id: string): void {
  db.prepare('UPDATE conversations SET unread_count = 0 WHERE id = ? AND business_id = ?').run(id, businessId);
}

export function takeOver(db: DB, businessId: string, id: string, user: { id: string; name: string }): ConversationRow {
  const row = getConversationRow(db, businessId, id);
  const now = nowIso();
  db.prepare(
    "UPDATE conversations SET mode = 'human', taken_over_by_user_id = ?, taken_over_at = ?, assigned_user_id = ?, needs_human = 0, needs_human_reason = NULL, updated_at = ? WHERE id = ?",
  ).run(user.id, now, user.id, now, row.id);
  appendMessage(db, { conversationId: row.id, direction: 'out', senderType: 'system', content: `Atendimento assumido por ${user.name}.`, deliveryStatus: 'n/a', metadata: { internal: true, event: 'takeover', userId: user.id } });
  return getConversationRow(db, businessId, id);
}

export function releaseToAi(db: DB, businessId: string, id: string, user: { id: string; name: string }): ConversationRow {
  const row = getConversationRow(db, businessId, id);
  db.prepare("UPDATE conversations SET mode = 'ai', assigned_user_id = NULL, needs_human = 0, needs_human_reason = NULL, updated_at = ? WHERE id = ?").run(nowIso(), row.id);
  appendMessage(db, { conversationId: row.id, direction: 'out', senderType: 'system', content: `${user.name} devolveu a conversa ao atendimento automático.`, deliveryStatus: 'n/a', metadata: { internal: true, event: 'release', userId: user.id } });
  return getConversationRow(db, businessId, id);
}

export function closeConversation(db: DB, businessId: string, id: string, user: { id: string; name: string } | null): ConversationRow {
  const row = getConversationRow(db, businessId, id);
  const now = nowIso();
  db.prepare("UPDATE conversations SET status = 'closed', closed_at = ?, needs_human = 0, updated_at = ? WHERE id = ?").run(now, now, row.id);
  appendMessage(db, { conversationId: row.id, direction: 'out', senderType: 'system', content: `Conversa encerrada${user ? ` por ${user.name}` : ''}.`, deliveryStatus: 'n/a', metadata: { internal: true, event: 'close' } });
  return getConversationRow(db, businessId, id);
}

export function reopenConversation(db: DB, businessId: string, id: string): ConversationRow {
  const row = getConversationRow(db, businessId, id);
  db.prepare("UPDATE conversations SET status = 'open', closed_at = NULL, updated_at = ? WHERE id = ?").run(nowIso(), row.id);
  return getConversationRow(db, businessId, id);
}

export function createManualConversation(db: DB, businessId: string, input: { customerName: string | null; customerPhone: string | null }, user: { id: string; name: string }): ConversationRow {
  const now = nowIso();
  const id = newId();
  db.prepare(
    `INSERT INTO conversations (id, business_id, channel, external_id, customer_name, customer_phone, mode, status, needs_human, assigned_user_id, taken_over_by_user_id, taken_over_at, draft_json, unread_count, created_at, updated_at)
     VALUES (?, ?, 'manual', NULL, ?, ?, 'human', 'open', 0, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(id, businessId, input.customerName, input.customerPhone, user.id, user.id, now, JSON.stringify(emptyDraft()), now, now);
  return getConversationRow(db, businessId, id);
}
