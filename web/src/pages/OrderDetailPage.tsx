import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Order, OrderStatus, PaymentStatus, Receipt } from '../api/types';
import { Alert, Button, Card, ConfirmDialog, ErrorBox, FulfillmentBadge, Modal, PageHeader, PaymentBadge, Spinner, StatusBadge, Textarea } from '../components/ui';
import { useToast } from '../components/Toast';
import { useOrder } from '../hooks/queries';
import { formatBRL, formatDateTime, formatPhone } from '../lib/format';
import { ORDER_STATUS_ICON, ORDER_STATUS_LABEL, ORIGIN_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from '../lib/labels';
import { useAuth } from '../state/auth';

interface PixInfo {
  available: boolean;
  reason?: string;
  payload?: string;
  qrSvg?: string | null;
  paymentStatus: PaymentStatus;
  paymentStatusLabel: string;
  confirmationNote: string;
  amountIncluded?: boolean;
  instructions?: string | null;
  paidConfirmedByName: string | null;
  paidConfirmedAt: string | null;
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { business } = useAuth();
  const tz = business?.timezone;
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const order = useOrder(id, 8000);
  const pix = useQuery({ queryKey: ['order-pix', id], queryFn: () => api.get<PixInfo>(`/api/orders/${id}/pix`), enabled: Boolean(id) && order.data?.paymentMethod === 'pix' });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [payOpen, setPayOpen] = useState<PaymentStatus | null>(null);
  const [payNote, setPayNote] = useState('');
  const [notes, setNotes] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['order', id] });
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: ['order-pix', id] });
    void qc.invalidateQueries({ queryKey: ['nav-orders'] });
  };
  const status = useMutation({
    mutationFn: (body: { status: OrderStatus; cancelReason?: string }) => api.post<{ order: Order }>(`/api/orders/${id}/status`, body),
    onSuccess: (r) => {
      toast.success(`Pedido #${r.order.number}: ${ORDER_STATUS_LABEL[r.order.status]}`);
      setCancelOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const payment = useMutation({
    mutationFn: (body: { paymentStatus: PaymentStatus; note?: string }) => api.post<{ order: Order }>(`/api/orders/${id}/payment`, body),
    onSuccess: (r) => {
      toast.success(`Pagamento: ${PAYMENT_STATUS_LABEL[r.order.paymentStatus]}`);
      setPayOpen(null);
      setPayNote('');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const print = useMutation({
    mutationFn: () => api.post<{ mode: 'browser' | 'escpos'; result: { status: string; error?: string }; receipt: Receipt; paperWidthMm: number; copies: number }>(`/api/orders/${id}/print`, {}),
    onSuccess: (r) => {
      invalidate();
      if (r.mode === 'browser') {
        window.open(`/imprimir/${id}?reprint=${r.receipt.reprint ? 1 : 0}&w=${r.paperWidthMm}&copies=${r.copies}`, '_blank', 'noopener,width=480,height=720');
      } else if (r.result.status === 'done') toast.success('Comprovante enviado para a impressora.');
      else toast.error(`Falha na impressão: ${r.result.error ?? ''}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const saveNotes = useMutation({
    mutationFn: (internalNotes: string) => api.patch(`/api/orders/${id}/notes`, { internalNotes }),
    onSuccess: () => {
      toast.success('Observações salvas');
      setNotes(null);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (order.isLoading) return <Spinner />;
  if (order.error || !order.data) return <ErrorBox error={order.error ?? new Error('Pedido não encontrado')} retry={() => void order.refetch()} />;
  const o = order.data;
  const canEdit = o.status === 'recebido' || o.status === 'confirmado';

  return (
    <>
      <PageHeader
        title={`Pedido #${o.number}`}
        subtitle={
          <span className="row">
            <StatusBadge status={o.status} />
            <PaymentBadge status={o.paymentStatus} />
            <FulfillmentBadge fulfillment={o.fulfillment} />
            <span className="small">Criado {formatDateTime(o.createdAt, tz)} · Origem: {ORIGIN_LABEL(o.origin)}</span>
          </span>
        }
        actions={
          <>
            <Button onClick={() => navigate('/pedidos')}>← Pedidos</Button>
            {canEdit ? (
              <Link to={`/pedidos/${o.id}/editar`} className="btn">
                ✏️ Editar
              </Link>
            ) : null}
            <Button variant="primary" onClick={() => print.mutate()} loading={print.isPending}>
              🖨️ {o.printCount > 0 ? `Reimprimir (${o.printCount}x)` : 'Imprimir comprovante'}
            </Button>
          </>
        }
      />

      <div className="grid cols-2">
        <div className="stack">
          <Card title="Andamento">
            <div className="row">
              {o.allowedStatuses
                .filter((s) => s !== 'cancelado')
                .map((s) => (
                  <Button key={s} variant={s === 'concluido' ? 'success' : 'primary'} size="lg" onClick={() => status.mutate({ status: s })} loading={status.isPending}>
                    {ORDER_STATUS_ICON[s]} {ORDER_STATUS_LABEL[s]}
                  </Button>
                ))}
              {o.allowedStatuses.includes('cancelado') ? (
                <Button variant="danger" onClick={() => setCancelOpen(true)}>
                  ✖️ Cancelar pedido
                </Button>
              ) : null}
              {o.allowedStatuses.length === 0 ? <span className="muted">Pedido {ORDER_STATUS_LABEL[o.status].toLowerCase()}. Sem transições disponíveis.</span> : null}
            </div>
            {o.cancelReason ? <p className="small muted">Motivo do cancelamento: {o.cancelReason}</p> : null}
            {o.estimatedMinutes != null ? <p className="small muted">Previsão informada: {o.estimatedMinutes} min</p> : null}
          </Card>

          <Card title="Cliente">
            <p>
              <strong>{o.customer.name || '(sem nome)'}</strong>
              {o.customer.phone ? <> · {formatPhone(o.customer.phone)}</> : null}
              {o.tableLabel ? <> · Mesa {o.tableLabel}</> : null}
            </p>
            {o.fulfillment === 'delivery' && o.address ? (
              <p>
                📍 {[o.address.street, o.address.number].filter(Boolean).join(', ')}
                {o.address.complement ? ` · ${o.address.complement}` : ''}
                {o.address.neighborhood ? ` · ${o.address.neighborhood}` : ''}
                {o.address.reference ? <span className="small muted"> · Ref.: {o.address.reference}</span> : null}
                {o.deliveryZone ? <span className="badge" style={{ marginLeft: 6 }}>Área: {o.deliveryZone.name}</span> : null}
              </p>
            ) : null}
            {o.deliveryNotes ? <p className="small">Obs. entrega: {o.deliveryNotes}</p> : null}
            {o.customerNotes ? <p className="small">Obs. do cliente: {o.customerNotes}</p> : null}
            {o.conversationId ? (
              <Link to={`/conversas/${o.conversationId}`} className="btn sm">
                💬 Abrir conversa
              </Link>
            ) : null}
          </Card>

          <Card title="Itens">
            <table className="table">
              <tbody>
                {o.items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <strong>
                        {it.quantity}x {it.productName}
                        {it.variantName ? ` (${it.variantName})` : ''}
                      </strong>
                      {it.options.length ? <div className="small muted">+ {it.options.map((op) => `${op.quantity > 1 ? `${op.quantity}x ` : ''}${op.optionName}`).join(', ')}</div> : null}
                      {it.notes ? <div className="small">Obs: {it.notes}</div> : null}
                    </td>
                    <td className="right nowrap">
                      {formatBRL(it.lineTotalCents)}
                      <div className="small muted">
                        {formatBRL(it.unitPriceCents)} un.{it.optionsPriceCents ? ` + ${formatBRL(it.optionsPriceCents)}` : ''}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Subtotal</td>
                  <td className="right">{formatBRL(o.subtotalCents)}</td>
                </tr>
                {o.discountCents ? (
                  <tr>
                    <td>Desconto</td>
                    <td className="right">-{formatBRL(o.discountCents)}</td>
                  </tr>
                ) : null}
                {o.deliveryFeeCents ? (
                  <tr>
                    <td>Taxa de entrega</td>
                    <td className="right">{formatBRL(o.deliveryFeeCents)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td className="big">Total</td>
                  <td className="right big">{formatBRL(o.totalCents)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </div>

        <div className="stack">
          <Card title="Pagamento">
            <p>
              Forma: <strong>{o.paymentMethod ? PAYMENT_METHOD_LABEL[o.paymentMethod] : 'não informada'}</strong>
              {o.cashReceivedCents != null ? (
                <>
                  {' '}
                  · Recebe {formatBRL(o.cashReceivedCents)} · Troco <strong>{formatBRL(o.changeCents)}</strong>
                </>
              ) : null}
            </p>
            <p>
              <PaymentBadge status={o.paymentStatus} />
              {o.paidConfirmedByName ? (
                <span className="small muted">
                  {' '}
                  conferido por {o.paidConfirmedByName} em {formatDateTime(o.paidConfirmedAt, tz)}
                </span>
              ) : null}
            </p>
            <div className="row">
              {o.allowedPaymentStatuses.includes('pago') ? (
                <Button variant="success" size="lg" onClick={() => setPayOpen('pago')}>
                  💰 Marcar como pago
                </Button>
              ) : null}
              {o.allowedPaymentStatuses
                .filter((p) => p !== 'pago')
                .map((p) => (
                  <Button key={p} size="sm" onClick={() => setPayOpen(p)}>
                    {PAYMENT_STATUS_LABEL[p]}
                  </Button>
                ))}
            </div>
            {o.paymentMethod === 'pix' ? (
              <div style={{ marginTop: '1rem' }}>
                <h3>QR Code Pix</h3>
                {pix.isLoading ? <Spinner /> : null}
                {pix.data && !pix.data.available ? <Alert kind="warning">{pix.data.reason}</Alert> : null}
                {pix.data?.available ? (
                  <>
                    <Alert kind="warning">⏳ {pix.data.confirmationNote}</Alert>
                    <div className="row" style={{ alignItems: 'flex-start' }}>
                      {pix.data.qrSvg ? <div className="qr" dangerouslySetInnerHTML={{ __html: pix.data.qrSvg }} aria-label="QR Code Pix" role="img" /> : null}
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <p className="small muted">Pix copia e cola{pix.data.amountIncluded ? ` (valor ${formatBRL(o.totalCents)} incluído)` : ' (sem valor; cliente digita)'}:</p>
                        <textarea readOnly value={pix.data.payload} rows={4} className="mono small" onFocus={(e) => e.currentTarget.select()} />
                        <Button size="sm" onClick={() => { void navigator.clipboard?.writeText(pix.data!.payload!); toast.success('Código copiado'); }}>
                          Copiar código
                        </Button>
                        {pix.data.instructions ? <p className="small">{pix.data.instructions}</p> : null}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card title="Observações internas" actions={notes === null ? <Button size="sm" onClick={() => setNotes(o.internalNotes ?? '')}>Editar</Button> : null}>
            {notes === null ? (
              <p className={o.internalNotes ? '' : 'muted'}>{o.internalNotes || 'Nenhuma (não aparecem para o cliente nem no comprovante).'}</p>
            ) : (
              <>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
                <div className="row" style={{ marginTop: 8 }}>
                  <Button variant="primary" size="sm" onClick={() => saveNotes.mutate(notes)} loading={saveNotes.isPending}>
                    Salvar
                  </Button>
                  <Button size="sm" onClick={() => setNotes(null)}>
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </Card>

          <Card title="Histórico">
            <table className="table small">
              <tbody>
                {[...o.events].reverse().map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{formatDateTime(e.createdAt, tz)}</td>
                    <td>
                      {describeEvent(e)}
                      {e.note ? <div className="muted">{e.note}</div> : null}
                    </td>
                    <td className="nowrap muted">{e.actorName ?? (e.actorType === 'system' ? 'sistema' : e.actorType === 'customer' ? 'cliente' : e.actorType)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>

      {cancelOpen ? (
        <ConfirmDialog title="Cancelar pedido" confirmLabel="Cancelar pedido" danger onCancel={() => setCancelOpen(false)} onConfirm={() => status.mutate({ status: 'cancelado', cancelReason })} loading={status.isPending}>
          <p>O pedido #{o.number} será cancelado. Isso não altera o status de pagamento.</p>
          <label className="field">
            <span className="label">Motivo (opcional)</span>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </label>
        </ConfirmDialog>
      ) : null}
      {payOpen ? (
        <Modal
          title={payOpen === 'pago' ? 'Confirmar recebimento' : `Pagamento: ${PAYMENT_STATUS_LABEL[payOpen]}`}
          onClose={() => setPayOpen(null)}
          actions={
            <>
              <Button onClick={() => setPayOpen(null)}>Voltar</Button>
              <Button variant={payOpen === 'pago' ? 'success' : 'primary'} onClick={() => payment.mutate({ paymentStatus: payOpen, note: payNote || undefined })} loading={payment.isPending}>
                Confirmar
              </Button>
            </>
          }
        >
          {payOpen === 'pago' ? <Alert kind="warning">Confirme apenas após conferir o recebimento (extrato, app do banco, dinheiro em mãos). Seu nome e a hora ficam registrados.</Alert> : null}
          <label className="field">
            <span className="label">Observação (opcional)</span>
            <Textarea value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="ex.: conferido no app do banco" />
          </label>
        </Modal>
      ) : null}
    </>
  );
}

function describeEvent(e: Order['events'][number]): string {
  switch (e.type) {
    case 'created':
      return `Pedido criado (${e.toValue ? ORDER_STATUS_LABEL[e.toValue as OrderStatus] : ''})`;
    case 'status_change':
      return `${ORDER_STATUS_LABEL[e.fromValue as OrderStatus] ?? e.fromValue} → ${ORDER_STATUS_LABEL[e.toValue as OrderStatus] ?? e.toValue}`;
    case 'payment_change':
      return `Pagamento: ${e.fromValue ? PAYMENT_STATUS_LABEL[e.fromValue as PaymentStatus] : '-'} → ${PAYMENT_STATUS_LABEL[e.toValue as PaymentStatus] ?? e.toValue}`;
    case 'printed':
      return e.toValue === 'failed' ? 'Falha na impressão' : 'Comprovante impresso';
    case 'edited':
      return 'Pedido editado';
    case 'note':
      return 'Observações atualizadas';
    default:
      return e.type;
  }
}
