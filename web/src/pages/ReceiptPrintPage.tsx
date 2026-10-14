import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Receipt } from '../api/types';
import { Button, ErrorBox, Spinner } from '../components/ui';

export function ReceiptPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [sp] = useSearchParams();
  const reprint = sp.get('reprint') === '1' ? '1' : '0';
  const w = sp.get('w') === '58' ? '58' : '80';
  const copies = Math.min(5, Math.max(1, Number(sp.get('copies') ?? '1') || 1));
  const q = useQuery({
    queryKey: ['receipt', id, reprint, w],
    queryFn: () => api.get<{ receipt: Receipt; text: string[]; paperWidthMm: number }>(`/api/orders/${id}/receipt?reprint=${reprint}&width=${w}`),
    enabled: Boolean(id),
  });
  useEffect(() => {
    if (q.data && sp.get('auto') !== '0') {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [q.data, sp]);
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error ?? new Error('Comprovante indisponível')} />;
  return (
    <div>
      <div className="no-print row" style={{ padding: '0.75rem' }}>
        <Button variant="primary" onClick={() => window.print()}>
          🖨️ Imprimir
        </Button>
        <Button onClick={() => window.close()}>Fechar</Button>
        <span className="small muted">Papel {w} mm · {copies} via(s). Configure a impressora térmica como padrão e margens mínimas.</span>
      </div>
      {Array.from({ length: copies }).map((_, i) => (
        <div key={i} className={`receipt-wrap w${w} ${i < copies - 1 ? 'page-break' : ''}`}>
          <pre>{q.data!.text.join('\n')}</pre>
        </div>
      ))}
    </div>
  );
}
