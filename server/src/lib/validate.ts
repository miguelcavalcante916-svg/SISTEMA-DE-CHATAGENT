import type { ZodType } from 'zod';
import { AppError } from './errors.js';

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      400,
      'validation_error',
      'Dados inválidos',
      result.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })),
    );
  }
  return result.data;
}

export const toBool = (v: unknown): number => (v ? 1 : 0);
export const fromBool = (v: unknown): boolean => v === 1 || v === true;
