// Uji: Admin tidak boleh masuk jadwal shift (aturan server, bukan hanya UI).
import assert from 'node:assert/strict';
import express from 'express';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { registerExtraRoutes } from '../server/routes-extra.js';

const DB = { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '' };
const DB_NAME = `kl_sched_${crypto.randomBytes(4).toString('hex')}`;
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

  const ADMIN_ID = 'u_supervisor_75d4f29fee493805';
  const ADMIN_EMAIL = 'admin@gmail.com';
  await conn.query(
    "INSERT INTO workspaces (id,kitchen_name,owner_id,owner_email,member_emails,supervisor_emails) VALUES ('ws','Dapur Uji',?,?,'admin@gmail.com,staf1@gmail.com,staf2@gmail.com','admin@gmail.com')",
    [ADMIN_ID, ADMIN_EMAIL]
  );
  await conn.query("INSERT INTO users (id,email,username,password_hash,name,role,job_title) VALUES (?,?,'admin','x','Admin','supervisor','Admin Operasional')", [ADMIN_ID, ADMIN_EMAIL]);
  await conn.query("INSERT INTO staff (id,workspace_id,name,email,role,job_title) VALUES (?,'ws','Admin','?','supervisor','Admin Operasional')".replace("'?',", '?,'), [ADMIN_ID, ADMIN_EMAIL]).catch(async () => {
    await conn.query("INSERT INTO staff (id,workspace_id,name,email,role,job_title) VALUES (?,'ws','Admin',?,'supervisor','Admin Operasional')", [ADMIN_ID, ADMIN_EMAIL]);
  });
  await conn.query("INSERT INTO staff (id,workspace_id,name,email,role,job_title) VALUES ('s1','ws','Staf Satu','staf1@gmail.com','staff','Koki')");
  await conn.query("INSERT INTO staff (id,workspace_id,name,email,role,job_title) VALUES ('s2','ws','Staf Dua','staf2@gmail.com','staff','Koki')");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: ADMIN_ID, email: ADMIN_EMAIL, name: 'Admin' }; next(); });
  const uid = (p) => `${p}_${crypto.randomBytes(6).toString('hex')}`;
  registerExtraRoutes(app, {
    getPool: () => pool,
    requireAuth: (req, res, next) => next(),
    loadWorkspace: async () => {
      const [[ws]] = await pool.query('SELECT * FROM workspaces WHERE id = ?', ['ws']);
      return { ws, isSupervisor: true };
    },
    uid,
    wibNow: () => ({ date: '2026-11-25', time: '08:00' }),
    isEmail: (v) => /^[^@\s]+@[^@\s]+$/.test(v),
    hashPassword: (p) => `h:${p}`,
  });

  const server = app.listen(0);
  // Router dipasang pada prefix /api.
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = async (body) => {
    const res = await fetch(`${base}/assignments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  // 1. Admin tidak boleh dijadwalkan sebagai staf.
  const withAdmin = await post({ workspaceId: 'ws', date: '2026-11-25', shift: 'opening', staffIds: [ADMIN_ID, 's1'], picId: 's1' });
  assert.equal(withAdmin.status, 400, 'Admin ditolak sebagai anggota jadwal');
  assert.match(withAdmin.body.error, /Admin tidak dapat dijadwalkan/i);

  // 2. Admin tidak boleh menjadi PIC.
  const adminPic = await post({ workspaceId: 'ws', date: '2026-11-25', shift: 'opening', staffIds: ['s1', 's2'], picId: ADMIN_ID });
  assert.equal(adminPic.status, 400, 'Admin ditolak sebagai PIC');

  // 3. Staf biasa tetap bisa dijadwalkan.
  const ok = await post({ workspaceId: 'ws', date: '2026-11-25', shift: 'opening', staffIds: ['s1', 's2'], picId: 's1' });
  assert.equal(ok.status, 201, 'jadwal staf biasa tersimpan');
  const [[row]] = await pool.query("SELECT staff_ids, pic_id FROM assignments WHERE workspace_id='ws' AND shift_date='2026-11-25' AND shift='opening'");
  assert.equal(row.staff_ids, 's1,s2');
  assert.equal(row.pic_id, 's1');
  assert.ok(!String(row.staff_ids).includes(ADMIN_ID), 'tidak ada id Admin di jadwal');

  server.close();
  await pool.end();
  await conn.end();
  console.log(JSON.stringify({ adminAsStaff: 'rejected', adminAsPic: 'rejected', staffSchedule: 'PASS' }));
} finally {
  await root.query(`DROP DATABASE IF EXISTS ${DB_NAME}`).catch(() => {});
  await root.end();
}
