// Uji validasi form Masuk/Daftar.
import {
  checkPassword,
  isValidEmail,
  isValidPhone,
  isValidName,
  isStrongPassword,
  mapAuthError,
  normalizePhone,
  validateLogin,
  validateSignup,
} from '../src/utils/authValidation';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) console.log(`ok    ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}\n      harap: ${JSON.stringify(expected)}\n      dapat: ${JSON.stringify(actual)}`);
  }
}

// --- Email ---
check('email sah', isValidEmail('budi@dapur.com'), true);
check('email dengan titik', isValidEmail('budi.santoso@dapur.co.id'), true);
check('email tanpa @', isValidEmail('budidapur.com'), false);
check('email tanpa domain', isValidEmail('budi@'), false);
check('email kosong', isValidEmail(''), false);
check('email spasi di tengah', isValidEmail('bu di@dapur.com'), false);

// --- Telepon ---
check('telp 08', normalizePhone('08123456789'), '08123456789');
check('telp +62', normalizePhone('+628123456789'), '08123456789');
check('telp 62', normalizePhone('628123456789'), '08123456789');
check('telp 8 tanpa 0', normalizePhone('8123456789'), '08123456789');
check('telp dengan strip', normalizePhone('0812-3456-789'), '08123456789');
check('telp dengan spasi', normalizePhone('0812 3456 789'), '08123456789');
check('telp sah', isValidPhone('08123456789'), true);
check('telp +62 sah', isValidPhone('+628123456789'), true);
check('telp terlalu pendek', isValidPhone('0812345'), false);
check('telp bukan 08', isValidPhone('0212345678'), false);
check('telp kosong', isValidPhone(''), false);

// --- Password ---
check('pw pendek', checkPassword('abc1').length, false);
check('pw 8 huruf+angka', isStrongPassword('dapur123'), true);
check('pw tanpa angka', isStrongPassword('dapurkuat'), false);
check('pw tanpa huruf', isStrongPassword('12345678'), false);
check('pw umum ditolak', isStrongPassword('password1'), false);
check('pw kosong', isStrongPassword(''), false);

// --- Nama ---
check('nama 1 huruf', isValidName('A'), false);
check('nama 2 huruf', isValidName('Ab'), true);
check('nama kosong', isValidName('  '), false);

// --- validateSignup ---
const ok = validateSignup({
  name: 'Budi Santoso',
  email: 'budi@dapur.com',
  phone: '08123456789',
  password: 'dapur123',
  confirm: 'dapur123',
});
check('signup valid tanpa error', Object.keys(ok).length, 0);

const bad = validateSignup({
  name: 'B',
  email: 'salah',
  phone: '123',
  password: 'abc',
  confirm: 'beda',
});
check('signup tidak valid: 5 error', Object.keys(bad).sort(), ['confirm', 'email', 'name', 'password', 'phone']);

// --- validateLogin ---
check('login kosong', Object.keys(validateLogin({ email: '', password: '' })).sort(), ['email', 'password']);
check('login valid', Object.keys(validateLogin({ email: 'a@b.co', password: 'x' })).length, 0);

// --- mapAuthError ---
check(
  'error provider belum aktif',
  mapAuthError({ code: 'auth/operation-not-allowed' }).includes('belum diaktifkan'),
  true
);
check(
  'error domain',
  mapAuthError(new Error('Firebase: Error (auth/unauthorized-domain).')).includes('Authorized domains'),
  true
);
check(
  'error email dipakai',
  mapAuthError({ code: 'auth/email-already-in-use' }).includes('sudah terdaftar'),
  true
);
check(
  'error password salah',
  mapAuthError({ code: 'auth/wrong-password' }).includes('salah'),
  true
);
check(
  'error tidak dikenal tetap diteruskan',
  mapAuthError(new Error('sesuatu yang aneh')),
  'sesuatu yang aneh'
);

console.log(`\n${failures === 0 ? 'SEMUA LULUS' : `${failures} GAGAL`}`);
process.exit(failures === 0 ? 0 : 1);
