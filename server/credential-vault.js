// Enkripsi kredensial akun staf yang perlu bisa dilihat Admin.
//
// Kenapa tidak memakai hash? Password login disimpan sebagai hash scrypt (satu
// arah) sehingga mustahil ditampilkan kembali. Untuk kebutuhan operasional
// (Admin menyalin ulang kredensial saat staf lupa), password disimpan TERPISAH
// dalam bentuk terenkripsi dua arah dengan kunci dari environment.
//
// Kunci: CREDENTIAL_KEY (bebas, minimal 32 karakter). Turunan AES-256-GCM
// memakai scrypt sehingga kunci panjang/pendek sama kuatnya.
// Bila CREDENTIAL_KEY tidak diset, fitur ini NONAKTIF (gagal tertutup):
// akun tetap bisa dibuat, hanya kredensial tidak dapat ditampilkan lagi.
import crypto from 'node:crypto';

const PREFIX = 'v1:';
const SALT = 'dapurops-credential-v1';

function key() {
  const raw = process.env.CREDENTIAL_KEY;
  if (typeof raw !== 'string' || raw.length < 32) return null;
  return crypto.scryptSync(raw, SALT, 32, { N: 16384, r: 8, p: 1 });
}

export function credentialsEnabled() {
  return key() !== null;
}

/** Enkripsi teks; mengembalikan null bila kunci belum diset. */
export function encryptSecret(plain) {
  const k = key();
  if (!k || typeof plain !== 'string' || !plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/** Dekripsi; mengembalikan null bila tidak valid atau kunci berubah. */
export function decryptSecret(payload) {
  const k = key();
  if (!k || typeof payload !== 'string' || !payload.startsWith(PREFIX)) return null;
  try {
    const buf = Buffer.from(payload.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', k, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
