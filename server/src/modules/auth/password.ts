import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), hash.toString('base64')].join('$');
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');
  const actual = scryptSync(password, salt, expected.length, { N, r, p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const WEAK_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'senha123', 'senha1234', 'admin123', 'administrador',
  'qwerty123', 'abcd1234', '11111111', '00000000', 'mudar123', 'pizzaria1',
]);

export function validatePasswordPolicy(password: string, username?: string): string | null {
  if (password.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
  if (password.length > 128) return 'A senha é longa demais.';
  if (WEAK_PASSWORDS.has(password.toLowerCase())) return 'Senha muito comum. Escolha outra.';
  if (username && password.toLowerCase() === username.toLowerCase()) return 'A senha não pode ser igual ao usuário.';
  return null;
}
