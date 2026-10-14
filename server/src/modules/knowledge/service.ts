import { z } from 'zod';
import type { DB } from '../../db/connection.js';
import { notFound } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import { parseJson } from '../../lib/json.js';
import { maskPiiInText } from '../../lib/pii.js';
import { nowIso } from '../../lib/time.js';

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  source: string;
  isActive: boolean;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeSuggestion {
  id: string;
  question: string;
  proposedAnswer: string | null;
  origin: string;
  conversationId: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt: string | null;
  reviewNote: string | null;
  knowledgeEntryId: string | null;
  createdAt: string;
}

interface EntryRow {
  id: string;
  title: string;
  content: string;
  tags_json: string;
  source: string;
  is_active: number;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}
interface SuggestionRow {
  id: string;
  question: string;
  proposed_answer: string | null;
  origin: string;
  conversation_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_at: string | null;
  review_note: string | null;
  knowledge_entry_id: string | null;
  created_at: string;
}

export const EntryInputSchema = z.object({
  title: z.string().trim().min(2).max(120),
  content: z.string().trim().min(2).max(4000),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});

const toEntry = (r: EntryRow): KnowledgeEntry => ({
  id: r.id,
  title: r.title,
  content: r.content,
  tags: parseJson<string[]>(r.tags_json, []),
  source: r.source,
  isActive: r.is_active === 1,
  approvedAt: r.approved_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toSuggestion = (r: SuggestionRow): KnowledgeSuggestion => ({
  id: r.id,
  question: r.question,
  proposedAnswer: r.proposed_answer,
  origin: r.origin,
  conversationId: r.conversation_id,
  status: r.status,
  reviewedAt: r.reviewed_at,
  reviewNote: r.review_note,
  knowledgeEntryId: r.knowledge_entry_id,
  createdAt: r.created_at,
});

export function listEntries(db: DB, businessId: string): KnowledgeEntry[] {
  return (db.prepare('SELECT * FROM knowledge_entries WHERE business_id = ? ORDER BY updated_at DESC').all(businessId) as EntryRow[]).map(toEntry);
}

/** Apenas conteúdo aprovado e ativo chega ao agente. */
export function listApprovedEntries(db: DB, businessId: string): KnowledgeEntry[] {
  return (
    db
      .prepare('SELECT * FROM knowledge_entries WHERE business_id = ? AND is_active = 1 AND approved_at IS NOT NULL ORDER BY updated_at DESC')
      .all(businessId) as EntryRow[]
  ).map(toEntry);
}

export function createEntry(db: DB, businessId: string, input: z.infer<typeof EntryInputSchema>, userId: string, source = 'manual'): KnowledgeEntry {
  const now = nowIso();
  const id = newId();
  db.prepare(
    `INSERT INTO knowledge_entries (id, business_id, title, content, tags_json, source, is_active, created_by_user_id, approved_by_user_id, approved_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
  ).run(id, businessId, input.title, input.content, JSON.stringify(input.tags), source, userId, userId, now, now, now);
  return toEntry(db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(id) as EntryRow);
}

export function updateEntry(db: DB, businessId: string, id: string, input: z.infer<typeof EntryInputSchema>, userId: string): KnowledgeEntry {
  const res = db
    .prepare('UPDATE knowledge_entries SET title = ?, content = ?, tags_json = ?, approved_by_user_id = ?, approved_at = ?, updated_at = ? WHERE id = ? AND business_id = ?')
    .run(input.title, input.content, JSON.stringify(input.tags), userId, nowIso(), nowIso(), id, businessId);
  if (res.changes === 0) throw notFound('Conhecimento não encontrado');
  return toEntry(db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(id) as EntryRow);
}

export function setEntryActive(db: DB, businessId: string, id: string, active: boolean): KnowledgeEntry {
  const res = db.prepare('UPDATE knowledge_entries SET is_active = ?, updated_at = ? WHERE id = ? AND business_id = ?').run(active ? 1 : 0, nowIso(), id, businessId);
  if (res.changes === 0) throw notFound('Conhecimento não encontrado');
  return toEntry(db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(id) as EntryRow);
}

export function deleteEntry(db: DB, businessId: string, id: string): void {
  const res = db.prepare('DELETE FROM knowledge_entries WHERE id = ? AND business_id = ?').run(id, businessId);
  if (res.changes === 0) throw notFound('Conhecimento não encontrado');
}

export function createSuggestion(
  db: DB,
  input: {
    businessId: string;
    question: string;
    proposedAnswer?: string | null;
    origin: 'unanswered' | 'human_correction' | 'outdated' | 'low_confidence' | 'ai_unavailable' | 'manual';
    conversationId?: string | null;
    messageId?: string | null;
  },
): KnowledgeSuggestion {
  const id = newId();
  db.prepare(
    `INSERT INTO knowledge_suggestions (id, business_id, question, proposed_answer, origin, conversation_id, message_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(id, input.businessId, maskPiiInText(input.question).slice(0, 1000), input.proposedAnswer ? maskPiiInText(input.proposedAnswer).slice(0, 4000) : null, input.origin, input.conversationId ?? null, input.messageId ?? null, nowIso());
  return toSuggestion(db.prepare('SELECT * FROM knowledge_suggestions WHERE id = ?').get(id) as SuggestionRow);
}

export function listSuggestions(db: DB, businessId: string, status?: string): KnowledgeSuggestion[] {
  const rows = status
    ? (db.prepare('SELECT * FROM knowledge_suggestions WHERE business_id = ? AND status = ? ORDER BY created_at DESC LIMIT 500').all(businessId, status) as SuggestionRow[])
    : (db.prepare('SELECT * FROM knowledge_suggestions WHERE business_id = ? ORDER BY created_at DESC LIMIT 500').all(businessId) as SuggestionRow[]);
  return rows.map(toSuggestion);
}

export function approveSuggestion(
  db: DB,
  businessId: string,
  id: string,
  userId: string,
  edited: { title: string; content: string; tags: string[] },
): { suggestion: KnowledgeSuggestion; entry: KnowledgeEntry } {
  const row = db.prepare('SELECT * FROM knowledge_suggestions WHERE id = ? AND business_id = ?').get(id, businessId) as SuggestionRow | undefined;
  if (!row) throw notFound('Sugestão não encontrada');
  const result = db.transaction(() => {
    const entry = createEntry(db, businessId, edited, userId, 'suggestion');
    db.prepare("UPDATE knowledge_suggestions SET status = 'approved', reviewed_by_user_id = ?, reviewed_at = ?, knowledge_entry_id = ? WHERE id = ?").run(userId, nowIso(), entry.id, id);
    return entry;
  })();
  return { suggestion: toSuggestion(db.prepare('SELECT * FROM knowledge_suggestions WHERE id = ?').get(id) as SuggestionRow), entry: result };
}

export function rejectSuggestion(db: DB, businessId: string, id: string, userId: string, note: string | null): KnowledgeSuggestion {
  const res = db
    .prepare("UPDATE knowledge_suggestions SET status = 'rejected', reviewed_by_user_id = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND business_id = ?")
    .run(userId, nowIso(), note, id, businessId);
  if (res.changes === 0) throw notFound('Sugestão não encontrada');
  return toSuggestion(db.prepare('SELECT * FROM knowledge_suggestions WHERE id = ?').get(id) as SuggestionRow);
}

export function deleteSuggestion(db: DB, businessId: string, id: string): void {
  const res = db.prepare('DELETE FROM knowledge_suggestions WHERE id = ? AND business_id = ?').run(id, businessId);
  if (res.changes === 0) throw notFound('Sugestão não encontrada');
}
