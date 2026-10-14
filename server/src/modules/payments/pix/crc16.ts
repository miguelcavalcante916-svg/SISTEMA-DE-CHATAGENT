/** CRC-16/CCITT-FALSE (polinômio 0x1021, inicial 0xFFFF), conforme BR Code / EMV MPM. */
export function crc16ccitt(input: string): string {
  const bytes = Buffer.from(input, 'utf8');
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
