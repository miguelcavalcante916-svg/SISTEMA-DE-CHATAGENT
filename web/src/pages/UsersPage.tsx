import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { PublicUser, Role } from '../api/types';
import { Alert, Button, Card, Check, ConfirmDialog, Field, Input, Modal, PageHeader, Select, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import { formatDateTime } from '../lib/format';
import { useAuth } from '../state/auth';

export function UsersPage() {
  const { isAdmin } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? (isAdmin ? 'usuarios' : 'senha');
  const tabs = isAdmin ? [['usuarios', 'Usuários'], ['senha', 'Minha senha'], ['backup', 'Backup'], ['privacidade', 'Privacidade e retenção'], ['auditoria', 'Auditoria']] : [['senha', 'Minha senha']];
  return (
    <>
      <PageHeader title={isAdmin ? 'Usuários e segurança' : 'Minha conta'} />
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" className={tab === k ? 'active' : ''} onClick={() => setSp({ tab: k! })}>{label}</button>
        ))}
      </div>
      {tab === 'usuarios' && isAdmin ? <UsersTab /> : null}
      {tab === 'senha' ? <PasswordTab /> : null}
      {tab === 'backup' && isAdmin ? <BackupTab /> : null}
      {tab === 'privacidade' && isAdmin ? <PrivacyTab /> : null}
      {tab === 'auditoria' && isAdmin ? <AuditTab /> : null}
    </>
  );
}

function UsersTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<{ users: PublicUser[] }>('/api/users').then((r) => r.users) });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['users'] });
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'atendente' as Role });
  const create = useMutation({ mutationFn: () => api.post('/api/users', form), onSuccess: () => { toast.success('Usuário criado. Ele deverá trocar a senha no primeiro acesso.'); setCreating(false); setForm({ name: '', username: '', password: '', role: 'atendente' }); invalidate(); }, onError: (e) => toast.error(errorMessage(e)) });
  const [edit, setEdit] = useState({ name: '', role: 'atendente' as Role, isActive: true, newPassword: '' });
  const update = useMutation({ mutationFn: (id: string) => api.patch(`/api/users/${id}`, { name: edit.name, role: edit.role, isActive: edit.isActive, newPassword: edit.newPassword || undefined }), onSuccess: () => { toast.success('Usuário atualizado'); setEditing(null); invalidate(); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Card title="Usuários do painel" actions={<Button variant="primary" onClick={() => setCreating(true)}>➕ Usuário</Button>}>
      <p className="small muted">Administrador: configura estabelecimento, catálogo, Pix, usuários e aprova conhecimento. Atendente: opera pedidos, conversas e disponibilidade.</p>
      {users.isLoading ? <Spinner /> : null}
      <table className="table">
        <thead><tr><th>Nome</th><th>Usuário</th><th>Papel</th><th>Ativo</th><th>Último acesso</th><th /></tr></thead>
        <tbody>
          {users.data?.map((u) => (
            <tr key={u.id}>
              <td>{u.name}{u.id === me?.id ? <span className="small muted"> (você)</span> : null}</td>
              <td className="mono">{u.username}</td>
              <td>{u.role === 'admin' ? 'Administrador' : 'Atendente'}</td>
              <td>{u.isActive ? '✔' : '✖'}{u.mustChangePassword ? <span className="badge warning" style={{ marginLeft: 4 }}>trocar senha</span> : null}</td>
              <td className="small">{formatDateTime(u.lastLoginAt)}</td>
              <td><Button size="sm" onClick={() => { setEditing(u); setEdit({ name: u.name, role: u.role, isActive: u.isActive, newPassword: '' }); }}>Editar</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {creating ? (
        <Modal title="Novo usuário" onClose={() => setCreating(false)} actions={<><Button onClick={() => setCreating(false)}>Cancelar</Button><Button variant="primary" onClick={() => create.mutate()} loading={create.isPending}>Criar</Button></>}>
          <Field label="Nome" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Usuário de acesso" required><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" /></Field>
          <Field label="Senha inicial" required hint="Mínimo 8 caracteres. O usuário deverá trocar no primeiro acesso."><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="Papel"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}><option value="atendente">Atendente</option><option value="admin">Administrador</option></Select></Field>
        </Modal>
      ) : null}
      {editing ? (
        <Modal title={`Editar ${editing.username}`} onClose={() => setEditing(null)} actions={<><Button onClick={() => setEditing(null)}>Cancelar</Button><Button variant="primary" onClick={() => update.mutate(editing.id)} loading={update.isPending}>Salvar</Button></>}>
          <Field label="Nome"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Papel"><Select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}><option value="atendente">Atendente</option><option value="admin">Administrador</option></Select></Field>
          <Check label="Acesso ativo" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />
          <Field label="Redefinir senha (opcional)" hint="Encerra as sessões do usuário e exige troca no próximo acesso"><Input type="password" value={edit.newPassword} onChange={(e) => setEdit({ ...edit, newPassword: e.target.value })} autoComplete="new-password" /></Field>
        </Modal>
      ) : null}
    </Card>
  );
}

function PasswordTab() {
  const toast = useToast();
  const { refresh } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', repeat: '' });
  const m = useMutation({ mutationFn: () => api.post('/api/auth/change-password', { currentPassword: form.current, newPassword: form.next }), onSuccess: async () => { toast.success('Senha alterada'); setForm({ current: '', next: '', repeat: '' }); await refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const submit = (e: FormEvent) => { e.preventDefault(); if (form.next !== form.repeat) { toast.error('As senhas não conferem'); return; } m.mutate(); };
  return (
    <Card title="Trocar minha senha">
      <form onSubmit={submit} style={{ maxWidth: 420 }}>
        <Field label="Senha atual" required><Input type="password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} autoComplete="current-password" required /></Field>
        <Field label="Nova senha" required hint="Mínimo 8 caracteres"><Input type="password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} autoComplete="new-password" required minLength={8} /></Field>
        <Field label="Repita a nova senha" required><Input type="password" value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} autoComplete="new-password" required /></Field>
        <Button type="submit" variant="primary" loading={m.isPending}>Alterar senha</Button>
      </form>
    </Card>
  );
}

interface BackupInfo { file: string; bytes: number; createdAt: string }
interface Verification { ok: boolean; integrity: string; tables: Record<string, number>; migrationVersion: number | null; error: string | null }
function BackupTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['backup'], queryFn: () => api.get<{ backups: BackupInfo[]; dir: string; databasePath: string }>('/api/backup') });
  const [verification, setVerification] = useState<{ file: string; verification: Verification } | null>(null);
  const create = useMutation({ mutationFn: () => api.post<{ backup: BackupInfo & { verification: Verification } }>('/api/backup'), onSuccess: (r) => { toast.success(r.backup.verification.ok ? 'Backup criado e verificado' : 'Backup criado, mas a verificação falhou'); setVerification({ file: r.backup.file, verification: r.backup.verification }); void qc.invalidateQueries({ queryKey: ['backup'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const verify = useMutation({ mutationFn: (file: string) => api.post<{ file: string; verification: Verification }>(`/api/backup/${file}/verify`), onSuccess: setVerification, onError: (e) => toast.error(errorMessage(e)) });
  const remove = useMutation({ mutationFn: (file: string) => api.delete(`/api/backup/${file}`), onSuccess: () => void qc.invalidateQueries({ queryKey: ['backup'] }), onError: (e) => toast.error(errorMessage(e)) });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  return (
    <Card title="Backup local do banco de dados" actions={<Button variant="primary" onClick={() => create.mutate()} loading={create.isPending}>💾 Fazer backup agora</Button>}>
      <p className="small muted">Banco: <code>{list.data?.databasePath}</code> · Pasta de backups: <code>{list.data?.dir}</code>. Nada é enviado para a nuvem. Copie os arquivos para um pendrive ou outro computador regularmente.</p>
      {verification ? (
        <Alert kind={verification.verification.ok ? 'success' : 'danger'}>
          {verification.file}: integridade <strong>{verification.verification.integrity}</strong>{verification.verification.error ? ` · ${verification.verification.error}` : ''} · esquema v{verification.verification.migrationVersion ?? '?'} · {Object.entries(verification.verification.tables).map(([t, n]) => `${t}: ${n}`).join(', ')}
        </Alert>
      ) : null}
      {list.isLoading ? <Spinner /> : null}
      <table className="table">
        <thead><tr><th>Arquivo</th><th>Data</th><th>Tamanho</th><th /></tr></thead>
        <tbody>
          {list.data?.backups.map((b) => (
            <tr key={b.file}>
              <td className="mono small">{b.file}</td>
              <td>{formatDateTime(b.createdAt)}</td>
              <td>{(b.bytes / 1024).toFixed(0)} KB</td>
              <td className="nowrap">
                <a className="btn sm" href={`/api/backup/${b.file}/download`}>⬇ Baixar</a>{' '}
                <Button size="sm" onClick={() => verify.mutate(b.file)}>Verificar</Button>{' '}
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(b.file)}>Apagar</Button>
              </td>
            </tr>
          ))}
          {list.data?.backups.length === 0 ? <tr><td colSpan={4} className="muted">Nenhum backup ainda.</td></tr> : null}
        </tbody>
      </table>
      <details className="small" style={{ marginTop: 8 }}>
        <summary>Como restaurar um backup</summary>
        <ol>
          <li>Pare o servidor (Ctrl+C na janela onde ele roda).</li>
          <li>Renomeie o banco atual (<code>data/app.db</code>) para guardar uma cópia e apague os arquivos <code>app.db-wal</code> e <code>app.db-shm</code> se existirem.</li>
          <li>Copie o arquivo de backup para <code>data/app.db</code>.</li>
          <li>Opcional: valide com <code>npm run backup:verify -- data/app.db</code>.</li>
          <li>Inicie o servidor novamente. Migrações pendentes são aplicadas automaticamente.</li>
        </ol>
      </details>
      {confirmDelete ? <ConfirmDialog title="Apagar backup" message={`Apagar ${confirmDelete}? Esta ação não pode ser desfeita.`} danger confirmLabel="Apagar" onCancel={() => setConfirmDelete(null)} onConfirm={() => { remove.mutate(confirmDelete); setConfirmDelete(null); }} /> : null}
    </Card>
  );
}

interface RetentionStatus { settings: { conversationDays: number; personalDataDays: number; auditDays: number }; lastRun: { conversationsDeleted: number; ordersAnonymized: number; auditDeleted: number; ranAt: string } | null }
function PrivacyTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { business, refresh } = useAuth();
  const status = useQuery({ queryKey: ['retention'], queryFn: () => api.get<RetentionStatus>('/api/retention/status') });
  const [r, setR] = useState({ ...(business?.settings.retention ?? { conversationDays: 90, personalDataDays: 365, auditDays: 365 }) });
  const save = useMutation({ mutationFn: () => api.patch('/api/business', { settings: { retention: r } }), onSuccess: async () => { toast.success('Retenção salva'); await refresh(); void qc.invalidateQueries({ queryKey: ['retention'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const run = useMutation({ mutationFn: () => api.post<{ result: RetentionStatus['lastRun'] }>('/api/retention/run'), onSuccess: (res) => { toast.success(`Retenção aplicada: ${res.result?.conversationsDeleted} conversa(s), ${res.result?.ordersAnonymized} pedido(s) anonimizado(s)`); void qc.invalidateQueries({ queryKey: ['retention'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const [phone, setPhone] = useState('');
  const [confirmErase, setConfirmErase] = useState(false);
  const erase = useMutation({ mutationFn: () => api.post<{ result: { ordersAnonymized: number; conversationsDeleted: number } }>('/api/privacy/erase', { phone, confirm: true }), onSuccess: (res) => { toast.success(`Removido: ${res.result.conversationsDeleted} conversa(s), ${res.result.ordersAnonymized} pedido(s) anonimizado(s)`); setPhone(''); setConfirmErase(false); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <div className="stack">
      <Card title="Retenção de dados">
        <p className="small muted">Aplicada automaticamente uma vez por dia. 0 = não apagar. Pedidos antigos são anonimizados (nome, telefone, endereço e observações removidos); conversas antigas são apagadas.</p>
        <div className="inline-fields">
          <Field label="Conversas (dias)"><Input type="number" min={0} value={r.conversationDays} onChange={(e) => setR({ ...r, conversationDays: Number(e.target.value) })} /></Field>
          <Field label="Dados pessoais em pedidos (dias)"><Input type="number" min={0} value={r.personalDataDays} onChange={(e) => setR({ ...r, personalDataDays: Number(e.target.value) })} /></Field>
          <Field label="Auditoria (dias)"><Input type="number" min={0} value={r.auditDays} onChange={(e) => setR({ ...r, auditDays: Number(e.target.value) })} /></Field>
        </div>
        <div className="row">
          <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button>
          <Button onClick={() => run.mutate()} loading={run.isPending}>Aplicar agora</Button>
          {status.data?.lastRun ? <span className="small muted">Última execução: {formatDateTime(status.data.lastRun.ranAt)}</span> : null}
        </div>
      </Card>
      <Card title="Remover dados de um cliente (a pedido)">
        <p className="small muted">Apaga as conversas e anonimiza os pedidos vinculados ao telefone. A ação fica registrada na auditoria com o telefone mascarado.</p>
        <div className="row">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone do cliente" style={{ maxWidth: 260 }} aria-label="Telefone do cliente" />
          <Button variant="danger" onClick={() => setConfirmErase(true)} disabled={phone.replace(/\D/g, '').length < 8}>Remover dados</Button>
        </div>
        {confirmErase ? <ConfirmDialog title="Remover dados do cliente" message={`Remover conversas e dados pessoais de ${phone}? Não pode ser desfeito.`} danger confirmLabel="Remover" onCancel={() => setConfirmErase(false)} onConfirm={() => erase.mutate()} loading={erase.isPending} /> : null}
      </Card>
      <Card title="Aviso de privacidade atual">
        <p className="pre">{business?.settings.messages.privacyNotice}</p>
        <p className="small muted">Edite em Configurações › Mensagens.</p>
      </Card>
    </div>
  );
}

interface AuditEntry { id: string; userName: string | null; action: string; entityType: string | null; entityId: string | null; details: Record<string, unknown> | null; ip: string | null; createdAt: string }
function AuditTab() {
  const { business } = useAuth();
  const q = useQuery({ queryKey: ['audit'], queryFn: () => api.get<{ entries: AuditEntry[] }>('/api/audit?limit=300').then((r) => r.entries) });
  return (
    <Card title="Trilha de ações importantes">
      {q.isLoading ? <Spinner /> : null}
      <table className="table small">
        <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhes</th></tr></thead>
        <tbody>
          {q.data?.map((e) => (
            <tr key={e.id}>
              <td className="nowrap">{formatDateTime(e.createdAt, business?.timezone)}</td>
              <td>{e.userName ?? '-'}</td>
              <td className="mono">{e.action}</td>
              <td className="muted">{e.entityType ? `${e.entityType} ` : ''}{e.details ? JSON.stringify(e.details) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
