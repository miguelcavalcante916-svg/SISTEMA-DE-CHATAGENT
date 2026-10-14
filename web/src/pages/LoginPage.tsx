import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { Alert, Button, Field, Input } from '../components/ui';
import { useAuth } from '../state/auth';

export function LoginPage() {
  const { status, user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (status?.needsSetup) return <Navigate to="/configuracao-inicial" replace />;
  if (user) return <Navigate to={location.state?.from ?? '/pedidos'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/auth/login', { username, password });
      await refresh();
      navigate(location.state?.from ?? '/pedidos', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Entrar no painel</h1>
        <p className="muted">Sistema local de atendimento e pedidos.</p>
        {error ? <Alert kind="danger">{error}</Alert> : null}
        <Field label="Usuário" required>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
        </Field>
        <Field label="Senha" required>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="block" loading={loading}>
          Entrar
        </Button>
      </form>
    </div>
  );
}
