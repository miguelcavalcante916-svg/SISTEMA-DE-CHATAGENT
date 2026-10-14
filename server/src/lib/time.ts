export const nowIso = (): string => new Date().toISOString();

export function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600_000).toISOString();
}

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface LocalParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  weekday: 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
  minutesOfDay: number;
}

const WEEKDAYS: LocalParts['weekday'][] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Partes da data/hora no fuso informado, sem bibliotecas externas. */
export function localParts(date: Date, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  const hour = Number(parts.hour === '24' ? '0' : parts.hour);
  const minute = Number(parts.minute);
  const wd = (parts.weekday ?? 'Sun').slice(0, 3).toLowerCase() as LocalParts['weekday'];
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    weekday: WEEKDAYS.includes(wd) ? wd : 'sun',
    minutesOfDay: hour * 60 + minute,
  };
}

/** Formata data/hora para exibição em pt-BR no fuso informado. */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}
