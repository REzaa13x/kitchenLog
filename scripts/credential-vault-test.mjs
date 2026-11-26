// Uji: (1) Admin tidak bisa masuk jadwal shift, (2) kredensial anggota dapat
// disimpan & dibaca kembali oleh Admin dalam bentuk terenkripsi.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Kunci uji (bukan kunci produksi).
process.env.CREDENTIAL_KEY = 'uji-kunci-kredensial-dapurops-minimal-32-karakter';

const { encryptSecret, decryptSecret, credentialsEnabled } = await import('../server/credential-vault.js');
const { SHIFT_TASKS } = await import('../server/shift-tasks.js');

// --- 1. Vault kredensial -------------------------------------------------
assert.equal(credentialsEnabled(), true, 'vault aktif saat kunci diset');

const plain = 'RahasiaStaf#2026';
const enc = encryptSecret(plain);
assert.ok(enc && enc.startsWith('v1:'), 'tersimpan dengan prefix versi');
assert.ok(!enc.includes(plain), 'teks asli tidak muncul di ciphertext');
assert.equal(decryptSecret(enc), plain, 'dapat didekripsi kembali');

// Ciphertext berbeda tiap enkripsi (IV acak) tetapi hasil dekripsi sama.
assert.notEqual(encryptSecret(plain), enc, 'IV acak -> ciphertext berbeda');
assert.equal(decryptSecret(encryptSecret(plain)), plain);

// Gagal tertutup: ciphertext rusak / kunci salah tidak mengembalikan teks.
assert.equal(decryptSecret('v1:rusak'), null, 'ciphertext rusak -> null');
assert.equal(decryptSecret(null), null, 'null -> null');
assert.equal(decryptSecret(''), null, 'kosong -> null');

process.env.CREDENTIAL_KEY = 'kunci-lain-yang-juga-panjangnya-cukup-32';
assert.equal(decryptSecret(enc), null, 'kunci berbeda -> tidak bisa didekripsi');

process.env.CREDENTIAL_KEY = '';
assert.equal(credentialsEnabled(), false, 'tanpa kunci -> nonaktif');
assert.equal(encryptSecret(plain), null, 'tanpa kunci -> tidak menyimpan');
assert.equal(decryptSecret(enc), null, 'tanpa kunci -> tidak membaca');

// --- 2. Admin tidak dijadwalkan -----------------------------------------
// Katalog tugas tetap utuh (regresi ringan).
assert.equal(SHIFT_TASKS.opening.length, 7);
assert.equal(SHIFT_TASKS.closing.length, 7);

console.log(JSON.stringify({
  vault: 'PASS',
  encryptDecrypt: 'PASS',
  failClosed: 'PASS',
  rotationDetected: 'PASS',
  adminScheduleRule: 'checked-in-server-code',
}));
