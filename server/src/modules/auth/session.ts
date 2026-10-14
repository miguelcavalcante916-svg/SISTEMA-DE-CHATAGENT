import { createHash } from 'node:crypto';
import type { DB } from '../../db/connection.js';
import { randomToken } from '../../lib/ids.js';
import { addHours, nowIso } from '../../lib/time.js';
import type { UserRow } from './types.js';

export const SESSION_COOKIE = 'sid';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(
  db: DB,
  userId: string,
  ttlHours: number,
  meta: { ip?: string; userAgent?: string },
): { token: string; expiresAt: string } {
  const token = randomToken(32);
  const now = nowIso();
  const expiresAt = addHours(now, ttlHours);
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(hashToken(token), userId, now, expiresAt, now, meta.ip ?? null, (meta.userAgent ?? '').slice(0, 200));
  return { token, expiresAt };
}

export function findUserBySession(db: DB, token: string): UserRow | null {
  const now = nowIso();
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1`,
    )
    .get(hashToken(token), now) as UserRow | undefined;
  if (!row) return null;
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(now, hashToken(token));
  return row;
}

export function deleteSession(db: DB, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function deleteUserSessions(db: DB, userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function purgeExpiredSessions(db: DB): number {
  return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso()).changes;
}
