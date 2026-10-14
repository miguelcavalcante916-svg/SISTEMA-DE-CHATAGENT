import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { KnowledgeEntry, KnowledgeSuggestion } from '../api/types';
import { Alert, Button, Card, Check, Empty, Field, Input, Modal, PageHeader, Spinner, Textarea } from '../components/ui';
import { useToast } from '../components/Toast';
import { formatDateTime } from '../lib/format';
import { useAuth } from '../state/auth';

const ORIGIN_LABEL: Record<string, string> = { unanswered: 'Pergunta sem resposta', human_correction: 'Correção humana', outdated: 'Informação desatualizada', low_confidence: 'Confiança baixa', ai_unavailable: 'IA indisponível', manual: 'Manual' };

export function KnowledgePage() {
  const { isAdmin, business } = useAuth();
  const tz = business?.timezone;
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'entries' | 'history'>('pending');
  const suggestions = useQuery({ queryKey: ['suggestions', tab === 'history' ? 'all' : 'pending'], queryFn: () => api.get<{ suggestions: KnowledgeSuggestion[] }>(`/api/knowledge/suggestions${tab === 'history' ? '' : '?status=pending'}`).then((r) => r.suggestions), refetchInterval: 15000 });
  const entries = useQuery({ queryKey: ['knowledge'], queryFn: () => api.get<{ entries: KnowledgeEntry[] }>('/api/knowledge').then((r) => r.entries) });
  const [approving, setApproving] = useState<KnowledgeSuggestion | null>(null);
  const [editing, setEditing] = useState<KnowledgeEntry | 'new' | null>(null);
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['suggestions'] }); void qc.invalidateQueries({ queryKey: ['knowledge'] }); };
  const reject = useMutation({ mutationFn: (id: string) => api.post(`/api/knowledge/suggestions/${id}/reject`, { note: null }), onSuccess: invalidate, onError: (e) => toast.error(errorMessage(e)) });
  const toggle = useMutation({ mutationFn: (p: { id: string; isActive: boolean }) => api.patch(`/api/knowledge/${p.id}/active`, { isActive: p.isActive }), onSuccess: invalidate, onError: (e) => toast.error(errorMessage(e)) });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/api/knowledge/${id}`), onSuccess: invalidate, onError: (e) => toast.error(errorMessage(e)) });
  const [manual, setManual] = useState({ question: '', answer: '' });
  const createManual = useMutation({ mutationFn: () => api.post('/api/knowledge/suggestions', { question: manual.question, proposedAnswer: manual.answer || null }), onSuccess: () => { setManual({ question: '', answer: '' }); toast.success('Sugestão registrada'); invalidate(); }, onError: (e) => toast.error(errorMessage(e)) });

  return (
    <>
      <PageHeader title="Conhecimento do agente" subtitle="Só conteúdo aprovado por um administrador é usado nas respostas automáticas." actions={isAdmin ? <Button variant="primary" onClick={() => setEditing('new')}>➕ Conhecimento aprovado</Button> : undefined} />
      <div className="tabs" role="tablist">
        <button type="button" role="tab" className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>Sugestões para revisar {tab !== 'history' && suggestions.data?.length ? `(${suggestions.data.length})` : ''}</button>
        <button type="button" role="tab" className={tab === 'entries' ? 'active' : ''} onClick={() => setTab('entries')}>Conhecimento aprovado ({entries.data?.length ?? 0})</button>
        <button type="button" role="tab" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Histórico de revisões</button>
      </div>

      {tab === 'pending' || tab === 'history' ? (
        <>
          {tab === 'pending' ? (
            <Card title="Registrar sugestão manual">
              <div className="inline-fields">
                <Field label="Pergunta"><Input value={manual.question} onChange={(e) => setManual({ ...manual, question: e.target.value })} /></Field>
                <Field label="Resposta proposta"><Input value={manual.answer} onChange={(e) => setManual({ ...manual, answer: e.target.value })} /></Field>
              </div>
              <Button size="sm" onClick={() => createManual.mutate()} disabled={manual.question.length < 2} loading={createManual.isPending}>Enviar para revisão</Button>
            </Card>
          ) : null}
          {suggestions.isLoading ? <Spinner /> : null}
          {suggestions.data?.length === 0 ? <Empty icon="📭" title={tab === 'pending' ? 'Nenhuma sugestão pendente' : 'Sem histórico'}>Perguntas sem resposta, correções humanas e falhas da IA aparecem aqui.</Empty> : null}
          <div className="stack">
            {suggestions.data?.map((s) => (
              <Card key={s.id}>
                <div className="row between">
                  <div>
                    <span className="badge info">{ORIGIN_LABEL[s.origin] ?? s.origin}</span> <span className="small muted">{formatDateTime(s.createdAt, tz)}</span>
                    {s.status !== 'pending' ? <span className={`badge ${s.status === 'approved' ? 'success' : 'danger'}`} style={{ marginLeft: 6 }}>{s.status === 'approved' ? 'aprovada' : 'rejeitada'}</span> : null}
                    {s.conversationId ? <Link to={`/conversas/${s.conversationId}`} className="small" style={{ marginLeft: 8 }}>ver conversa</Link> : null}
                  </div>
                  {isAdmin && s.status === 'pending' ? (
                    <div className="row">
                      <Button size="sm" variant="success" onClick={() => setApproving(s)}>✔ Aprovar/editar</Button>
                      <Button size="sm" variant="danger" onClick={() => reject.mutate(s.id)}>✖ Rejeitar</Button>
                    </div>
                  ) : null}
                </div>
                <p style={{ marginTop: 8 }}><strong>Pergunta:</strong> {s.question}</p>
                {s.proposedAnswer ? <p><strong>Resposta proposta:</strong> {s.proposedAnswer}</p> : <p className="muted small">Sem resposta proposta: escreva uma ao aprovar.</p>}
                {s.reviewNote ? <p className="small muted">Nota: {s.reviewNote}</p> : null}
              </Card>
            ))}
          </div>
        </>
      ) : null}

      {tab === 'entries' ? (
        <>
          <Alert kind="info">Estas informações entram no contexto do agente junto com o cardápio e as regras do estabelecimento. Mantenha curtas e objetivas.</Alert>
          {entries.data?.length === 0 ? <Empty icon="📚" title="Nenhum conhecimento aprovado" /> : null}
          <div className="stack">
            {entries.data?.map((e) => (
              <Card key={e.id} title={<>{e.title} {!e.isActive ? <span className="badge">inativo</span> : null}</>} actions={isAdmin ? <div className="row"><Check label="Ativo" checked={e.isActive} onChange={(ev) => toggle.mutate({ id: e.id, isActive: ev.target.checked })} /><Button size="sm" onClick={() => setEditing(e)}>Editar</Button><Button size="sm" variant="ghost" onClick={() => { if (confirm('Excluir este conhecimento?')) remove.mutate(e.id); }}>Excluir</Button></div> : undefined}>
                <p className="pre">{e.content}</p>
                <p className="small muted">Origem: {e.source === 'suggestion' ? 'sugestão aprovada' : 'manual'} · atualizado {formatDateTime(e.updatedAt, tz)}{e.tags.length ? ` · ${e.tags.join(', ')}` : ''}</p>
              </Card>
            ))}
          </div>
        </>
      ) : null}

      {approving ? <ApproveModal s={approving} onClose={() => { setApproving(null); invalidate(); }} /> : null}
      {editing ? <EntryModal entry={editing === 'new' ? null : editing} onClose={() => { setEditing(null); invalidate(); }} /> : null}
    </>
  );
}

function ApproveModal({ s, onClose }: { s: KnowledgeSuggestion; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(s.question.slice(0, 100));
  const [content, setContent] = useState(s.proposedAnswer ?? '');
  const m = useMutation({ mutationFn: () => api.post(`/api/knowledge/suggestions/${s.id}/approve`, { title, content, tags: [] }), onSuccess: () => { toast.success('Aprovado. Já disponível para o agente.'); onClose(); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Modal title="Aprovar sugestão" onClose={onClose} actions={<><Button onClick={onClose}>Cancelar</Button><Button variant="success" onClick={() => m.mutate()} loading={m.isPending} disabled={title.length < 2 || content.length < 2}>Aprovar</Button></>}>
      <Field label="Título" required><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Conteúdo aprovado" required hint="Revise e corrija antes de aprovar. Este texto passa a ser usado pelo agente."><Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} /></Field>
    </Modal>
  );
}

function EntryModal({ entry, onClose }: { entry: KnowledgeEntry | null; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(entry?.title ?? '');
  const [content, setContent] = useState(entry?.content ?? '');
  const [tags, setTags] = useState(entry?.tags.join(', ') ?? '');
  const m = useMutation({
    mutationFn: () => {
      const body = { title, content, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) };
      return entry ? api.put(`/api/knowledge/${entry.id}`, body) : api.post('/api/knowledge', body);
    },
    onSuccess: () => { toast.success('Salvo'); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal title={entry ? 'Editar conhecimento' : 'Novo conhecimento aprovado'} onClose={onClose} actions={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => m.mutate()} loading={m.isPending} disabled={title.length < 2 || content.length < 2}>Salvar</Button></>}>
      <Field label="Título" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: Estacionamento" /></Field>
      <Field label="Conteúdo" required><Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} /></Field>
      <Field label="Etiquetas (separadas por vírgula)"><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
    </Modal>
  );
}
