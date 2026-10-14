import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Fulfillment, Order, OrderStatus, PaymentStatus } from '../api/types';
import { Button, Empty, ErrorBox, FulfillmentBadge, PageHeader, PaymentBadge, Spinner, StatusBadge } from '../components/ui';
import { formatBRL, formatPhone, formatTime, minutesAgo, todayLocal } from '../lib/format';
import { ACTIVE_STATUSES, FULFILLMENT_LABEL, ORDER_STATUSES, ORDER_STATUS_ICON, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '../lib/labels';
import { useAuth } from '../state/auth';

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.frequency.value = 1175;
    }, 150);
    setTimeout(() => {
      o.stop();
      void ctx.close();
    }, 350);
  } catch {
    // sem áudio disponível
  }
}

export function OrdersPage() {
  const { business } = useAuth();
  const tz = business?.timezone;
  const [view, setView] = useState<'board' | 'list'>(() => (localStorage.getItem('ordersView') as 'board' | 'list') ?? 'board');
  const [sound, setSound] = useState(() => localStorage.getItem('soundEnabled') === '1');
  const [filters, setFilters] = useState<{ date: string; status: string; fulfillment: string; payment: string; q: string; scope: 'active' | 'all' }>({ date: '', status: '', fulfillment: '', payment: '', q: '', scope: 'active' });
  const params = new URLSearchParams();
  if (filters.date) params.set('date', filters.date);
  if (filters.status) params.set('status', filters.status);
  if (filters.fulfillment) params.set('fulfillment', filters.fulfillment);
  if (filters.payment) params.set('paymentStatus', filters.payment);
  if (filters.q) params.set('q', filters.q);
  params.set('scope', filters.date || filters.q || filters.status ? 'all' : filters.scope);
  const query = useQuery({ queryKey: ['orders', params.toString()], queryFn: () => api.get<{ orders: Order[]; counts: Record<string, number> }>(`/api/orders?${params}`), refetchInterval: 5000 });

  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    const orders = query.data?.orders;
    if (!orders) return;
    if (!known.current) {
      known.current = new Set(orders.map((o) => o.id));
      return;
    }
    const added = orders.filter((o) => !known.current!.has(o.id) && o.status === 'recebido');
    if (added.length) {
      setFresh((f) => new Set([...f, ...added.map((o) => o.id)]));
      if (sound) beep();
      setTimeout(() => setFresh((f) => new Set([...f].filter((id) => !added.some((a) => a.id === id)))), 90_000);
    }
    for (const o of orders) known.current.add(o.id);
  }, [query.data, sound]);

  const orders = query.data?.orders ?? [];
  const counts = query.data?.counts ?? {};
  const byStatus = useMemo(() => {
    const m = new Map<OrderStatus, Order[]>();
    for (const s of ORDER_STATUSES) m.set(s, []);
    for (const o of orders) m.get(o.status)!.push(o);
    return m;
  }, [orders]);
  const columns: OrderStatus[] = filters.date || filters.status || filters.q ? ORDER_STATUSES : ACTIVE_STATUSES;
  const waitingPix = orders.filter((o) => o.paymentStatus === 'aguardando_pix').length;

  return (
    <>
      <PageHeader
        title="Pedidos"
        subtitle={
          <>
            {Object.keys(counts).length ? `${ACTIVE_STATUSES.map((s) => counts[s] ?? 0).reduce((a, b) => a + b, 0)} em andamento` : ''}
            {waitingPix ? ` · ⏳ ${waitingPix} aguardando Pix` : ''}
          </>
        }
        actions={
          <>
            <Button size="sm" onClick={() => { const v = !sound; setSound(v); localStorage.setItem('soundEnabled', v ? '1' : '0'); if (v) beep(); }} aria-pressed={sound}>
              {sound ? '🔔 Som ligado' : '🔕 Som desligado'}
            </Button>
            <Button size="sm" onClick={() => { const v = view === 'board' ? 'list' : 'board'; setView(v); localStorage.setItem('ordersView', v); }}>
              {view === 'board' ? '☰ Lista' : '▦ Quadro'}
            </Button>
            <Link to="/pedidos/novo" className="btn primary sm">
              ➕ Novo pedido
            </Link>
          </>
        }
      />
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="inline-fields">
          <label className="field">
            <span className="label">Buscar (número, nome ou telefone)</span>
            <input type="search" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="ex.: 42, Maria, 99999" />
          </label>
          <label className="field">
            <span className="label">Data</span>
            <div className="row">
              <input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
              <Button size="sm" onClick={() => setFilters({ ...filters, date: todayLocal(tz) })}>
                Hoje
              </Button>
            </div>
          </label>
          <label className="field">
            <span className="label">Status</span>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Em andamento</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Modalidade</span>
            <select value={filters.fulfillment} onChange={(e) => setFilters({ ...filters, fulfillment: e.target.value })}>
              <option value="">Todas</option>
              {(Object.keys(FULFILLMENT_LABEL) as Fulfillment[]).map((f) => (
                <option key={f} value={f}>
                  {FULFILLMENT_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Pagamento</span>
            <select value={filters.payment} onChange={(e) => setFilters({ ...filters, payment: e.target.value })}>
              <option value="">Todos</option>
              {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((p) => (
                <option key={p} value={p}>
                  {PAYMENT_STATUS_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {filters.date || filters.q || filters.status || filters.fulfillment || filters.payment ? (
          <Button size="sm" variant="ghost" onClick={() => setFilters({ date: '', status: '', fulfillment: '', payment: '', q: '', scope: 'active' })}>
            Limpar filtros
          </Button>
        ) : null}
      </div>

      {query.isLoading ? <Spinner /> : null}
      {query.error ? <ErrorBox error={query.error} retry={() => void query.refetch()} /> : null}
      {!query.isLoading && orders.length === 0 ? (
        <Empty icon="🧾" title="Nenhum pedido encontrado">
          Crie um pedido manual ou receba pelo simulador/canal configurado.
        </Empty>
      ) : null}

      {view === 'board' && orders.length > 0 ? (
        <div className="board">
          {columns.map((status) => (
            <section key={status} className="column" aria-label={ORDER_STATUS_LABEL[status]}>
              <h3>
                <span>
                  <span aria-hidden>{ORDER_STATUS_ICON[status]}</span> {ORDER_STATUS_LABEL[status]}
                </span>
                <span className="badge">{byStatus.get(status)!.length}</span>
              </h3>
              {byStatus.get(status)!.map((o) => (
                <OrderCard key={o.id} order={o} fresh={fresh.has(o.id)} tz={tz} />
              ))}
            </section>
          ))}
        </div>
      ) : null}

      {view === 'list' && orders.length > 0 ? (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Hora</th>
                <th>Cliente</th>
                <th>Modalidade</th>
                <th>Itens</th>
                <th className="right">Total</th>
                <th>Pagamento</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className={fresh.has(o.id) ? 'new' : ''}>
                  <td>
                    <Link to={`/pedidos/${o.id}`} className="big">
                      #{o.number}
                    </Link>
                  </td>
                  <td className="nowrap">{formatTime(o.createdAt, tz)}</td>
                  <td>
                    {o.customer.name || o.tableLabel || '-'}
                    <div className="small muted">{formatPhone(o.customer.phone)}</div>
                  </td>
                  <td>
                    <FulfillmentBadge fulfillment={o.fulfillment} />
                  </td>
                  <td className="small">{o.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}</td>
                  <td className="right nowrap">{formatBRL(o.totalCents)}</td>
                  <td>
                    <PaymentBadge status={o.paymentStatus} />
                  </td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

function OrderCard({ order: o, fresh, tz }: { order: Order; fresh: boolean; tz?: string }) {
  const needsAction = o.status === 'recebido' || o.paymentStatus === 'aguardando_pix' || o.paymentStatus === 'falhou';
  return (
    <Link to={`/pedidos/${o.id}`} className={`order-card ${fresh ? 'new' : ''}`} aria-label={`Pedido ${o.number}`}>
      <div className="row between">
        <span className="num">#{o.number}</span>
        <span className="small muted nowrap">
          {formatTime(o.createdAt, tz)} · há {minutesAgo(o.createdAt)} min
        </span>
      </div>
      <div>
        <strong>{o.customer.name || o.tableLabel || 'Cliente não informado'}</strong>
        {o.customer.phone ? <span className="small muted"> · {formatPhone(o.customer.phone)}</span> : null}
      </div>
      <div className="meta">
        <FulfillmentBadge fulfillment={o.fulfillment} />
        <span className="badge">{formatBRL(o.totalCents)}</span>
      </div>
      <ul className="items">
        {o.items.slice(0, 4).map((i) => (
          <li key={i.id}>
            {i.quantity}x {i.productName}
            {i.variantName ? ` (${i.variantName})` : ''}
          </li>
        ))}
        {o.items.length > 4 ? <li className="muted">+{o.items.length - 4} item(ns)</li> : null}
      </ul>
      <div className="flags">
        <PaymentBadge status={o.paymentStatus} />
        {fresh ? <span className="badge danger">🆕 Novo</span> : null}
        {needsAction && !fresh ? <span className="badge warning">⚠️ Requer ação</span> : null}
        {o.deliveryZone ? <span className="badge">📍 {o.deliveryZone.name}</span> : null}
      </div>
    </Link>
  );
}
