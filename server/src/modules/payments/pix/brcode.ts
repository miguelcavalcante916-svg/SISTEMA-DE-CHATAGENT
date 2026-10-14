import { centsToDecimalString } from '../../../lib/money.js';
import { stripAccents } from '../../../lib/text.js';
import { crc16ccitt } from './crc16.js';

/**
 * Payload Pix "copia e cola"/QR estático (EMV MPM, Manual de Padrões para Iniciação do Pix - BCB).
 * Sem integração bancária: o QR só identifica a cobrança; a confirmação do pagamento é manual.
 */
export interface StaticPixInput {
  key: string;
  receiverName: string;
  city: string;
  amountCents?: number | null;
  /** [A-Za-z0-9]{1,25}; sem txid usa "***" */
  txid?: string | null;
  description?: string | null;
}

function tlv(id: string, value: string): string {
  if (value.length > 99) throw new Error(`Campo ${id} excede 99 caracteres`);
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

export function sanitizeField(value: string, max: number): string {
  return stripAccents(value)
    .replace(/[^\x20-\x7e]/g, '')
    .trim()
    .slice(0, max);
}

export function sanitizeTxid(txid: string | null | undefined): string {
  if (!txid) return '***';
  const t = txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25);
  return t || '***';
}

export function buildStaticPixPayload(input: StaticPixInput): string {
  const key = input.key.trim();
  if (!key) throw new Error('Chave Pix ausente');
  const name = sanitizeField(input.receiverName, 25);
  const city = sanitizeField(input.city, 15);
  if (!name || !city) throw new Error('Nome do recebedor e cidade são obrigatórios');

  const mai = [tlv('00', 'br.gov.bcb.pix'), tlv('01', key)];
  if (input.description) {
    const desc = sanitizeField(input.description, 99 - 4 - (14 + 4) - (key.length + 4));
    if (desc) mai.push(tlv('02', desc));
  }
  // Campo 01 (Point of Initiation Method) é opcional em QR estático; omitido como no exemplo do manual do BCB.
  const parts = [tlv('00', '01'), tlv('26', mai.join('')), tlv('52', '0000'), tlv('53', '986')];
  if (input.amountCents != null && input.amountCents > 0) parts.push(tlv('54', centsToDecimalString(input.amountCents)));
  parts.push(tlv('58', 'BR'), tlv('59', name), tlv('60', city), tlv('62', tlv('05', sanitizeTxid(input.txid))));
  const withoutCrc = `${parts.join('')}6304`;
  return `${withoutCrc}${crc16ccitt(withoutCrc)}`;
}

/** Decodifica TLVs do primeiro nível (uso em testes e diagnóstico). */
export function parseTlv(payload: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    const value = payload.slice(i + 4, i + 4 + len);
    out[id] = value;
    i += 4 + len;
  }
  return out;
}

export function validatePixPayloadCrc(payload: string): boolean {
  if (payload.length < 8) return false;
  const body = payload.slice(0, -4);
  const crc = payload.slice(-4);
  return crc16ccitt(body) === crc.toUpperCase();
}
