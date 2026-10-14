import { onlyDigits } from './text.js';

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const d = onlyDigits(phone);
  if (d.length < 6) return '*'.repeat(d.length);
  return `${d.slice(0, 2)}${'*'.repeat(Math.max(0, d.length - 6))}${d.slice(-4)}`;
}

export function maskPixKey(key: string, type: string): string {
  if (!key) return '';
  if (type === 'email') {
    const [user = '', domain = ''] = key.split('@');
    return `${user.slice(0, 2)}***@${domain}`;
  }
  if (key.length <= 6) return '*'.repeat(key.length);
  return `${key.slice(0, 3)}${'*'.repeat(key.length - 6)}${key.slice(-3)}`;
}

/** Minimiza dados pessoais em texto livre antes de guardar como sugestão de conhecimento. */
export function maskPiiInText(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[telefone]');
}
