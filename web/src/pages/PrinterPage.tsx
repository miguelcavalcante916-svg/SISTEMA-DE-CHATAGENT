import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import { PrinterSection } from '../components/SettingsSections';
import { Alert, Button, Card, PageHeader, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../state/auth';

interface PrinterStatus {
  provider: string;
  providerName: string | null;
  options: { paperWidthMm: number; copies: number; host: string; port: number };
  check: { ok: boolean; message: string };
}

function openTextPrintWindow(lines: string[], widthMm: number, copies: number) {
  const w = window.open('', '_blank', 'noopener,width=480,height=720');
  if (!w) return false;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = Array.from({ length: copies })
    .map((_, i) => `<pre style="margin:0;white-space:pre;font:2.5mm/1.25 ui-monospace,Menlo,Consolas,monospace;width:${widthMm === 58 ? 48 : 72}mm;${i < copies - 1 ? 'page-break-after:always;' : ''}">${esc(lines.join('\n'))}</pre>`)
    .join('');
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Teste de impressão</title><style>@page{margin:2mm}body{margin:0;padding:4mm}</style></head><body>${body}<script>setTimeout(function(){window.print()},300)</script></body></html>`);
  w.document.close();
  return true;
}

export function PrinterPage() {
  const { business, isAdmin } = useAuth();
  const toast = useToast();
  const status = useQuery({ queryKey: ['printer-status'], queryFn: () => api.get<PrinterStatus>('/api/printer/status') });
  const [lastText, setLastText] = useState<string[] | null>(null);
  const test = useMutation({
    mutationFn: () => api.post<{ result: { status: string; error?: string; bytes?: number }; text: string[]; paperWidthMm: number }>('/api/printer/test'),
    onSuccess: (r) => {
      setLastText(r.text);
      if (r.result.status === 'browser') {
        if (!openTextPrintWindow(r.text, r.paperWidthMm, business?.settings.printer.copies ?? 1)) toast.error('O navegador bloqueou a janela de impressão. Permita pop-ups para este site.');
      } else if (r.result.status === 'done') toast.success(`Teste enviado à impressora (${r.result.bytes} bytes).`);
      else toast.error(r.result.error ?? 'Falha no teste');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!business) return null;
  return (
    <>
      <PageHeader title="Impressora" subtitle="Comprovante interno de pedido (não é documento fiscal)." actions={<Button variant="primary" onClick={() => test.mutate()} loading={test.isPending}>🖨️ Teste de impressão</Button>} />
      <Card title="Status">
        {status.isLoading ? <Spinner /> : null}
        {status.data ? (
          <Alert kind={status.data.check.ok ? 'success' : 'warning'}>
            <strong>{status.data.providerName}</strong> · papel {status.data.options.paperWidthMm} mm · {status.data.options.copies} via(s)
            {status.data.provider === 'escpos_network' ? ` · ${status.data.options.host || '(sem IP)'}:${status.data.options.port}` : ''}
            <div>{status.data.check.message}</div>
          </Alert>
        ) : null}
        <details className="small">
          <summary>Como configurar a impressora térmica</summary>
          <ul>
            <li><strong>Pelo navegador:</strong> instale o driver do fabricante, defina a térmica como impressora padrão do sistema, papel 80 mm (ou 58 mm) e margens mínimas. Ao imprimir, a janela do navegador abre; marque "não perguntar novamente" para agilizar.</li>
            <li><strong>ESC/POS por rede:</strong> impressoras com Ethernet/Wi-Fi costumam aceitar texto bruto na porta 9100. Informe o IP fixo da impressora. Impressoras USB/seriais exigem compartilhamento via sistema operacional ou um servidor de impressão; use o modo navegador nesses casos.</li>
            <li>Acentos: a maioria aceita a tabela CP1252 (comando 16). Se sair "lixo", troque para ASCII ou ajuste o número do comando conforme o manual do fabricante.</li>
          </ul>
        </details>
      </Card>
      {isAdmin ? <PrinterSection business={business} /> : null}
      {lastText ? (
        <Card title="Prévia do último teste">
          <div className={`receipt-wrap w${business.settings.printer.paperWidthMm}`} style={{ border: '1px dashed var(--border)' }}>
            <pre>{lastText.join('\n')}</pre>
          </div>
        </Card>
      ) : null}
    </>
  );
}
