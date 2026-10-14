// Copia arquivos não-TS (migrações .sql) para dist após o build.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'src', 'db', 'migrations');
const dest = join(root, 'dist', 'db', 'migrations');
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('migrações copiadas para', dest);
