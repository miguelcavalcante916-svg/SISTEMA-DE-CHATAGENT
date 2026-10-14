import { describe, expect, it } from 'vitest';
import { formatBRL, formatPhone, parseMoney } from './format';

describe('formatação', () => {
  it('converte entrada monetária em centavos', () => {
    expect(parseMoney('12,34')).toBe(1234);
    expect(parseMoney('R$ 1.234,50')).toBe(123450);
    expect(parseMoney('')).toBe(0);
    expect(parseMoney('abc')).toBe(0);
  });
  it('formata reais e telefone', () => {
    expect(formatBRL(1234).replace(/ /g, ' ')).toBe('R$ 12,34');
    expect(formatPhone('5511999998888')).toBe('(11) 99999-8888');
    expect(formatPhone('1133334444')).toBe('(11) 3333-4444');
  });
});
