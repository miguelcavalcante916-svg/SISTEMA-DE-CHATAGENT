import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { BusinessCategory, Profile } from '../api/types';
import { ChannelsSection, HoursSection, FulfillmentSection, MessagesSection, PaymentsSection, PrinterSection, ProfileSection, ReviewSection } from '../components/SettingsSections';
import { Alert, Button, Field, Input, Select } from '../components/ui';
import { CATEGORY_LABEL } from '../lib/labels';
import { useAuth } from '../state/auth';

const STEPS = ['Estabelecimento', 'Perfil', 'Horários', 'Modalidades e taxas', 'Pagamentos e Pix', 'Impressora', 'Mensagens', 'Canais', 'Revisão'];

export function SetupPage() {
  const { status, user, business, refresh, loading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: () => api.get<{ profiles: Profile[] }>('/api/business/profiles').then((r) => r.profiles), enabled: Boolean(user) });

  const [form, setForm] = useState({ businessName: '', category: 'pizzaria' as BusinessCategory, timezone: 'America/Sao_Paulo', phone: '', adminName: '', username: '', password: '', password2: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading) return null;
  if (status && !status.needsSetup && !user) return <Navigate to="/login" replace />;
  if (business?.setupCompleted) return <Navigate to="/pedidos" replace />;

  const submitFirst = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.password2) {
      setError('As senhas não conferem.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/auth/setup', {
        business: { name: form.businessName, category: form.category, timezone: form.timezone, phone: form.phone || undefined },
        admin: { name: form.adminName, username: form.username, password: form.password },
      });
      await refresh();
      setStep(1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      await api.patch('/api/business', { setupCompleted: true });
      await refresh();
      navigate('/pedidos', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const currentStep = user ? Math.max(step, 1) : 0;

  return (
    <div className="auth-wrap">
      <div className="card auth-card wide">
        <h1>Configuração inicial</h1>
        <p className="muted">Você poderá alterar tudo depois em Configurações.</p>
        <div className="steps" aria-label="Etapas">
          {STEPS.map((s, i) => (
            <span key={s} className={i === currentStep ? 'active' : i < currentStep ? 'done' : ''}>
              {i + 1}. {s}
            </span>
          ))}
        </div>
        {error ? <Alert kind="danger">{error}</Alert> : null}

        {currentStep === 0 ? (
          <form onSubmit={submitFirst}>
            <h2>Estabelecimento e administrador</h2>
            <div className="inline-fields">
              <Field label="Nome fantasia" required>
                <Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} required minLength={2} />
              </Field>
              <Field label="Categoria" required>
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as BusinessCategory })}>
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Telefone/contato">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="Fuso horário" required hint="Ex.: America/Sao_Paulo, America/Manaus, America/Fortaleza">
                <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} required />
              </Field>
            </div>
            <h3>Conta do administrador</h3>
            <div className="inline-fields">
              <Field label="Seu nome" required>
                <Input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} required />
              </Field>
              <Field label="Usuário de acesso" required hint="Letras, números, ponto, hífen ou sublinhado">
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required autoComplete="username" />
              </Field>
              <Field label="Senha" required hint="Mínimo 8 caracteres. Não use senhas óbvias.">
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} autoComplete="new-password" />
              </Field>
              <Field label="Repita a senha" required>
                <Input type="password" value={form.password2} onChange={(e) => setForm({ ...form, password2: e.target.value })} required autoComplete="new-password" />
              </Field>
            </div>
            <Button type="submit" variant="primary" size="lg" loading={saving}>
              Criar e continuar
            </Button>
          </form>
        ) : null}

        {currentStep === 1 && business ? <ProfileSection business={business} profiles={profiles.data ?? []} onDone={() => setStep(2)} /> : null}
        {currentStep === 2 && business ? <HoursSection business={business} onDone={() => setStep(3)} /> : null}
        {currentStep === 3 && business ? <FulfillmentSection business={business} onDone={() => setStep(4)} /> : null}
        {currentStep === 4 && business ? <PaymentsSection business={business} onDone={() => setStep(5)} /> : null}
        {currentStep === 5 && business ? <PrinterSection business={business} onDone={() => setStep(6)} /> : null}
        {currentStep === 6 && business ? <MessagesSection business={business} onDone={() => setStep(7)} /> : null}
        {currentStep === 7 && business ? <ChannelsSection business={business} onDone={() => setStep(8)} /> : null}
        {currentStep === 8 && business ? (
          <>
            <ReviewSection business={business} />
            <Alert kind="info">O catálogo (produtos, preços e adicionais) é cadastrado na tela Catálogo. O atendimento automático só pode ser ligado depois da revisão de dados.</Alert>
            <Button variant="primary" size="lg" onClick={() => void finish()} loading={saving}>
              Concluir e ir para o painel
            </Button>
          </>
        ) : null}

        {currentStep > 1 ? (
          <div className="row" style={{ marginTop: '1rem' }}>
            <Button variant="ghost" onClick={() => setStep(currentStep - 1)}>
              ← Voltar
            </Button>
            {currentStep < 8 ? (
              <Button variant="ghost" onClick={() => setStep(currentStep + 1)}>
                Pular etapa →
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
