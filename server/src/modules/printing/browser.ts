import type { PrinterProvider, PrintOptions, PrintResult } from './provider.js';
import type { ReceiptModel } from './receipt.js';

/** O navegador imprime o layout HTML (80/58 mm) na impressora instalada no sistema operacional. */
export class BrowserPrintProvider implements PrinterProvider {
  readonly id = 'browser' as const;
  readonly name = 'Impressão pelo navegador';

  async print(_receipt: ReceiptModel, _options: PrintOptions): Promise<PrintResult> {
    return { status: 'browser' };
  }

  async check(): Promise<{ ok: boolean; message: string }> {
    return {
      ok: true,
      message:
        'A impressão é feita pelo navegador. Configure a impressora térmica como padrão no sistema, com papel 80 mm ou 58 mm e margens zero.',
    };
  }
}
