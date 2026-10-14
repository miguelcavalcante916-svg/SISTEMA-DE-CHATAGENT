// Ponte WhatsApp (open-wa) <-> sistema local.
//
// AVISO: open-wa automatiza o WhatsApp Web e NÃO é oficial nem autorizado pela Meta.
// Risco de bloqueio do número e de quebra quando o WhatsApp Web muda. Use por sua conta e risco.
// Esta ponte só repassa mensagens de conversas individuais (ignora grupos, status e mensagens próprias),
// e só envia quando o servidor informa WHATSAPP_SEND_ENABLED=true.

import { createHmac, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(here, '.env'));
} catch {
  // sem .env: usa variáveis de ambiente
}

const env = (k, d = '') => (process.env[k] ?? d).trim();
const SERVER_URL = env('SERVER_URL', 'http://127.0.0.1:3333').replace(/\/+$/, '');
const WEBHOOK_SECRET = env('WEBHOOK_SECRET');
const BRIDGE_TOKEN = env('BRIDGE_TOKEN');
const SESSION_ID = env('SESSION_ID', 'atendimento');
const SESSION_DATA_PATH = env('SESSION_DATA_PATH', './session-data');
const HEADLESS = env('HEADLESS', 'true') !== 'false';
const CHROME_PATH = env('CHROME_PATH');
const LICENSE_KEY = env('OPENWA_LICENSE_KEY');
const POLL_INTERVAL_MS = Number(env('POLL_INTERVAL_MS', '3000'));
const HEARTBEAT_INTERVAL_MS = Number(env('HEARTBEAT_INTERVAL_MS', '30000'));
const ALLOWED_RECIPIENTS = env('ALLOWED_RECIPIENTS')
  .split(',')
  .map((s) => s.replace(/\D/g, ''))
  .filter(Boolean);

if (!WEBHOOK_SECRET || !BRIDGE_TOKEN) {
  console.error('Configure WEBHOOK_SECRET e BRIDGE_TOKEN (iguais aos do servidor) no .env desta pasta.');
  process.exit(1);
}

const log = (...args) => console.log(new Date().toISOString(), ...args);

async function postWebhook(envelope) {
  const body = JSON.stringify(envelope);
  const ts = Math.floor(Date.now() / 1000);
  const signature = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(`${ts}.${body}`).digest('hex')}`;
  const res = await fetch(`${SERVER_URL}/api/webhooks/openwa`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-timestamp': String(ts), 'x-webhook-signature': signature },
    body,
  });
  if (!res.ok) throw new Error(`webhook ${res.status}: ${await res.text()}`);
  return res.json();
}

async function bridgeApi(method, pathname, payload) {
  const res = await fetch(`${SERVER_URL}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-bridge-token': BRIDGE_TOKEN },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${pathname} ${res.status}: ${await res.text()}`);
  return res.json();
}

let currentState = 'STARTING';

async function heartbeat(details = {}) {
  try {
    await bridgeApi('POST', '/api/bridge/heartbeat', { provider: 'openwa', state: currentState, details });
  } catch (err) {
    log('heartbeat falhou:', err.message);
  }
}

async function main() {
  const { create } = await import('@open-wa/wa-automate');
  log('Iniciando sessão open-wa', SESSION_ID, '(headless:', HEADLESS, ')');
  log('Escaneie o QR code exibido no terminal com o WhatsApp do estabelecimento.');

  const client = await create({
    sessionId: SESSION_ID,
    sessionDataPath: SESSION_DATA_PATH,
    headless: HEADLESS,
    useChrome: Boolean(CHROME_PATH),
    ...(CHROME_PATH ? { executablePath: CHROME_PATH } : {}),
    ...(LICENSE_KEY ? { licenseKey: LICENSE_KEY } : {}),
    qrTimeout: 0,
    authTimeout: 0,
    logConsole: false,
    disableSpins: true,
    killProcessOnBrowserClose: true,
  });

  currentState = 'CONNECTED';
  await heartbeat({ sessionId: SESSION_ID });
  await postWebhook({ event_id: `conn-${randomUUID()}`, type: 'connection.state', channel: 'whatsapp', connection: { state: 'CONNECTED' } }).catch((e) => log(e.message));

  client.onStateChanged(async (state) => {
    currentState = String(state);
    log('estado:', currentState);
    await heartbeat();
  });

  client.onMessage(async (message) => {
    try {
      if (!message || message.fromMe || message.isGroupMsg) return;
      const from = message.from || message.chatId;
      if (!from || !String(from).endsWith('@c.us')) return; // apenas conversas individuais
      const text = message.type === 'chat' ? message.body ?? '' : '';
      const envelope = {
        event_id: String(message.id),
        type: 'message.received',
        timestamp: Math.floor(Date.now() / 1000),
        channel: 'whatsapp',
        from: { id: String(from), phone: String(from).split('@')[0], name: message.sender?.pushname || message.notifyName || null },
        message: { id: String(message.id), text, type: String(message.type || 'chat'), timestamp: Number(message.t || 0) },
      };
      const result = await postWebhook(envelope);
      log('recebida de', envelope.from.phone, '->', JSON.stringify(result));
    } catch (err) {
      log('erro ao repassar mensagem recebida:', err.message);
    }
  });

  // Fila de saída: busca mensagens enfileiradas pelo servidor e envia.
  const poll = async () => {
    try {
      const { messages, sendEnabled } = await bridgeApi('GET', '/api/bridge/outbox?limit=10');
      for (const m of messages) {
        const digits = String(m.to).split('@')[0].replace(/\D/g, '');
        if (!sendEnabled) {
          await bridgeApi('POST', `/api/bridge/outbox/${m.id}/ack`, { status: 'failed', error: 'WHATSAPP_SEND_ENABLED=false no servidor' });
          log('ENVIO BLOQUEADO (sendEnabled=false) para', digits, ':', m.text.slice(0, 60));
          continue;
        }
        if (ALLOWED_RECIPIENTS.length > 0 && !ALLOWED_RECIPIENTS.includes(digits)) {
          await bridgeApi('POST', `/api/bridge/outbox/${m.id}/ack`, { status: 'failed', error: 'destinatário fora de ALLOWED_RECIPIENTS' });
          log('ENVIO BLOQUEADO (fora da lista permitida) para', digits);
          continue;
        }
        try {
          const externalId = await client.sendText(m.to, m.text);
          await bridgeApi('POST', `/api/bridge/outbox/${m.id}/ack`, { status: 'sent', externalId: String(externalId) });
          log('enviada para', digits);
        } catch (err) {
          await bridgeApi('POST', `/api/bridge/outbox/${m.id}/ack`, { status: 'failed', error: String(err.message || err).slice(0, 400) });
          log('falha ao enviar para', digits, ':', err.message);
        }
      }
    } catch (err) {
      log('fila de saída indisponível:', err.message);
    } finally {
      setTimeout(poll, POLL_INTERVAL_MS);
    }
  };
  setTimeout(poll, POLL_INTERVAL_MS);
  setInterval(() => void heartbeat(), HEARTBEAT_INTERVAL_MS);

  const shutdown = async () => {
    currentState = 'DISCONNECTED';
    await heartbeat();
    try {
      await client.kill?.();
    } catch {
      // ignora
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Falha ao iniciar a ponte open-wa:', err);
  process.exit(1);
});
