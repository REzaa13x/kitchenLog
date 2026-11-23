/**
 * Validasi untuk form Masuk / Daftar.
 *
 * Semua fungsi murni (tanpa efek samping) supaya bisa diuji langsung dan
 * dipakai baik di klien maupun di pengujian.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_NAME_LENGTH = 100;

/** Email: cukup ketat, tanpa menolak alamat yang sah. */
export function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (email.length < 3 || email.length > 200) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/**
 * Nomor telepon Indonesia.
 * Menerima: 08123456789, 0812-3456-789, +628123456789, 628123456789.
 * Disimpan dalam bentuk ternormalisasi: 08xxxxxxxxxx
 */
export function normalizePhone(value: string): string {
  let digits = value.replace(/[^\d+]/g, '');
  if (digits.startsWith('+62')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('62')) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith('8')) digits = `0${digits}`;
  return digits.replace(/\D/g, '');
}

export function isValidPhone(value: string): boolean {
  const n = normalizePhone(value);
  // Nomor seluler Indonesia: 08 + 8–11 digit
  return /^08\d{8,11}$/.test(n);
}

export interface PasswordCheck {
  length: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
  notCommon: boolean;
}

const COMMON_PASSWORDS = [
  'password', 'password1', '12345678', '123456789', 'qwerty123', 'iloveyou',
  'admin123', 'letmein1', 'welcome1', 'kitchenlog',
];

export function checkPassword(value: string): PasswordCheck {
  const lower = value.toLowerCase();
  return {
    length: value.length >= MIN_PASSWORD_LENGTH,
    hasLetter: /[a-zA-Z]/.test(value),
    hasNumber: /\d/.test(value),
    notCommon: value.length > 0 && !COMMON_PASSWORDS.includes(lower),
  };
}

export function isStrongPassword(value: string): boolean {
  const c = checkPassword(value);
  return c.length && c.hasLetter && c.hasNumber && c.notCommon;
}

export function isValidName(value: string): boolean {
  const name = value.trim();
  return name.length >= 2 && name.length <= MAX_NAME_LENGTH;
}

export interface SignupErrors {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirm?: string;
}

export function validateSignup(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirm: string;
}): SignupErrors {
  const errors: SignupErrors = {};

  if (!isValidName(input.name)) {
    errors.name = 'Nama minimal 2 karakter.';
  }
  if (!isValidEmail(input.email)) {
    errors.email = 'Format email tidak valid. Contoh: nama@dapur.com';
  }
  if (!isValidPhone(input.phone)) {
    errors.phone = 'Nomor telepon tidak valid. Contoh: 08123456789';
  }
  if (!isStrongPassword(input.password)) {
    errors.password = `Password minimal ${MIN_PASSWORD_LENGTH} karakter serta mengandung huruf dan angka.`;
  }
  if (input.confirm !== input.password) {
    errors.confirm = 'Konfirmasi password belum sama.';
  }
  return errors;
}

export function validateLogin(input: { email: string; password: string }): {
  email?: string;
  password?: string;
} {
  const errors: { email?: string; password?: string } = {};
  if (!isValidEmail(input.email)) {
    errors.email = 'Format email tidak valid.';
  }
  if (!input.password) {
    errors.password = 'Password wajib diisi.';
  }
  return errors;
}

/**
 * Menerjemahkan kode error Firebase Auth menjadi pesan yang bisa ditindaklanjuti.
 * Pesan asli tetap dikembalikan pada bagian akhir agar tidak menyembunyikan info.
 */
export function mapAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const code = (err as { code?: string })?.code ?? '';

  const known: Array<[RegExp, string]> = [
    [
      /operation-not-allowed|OPERATION_NOT_ALLOWED/i,
      'Metode masuk Email/Password belum diaktifkan. Aktifkan dulu di Firebase Console → Authentication → Sign-in method → Email/Password.',
    ],
    [
      /unauthorized-domain/i,
      'Domain ini belum diizinkan di Firebase Console → Authentication → Settings → Authorized domains.',
    ],
    [
      /email-already-in-use|EMAIL_EXISTS/i,
      'Email ini sudah terdaftar. Silakan masuk, atau gunakan fitur lupa password.',
    ],
    [
      /invalid-email|INVALID_EMAIL/i,
      'Format email tidak valid.',
    ],
    [
      /weak-password|WEAK_PASSWORD/i,
      `Password terlalu lemah. Gunakan minimal ${MIN_PASSWORD_LENGTH} karakter berisi huruf dan angka.`,
    ],
    [
      /wrong-password|invalid-credential|INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/i,
      'Email atau password salah.',
    ],
    [
      /user-not-found|EMAIL_NOT_FOUND/i,
      'Akun dengan email ini belum terdaftar.',
    ],
    [
      /too-many-requests|TOO_MANY_ATTEMPTS_TRY_LATER/i,
      'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.',
    ],
    [
      /user-disabled|USER_DISABLED/i,
      'Akun ini dinonaktifkan.',
    ],
    [
      /popup-closed-by-user|cancelled-popup-request/i,
      'Jendela login Google ditutup sebelum selesai.',
    ],
    [
      /popup-blocked/i,
      'Pop-up diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.',
    ],
    [
      /network-request-failed/i,
      'Koneksi internet bermasalah. Periksa jaringan lalu coba lagi.',
    ],
  ];

  for (const [pattern, message] of known) {
    if (pattern.test(code) || pattern.test(raw)) return message;
  }
  return raw || 'Terjadi kesalahan yang tidak dikenali. Coba lagi.';
}
