import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedPizzaCatalog, type PizzaFixture } from '../../test/fixtures.js';
import { createAttendant, createTestApp, type TestContext } from '../../test/helpers.js';

let ctx: TestContext;
let fx: PizzaFixture;
beforeEach(async () => {
  ctx = await createTestApp();
  fx = await seedPizzaCatalog(ctx);
});
afterEach(async () => {
  await ctx.close();
});

const inbound = (content: string, phone = '11999990001', name: string | null = 'Cliente Simulado') =>
  ctx.admin({ method: 'POST', url: '/api/simulator/inbound', payload: { phone, name, content } });

describe('conversas em modo sem IA (atendimento manual)', () => {
  it('cria conversa pelo simulador, responde uma vez e sinaliza para a equipe', async () => {
    const first = await inbound('Oi, vocês entregam no Centro?');
    expect(first.statusCode).toBe(200);
    const conv = first.json().conversation;
    expect(conv.channel).toBe('simulator');
    expect(conv.customerPhone).toBe('5511999990001');
    expect(conv.needsHuman).toBe(true);
    expect(first.json().replies).toHaveLength(1);
    expect(first.json().replies[0].senderType).toBe('system');
    expect(first.json().replies[0].deliveryStatus).toBe('simulated');

    const second = await inbound('Alô?');
    expect(second.json().replies).toHaveLength(0);
    expect(second.json().conversation.id).toBe(conv.id);
    expect(second.json().conversation.messages.filter((m: { direction: string }) => m.direction === 'in')).toHaveLength(2);

    const list = await ctx.admin({ method: 'GET', url: '/api/conversations?needsHuman=1' });
    expect(list.json().conversations).toHaveLength(1);
    expect(list.json().needsHumanCount).toBe(1);
    expect(list.json().conversations[0].unreadCount).toBe(2);
  });

  it('10. resposta humana assume a conversa, registra quem assumiu e devolve à IA', async () => {
    const first = await inbound('Quero fazer um pedido');
    const convId = first.json().conversation.id as string;
    const attendant = await createAttendant(ctx);
    const reply = await ctx.as(attendant)({ method: 'POST', url: `/api/conversations/${convId}/messages`, payload: { content: 'Olá! Sou a Ana, vou te atender.' } });
    expect(reply.statusCode).toBe(201);
    expect(reply.json().message.senderType).toBe('human');
    expect(reply.json().message.deliveryStatus).toBe('simulated');
    const conv = reply.json().conversation;
    expect(conv.mode).toBe('human');
    expect(conv.takenOverByName).toBe('Atendente');
    expect(conv.takenOverAt).toBeTruthy();
    expect(conv.needsHuman).toBe(false);

    // com a conversa assumida, mensagens do cliente não geram resposta automática
    const next = await inbound('Pode ser uma pizza grande');
    expect(next.json().replies).toHaveLength(0);
    expect(next.json().conversation.needsHuman).toBe(true);

    const release = await ctx.as(attendant)({ method: 'POST', url: `/api/conversations/${convId}/release` });
    expect(release.json().conversation.mode).toBe('ai');
    const sys = release.json().conversation.messages.filter((m: { senderType: string }) => m.senderType === 'system');
    expect(sys.some((m: { content: string }) => m.content.includes('assumido por Atendente'))).toBe(true);
    expect(sys.some((m: { content: string }) => m.content.includes('devolveu a conversa'))).toBe(true);
  });

  it('cria pedido a partir da conversa somente com confirmação do cliente e avisa o número', async () => {
    const first = await inbound('Quero um refrigerante');
    const convId = first.json().conversation.id as string;
    const base = { fulfillment: 'pickup', paymentMethod: 'pix', customer: { name: 'Cliente Simulado', phone: '11999990001' }, items: [{ productId: fx.refriId, quantity: 1 }] };
    const notConfirmed = await ctx.admin({ method: 'POST', url: `/api/conversations/${convId}/order`, payload: { ...base, customerConfirmed: false } });
    expect(notConfirmed.statusCode).toBe(422);
    const ok = await ctx.admin({ method: 'POST', url: `/api/conversations/${convId}/order`, payload: { ...base, customerConfirmed: true } });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().order.origin).toBe('conversation:simulator');
    expect(ok.json().order.conversationId).toBe(convId);
    expect(ok.json().order.customerConfirmedAt).toBeTruthy();
    const last = ok.json().conversation.messages.at(-1);
    expect(last.direction).toBe('out');
    expect(last.content).toContain(`#${ok.json().order.number}`);
  });

  it('notifica status ao cliente só quando habilitado e por mudança explícita', async () => {
    const first = await inbound('Oi');
    const convId = first.json().conversation.id as string;
    const order = await ctx.admin({
      method: 'POST',
      url: `/api/conversations/${convId}/order`,
      payload: { fulfillment: 'pickup', customer: { name: 'Cliente Simulado' }, customerConfirmed: true, items: [{ productId: fx.refriId, quantity: 1 }] },
    });
    const orderId = order.json().order.id as string;
    // desabilitado: nada é enviado
    await ctx.admin({ method: 'POST', url: `/api/orders/${orderId}/status`, payload: { status: 'confirmado' } });
    await new Promise((r) => setTimeout(r, 30));
    let conv = (await ctx.admin({ method: 'GET', url: `/api/conversations/${convId}` })).json().conversation;
    expect(conv.messages.some((m: { content: string }) => m.content.includes('foi confirmado'))).toBe(false);

    await ctx.admin({ method: 'PATCH', url: '/api/business', payload: { settings: { notifications: { enabled: true, statuses: ['pronto'] } } } });
    await ctx.admin({ method: 'POST', url: `/api/orders/${orderId}/status`, payload: { status: 'em_preparo' } });
    await ctx.admin({ method: 'POST', url: `/api/orders/${orderId}/status`, payload: { status: 'pronto' } });
    await new Promise((r) => setTimeout(r, 30));
    conv = (await ctx.admin({ method: 'GET', url: `/api/conversations/${convId}` })).json().conversation;
    expect(conv.messages.some((m: { content: string }) => m.content.includes('está em preparo'))).toBe(false);
    const ready = conv.messages.find((m: { content: string }) => m.content.includes('está pronto'));
    expect(ready).toBeTruthy();
    expect(ready.deliveryStatus).toBe('simulated');
  });

  it('conversa manual criada pelo painel e sugestão de conhecimento com dados pessoais mascarados', async () => {
    const created = await ctx.admin({ method: 'POST', url: '/api/conversations', payload: { customerName: 'Fulano', customerPhone: '(11) 98888-0000' } });
    expect(created.statusCode).toBe(201);
    expect(created.json().conversation.channel).toBe('manual');
    expect(created.json().conversation.mode).toBe('human');
    const id = created.json().conversation.id as string;
    const msg = await ctx.admin({ method: 'POST', url: `/api/conversations/${id}/messages`, payload: { content: 'Anotado por telefone.' } });
    expect(msg.json().message.deliveryStatus).toBe('n/a');

    const sug = await ctx.admin({
      method: 'POST',
      url: `/api/conversations/${id}/suggest-knowledge`,
      payload: { question: 'Cliente 11988880000 perguntou se tem opção sem glúten, e-mail fulano@exemplo.com', answer: 'Temos massa sem glúten sob encomenda.' },
    });
    expect(sug.statusCode).toBe(201);
    expect(sug.json().suggestion.question).not.toContain('11988880000');
    expect(sug.json().suggestion.question).not.toContain('fulano@exemplo.com');
    expect(sug.json().suggestion.origin).toBe('human_correction');
  });
});

