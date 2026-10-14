import type { PrinterProvider, PrintOptions, PrintResult } from './provider.js';
import type { ReceiptModel } from './receipt.js';

export class EscPosNetworkProvider implements PrinterProvider {
  readonly id = 'escpos_network' as const;
  readonly name = 'ESC/POS por rede (TCP 9100)';
  async print(_receipt: ReceiptModel, _options: PrintOptions): Promise<PrintResult> {
    return { status: 'failed', error: 'não implementado' };
  }
  async check(): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: 'não implementado' };
  }
}
