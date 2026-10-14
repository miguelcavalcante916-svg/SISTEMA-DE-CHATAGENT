import { loadConfig, loadDotEnv } from '../config.js';
import { openDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { seedDemo } from '../seed/demo.js';

loadDotEnv();
const config = loadConfig();
const db = openDatabase(config.databasePath);
runMigrations(db);
try {
  const r = seedDemo(db);
  console.log('Dados de demonstração FICTÍCIOS criados em', config.databasePath);
  console.log('');
  console.log(`  Administrador: usuário "${r.adminUsername}"  senha "${r.adminPassword}"`);
  console.log(`  Atendente:     usuário "${r.attendantUsername}"  senha "${r.attendantPassword}"`);
  console.log('');
  console.log('As senhas são aleatórias e serão pedidas para troca no primeiro acesso. Guarde-as agora.');
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
} finally {
  db.close();
}
