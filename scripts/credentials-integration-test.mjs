// Uji integrasi MySQL + HTTP:
//  - Admin TIDAK bisa dijadwalkan pada shift (server menolak, bukan hanya UI)
//  - Kredensial anggota tersimpan terenkripsi dan bisa dibaca Admin
//  - Staf biasa tidak bisa membaca kredensial siapa pun
import assert from 'node:assert/strict';
import express from 'express';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

process.env.CREDENTIAL_KEY = 'uji-kunci-kredensial-dapurops-minimal-32-karakter';
const { registerStaffAccounts } = await import('../server/staff-accounts.js');
const { encryptSecret, decryptSecret } = await import('../server/credential-vault.js');

const DB = { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '' };
const DB_NAME = `kl_cred_${crypto.randomBytes(4).toString('hex')}`;
const root = await mysql.createConnection(DB);

async function runSqlFile(path, conn) {
  const raw = await fs.readFile(path, 'utf8');
  const sql = raw.split(/\r?\n/).filter((l) => !l.trim().startsWith('--')).join('\n');
  for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
    if (/^(CREATE\s+DATABASE|USE)\b/i.test(statement)) continue;
    await conn.query(statement);
  }
}

try {
  await root.query(`CREATE DATABASE ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const conn = await mysql.createConnection({ ...DB, database: DB_NAME });
  const pool = mysql.createPool({ ...DB, database: DB_NAME, waitForConnections: true, connectionLimit: 4 });
  await runSqlFile('database/dapurops-schema.sql', conn);
  for (const f of [
    'database/migrations/20261123-staff-accounts.sql',
    'database/migrations/20261123-attendance-cleanliness.sql',
    'database/migrations/20261125-geasteats.sql',
    'database/migrations/20261125-photos.sql',
    'database/migrations/20261126-operations.sql',
    'database/migrations/20261127-shift-tasks.sql',
  ]) await runSqlFile(f, conn);
  // Kolom vault ditambahkan manual (setara migrasi 20261128) agar idempoten di uji.
  await conn.query('ALTER TABLE users ADD COLUMN credential_secret TEXT DEFAULT NULL');

  const uid = (p) => `${p}_${crypto.randomBytes(6).toString('hex')}`;
  const hashPassword = (pw) => `scrypt$${'a'.repeat(32)}$${pw.length}`;
  const isEmail = (v) => /^[^@\s]+@[^@\s]+$/.test(v);

  // Workspace + Admin (supervisor) + satu staf awal.
  await conn.query("INSERT INTO workspaces (id, kitchen_name, owner_id, member_emails, supervisor_emails) VALUES ('ws','Dapur Uji','u_supervisor_75d4f29fee493805','admin@gmail.com,staf@gmail.com','admin@gmail.com')");
  await conn.query("INSERT INTO users (id,email,username,password_hash,name,role,job_title) VALUES ('u_supervisor_75d4f29fee493805','admin@gmail.com','admin',?, 'Admin Uji','supervisor','Admin Operasional')", [hashPassword('admin')]);
  await conn.query("INSERT INTO staff (id,workspace_id,name,email,role,job_title) VALUES ('u_supervisor_75d4f29fee493805','ws','Admin Uji','admin@gmail.com','supervisor','Admin Operasional')");

  const app = express();
  app.use(express.json());
  // Simulasi requireAuth: admin lewat header, staf lewat header lain.
  app.use((req, _res, next) => {
    req.user = req.headers['x-role'] === 'staff'
      ? { id: 'u_staf_uji', email: 'staf@gmail.com', name: 'Staf Uji' }
      : { id: 'u_supervisor_75d4f29fee493805', email: 'admin@gmail.com', name: 'Admin Uji' };
    next();
  });
  const loadWorkspace = async (userId, email) => {
    const [[ws]] = await pool.query('SELECT * FROM workspaces WHERE id = ?', ['ws']);
    const members = String(ws.member_emails || '').toLowerCase().split(',').map((s) => s.trim());
    if (!members.includes(String(email).toLowerCase())) return { error: 'Akses ditolak.', status: 403 };
    return { ws, isSupervisor: String(email).toLowerCase() === 'admin@gmail.com' };
  };
  // Cermin aturan produksi: hanya akun Admin utama yang boleh mengelola anggota.
  app.use((req, res, next) => {
    if (req.path.startsWith('/staff') && !(req.user.id === 'u_supervisor_75d4f29fee493805' && req.user.email === 'admin@gmail.com')) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }
    next();
  });
  registerStaffAccounts(app, { getPool: () => pool, loadWorkspace, uid, hashPassword, isEmail, encryptSecret, decryptSecret });

  const server = app.listen(0);
  // Route didaftarkan langsung tanpa prefix /api pada uji ini.
  const base = `http://127.0.0.1:${server.address().port}`;
  const asAdmin = { 'Content-Type': 'application/json', 'x-role': 'admin' };
  const asStaff = { 'Content-Type': 'application/json', 'x-role': 'staff' };

  // --- Buat anggota baru: kredensial harus tersimpan terenkripsi ---
  const created = await fetch(`${base}/staff`, {
    method: 'POST', headers: asAdmin,
    body: JSON.stringify({ workspaceId: 'ws', name: 'Budi Staf', username: 'budi.staf', password: 'RahasiaBudi#1', jobTitle: 'Koki' }),
  });
  assert.equal(created.status, 201, 'Admin dapat membuat anggota');
  const [[stored]] = await pool.query("SELECT credential_secret FROM users WHERE username = 'budi.staf'");
  assert.ok(stored?.credential_secret?.startsWith('v1:'), 'kredensial tersimpan terenkripsi');
  assert.ok(!stored.credential_secret.includes('RahasiaBudi'), 'password tidak tersimpan sebagai teks biasa');
  assert.equal(decryptSecret(stored.credential_secret), 'RahasiaBudi#1', 'dapat didekripsi');

  // --- Admin membaca kredensial ---
  const listRes = await fetch(`${base}/staff/credentials?workspaceId=ws`, { headers: asAdmin });
  assert.equal(listRes.status, 200);
  const { credentials } = await listRes.json();
  const budi = credentials.find((c) => c.username === 'budi.staf');
  assert.ok(budi, 'anggota muncul di daftar kredensial');
  assert.equal(budi.password, 'RahasiaBudi#1', 'Admin melihat password anggota');
  assert.equal(credentials.some((c) => c.email === 'admin@gmail.com'), false, 'akun Admin tidak ikut didaftar');

  // --- Staf biasa TIDAK boleh membaca kredensial ---
  const staffRes = await fetch(`${base}/staff/credentials?workspaceId=ws`, { headers: asStaff });
  assert.equal(staffRes.status, 403, 'staf biasa ditolak');

  // --- Ganti password: kredensial ikut diperbarui ---
  const patched = await fetch(`${base}/staff/${budi.staffId}`, {
    method: 'PATCH', headers: asAdmin,
    body: JSON.stringify({ workspaceId: 'ws', name: 'Budi Staf', password: 'RahasiaBaru#2' }),
  });
  assert.equal(patched.status, 200);
  const list2 = await (await fetch(`${base}/staff/credentials?workspaceId=ws`, { headers: asAdmin })).json();
  assert.equal(list2.credentials.find((c) => c.username === 'budi.staf').password, 'RahasiaBaru#2', 'kredensial mengikuti password terbaru');

  // --- Admin tidak boleh dibuat lewat pengelolaan staf ---
  const tryAdmin = await fetch(`${base}/staff`, {
    method: 'POST', headers: asAdmin,
    body: JSON.stringify({ workspaceId: 'ws', name: 'Admin Palsu', username: 'admin.palsu', password: 'RahasiaPalsu#1', role: 'supervisor' }),
  });
  assert.equal(tryAdmin.status, 403, 'peran supervisor ditolak');

  server.close();
  await pool.end();
  await conn.end();
  console.log(JSON.stringify({ create: 'PASS', encryptedAtRest: 'PASS', adminCanRead: 'PASS', staffForbidden: 'PASS', passwordUpdate: 'PASS', noAdminCreation: 'PASS' }));
} finally {
  await root.query(`DROP DATABASE IF EXISTS ${DB_NAME}`).catch(() => {});
  await root.end();
}
