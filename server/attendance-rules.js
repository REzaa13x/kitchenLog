/**
 * Aturan shift DapurOps — fungsi murni, tanpa DB/HTTP.
 *
 * Semua jam adalah menit sejak 00:00 WIB pada tanggal shift. Check-out yang
 * jatuh setelah tengah malam ditandai `overnight` dan dihitung +24 jam agar
 * durasi kerja tidak menjadi negatif.
 *
 * Batas toleransi keterlambatan 0 menit: check-in setelah jam mulai dihitung
 * terlambat. Pulang lebih awal dihitung terhadap jam selesai shift.
 */

export const SHIFT_WINDOWS = {
  opening: { label: 'Opening', startMinutes: 6 * 60, endMinutes: 12 * 60 },
  closing: { label: 'Closing', startMinutes: 12 * 60, endMinutes: 17 * 60 },
};

/** Shift dianggap "lupa check-out" bila belum pulang > 4 jam setelah jam selesai. */
export const MISSING_CHECKOUT_GRACE_MINUTES = 4 * 60;

export function shiftWindow(shift) {
  const window = SHIFT_WINDOWS[shift];
  if (!window) throw new Error('Shift tidak valid.');
  return window;
}

export function isShift(value) {
  return Object.hasOwn(SHIFT_WINDOWS, value);
}

/**
 * Menit terlambat. `dayOffset` = selisih hari check-in terhadap tanggal shift
 * (0 untuk hari yang sama, 1 bila check-in lewat tengah malam).
 */
export function lateMinutes(shift, checkInMinutes, dayOffset = 0) {
  if (!Number.isFinite(checkInMinutes)) return 0;
  const absolute = checkInMinutes + dayOffset * 24 * 60;
  return Math.max(0, absolute - shiftWindow(shift).startMinutes);
}

/** Menit pulang lebih awal; 0 bila pulang tepat waktu atau lembur. */
export function earlyLeaveMinutes(shift, checkOutMinutes) {
  if (!Number.isFinite(checkOutMinutes)) return 0;
  return Math.max(0, shiftWindow(shift).endMinutes - checkOutMinutes);
}

/** True bila check-out berada di hari berikutnya (mis. closing lewat tengah malam). */
export function isOvernight(checkInMinutes, checkOutMinutes) {
  if (!Number.isFinite(checkInMinutes) || !Number.isFinite(checkOutMinutes)) return false;
  return checkOutMinutes < checkInMinutes;
}

/** Durasi kerja dalam menit, aman untuk check-out lintas tengah malam. */
export function workedMinutes(checkInMinutes, checkOutMinutes) {
  if (!Number.isFinite(checkInMinutes) || !Number.isFinite(checkOutMinutes)) return null;
  const end = checkOutMinutes < checkInMinutes ? checkOutMinutes + 24 * 60 : checkOutMinutes;
  return Math.max(0, end - checkInMinutes);
}

/** Jam lembur setelah jam selesai shift (menit). */
export function overtimeMinutes(shift, checkOutMinutes) {
  if (!Number.isFinite(checkOutMinutes)) return 0;
  const end = checkOutMinutes < shiftWindow(shift).startMinutes ? checkOutMinutes + 24 * 60 : checkOutMinutes;
  return Math.max(0, end - shiftWindow(shift).endMinutes);
}

/**
 * Ringkasan satu absensi.
 * @param {{shift: string, checkInMinutes: number|null, checkOutMinutes: number|null}} record
 */
export function summarizeAttendance(record) {
  const { shift, checkInMinutes, checkOutMinutes } = record ?? {};
  if (!isShift(shift)) throw new Error('Shift tidak valid.');
  if (!Number.isFinite(checkInMinutes)) {
    return { lateMinutes: 0, earlyLeaveMinutes: 0, durationMinutes: null, overnight: false, overtimeMinutes: 0 };
  }
  const overnight = isOvernight(checkInMinutes, checkOutMinutes);
  return {
    lateMinutes: lateMinutes(shift, checkInMinutes),
    earlyLeaveMinutes: earlyLeaveMinutes(shift, checkOutMinutes),
    durationMinutes: workedMinutes(checkInMinutes, checkOutMinutes),
    overnight,
    overtimeMinutes: overtimeMinutes(shift, checkOutMinutes),
  };
}

/**
 * Apakah shift sudah berakhir melewati toleransi sehingga check-out dianggap
 * terlupa. `now` = { date: 'YYYY-MM-DD', minutes } pada zona WIB.
 */
export function isCheckoutOverdue({ shiftDate, shift, checkInMinutes, checkOutMinutes, now }) {
  if (!Number.isFinite(checkInMinutes)) return false;
  if (Number.isFinite(checkOutMinutes)) return false;
  const end = shiftWindow(shift).endMinutes;
  if (now.date > shiftDate) return true;
  if (now.date < shiftDate) return false;
  return now.minutes > end + MISSING_CHECKOUT_GRACE_MINUTES;
}

/** Menit sejak jam masuk, untuk absensi yang belum check-out (0 bila belum masuk). */
export function elapsedMinutes(checkInMinutes, now) {
  if (!Number.isFinite(checkInMinutes)) return null;
  return Math.max(0, now.minutes - checkInMinutes);
}
