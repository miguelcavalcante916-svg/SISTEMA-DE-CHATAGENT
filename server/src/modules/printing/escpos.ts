import net from 'node:net';
import { stripAccents } from '../../lib/text.js';
import type { PrinterProvider, PrintOptions, PrintResult } from './provider.js';
import { colsForPaper, renderReceiptText, type ReceiptModel } from './receipt.js';

const ESC = 0x1b;
const GS = 0x1d;

const REPLACEMENTS: Record<string, string> = {
  '…': '...',
  '–': '-',
  '—': '-',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '•': '*',
  ' ': ' ',
};

/** Codifica texto para a impressora: CP1252 (acentos preservados) ou ASCII (acentos removidos). */
export function encodeText(text: string, encoding: 'cp1252' | 'ascii'): Buffer {
  let t = text;
  for (const [from, to] of Object.entries(REPLACEMENTS)) t = t.split(from).join(to);
  if (encoding === 'ascii') {
    t = stripAccents(t).replace(/[^\x00-\x7f]/g, '?');
    return Buffer.from(t, 'latin1');
  }
  // latin1 cobre os acentos do português; o que estiver fora vira '?'
  t = t.replace(/[^\u0000-ÿ]/g, '?');
  return Buffer.from(t, 'latin1');
}

/** Monta os bytes ESC/POS do comprovante. Sem dependências de fabricante; comandos básicos amplamente suportados. */
export function encodeEscPos(model: ReceiptModel, opts: Pick<PrintOptions, 'paperWidthMm' | 'cut' | 'encoding' | 'codepageCommand'>): Buffer {
  const cols = colsForPaper(opts.paperWidthMm);
  const chunks: Buffer[] = [];
  const cmd = (...bytes: number[]) => chunks.push(Buffer.from(bytes));
  const line = (s: string) => {
    chunks.push(encodeText(s, opts.encoding));
    chunks.push(Buffer.from([0x0a]));
  };

  cmd(ESC, 0x40); // inicializa
  if (opts.codepageCommand != null) cmd(ESC, 0x74, opts.codepageCommand); // seleciona tabela de caracteres
  cmd(ESC, 0x61, 0x00); // alinhamento à esquerda (o texto já vem centralizado por espaços)

  const lines = renderReceiptText(model, cols);
  const orderLineIdx = lines.findIndex((l) => l.trim().startsWith('PEDIDO '));
  lines.forEach((l, idx) => {
    if (idx === orderLineIdx) {
      cmd(ESC, 0x45, 0x01); // negrito
      cmd(GS, 0x21, 0x11); // dupla altura/largura
      chunks.push(encodeText(l.trim(), opts.encoding));
      chunks.push(Buffer.from([0x0a]));
      cmd(GS, 0x21, 0x00);
      cmd(ESC, 0x45, 0x00);
      return;
    }
    if (l.includes('REIMPRESSÃO') || l.trim().startsWith('TOTAL:')) {
      cmd(ESC, 0x45, 0x01);
      line(l);
      cmd(ESC, 0x45, 0x00);
      return;
    }
    line(l);
  });
  cmd(ESC, 0x64, 0x04); // avança papel
  if (opts.cut) cmd(GS, 0x56, 0x42, 0x00); // corte parcial
  return Buffer.concat(chunks);
}

export function sendToNetworkPrinter(host: string, port: number, data: Buffer, timeoutMs = 5000): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(data.length);
    };
    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => done(new Error('Tempo esgotado ao conectar/enviar para a impressora')));
    socket.on('error', (err) => done(err));
    socket.on('connect', () => {
      socket.write(data, (err) => {
        if (err) return done(err);
        socket.end();
      });
    });
    socket.on('close', () => done());
  });
}

export function probeTcp(host: string, port: number, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const finish = (err?: Error) => {
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };
    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => finish(new Error('Tempo esgotado')));
    socket.on('error', (err) => finish(err));
    socket.on('connect', () => finish());
  });
}

export class EscPosNetworkProvider implements PrinterProvider {
  readonly id = 'escpos_network' as const;
  readonly name = 'ESC/POS por rede (TCP/9100)';

  async print(receipt: ReceiptModel, options: PrintOptions): Promise<PrintResult> {
    if (!options.host) return { status: 'failed', error: 'Informe o endereço IP/host da impressora nas configurações.' };
    const data = encodeEscPos(receipt, options);
    try {
      let bytes = 0;
      for (let i = 0; i < Math.max(1, options.copies); i++) {
        bytes += await sendToNetworkPrinter(options.host, options.port ?? 9100, data);
      }
      return { status: 'done', bytes };
    } catch (err) {
      return { status: 'failed', error: `Não foi possível enviar para ${options.host}:${options.port ?? 9100}: ${(err as Error).message}` };
    }
  }

  async check(options: PrintOptions): Promise<{ ok: boolean; message: string }> {
    if (!options.host) return { ok: false, message: 'Impressora de rede sem endereço configurado.' };
    try {
      await probeTcp(options.host, options.port ?? 9100);
      return { ok: true, message: `Conexão TCP com ${options.host}:${options.port ?? 9100} aberta com sucesso.` };
    } catch (err) {
      return { ok: false, message: `Sem conexão com ${options.host}:${options.port ?? 9100}: ${(err as Error).message}` };
    }
  }
}
