import { loadConfig, loadDotEnv } from '../config.js';
import { openDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';

loadDotEnv();
const config = loadConfig();
const db = openDatabase(config.databasePath);
const result = runMigrations(db);
console.log(`Banco: ${config.databasePath}`);
console.log(result.applied.length ? `Migrações aplicadas: ${result.applied.join(', ')}` : 'Nenhuma migração pendente.');
console.log(`Versão atual do esquema: ${result.current}`);
db.close();
