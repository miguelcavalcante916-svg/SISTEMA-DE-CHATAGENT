import { onlyDigits, stripAccents } from '../../../lib/text.js';
import type { BusinessSettings } from '../../business/settings.js';

export interface PixValidation {
  ok: boolean;
  errors: string[];
  normalizedKey: string | null;
}

const EVP_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida os dados Pix cadastrados. Não solicita nem valida credenciais bancárias. */
export function validatePixConfig(pix: BusinessSettings['pix']): PixValidation {
  const errors: string[] = [];
  let normalizedKey: string | null = null;
  if (!pix.keyType) errors.push('Informe o tipo da chave Pix.');
  const key = pix.key.trim();
  if (!key) errors.push('Informe a chave Pix.');
  if (pix.keyType && key) {
    switch (pix.keyType) {
      case 'cpf': {
        const d = onlyDigits(key);
        if (d.length !== 11) errors.push('CPF deve ter 11 dígitos.');
        normalizedKey = d;
        break;
      }
      case 'cnpj': {
        const d = onlyDigits(key);
        if (d.length !== 14) errors.push('CNPJ deve ter 14 dígitos.');
        normalizedKey = d;
        break;
      }
      case 'phone': {
        const d = onlyDigits(key);
        if (d.length < 10 || d.length > 13) errors.push('Telefone deve ter DDD e número (ex.: +5511999998888).');
        normalizedKey = `+${d.startsWith('55') ? d : `55${d}`}`;
        break;
      }
      case 'email': {
        if (!EMAIL_RE.test(key) || key.length > 77) errors.push('E-mail da chave Pix inválido.');
        normalizedKey = key.toLowerCase();
        break;
      }
      case 'evp': {
        if (!EVP_RE.test(key)) errors.push('Chave aleatória deve ter o formato de UUID (8-4-4-4-12).');
        normalizedKey = key.toLowerCase();
        break;
      }
    }
  }
  const name = stripAccents(pix.receiverName).trim();
  if (name.length < 2) errors.push('Informe o nome do recebedor.');
  if (name.length > 25) errors.push('Nome do recebedor deve ter até 25 caracteres (sem acentos).');
  const city = stripAccents(pix.city).trim();
  if (city.length < 2) errors.push('Informe a cidade do recebedor.');
  if (city.length > 15) errors.push('Cidade deve ter até 15 caracteres (sem acentos).');
  return { ok: errors.length === 0, errors, normalizedKey: errors.length === 0 ? normalizedKey : null };
}
