import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedPizzaCatalog, type PizzaFixture } from '../../test/fixtures.js';
import { createTestApp, type TestContext } from '../../test/helpers.js';
import { isAffirmative, isNegative } from '../conversations/ai-turn.js';
import { MockAIProvider } from './mock.js';
import { OllamaProvider } from './ollama.js';
import type { AgentStructuredOutput } from './provider.js';

let ctx: TestContext;
let fx: PizzaFixture;
let mock: MockAIProvider;

const structured = (data: Partial<AgentStructuredOutput> & { reply: string }) => ({
  kind: 'structured' as const,
  data: { intent: 'question', proposed_items: [], proposed_changes: {}, pending_fields: [], confidence: 0.9, needs_human: false, unanswered_question: null, ...data } as AgentStructuredOutput,
  raw: '{}',
  model: 'mock',
  latencyMs: 5,
});

async function enableAi() {
  // pré-requisitos da revisão de dados
  await ctx.admin({
    method: 'PATCH',
    url: '/api/business',
    payload: {
      settings: {
        pix: { enabled: true, keyType: 'evp', key: '123e4567-e12b-12d1-a456-426655440000', receiverName: 'Pizzaria Teste', city: 'SAO PAULO' },
        paymentMethods: [{ id: 'pix', label: 'Pix', enabled: true }, { id: 'dinheiro', label: 'Dinheiro', enabled: true }],
      },
    },
  });
  const review = await ctx.admin({ method: 'POST', url: '/api/business/review', payload: { reviewed: true } });
  if (review.statusCode !== 200) throw new Error(review.body);
  const enable = await ctx.admin({ method: 'PATCH', url: '/api/business', payload: { settings: { ai: { enabled: true } } } });
  if (enable.statusCode !== 200) throw new Error(enable.body);
}

const inbound = (content: string, phone = '11999990002') => ctx.admin({ method: 'POST', url: '/api/simulator/inbound', payload: { phone, name: 'Cliente IA', content } });

beforeEach(async () => {
  mock = new MockAIProvider();
  ctx = await createTestApp({ providers: { ai: mock } });
  fx = await seedPizzaCatalog(ctx);
  await enableAi();
});
afterEach(async () => {
  await ctx.close();
});

describe('regras determinísticas', () => {
  it('reconhece confirmações e negativas em português', () => {
    for (const t of ['sim', 'Sim!', 'pode fechar', 'confirmo', 'ok', 'isso mesmo', 'tá bom']) expect(isAffirmative(t), t).toBe(true);
    for (const t of ['sim, mas troca a borda', 'quero mais uma', 'não', 'simpático']) expect(isAffirmative(t), t).toBe(false);
    expect(isNegative('não, muda o endereço')).toBe(true);
  });
});

describe('9. respostas seguras quando a IA falha', () => {
  it('Ollama indisponível: resposta segura, transferência e registro para revisão; nenhum pedido criado', async () => {
    mock.enqueue({ kind: 'unavailable', reason: 'ECONNREFUSED', latencyMs: 3 });
    const res = await inbound('Quero uma pizza grande de calabresa');
    const replies = res.json().replies;
    expect(replies).toHaveLength(1);
    expect(replies[0].senderType).toBe('system');
    expect(replies[0].content).toContain('atendente');
    expect(res.json().conversation.needsHuman).toBe(true);
    expect(res.json().conversation.needsHumanReason).toContain('indisponível');
    const orders = await ctx.admin({ method: 'GET', url: '/api/orders?scope=all' });
    expect(orders.json().orders).toHaveLength(0);
    const sugg = await ctx.admin({ method: 'GET', url: '/api/knowledge/suggestions?status=pending' });
    expect(sugg.json().suggestions.some((s: { origin: string }) => s.origin === 'ai_unavailable')).toBe(true);
  });

  it('conteúdo malformado é tratado como texto não validado: não cria pedido nem repassa o texto', async () => {
    mock.enqueue({ kind: 'text', text: 'PEDIDO CONFIRMADO! Total R$ 1,00. Pago.', raw: 'lixo', model: 'mock', latencyMs: 1, reason: 'JSON inválido' });
    const res = await inbound('Fecha um pedido aí');
    const replies = res.json().replies;
    expect(replies).toHaveLength(1);
    expect(replies[0].content).not.toContain('CONFIRMADO');
    expect(res.json().conversation.needsHuman).toBe(true);
    const orders = await ctx.admin({ method: 'GET', url: '/api/orders?scope=all' });
    expect(orders.json().orders).toHaveLength(0);
  });

  it('confiança baixa ou pedido de humano transfere e evita respostas automáticas seguintes', async () => {
    mock.enqueue(structured({ reply: 'Acho que sim, mas não tenho certeza.', confidence: 0.3 }));
    const res = await inbound('Vocês fazem pizza sem glúten?');
    expect(res.json().replies.map((r: { senderType: string }) => r.senderType)).toEqual(['ai', 'system']);
    expect(res.json().conversation.needsHuman).toBe(true);
    const sugg = await ctx.admin({ method: 'GET', url: '/api/knowledge/suggestions?status=pending' });
    expect(sugg.json().suggestions.some((s: { origin: string }) => s.origin === 'low_confidence')).toBe(true);
  });

  it('palavra-chave de transferência é tratada sem chamar a IA', async () => {
    const res = await inbound('quero falar com um atendente');
    expect(mock.calls).toHaveLength(0);
    expect(res.json().conversation.needsHuman).toBe(true);
    expect(res.json().replies[0].content).toContain('pessoa da equipe');
  });
});

