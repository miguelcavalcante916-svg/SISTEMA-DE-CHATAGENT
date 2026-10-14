import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestContext } from '../../test/helpers.js';
import { signWebhook, verifyWebhookSignature } from './webhooks.js';

let ctx: TestContext;
afterEach(async () => {
  if (ctx) await ctx.close();
});

const SECRET = 'segredo-de-teste';

function signed(body: Record<string, unknown>, opts: { secret?: string; ts?: number } = {}) {
  const raw = JSON.stringify(body);
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  return {
    method: 'POST' as const,
    url: '/api/webhooks/openwa',
    headers: {
      'content-type': 'application/json',
      'x-webhook-timestamp': String(ts),
      'x-webhook-signature': signWebhook(opts.secret ?? SECRET, ts, raw),
    },
    payload: raw,
  };
}

const messageEvent = (eventId: string, text: string, msgId = eventId) => ({
  event_id: eventId,
  type: 'message.received',
  channel: 'whatsapp',
  from: { id: '5511977770000@c.us', phone: '5511977770000', name: 'Cliente WA' },
  message: { id: msgId, text, type: 'chat', timestamp: 1 },
});

describe('assinatura HMAC', () => {
  it('valida assinatura, janela de tempo e segredo ausente', () => {
    const raw = '{"a":1}';
    const ts = 1_700_000_000;
    const sig = signWebhook(SECRET, ts, raw);
    expect(verifyWebhookSignature({ secret: SECRET, rawBody: raw, signatureHeader: sig, timestampHeader: String(ts), maxAgeSeconds: 300, now: ts + 10 }).ok).toBe(true);
    expect(verifyWebhookSignature({ secret: SECRET, rawBody: raw, signatureHeader: sig, timestampHeader: String(ts), maxAgeSeconds: 300, now: ts + 1000 }).reason).toBe('fora_da_janela');
    expect(verifyWebhookSignature({ secret: SECRET, rawBody: '{"a":2}', signatureHeader: sig, timestampHeader: String(ts), maxAgeSeconds: 300, now: ts }).reason).toBe('assinatura_invalida');
    expect(verifyWebhookSignature({ secret: '', rawBody: raw, signatureHeader: sig, timestampHeader: String(ts), maxAgeSeconds: 300, now: ts }).reason).toBe('webhook_desabilitado');
  });
});

describe('webhook de mensagens', () => {
  it('rejeita sem assinatura, com assinatura errada e com timestamp antigo', async () => {
    ctx = await createTestApp();
    await ctx.admin({ method: 'PATCH', url: '/api/business', payload: { settings: { channels: { whatsapp: true } } } });
    const noSig = await ctx.app.inject({ method: 'POST', url: '/api/webhooks/openwa', payload: messageEvent('e1', 'oi') });
    expect(noSig.statusCode).toBe(401);
    const wrong = await ctx.app.inject(signed(messageEvent('e1', 'oi'), { secret: 'outro' }));
    expect(wrong.statusCode).toBe(401);
    const old = await ctx.app.inject(signed(messageEvent('e1', 'oi'), { ts: Math.floor(Date.now() / 1000) - 3600 }));
    expect(old.statusCode).toBe(401);
    const convs = await ctx.admin({ method: 'GET', url: '/api/conversations?status=all' });
    expect(convs.json().conversations).toHaveLength(0);
  });

  it('aceita evento válido, ignora repetição (idempotência) e mensagem duplicada', async () => {
    ctx = await createTestApp();
    await ctx.admin({ method: 'PATCH', url: '/api/business', payload: { settings: { channels: { whatsapp: true } } } });
    const ok = await ctx.app.inject(signed(messageEvent('e1', 'Boa noite, tem pizza doce?')));
    expect(ok.statusCode).toBe(200);
    expect(ok.json().conversationId).toBeTruthy();
    const dup = await ctx.app.inject(signed(messageEvent('e1', 'Boa noite, tem pizza doce?')));
    expect(dup.json().duplicate).toBe(true);
    const sameMsgNewEvent = await ctx.app.inject(signed(messageEvent('e2', 'Boa noite, tem pizza doce?', 'e1')));
    expect(sameMsgNewEvent.json().ignored).toBe('duplicada');
    const conv = await ctx.admin({ method: 'GET', url: `/api/conversations/${ok.json().conversationId}` });
    expect(conv.json().conversation.channel).toBe('whatsapp');
    expect(conv.json().conversation.customerPhone).toBe('5511977770000');
    expect(conv.json().conversation.messages.filter((m: { direction: string }) => m.direction === 'in')).toHaveLength(1);
  });

  it('canal WhatsApp desabilitado no estabelecimento: evento aceito mas ignorado', async () => {
    ctx = await createTestApp();
    const res = await ctx.app.inject(signed(messageEvent('e9', 'oi')));
    expect(res.statusCode).toBe(200);
    expect(res.json().ignored).toBe('canal_desabilitado');
  });

  it('webhook desabilitado quando não há segredo', async () => {
    ctx = await createTestApp({ env: { WEBHOOK_SECRET: '' } });
    const res = await ctx.app.inject(signed(messageEvent('e1', 'oi')));
    expect(res.statusCode).toBe(401);
  });
});

