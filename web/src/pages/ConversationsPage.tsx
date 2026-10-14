import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Conversation, Message } from '../api/types';
import { Alert, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Spinner, Textarea } from '../components/ui';
import { useToast } from '../components/Toast';
import { useCatalog, useConversation } from '../hooks/queries';
import { formatDateTime, formatPhone, formatTime, minutesAgo } from '../lib/format';
import { CHANNEL_LABEL, FULFILLMENT_LABEL, PAYMENT_METHOD_LABEL } from '../lib/labels';
import { useAuth } from '../state/auth';

export function ConversationsPage() {
  const { id } = useParams<{ id: string }>();
  const [filter, setFilter] = useState<'open' | 'needsHuman' | 'closed'>('open');
  const [q, setQ] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const params = new URLSearchParams();
  params.set('status', filter === 'closed' ? 'closed' : 'open');
  if (filter === 'needsHuman') params.set('needsHuman', '1');
  if (q) params.set('q', q);
  const list = useQuery({ queryKey: ['conversations', params.toString()], queryFn: () => api.get<{ conversations: Conversation[]; needsHumanCount: number }>(`/api/conversations?${params}`), refetchInterval: 5000 });

  return (
    <>
      <PageHeader title="Conversas" subtitle="Atendimento por canal integrado, simulador ou registro manual." actions={<Button variant="primary" onClick={() => setNewOpen(true)}>➕ Conversa manual</Button>} />
      <div className="chat-layout">
        <Card>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>
              Abertas
            </button>
            <button type="button" role="tab" className={filter === 'needsHuman' ? 'active' : ''} onClick={() => setFilter('needsHuman')}>
              ⚠️ Requer pessoa {list.data?.needsHumanCount ? `(${list.data.needsHumanCount})` : ''}
            </button>
            <button type="button" role="tab" className={filter === 'closed' ? 'active' : ''} onClick={() => setFilter('closed')}>
              Encerradas
            </button>
          </div>
          <input type="search" placeholder="Buscar por nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar conversa" />
          <div className="conv-list" style={{ marginTop: '0.5rem', maxHeight: '60vh', overflow: 'auto' }}>
            {list.isLoading ? <Spinner /> : null}
            {list.data?.conversations.length === 0 ? <Empty icon="💬" title="Nenhuma conversa" /> : null}
            {list.data?.conversations.map((c) => (
              <NavLink key={c.id} to={`/conversas/${c.id}`} className={({ isActive }) => (isActive ? 'active' : '')}>
                <div className="row between">
                  <span className="name">{c.customerName || formatPhone(c.customerPhone) || 'Sem identificação'}</span>
                  <span className="small muted">{c.lastMessageAt ? `há ${minutesAgo(c.lastMessageAt)} min` : ''}</span>
                </div>
                <div className="small muted">
                  {CHANNEL_LABEL[c.channel]} · {c.mode === 'human' ? `👤 ${c.takenOverByName ?? 'pessoa'}` : '🤖 automático'}
                  {c.unreadCount ? <span className="badge danger" style={{ marginLeft: 6 }}>{c.unreadCount} nova(s)</span> : null}
                  {c.needsHuman ? <span className="badge warning" style={{ marginLeft: 6 }}>requer pessoa</span> : null}
                </div>
                <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMessagePreview}</div>
              </NavLink>
            ))}
          </div>
        </Card>
        {id ? <ConversationDetail id={id} /> : <Card><Empty icon="👈" title="Selecione uma conversa" /></Card>}
      </div>
      {newOpen ? <NewConversationModal onClose={() => setNewOpen(false)} /> : null}
    </>
  );
}

function NewConversationModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () => api.post<{ conversation: Conversation }>('/api/conversations', { customerName: name || null, customerPhone: phone || null }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      onClose();
      navigate(`/conversas/${r.conversation.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal title="Nova conversa manual" onClose={onClose} actions={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => create.mutate()} loading={create.isPending}>Criar</Button></>}>
      <p className="muted small">Para registrar um atendimento por telefone ou balcão. Nada é enviado ao cliente.</p>
      <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Telefone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
    </Modal>
  );
}

function ConversationDetail({ id }: { id: string }) {
  const { user, business } = useAuth();
  const tz = business?.timezone;
  const toast = useToast();
  const qc = useQueryClient();
  const conv = useConversation(id, 4000);
  const catalog = useCatalog();
  const [text, setText] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [conv.data?.messages.length]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['conversation', id] });
    void qc.invalidateQueries({ queryKey: ['conversations'] });
    void qc.invalidateQueries({ queryKey: ['nav-conversations'] });
  };
  const act = useMutation({
    mutationFn: (action: 'takeover' | 'release' | 'close' | 'reopen') => api.post(`/api/conversations/${id}/${action}`),
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const send = useMutation({
    mutationFn: (content: string) => api.post<{ message: Message }>(`/api/conversations/${id}/messages`, { content }),
    onSuccess: (r) => {
      setText('');
      if (r.message.deliveryStatus === 'failed') toast.error(`Mensagem registrada, mas não enviada: ${String(r.message.metadata?.error ?? '')}`);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (conv.isLoading) return <Card><Spinner /></Card>;
  if (conv.error || !conv.data) return <Card><ErrorBox error={conv.error ?? new Error('Conversa não encontrada')} /></Card>;
  const c = conv.data;
  const d = c.draft;
  const productName = (pid: string) => catalog.data?.products.find((p) => p.id === pid)?.name ?? pid;

  return (
    <Card>
      <div className="row between" style={{ marginBottom: '0.5rem' }}>
        <div>
          <h2 style={{ marginBottom: 0 }}>
            {c.customerName || formatPhone(c.customerPhone) || 'Sem identificação'}{' '}
            <Button size="sm" variant="ghost" onClick={() => setEditCustomer(true)} aria-label="Editar dados do cliente">
              ✏️
            </Button>
          </h2>
          <div className="small muted">
            {CHANNEL_LABEL[c.channel]} · {c.customerPhone ? formatPhone(c.customerPhone) : 'sem telefone'} · {c.status === 'open' ? 'aberta' : 'encerrada'} ·{' '}
            {c.mode === 'human' ? `👤 Assumida por ${c.takenOverByName ?? 'pessoa'} ${c.takenOverAt ? `em ${formatDateTime(c.takenOverAt, tz)}` : ''}` : '🤖 Atendimento automático'}
          </div>
        </div>
        <div className="row">
          {c.status === 'open' && c.mode !== 'human' ? (
            <Button variant="primary" onClick={() => act.mutate('takeover')} loading={act.isPending}>
              👤 Assumir conversa
            </Button>
          ) : null}
          {c.status === 'open' && c.mode === 'human' ? (
            <Button onClick={() => act.mutate('release')} loading={act.isPending}>
              🤖 Devolver ao automático
            </Button>
          ) : null}
          <Link to={`/pedidos/novo?conversa=${c.id}`} className="btn success">
            🧾 Criar pedido
          </Link>
          <Button onClick={() => setSuggestOpen(true)}>📚 Sugerir conhecimento</Button>
          {c.status === 'open' ? <Button onClick={() => act.mutate('close')}>Encerrar</Button> : <Button onClick={() => act.mutate('reopen')}>Reabrir</Button>}
        </div>
      </div>
      {c.needsHuman ? <Alert kind="warning">⚠️ Requer atenção humana: {c.needsHumanReason ?? 'cliente aguardando'}</Alert> : null}
      {d.items.length || d.awaitingConfirmation ? (
        <Alert kind="info">
          <strong>Rascunho do pedido:</strong> {d.items.map((it) => `${it.quantity}x ${productName(it.productId)}`).join(', ') || 'sem itens'}
          {d.fulfillment ? ` · ${FULFILLMENT_LABEL[d.fulfillment]}` : ''}
          {d.paymentMethod ? ` · ${PAYMENT_METHOD_LABEL[d.paymentMethod]}` : ''}
          {d.awaitingConfirmation ? ' · ⏳ aguardando o cliente responder SIM' : ''}
          {d.lastOrderId ? (
            <>
              {' '}
              · <Link to={`/pedidos/${d.lastOrderId}`}>último pedido</Link>
            </>
          ) : null}
        </Alert>
      ) : null}
      <div className="chat">
        <div className="messages" aria-live="polite">
          {c.messages.map((m) => (
            <div key={m.id} className={`bubble ${m.direction === 'out' ? 'out' : ''} ${m.senderType === 'system' && m.metadata?.internal ? 'system' : ''}`}>
              <span className="who">
                {m.direction === 'in' ? c.customerName || 'Cliente' : m.senderType === 'human' ? m.senderName ?? 'Atendente' : m.senderType === 'ai' ? '🤖 Assistente' : 'Sistema'}
                {m.direction === 'out' && m.deliveryStatus !== 'n/a' ? ` · ${deliveryLabel(m.deliveryStatus)}` : ''}
                {typeof m.metadata?.confidence === 'number' ? ` · confiança ${(m.metadata.confidence as number).toFixed(2)}` : ''}
              </span>
              {m.content}
              <span className="when">{formatTime(m.createdAt, tz)}</span>
            </div>
          ))}
          <div ref={bottom} />
        </div>
        {c.status === 'open' ? (
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send.mutate(text.trim());
            }}
          >
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={c.mode === 'human' ? 'Responder ao cliente…' : 'Responder assume a conversa (a IA deixa de responder).'} aria-label="Mensagem" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) send.mutate(text.trim()); }} />
            <Button type="submit" variant="primary" loading={send.isPending} disabled={!text.trim()}>
              Enviar
            </Button>
          </form>
        ) : null}
        <p className="small muted" style={{ marginTop: 4 }}>
          {c.channel === 'simulator' ? 'Canal simulado: nada é enviado de verdade.' : c.channel === 'manual' ? 'Registro manual: nada é enviado ao cliente.' : 'Envio pelo canal configurado (veja status em Configurações › Canais).'} Atalho: Ctrl+Enter envia.
        </p>
      </div>
      {suggestOpen ? <SuggestModal conversationId={c.id} onClose={() => setSuggestOpen(false)} /> : null}
      {editCustomer ? <EditCustomerModal c={c} onClose={() => { setEditCustomer(false); invalidate(); }} /> : null}
      <span className="sr-only">Usuário atual: {user?.name}</span>
    </Card>
  );
}

function deliveryLabel(s: Message['deliveryStatus']): string {
  return { 'n/a': '', simulated: 'simulado', queued: 'na fila', sent: 'enviado', failed: 'falhou' }[s];
}

function SuggestModal({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => api.post(`/api/conversations/${conversationId}/suggest-knowledge`, { question, answer }),
    onSuccess: () => {
      toast.success('Sugestão enviada para revisão. Só vale após aprovação.');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal title="Sugerir conhecimento para revisão" onClose={onClose} actions={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => m.mutate()} loading={m.isPending} disabled={question.length < 2 || answer.length < 2}>Enviar para revisão</Button></>}>
      <p className="small muted">Dados pessoais (telefones, e-mails, CPF) são mascarados automaticamente. O agente só usa o que um administrador aprovar.</p>
      <Field label="Pergunta do cliente"><Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} /></Field>
      <Field label="Resposta correta"><Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} /></Field>
    </Modal>
  );
}

function EditCustomerModal({ c, onClose }: { c: Conversation; onClose: () => void }) {
  const [name, setName] = useState(c.customerName ?? '');
  const [phone, setPhone] = useState(c.customerPhone ?? '');
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => api.patch(`/api/conversations/${c.id}/customer`, { name: name || null, phone: phone || null }),
    onSuccess: onClose,
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal title="Dados do cliente" onClose={onClose} actions={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => m.mutate()} loading={m.isPending}>Salvar</Button></>}>
      <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Telefone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
    </Modal>
  );
}