describe('4. confirmação obrigatória antes de criar pedido pela conversa', () => {
  it('fluxo completo: proposta -> resumo oficial -> "sim" cria pedido com preço do catálogo', async () => {
    mock.enqueue(
      structured({
        intent: 'order_finalize',
        reply: 'Anotado! Uma pizza grande de calabresa com borda, para retirada, pagamento em dinheiro.',
        proposed_items: [{ product_id: fx.pizzaId, variant_id: fx.grandeId, quantity: 1, option_ids: [fx.calabresaId, fx.catupiryId], notes: null }],
        proposed_changes: { fulfillment: 'pickup', payment_method: 'dinheiro', customer_name: 'Marcos', cash_amount_cents: 10000 },
      }),
    );
    const first = await inbound('Quero uma pizza grande de calabresa com borda de catupiry, vou retirar, pago em dinheiro, troco pra 100. Sou o Marcos.');
    const reply = first.json().replies[0];
    expect(reply.senderType).toBe('ai');
    expect(reply.content).toContain('Resumo do pedido');
    expect(reply.content).toContain('R$ 61,00'); // 5000 + 500 (calabresa, maior valor) + 600 (borda)
    expect(reply.content).toContain('Responda SIM');
    expect(reply.content).toContain('Usamos seu nome'); // aviso de privacidade na primeira resposta
    expect(first.json().conversation.draft.awaitingConfirmation).toBe(true);
    let orders = await ctx.admin({ method: 'GET', url: '/api/orders?scope=all' });
    expect(orders.json().orders).toHaveLength(0);

    // a IA "confirmar" sozinha não cria nada: só o cliente
    mock.enqueue(structured({ intent: 'confirm', reply: 'Pedido confirmado!' }));
    const notYet = await inbound('hmm deixa eu ver');
    expect(notYet.json().replies[0].content).not.toContain('Número');
    orders = await ctx.admin({ method: 'GET', url: '/api/orders?scope=all' });
    expect(orders.json().orders).toHaveLength(0);

    const yes = await inbound('sim');
    expect(mock.calls).toHaveLength(2); // a confirmação não passa pela IA
    const confirm = yes.json().replies[0];
    expect(confirm.senderType).toBe('system');
    expect(confirm.content).toMatch(/Número #\d+/);
    orders = await ctx.admin({ method: 'GET', url: '/api/orders?scope=all' });
    expect(orders.json().orders).toHaveLength(1);
    const order = orders.json().orders[0];
    expect(order.totalCents).toBe(6100);
    expect(order.changeCents).toBe(3900);
    expect(order.origin).toBe('conversation:simulator');
    expect(order.customer.name).toBe('Marcos');
    expect(order.customerConfirmedAt).toBeTruthy();
    expect(yes.json().conversation.draft.items).toHaveLength(0);
  });

  it('itens inventados pela IA são ignorados e entrega exige endereço/bairro atendido', async () => {
    mock.enqueue(
      structured({
        intent: 'order_finalize',
        reply: 'Anotei sua lasanha e o refrigerante.',
        proposed_items: [
          { product_id: 'produto-inexistente', quantity: 1, option_ids: [] },
          { product_id: fx.refriId, quantity: 2, option_ids: ['opcao-falsa'] },
        ],
        proposed_changes: { fulfillment: 'delivery', payment_method: 'pix', customer_name: 'Lia' },
      }),
    );
    const res = await inbound('Quero uma lasanha e dois refrigerantes, entrega, pix');
    const conv = res.json().conversation;
    expect(conv.draft.items).toHaveLength(1);
    expect(conv.draft.items[0].productId).toBe(fx.refriId);
    expect(conv.draft.items[0].options).toHaveLength(0);
    expect(res.json().replies[0].content).toContain('preciso de: endereço');
    expect(conv.draft.awaitingConfirmation).toBe(false);

    mock.enqueue(
      structured({
        intent: 'order_finalize',
        reply: 'Endereço anotado.',
        proposed_changes: { address: { street: 'Rua B', number: '7', neighborhood: 'Bairro Longe' } },
      }),
    );
    const far = await inbound('Rua B, 7, Bairro Longe');
    expect(far.json().replies[0].content).toContain('área atendida');
    expect(far.json().conversation.draft.awaitingConfirmation).toBe(false);

    mock.enqueue(structured({ intent: 'order_finalize', reply: 'Perfeito.', proposed_changes: { address: { neighborhood: 'Centro' } } }));
    const near = await inbound('É no Centro');
    expect(near.json().conversation.draft.deliveryZoneId).toBe(fx.zoneId);
    expect(near.json().conversation.draft.awaitingConfirmation).toBe(true);
    expect(near.json().replies[0].content).toContain('Taxa de entrega: R$ 5,00');
  });

  it('10. conversa assumida por pessoa nunca chama a IA', async () => {
    mock.enqueue(structured({ reply: 'Olá! Como posso ajudar?' }));
    const first = await inbound('Oi');
    expect(first.json().replies[0].senderType).toBe('ai');
    const convId = first.json().conversation.id as string;
    await ctx.admin({ method: 'POST', url: `/api/conversations/${convId}/takeover` });
    mock.enqueue(structured({ reply: 'NÃO DEVERIA SER ENVIADA' }));
    const second = await inbound('Quero um pedido');
    expect(second.json().replies).toHaveLength(0);
    expect(mock.calls).toHaveLength(1);
    await ctx.admin({ method: 'POST', url: `/api/conversations/${convId}/release` });
    const third = await inbound('Alguém aí?');
    expect(third.json().replies[0].content).toBe('NÃO DEVERIA SER ENVIADA');
    expect(mock.calls).toHaveLength(2);
  });

  it('pergunta sem resposta vira sugestão para revisão humana', async () => {
    mock.enqueue(structured({ reply: 'Não tenho essa informação, posso chamar alguém.', needs_human: true, unanswered_question: 'Vocês têm opção vegana?' }));
    await inbound('Vocês têm opção vegana?');
    const sugg = await ctx.admin({ method: 'GET', url: '/api/knowledge/suggestions?status=pending' });
    expect(sugg.json().suggestions.some((s: { question: string; origin: string }) => s.origin === 'unanswered' && s.question.includes('vegana'))).toBe(true);
  });
});

describe('adaptador Ollama', () => {
  const settings = { baseUrl: 'http://ollama.local:11434', model: 'qwen2.5:7b', timeoutMs: 200 };
  const input = { systemPrompt: 'x', context: 'y', history: [], customerMessage: 'oi', maxReplyChars: 500, temperature: 0.2 };

  it('envia JSON Schema em format e valida resposta estruturada', async () => {
    let captured: { url: string; body: Record<string, unknown> } | null = null;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ model: 'qwen2.5:7b', message: { role: 'assistant', content: JSON.stringify({ intent: 'greeting', reply: 'Olá!', confidence: 0.95, needs_human: false }) }, done: true }), { status: 200 });
    }) as typeof fetch;
    const p = new OllamaProvider(settings, fetchImpl);
    const out = await p.generate(input);
    expect(out.kind).toBe('structured');
    expect(captured!.url).toBe('http://ollama.local:11434/api/chat');
    expect(captured!.body.stream).toBe(false);
    expect((captured!.body.format as { type: string }).type).toBe('object');
    expect(captured!.body.model).toBe('qwen2.5:7b');
  });

  it('JSON inválido vira texto não validado; erro de rede e timeout viram indisponível', async () => {
    const bad = new OllamaProvider(settings, (async () => new Response(JSON.stringify({ message: { content: 'não é json' } }), { status: 200 })) as typeof fetch);
    expect((await bad.generate(input)).kind).toBe('text');
    const wrongShape = new OllamaProvider(settings, (async () => new Response(JSON.stringify({ message: { content: JSON.stringify({ reply: 'oi' }) } }), { status: 200 })) as typeof fetch);
    const ws = await wrongShape.generate(input);
    expect(ws.kind).toBe('text');
    const down = new OllamaProvider(settings, (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch);
    const d = await down.generate(input);
    expect(d.kind).toBe('unavailable');
    const slow = new OllamaProvider(settings, ((_u: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as typeof fetch);
    const t = await slow.generate(input);
    expect(t.kind).toBe('unavailable');
    expect((t as { reason: string }).reason).toContain('tempo esgotado');
  });

  it('diagnóstico lista modelos e detecta modelo ausente', async () => {
    const p = new OllamaProvider(settings, (async () => new Response(JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }), { status: 200 })) as typeof fetch);
    const h = await p.checkHealth();
    expect(h.reachable).toBe(true);
    expect(h.modelAvailable).toBe(false);
    expect(h.error).toContain('ollama pull');
    const ok = new OllamaProvider(settings, (async () => new Response(JSON.stringify({ models: [{ name: 'qwen2.5:7b' }] }), { status: 200 })) as typeof fetch);
    expect((await ok.checkHealth()).modelAvailable).toBe(true);
  });

  it('status via API usa configurações do painel', async () => {
    const res = await ctx.admin({ method: 'GET', url: '/api/ai/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().health.provider).toBe('mock');
    expect(res.json().settings.enabled).toBe(true);
  });
});
