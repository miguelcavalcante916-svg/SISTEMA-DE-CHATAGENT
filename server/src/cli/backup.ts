import { loadConfig, loadDotEnv } from '../config.js';
import { openDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { createBackup, safeBackupPath, verifyBackupFile } from '../modules/backup/service.js';

loadDotEnv();
const config = loadConfig();
const [cmd, arg] = process.argv.slice(2);

if (cmd === 'verify') {
  if (!arg) {
    console.error('Uso: npm run backup:verify -- <arquivo-ou-caminho>');
    process.exit(1);
  }
  const full = arg.includes('/') || arg.includes('\\') ? arg : safeBackupPath(config.backupDir, arg);
  const v = verifyBackupFile(full);
  console.log(JSON.stringify(v, null, 2));
  process.exit(v.ok ? 0 : 2);
}

const db = openDatabase(config.databasePath);
runMigrations(db);
const result = createBackup(db, config.backupDir);
db.close();
console.log(`Backup criado: ${config.backupDir}/${result.file} (${result.bytes} bytes)`);
console.log(`Integridade: ${result.verification.integrity} | tabelas: ${JSON.stringify(result.verification.tables)}`);
process.exit(result.verification.ok ? 0 : 2);
