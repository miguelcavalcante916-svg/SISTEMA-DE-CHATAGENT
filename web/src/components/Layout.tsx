import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Conversation, Order } from '../api/types';
import { useAuth } from '../state/auth';
import { Button } from './ui';

export function Layout() {
  const { user, business, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const orders = useQuery({
    queryKey: ['nav-orders'],
    queryFn: () => api.get<{ orders: Order[]; counts: Record<string, number> }>('/api/orders?limit=1'),
    refetchInterval: 10_000,
  });
  const convs = useQuery({
    queryKey: ['nav-conversations'],
    queryFn: () => api.get<{ conversations: Conversation[]; needsHumanCount: number }>('/api/conversations?needsHuman=1'),
    refetchInterval: 10_000,
  });
  const activeOrders = Object.entries(orders.data?.counts ?? {})
    .filter(([k]) => k !== 'aguardando_pix')
    .reduce((acc, [, v]) => acc + v, 0);
  const needsHuman = convs.data?.needsHumanCount ?? 0;

  // fecha a gaveta ao navegar e com Escape
  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="app">
      <div className={`drawer-backdrop ${open ? 'open' : ''}`} onClick={() => setOpen(false)} aria-hidden />
      <aside className={`sidebar ${open ? 'open' : ''}`} id="menu-principal" aria-label="Menu principal">
        <Button className="sidebar-close icon" variant="ghost" onClick={() => setOpen(false)} aria-label="Fechar menu">
          ✕
        </Button>
        <div className="brand">
          {business?.name ?? 'Painel'}
          <small>
            {business?.openNow ? '🟢 Aberto agora' : '🔴 Fechado agora'}
            {business?.isDemo ? ' · DEMO' : ''}
          </small>
        </div>
        <nav className="nav" aria-label="Principal">
          <div className="nav-section">Operação</div>
          <NavLink to="/pedidos" end>
            <span aria-hidden>📋</span> Pedidos {activeOrders > 0 ? <span className="count">{activeOrders}</span> : null}
          </NavLink>
          <NavLink to="/pedidos/novo">
            <span aria-hidden>➕</span> Novo pedido
          </NavLink>
          <NavLink to="/conversas">
            <span aria-hidden>💬</span> Conversas {needsHuman > 0 ? <span className="count">{needsHuman}</span> : null}
          </NavLink>
          <NavLink to="/simulador">
            <span aria-hidden>🧪</span> Simulador
          </NavLink>
          <div className="nav-section">Cadastro</div>
          <NavLink to="/catalogo">
            <span aria-hidden>🍕</span> Catálogo
          </NavLink>
          <NavLink to="/conhecimento">
            <span aria-hidden>📚</span> Conhecimento
          </NavLink>
          <div className="nav-section">Sistema</div>
          <NavLink to="/configuracoes">
            <span aria-hidden>⚙️</span> Configurações
          </NavLink>
          <NavLink to="/impressora">
            <span aria-hidden>🖨️</span> Impressora
          </NavLink>
          <NavLink to="/usuarios">
            <span aria-hidden>👥</span> {isAdmin ? 'Usuários e segurança' : 'Minha conta'}
          </NavLink>
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <Button className="menu-btn icon" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-controls="menu-principal" aria-expanded={open}>
            ☰
          </Button>
          <span className="brand-mini">{business?.name ?? 'Painel'}</span>
          <span className="muted small user-label">
            {user?.name} · {user?.role === 'admin' ? 'Administrador' : 'Atendente'}
          </span>
          <span className="spacer" />
          <Button size="sm" onClick={() => navigate('/pedidos/novo')} variant="primary" aria-label="Novo pedido">
            ➕ <span className="btn-label">Novo pedido</span>
          </Button>
          <Button size="sm" onClick={() => void logout().then(() => navigate('/login'))}>
            Sair
          </Button>
        </header>
        <main className="content">
          {user?.mustChangePassword ? (
            <div className="alert warning">
              Sua senha foi definida por outra pessoa. <NavLink to="/usuarios?tab=senha">Troque sua senha agora</NavLink>.
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
