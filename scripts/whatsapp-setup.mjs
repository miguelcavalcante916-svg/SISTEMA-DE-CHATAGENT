#!/usr/bin/env node
// Prepara a conexão do WhatsApp via open-wa em um único passo:
// - cria/ajusta o .env da raiz (WHATSAPP_PROVIDER=openwa, WEBHOOK_SECRET, BRIDGE_TOKEN)
// - cria/ajusta integrations/whatsapp-openwa/.env com os MESMOS segredos e a URL do servidor
// - confere pré-requisitos (Node, zstd, Chrome) e diz exatamente o que falta
// Não envia nada, não liga o envio real (WHATSAPP_SEND_ENABLED continua false).
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRIDGE_DIR = path.join(ROOT, 'integrations', 'whatsapp-openwa');
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);

function readEnv(file) {
  const map = new Map();
  if (!existsSync(file)) return map;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

/** Atualiza chaves mantendo comentários e ordem do arquivo; acrescenta as que não existem. */
function upsertEnv(file, updates) {
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const pending = new Map(Object.entries(updates));
  const out = lines.map((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (m && pending.has(m[1])) {
      const v = pending.get(m[1]);
      pending.delete(m[1]);
      return `${m[1]}=${v}`;
    }
    return line;
  });
  for (const [k, v] of pending) out.push(`${k}=${v}`);
  writeFileSync(file, out.join('\n').replace(/\n*$/, '\n'));
}

function which(bin) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(cmd, [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim().split(/\r?\n/)[0] : null;
}

function findChrome() {
  const candidates = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
  }[process.platform] ?? [];
  return candidates.find((p) => p && existsSync(p)) ?? null;
}

console.log('\nConfiguração do WhatsApp (open-wa)\n');

// 1) .env da raiz
const rootEnvFile = path.join(ROOT, '.env');
if (!existsSync(rootEnvFile)) {
  copyFileSync(path.join(ROOT, '.env.example'), rootEnvFile);
  ok('.env criado a partir de .env.example');
}
const rootEnv = readEnv(rootEnvFile);
const webhookSecret = rootEnv.get('WEBHOOK_SECRET') || randomBytes(32).toString('hex');
const bridgeToken = rootEnv.get('BRIDGE_TOKEN') || randomBytes(32).toString('hex');
const host = rootEnv.get('HOST') || '127.0.0.1';
const port = rootEnv.get('PORT') || '3333';
upsertEnv(rootEnvFile, { WHATSAPP_PROVIDER: 'openwa', WEBHOOK_SECRET: webhookSecret, BRIDGE_TOKEN: bridgeToken });
ok(`.env: WHATSAPP_PROVIDER=openwa, WEBHOOK_SECRET e BRIDGE_TOKEN ${rootEnv.get('WEBHOOK_SECRET') ? 'mantidos' : 'gerados'}`);
if ((rootEnv.get('WHATSAPP_SEND_ENABLED') || 'false') !== 'true') {
  warn('WHATSAPP_SEND_ENABLED=false: o sistema RECEBE mensagens mas não envia. Para enviar de verdade, mude para true no .env e reinicie o servidor.');
}

// 2) .env da ponte
const bridgeEnvFile = path.join(BRIDGE_DIR, '.env');
if (!existsSync(bridgeEnvFile)) {
  copyFileSync(path.join(BRIDGE_DIR, '.env.example'), bridgeEnvFile);
  ok('integrations/whatsapp-openwa/.env criado');
}
const serverUrl = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
const bridgeUpdates = { SERVER_URL: serverUrl, WEBHOOK_SECRET: webhookSecret, BRIDGE_TOKEN: bridgeToken };
const bridgeEnv = readEnv(bridgeEnvFile);

// 3) Pré-requisitos
console.log('\nPré-requisitos');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major > 22 || (major === 22 && minor >= 12)) ok(`Node ${process.versions.node}`);
else warn(`Node ${process.versions.node}: o open-wa precisa de 22.12 ou mais novo`);

const zstd = which('zstd');
let missing = 0;
if (zstd) ok(`zstd em ${zstd}`);
else {
  missing += 1;
  const hint = { darwin: 'brew install zstd', linux: 'sudo apt install zstd', win32: 'winget install Facebook.Zstandard' }[process.platform] ?? 'instale o zstd';
  warn(`zstd não encontrado no PATH. Instale com: ${hint}`);
}

const chrome = bridgeEnv.get('CHROME_PATH') || findChrome();
if (chrome) {
  ok(`Chrome: ${chrome}`);
  bridgeUpdates.CHROME_PATH = chrome;
} else {
  warn('Chrome/Chromium não encontrado nos caminhos usuais. O open-wa tentará baixar um navegador; se falhar, instale o Google Chrome e preencha CHROME_PATH no .env da ponte.');
}
upsertEnv(bridgeEnvFile, bridgeUpdates);
ok(`ponte: SERVER_URL=${serverUrl}, segredos iguais aos do servidor`);

const bridgeInstalled = existsSync(path.join(BRIDGE_DIR, 'node_modules', '@open-wa', 'wa-automate'));
if (bridgeInstalled) ok('open-wa instalado');
else warn('open-wa ainda não instalado: rode npm run whatsapp:install');

console.log('\nPróximos passos');
console.log('  1. Terminal A:  npm run dev        (ou npm run build && npm start)');
if (!bridgeInstalled) console.log('  2. Terminal B:  npm run whatsapp:install');
console.log(`  ${bridgeInstalled ? 2 : 3}. Terminal B:  npm run whatsapp:start`);
console.log('     → aparece um QR code no terminal. No celular do estabelecimento:');
console.log('       WhatsApp > Configurações > Dispositivos conectados > Conectar dispositivo > escanear.');
console.log('  Depois, mande uma mensagem de OUTRO número para esse WhatsApp: ela aparece em Conversas no painel,');
console.log('  e em Configurações > Canais o estado da ponte muda para conectado.');
if (missing) console.log('\n  Atenção: há pré-requisitos faltando (acima). O open-wa não inicia sem o zstd.');
console.log('');
