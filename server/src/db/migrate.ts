import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from './connection.js';
import { nowIso } from '../lib/time.js';

export const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export interface MigrationResult {
  applied: string[];
  current: number;
}

export function runMigrations(db: DB, dir: string = MIGRATIONS_DIR): MigrationResult {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_-]+\.sql$/i.test(f))
    .sort();
  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[];
  const applied = new Set(appliedRows.map((r) => r.version));
  const result: MigrationResult = { applied: [], current: 0 };
  for (const file of files) {
    const version = Number.parseInt(file.slice(0, 4), 10);
    result.current = Math.max(result.current, version);
    if (applied.has(version)) continue;
    const sql = readFileSync(path.join(dir, file), 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        version,
        file,
        nowIso(),
      );
    });
    tx();
    result.applied.push(file);
  }
  return result;
}
