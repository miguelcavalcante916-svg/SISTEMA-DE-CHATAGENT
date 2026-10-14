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

/** Converte data+hora locais (no fuso) para instante UTC, com segunda passagem para bordas de horário de verão. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const target = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (utcMs: number): number => {
    const p = localParts(new Date(utcMs), timeZone);
    const [py, pm, pd] = p.date.split('-').map(Number) as [number, number, number];
    const asUtc = Date.UTC(py, pm - 1, pd, Math.floor(p.minutesOfDay / 60), p.minutesOfDay % 60);
    return asUtc - utcMs;
  };
  let utc = target - offsetAt(target);
  utc = target - offsetAt(utc);
  return new Date(utc);
}

/** Intervalo [início, fim) em UTC de um dia local. */
export function localDayRangeUtc(date: string, timeZone: string): { startIso: string; endIso: string } {
  const start = zonedToUtc(date, '00:00', timeZone);
  const end = new Date(start.getTime() + 86_400_000 + 3_600_000);
  // fim = início do dia seguinte (recalculado para respeitar DST)
  const nextDate = localParts(new Date(start.getTime() + 36 * 3_600_000), timeZone).date;
  const nextStart = zonedToUtc(nextDate, '00:00', timeZone);
  return { startIso: start.toISOString(), endIso: (nextStart.getTime() > start.getTime() ? nextStart : end).toISOString() };
}

export function todayLocalDate(timeZone: string, now: Date = new Date()): string {
  return localParts(now, timeZone).date;
}
