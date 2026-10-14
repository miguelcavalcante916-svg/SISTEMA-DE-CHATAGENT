import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { DB } from '../../db/connection.js';
import { badRequest, notFound } from '../../lib/errors.js';

export interface BackupInfo {
  file: string;
  bytes: number;
  createdAt: string;
}

export interface BackupVerification {
  ok: boolean;
  integrity: string;
  tables: Record<string, number>;
  migrationVersion: number | null;
  error: string | null;
}

const FILE_RE = /^backup-\d{8}-\d{6}\.db$/;
const COUNT_TABLES = ['businesses', 'users', 'orders', 'order_items', 'conversations', 'messages', 'products', 'knowledge_entries', 'audit_log'];

export function safeBackupPath(backupDir: string, file: string): string {
  if (!FILE_RE.test(file)) throw badRequest('Nome de arquivo de backup inválido');
  const full = path.join(backupDir, file);
  if (!existsSync(full)) throw notFound('Backup não encontrado');
  return full;
}

/** Cria uma cópia consistente do banco (VACUUM INTO) e verifica a integridade da cópia. */
export function createBackup(db: DB, backupDir: string, now: Date = new Date()): BackupInfo & { verification: BackupVerification } {
  mkdirSync(backupDir, { recursive: true });
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = `backup-${stamp}.db`;
  const full = path.join(backupDir, file);
  if (existsSync(full)) unlinkSync(full);
  db.exec(`VACUUM INTO '${full.replace(/'/g, "''")}'`);
  const verification = verifyBackupFile(full);
  const st = statSync(full);
  return { file, bytes: st.size, createdAt: st.mtime.toISOString(), verification };
}

export function verifyBackupFile(full: string): BackupVerification {
  let copy: Database.Database | null = null;
  try {
    copy = new Database(full, { readonly: true, fileMustExist: true });
    const integrity = (copy.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
    const tables: Record<string, number> = {};
    for (const t of COUNT_TABLES) {
      try {
        tables[t] = (copy.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;
      } catch {
        tables[t] = -1;
      }
    }
    const mv = copy.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null } | undefined;
    return { ok: integrity === 'ok' && Object.values(tables).every((n) => n >= 0), integrity, tables, migrationVersion: mv?.v ?? null, error: null };
  } catch (err) {
    return { ok: false, integrity: 'erro', tables: {}, migrationVersion: null, error: (err as Error).message };
  } finally {
    copy?.close();
  }
}

export function listBackups(backupDir: string): BackupInfo[] {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir)
    .filter((f) => FILE_RE.test(f))
    .map((f) => {
      const st = statSync(path.join(backupDir, f));
      return { file: f, bytes: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => (a.file < b.file ? 1 : -1));
}

export function deleteBackup(backupDir: string, file: string): void {
  unlinkSync(safeBackupPath(backupDir, file));
}
