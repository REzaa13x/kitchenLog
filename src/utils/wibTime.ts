import { ShiftType } from '../types/kitchen';

export const SHIFT_META: Record<
  ShiftType,
  {
    label: string;
    startHHMM: string;
    endHHMM: string;
    startMinutes: number;
    endMinutes: number;
    timeRangeLabel: string;
  }
> = {
  opening: {
    label: 'Opening',
    startHHMM: '06:00',
    endHHMM: '12:00',
    startMinutes: 6 * 60,
    endMinutes: 12 * 60,
    timeRangeLabel: '06.00–12.00 WIB',
  },
  closing: {
    label: 'Closing',
    startHHMM: '12:00',
    endHHMM: '17:00',
    startMinutes: 12 * 60,
    endMinutes: 17 * 60,
    timeRangeLabel: '12.00–17.00 WIB',
  },
};

export function getRealWibNow(): { date: string; timeHHMM: string; minutes: number } {
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const year = dateParts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = dateParts.find((p) => p.type === 'month')?.value ?? '01';
  const day = dateParts.find((p) => p.type === 'day')?.value ?? '01';

  const hourStr = timeParts.find((p) => p.type === 'hour')?.value ?? '08';
  const minuteStr = timeParts.find((p) => p.type === 'minute')?.value ?? '00';
  const hour = Number(hourStr === '24' ? '0' : hourStr);
  const minute = Number(minuteStr);

  return {
    date: `${year}-${month}-${day}`,
    timeHHMM: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    minutes: hour * 60 + minute,
  };
}

export function formatTimeDotWib(hhmm: string | null | undefined): string {
  if (!hhmm) return '—';
  return `${hhmm.replace(':', '.')} WIB`;
}

export function formatDurationIndo(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes < 0) return '—';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins} menit`;
  if (mins === 0) return `${hrs} jam`;
  return `${hrs} jam ${mins} menit`;
}

export function formatLateIndo(lateMinutes: number): string {
  if (lateMinutes <= 0) return 'Tepat Waktu';
  return `Terlambat ${lateMinutes} menit`;
}

export function formatDateIndo(dateStr: string, withWeekday = true): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: withWeekday ? 'long' : undefined,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(dateObj);
}

export function hasShiftEnded(
  shiftDate: string,
  shift: ShiftType,
  nowWib: { date: string; minutes: number }
): boolean {
  if (shiftDate < nowWib.date) return true;
  if (shiftDate > nowWib.date) return false;
  return nowWib.minutes >= SHIFT_META[shift].endMinutes;
}

export function calculateLateMinutes(checkInMinutes: number, shift: ShiftType): number {
  const start = SHIFT_META[shift].startMinutes;
  return checkInMinutes > start ? checkInMinutes - start : 0;
}
