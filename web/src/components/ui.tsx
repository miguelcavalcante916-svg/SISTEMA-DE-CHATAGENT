import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import type { Fulfillment, OrderStatus, PaymentStatus } from '../api/types';
import { FULFILLMENT_ICON, FULFILLMENT_LABEL, ORDER_STATUS_ICON, ORDER_STATUS_LABEL, PAYMENT_STATUS_ICON, PAYMENT_STATUS_LABEL } from '../lib/labels';

export function Button({ className = '', variant = '', size = '', loading = false, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: '' | 'primary' | 'danger' | 'success' | 'ghost'; size?: '' | 'sm' | 'lg'; loading?: boolean }) {
  return (
    <button type="button" className={`btn ${variant} ${size} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function LinkButton({ to, className = '', variant = '', size = '', children }: { to: string; className?: string; variant?: string; size?: string; children: ReactNode }) {
  return (
    <Link to={to} className={`btn ${variant} ${size} ${className}`}>
      {children}
    </Link>
  );
}

export function Field({ label, hint, error, children, required }: { label: string; hint?: string; error?: string | null; children: ReactNode; required?: boolean }) {
  return (
    <div className="field">
      <label>
        {label}
        {required ? <span aria-hidden> *</span> : null}
        {children}
      </label>
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? (
        <span className="error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type={props.type ?? 'text'} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} />;
}
export function Check({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: string }) {
  return (
    <label className="check">
      <input type="checkbox" {...rest} />
      <span>
        {label}
        {hint ? <span className="hint small muted" style={{ display: 'block', fontWeight: 400 }}>{hint}</span> : null}
      </span>
    </label>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title || actions ? (
        <div className="row between" style={{ marginBottom: '0.75rem' }}>
          {title ? <h2>{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'danger' | 'warning' | 'success'; children: ReactNode }) {
  return (
    <div className={`alert ${kind}`} role={kind === 'danger' ? 'alert' : undefined}>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="row" role="status">
      <span className="spinner" aria-hidden /> <span>{label}</span>
    </div>
  );
}

export function Empty({ icon = '📭', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="icon" aria-hidden>
        {icon}
      </div>
      <strong>{title}</strong>
      {children ? <div className="small">{children}</div> : null}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Erro inesperado';
  return (
    <Alert kind="danger">
      <div className="row between">
        <span>{message}</span>
        {retry ? (
          <Button size="sm" onClick={retry}>
            Tentar de novo
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}

export function Modal({ title, onClose, children, actions, wide = false }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="row between" style={{ marginBottom: '0.75rem' }}>
          <h2 id={titleId}>{title}</h2>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Fechar">
            ✕
          </Button>
        </div>
        {children}
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false, onConfirm, onCancel, loading = false, children }: { title: string; message?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void; loading?: boolean; children?: ReactNode }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancelar</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message ? <p>{message}</p> : null}
      {children}
    </Modal>
  );
}

const STATUS_TONE: Record<OrderStatus, string> = { recebido: 'warning', confirmado: 'info', em_preparo: 'info', pronto: 'success', saiu_para_entrega: 'info', concluido: '', cancelado: 'danger' };
const PAY_TONE: Record<PaymentStatus, string> = { pendente: 'warning', aguardando_pix: 'warning', pago: 'success', falhou: 'danger', reembolsado: '', nao_aplicavel: '' };

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge ${STATUS_TONE[status]}`}>
      <span aria-hidden>{ORDER_STATUS_ICON[status]}</span> {ORDER_STATUS_LABEL[status]}
    </span>
  );
}
export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className={`badge ${PAY_TONE[status]}`}>
      <span aria-hidden>{PAYMENT_STATUS_ICON[status]}</span> {PAYMENT_STATUS_LABEL[status]}
    </span>
  );
}
export function FulfillmentBadge({ fulfillment }: { fulfillment: Fulfillment }) {
  return (
    <span className="badge">
      <span aria-hidden>{FULFILLMENT_ICON[fulfillment]}</span> {FULFILLMENT_LABEL[fulfillment]}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="row between" style={{ marginBottom: '1rem' }}>
      <div>
        <h1>{title}</h1>
        {subtitle ? <div className="muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}