describe('ponte WhatsApp (fila de saída)', () => {
  it('sem provedor configurado, resposta humana em conversa WhatsApp falha de forma visível', async () => {
    ctx = await createTestApp();
    await ctx.admin({ method: 'PATCH', url: '/api/business', payload: { settings: { channels: { whatsapp: true } } } });
    const ok = await ctx.app.inject(signed(messageEvent('e1', 'oi')));
    const convId = ok.json().conversationId as string;
    const reply = await ctx.admin({ method: 'POST', url: `/api/conversations/${convId}/messages`, payload: { content: 'Olá!' } });
    expect(reply.json().message.deliveryStatus).toBe('failed');
    expect(reply.json().message.metadata.error).toBe('canal_nao_configurado');
  });

  it('com open-wa habilitado e envio bloqueado, nada vai para a fila; com envio liberado, a ponte busca e confirma', async () => {
    ctx = await createTestApp({ env: { WHATSAPP_PROVIDER: 'openwa', BRIDGE_TOKEN: 'token-ponte', WHATSAPP_SEND_ENABLED: 'false' } });
    await ctx.admin({ method: 'PATCH', url: '/api/business', payload: { settings: { channels: { whatsapp: true } } } });
    const ok = await ctx.app.inject(signed(messageEvent('e1', 'oi')));
    const convId = ok.json().conversationId as string;
    const blocked = await ctx.admin({ method: 'POST', url: `/api/conversations/${convId}/messages`, payload: { content: 'Olá!' } });
    expect(blocked.json().message.deliveryStatus).toBe('failed');
    expect(blocked.json().message.metadata.error).toContain('WHATSAPP_SEND_ENABLED');
    await ctx.close();

    ctx = await createTestApp({ env: { WHATSAPP_PROVIDER: 'openwa', BRIDGE_TOKEN: 'token-ponte', WHATSAPP_SEND_ENABLED: 'true' } });
    await ctx.admin({ method: 'PATCH', url: '/api/business', payload: { settings: { channels: { whatsapp: true } } } });
    const ok2 = await ctx.app.inject(signed(messageEvent('e1', 'oi')));
    const convId2 = ok2.json().conversationId as string;
    const queued = await ctx.admin({ method: 'POST', url: `/api/conversations/${convId2}/messages`, payload: { content: 'Olá! Em que posso ajudar?' } });
    expect(queued.json().message.deliveryStatus).toBe('queued');

    const unauthorized = await ctx.app.inject({ method: 'GET', url: '/api/bridge/outbox' });
    expect(unauthorized.statusCode).toBe(401);
    const outbox = await ctx.app.inject({ method: 'GET', url: '/api/bridge/outbox', headers: { 'x-bridge-token': 'token-ponte' } });
    expect(outbox.statusCode).toBe(200);
    // resposta automática (IA desligada) + resposta humana
    expect(outbox.json().messages).toHaveLength(2);
    const human = outbox.json().messages.find((m: { text: string }) => m.text === 'Olá! Em que posso ajudar?');
    expect(human.to).toBe('5511977770000@c.us');
    expect(outbox.json().sendEnabled).toBe(true);
    const again = await ctx.app.inject({ method: 'GET', url: '/api/bridge/outbox', headers: { 'x-bridge-token': 'token-ponte' } });
    expect(again.json().messages).toHaveLength(0); // já marcada como "sending"

    const ack = await ctx.app.inject({ method: 'POST', url: `/api/bridge/outbox/${human.id}/ack`, headers: { 'x-bridge-token': 'token-ponte' }, payload: { status: 'sent', externalId: 'true_5511977770000@c.us_ABC' } });
    expect(ack.statusCode).toBe(200);
    const conv = await ctx.admin({ method: 'GET', url: `/api/conversations/${convId2}` });
    const out = conv.json().conversation.messages.find((m: { content: string }) => m.content === 'Olá! Em que posso ajudar?');
    expect(out.deliveryStatus).toBe('sent');

    const hb = await ctx.app.inject({ method: 'POST', url: '/api/bridge/heartbeat', headers: { 'x-bridge-token': 'token-ponte' }, payload: { state: 'CONNECTED' } });
    expect(hb.statusCode).toBe(200);
    const status = await ctx.admin({ method: 'GET', url: '/api/messaging/status' });
    const wa = status.json().channels.find((c: { channel: string }) => c.channel === 'whatsapp');
    expect(wa.connected).toBe(true);
    expect(wa.sendEnabled).toBe(true);
  });
});
