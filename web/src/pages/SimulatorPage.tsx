import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Conversation, Message } from '../api/types';
import { Alert, Button, Card, Field, Input, PageHeader, Textarea } from '../components/ui';
import { useToast } from '../components/Toast';
import { useConversation } from '../hooks/queries';
import { formatTime } from '../lib/format';
import { useAuth } from '../state/auth';

export function SimulatorPage() {
  const { business } = useAuth();
  const toast = useToast();
  const [phone, setPhone] = useState(() => localStorage.getItem('simPhone') ?? '11999990000');
  const [name, setName] = useState(() => localStorage.getItem('simName') ?? 'Cliente de Teste');
  const [text, setText] = useState('');
  const [convId, setConvId] = useState<string | null>(null);
  const conv = useConversation(convId ?? undefined, 3000);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [conv.data?.messages.length]);

  const send = useMutation({
    mutationFn: (content: string) => api.post<{ conversation: Conversation; replies: Message[] }>('/api/simulator/inbound', { phone, name: name || null, content }),
    onSuccess: (r) => {
      setConvId(r.conversation.id);
      setText('');
      localStorage.setItem('simPhone', phone);
      localStorage.setItem('simName', name);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const aiOn = business?.settings.ai.enabled && business.dataReviewedAt;
  const messages = conv.data?.messages ?? [];

  return (
    <>
      <PageHeader title="Simulador de canal" subtitle="Converse como se fosse um cliente. Nenhuma mensagem real é enviada." />
      <Alert kind={aiOn ? 'success' : 'info'}>
        {aiOn
          ? '🤖 Atendimento automático ligado: as respostas vêm do agente (Ollama) com as regras do servidor.'
          : 'Atendimento automático desligado: o sistema responde uma mensagem padrão e sinaliza a conversa para a equipe. Ligue a IA em Configurações › Agente de IA após a revisão de dados.'}
      </Alert>
      <div className="grid cols-2">
        <Card title="Cliente simulado">
          <Field label="Telefone do cliente (fictício)" hint="Cada telefone é uma conversa diferente">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Nome exibido">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {conv.data ? (
            <p className="small">
              Conversa aberta: <Link to={`/conversas/${conv.data.id}`}>ver no painel de conversas</Link>
              {conv.data.mode === 'human' ? ' · assumida por uma pessoa (sem respostas automáticas)' : ''}
              {conv.data.needsHuman ? ' · ⚠️ requer pessoa' : ''}
            </p>
          ) : null}
          <p className="small muted">Sugestões: "Oi, tem pizza grande?", "Quero uma pizza grande de calabresa, entrega no Centro, pago em dinheiro", "sim".</p>
        </Card>
        <Card title="Conversa (visão do cliente)">
          <div className="chat" style={{ height: '55vh' }}>
            <div className="messages">
              {messages.length === 0 ? <p className="muted">Envie a primeira mensagem.</p> : null}
              {messages
                .filter((m) => !(m.senderType === 'system' && m.metadata?.internal))
                .map((m) => (
                  <div key={m.id} className={`bubble ${m.direction === 'in' ? 'out' : ''}`}>
                    <span className="who">{m.direction === 'in' ? name || 'Você (cliente)' : m.senderType === 'ai' ? 'Assistente' : m.senderType === 'human' ? m.senderName ?? 'Atendente' : 'Estabelecimento'}</span>
                    {m.content}
                    <span className="when">{formatTime(m.createdAt, business?.timezone)}</span>
                  </div>
                ))}
              <div ref={bottom} />
            </div>
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) send.mutate(text.trim());
              }}
            >
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem do cliente…" aria-label="Mensagem do cliente" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) send.mutate(text.trim()); } }} />
              <Button type="submit" variant="primary" loading={send.isPending} disabled={!text.trim() || !phone.trim()}>
                Enviar
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </>
  );
}
