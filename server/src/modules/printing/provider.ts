import type { ReceiptModel } from './receipt.js';

export type PrinterProviderId = 'browser' | 'escpos_network';

export interface PrintOptions {
  copies: number;
  paperWidthMm: 80 | 58;
  cut: boolean;
  /** usado só pelo ESC/POS */
  encoding: 'cp1252' | 'ascii';
  codepageCommand: number | null;
  host?: string;
  port?: number;
}

export type PrintResult =
  | { status: 'browser' } // o navegador imprime a partir do layout HTML
  | { status: 'done'; bytes: number }
  | { status: 'failed'; error: string };

export interface PrinterProvider {
  readonly id: PrinterProviderId;
  readonly name: string;
  print(receipt: ReceiptModel, options: PrintOptions): Promise<PrintResult>;
  /** Verifica se o provedor pode ser usado com as opções atuais (sem imprimir). */
  check(options: PrintOptions): Promise<{ ok: boolean; message: string }>;
}

export class PrinterRegistry {
  private providers = new Map<PrinterProviderId, PrinterProvider>();

  register(p: PrinterProvider): void {
    this.providers.set(p.id, p);
  }

  get(id: PrinterProviderId): PrinterProvider | undefined {
    return this.providers.get(id);
  }

  all(): PrinterProvider[] {
    return [...this.providers.values()];
  }
}