describe('conhecimento aprovado', () => {
  it('fila de sugestões: aprovar vira conhecimento ativo; rejeitar não; atendente não aprova', async () => {
    const s = await ctx.admin({ method: 'POST', url: '/api/knowledge/suggestions', payload: { question: 'Tem estacionamento?', proposedAnswer: 'Sim, gratuito.' } });
    const id = s.json().suggestion.id as string;
    const attendant = await createAttendant(ctx);
    const forbidden = await ctx.as(attendant)({ method: 'POST', url: `/api/knowledge/suggestions/${id}/approve`, payload: { title: 'Estacionamento', content: 'Sim, gratuito.' } });
    expect(forbidden.statusCode).toBe(403);
    const approved = await ctx.admin({ method: 'POST', url: `/api/knowledge/suggestions/${id}/approve`, payload: { title: 'Estacionamento', content: 'Sim, gratuito na frente.' } });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().entry.approvedAt).toBeTruthy();
    expect(approved.json().entry.source).toBe('suggestion');
    const entries = await ctx.admin({ method: 'GET', url: '/api/knowledge' });
    expect(entries.json().entries).toHaveLength(1);
    const pending = await ctx.admin({ method: 'GET', url: '/api/knowledge/suggestions?status=pending' });
    expect(pending.json().suggestions).toHaveLength(0);

    const s2 = await ctx.admin({ method: 'POST', url: '/api/knowledge/suggestions', payload: { question: 'Aceita cheque?' } });
    const rejected = await ctx.admin({ method: 'POST', url: `/api/knowledge/suggestions/${s2.json().suggestion.id}/reject`, payload: { note: 'Não aceitamos' } });
    expect(rejected.json().suggestion.status).toBe('rejected');
    const entriesAfter = await ctx.admin({ method: 'GET', url: '/api/knowledge' });
    expect(entriesAfter.json().entries).toHaveLength(1);
  });
});
