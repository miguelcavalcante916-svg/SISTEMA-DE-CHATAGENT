const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(cents: number): string {
  return fmt.format(cents / 100).replace(/ /g, ' ');
}

/** "12.34" conforme exigido pelo campo 54 do BR Code. */
export function centsToDecimalString(cents: number): string {
  const abs = Math.abs(cents);
  const sign = cents < 0 ? '-' : '';
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
