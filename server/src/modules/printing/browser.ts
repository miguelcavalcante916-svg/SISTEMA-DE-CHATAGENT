import type { PrinterProvider, PrintOptions, PrintResult } from './provider.js';
import type { ReceiptModel } from './receipt.js';

export class BrowserPrintProvider implements PrinterProvider {
  readonly id = 'browser' as const;
  readonly name = 'Impressão pelo navegador';
  async print(_receipt: ReceiptModel, _options: PrintOptions): Promise<PrintResult> {
    return { status: 'browser' };
  }
  async check(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'Use o botão Imprimir no painel; o navegador envia para a impressora configurada no sistema.' };
  }
}
