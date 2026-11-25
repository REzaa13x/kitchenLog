// Uji nyata MySQL + HTTP untuk Rekap Pekerjaan per shift:
// katalog tugas opening/closing, centang per staf, isolasi antar staf, dan validasi.
import assert from 'node:assert/strict';
import express from 'express';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { registerExtraRoutes } from '../server/routes-extra.js';
import { createGeasteats } from '../server/geasteats.js';
import { registerPhotos } from '../server/photos.js';
import { registerOperations } from '../server/operations.js';
import { SHIFT_TASKS } from '../server/shift-tasks.js';

const DB = { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true };
const DB_NAME = `kl_tasks_${crypto.randomBytes(4).toString('hex')}`;
const root = await mysql.createConnection({ ...DB, database: undefined });

async function runSqlFile(path, conn) {
  const raw = await fs.readFile(path, 'utf8');
  // Buang komentar baris lebih dulu: komentar bisa memuat titik koma yang
  // membuat pemisahan statement salah.
  const sql = raw
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  // Buang statement CREATE DATABASE / USE (bisa multi-baris) agar fixture tidak
  // pernah menyentuh database lain.
  const statements = sql
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^(CREATE\s+DATABASE|USE)\b/i.test(s));
  for (const statement of statements) await conn.query(statement);
}

const app = express();
app.use(express.json({ limit: '8mb' }));

try {
  await root.query(`CREATE DATABASE ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const schema = await mysql.createConnection({ ...DB, database: DB_NAME });
  const pool = mysql.createPool({ ...DB, database: DB_NAME, waitForConnections: true, connectionLimit: 4 });
  await runSqlFile('database/dapurops-schema.sql', schema);
  for (const file of [
    'database/migrations/20261123-staff-accounts.sql',
    'database/migrations/20261123-attendance-cleanliness.sql',
    'database/migrations/20261125-geasteats.sql',
    'database/migrations/20261125-photos.sql',
    'database/migrations/20261126-operations.sql',
    'database/migrations/20261127-shift-tasks.sql',
  ]) {
    await runSqlFile(file, schema);
  }

  registerPhotos(app, { getPool: () => pool, requireAuth: (req, res, next) => next(), uid: (p) => `${p}_${crypto.randomBytes(6).toString('hex')}` });
  registerOperations(app, { getPool: () => pool, requireAuth: (req, res, next) => next(), loadWorkspace: async () => ({ isSupervisor: true }), uid: (p) => `${p}_${crypto.randomBytes(6).toString('hex')}` });
  registerExtraRoutes(app, { getPool: () => pool, requireAuth: (req, res, next) => next(), uid: (p) => `${p}_${crypto.randomBytes(6).toString('hex')}` });
  void createGeasteats;

  // Rute rekap pekerjaan (sama seperti di server/index.js) dipasang ulang di sini
  // agar bisa diuji tanpa mengimpor seluruh index.js.
  const { SHIFT_TASKS: TASKS, findTask } = await import('../server/shift-tasks.js');
  const uid = (p) => `${p}_${crypto.randomBytes(6).toString('hex')}`;
  app.get('/api/shift-tasks', async (req, res) => {
    const { workspaceId, date, shift } = req.query;
    const [rows] = await pool.query(
      'SELECT staff_id, task_key, done FROM shift_task_progress WHERE workspace_id = ? AND task_date = ? AND shift = ?',
      [workspaceId, date, shift]
    );
    res.json({ tasks: TASKS[shift] ?? [], progress: rows.map((r) => ({ staffId: r.staff_id, taskKey: r.task_key, done: Boolean(r.done) })) });
  });
  app.patch('/api/shift-tasks', async (req, res) => {
    const { workspaceId, date, shift, taskKey, done, staffId } = req.body;
    if (!findTask(shift, taskKey)) return res.status(400).json({ error: 'Tugas tidak dikenal untuk shift ini.' });
    await pool.query(
      `INSERT INTO shift_task_progress (id, workspace_id, task_date, shift, staff_id, task_key, done)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE done = VALUES(done)`,
      [uid('stp'), workspaceId, date, shift, staffId, taskKey, done ? 1 : 0]
    );
    res.json({ ok: true });
  });

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const today = '2026-11-25';

  // Katalog: opening sesuai daftar operasional, closing punya cakupan setara.
  assert.equal(SHIFT_TASKS.opening.length, 7, 'opening 7 tugas');
  assert.equal(SHIFT_TASKS.closing.length, 7, 'closing 7 tugas');
  assert.ok(SHIFT_TASKS.opening.some((t) => /Masak nasi 2 rice cooker/i.test(t.label)), 'tugas masak nasi ada');
  assert.ok(SHIFT_TASKS.opening.some((t) => /Marinasi ayam/i.test(t.label)), 'tugas marinasi ada');
  const keys = new Set(SHIFT_TASKS.opening.map((t) => t.key));
  assert.equal(keys.size, SHIFT_TASKS.opening.length, 'key opening unik');

  const get = async (shift = 'opening') => (await fetch(`${base}/shift-tasks?workspaceId=ws&date=${today}&shift=${shift}`)).json();
  const patch = async (body) => {
    const res = await fetch(`${base}/shift-tasks`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: 'ws', date: today, shift: 'opening', ...body }) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  let data = await get();
  assert.equal(data.tasks.length, 7);
  assert.equal(data.progress.length, 0, 'belum ada progres');

  // Centang satu tugas untuk staf A.
  assert.equal((await patch({ taskKey: 'masak-nasi', done: true, staffId: 'staf-a' })).status, 200);
  data = await get();
  assert.equal(data.progress.filter((p) => p.done).length, 1);
  assert.equal(data.progress[0].staffId, 'staf-a');

  // Staf B centang tugas lain: progres A tidak tertimpa.
  assert.equal((await patch({ taskKey: 'marinasi-ayam', done: true, staffId: 'staf-b' })).status, 200);
  data = await get();
  assert.equal(data.progress.length, 2, 'progres dua staf terpisah');
  assert.equal(data.progress.find((p) => p.staffId === 'staf-a')?.taskKey, 'masak-nasi');

  // Membatalkan centang (done=false) menyimpan status, bukan menghapus baris.
  assert.equal((await patch({ taskKey: 'masak-nasi', done: false, staffId: 'staf-a' })).status, 200);
  data = await get();
  const aRow = data.progress.find((p) => p.staffId === 'staf-a');
  assert.equal(aRow.done, false, 'centang bisa dibatalkan');

  // Shift closing punya daftar sendiri.
  const closing = await get('closing');
  assert.equal(closing.tasks.length, 7);
  assert.notEqual(closing.tasks[0].key, SHIFT_TASKS.opening[0].key, 'closing bukan salinan opening');

  // Validasi: key tidak dikenal ditolak.
  assert.equal((await patch({ taskKey: 'tugas-ngawur', done: true, staffId: 'staf-a' })).status, 400);

  server.close();
  await pool.end();
  await schema.end();
  console.log(JSON.stringify({ tasks: 'PASS', isolation: 'PASS', closing: 'PASS', validation: 'PASS' }));
} finally {
  await root.query(`DROP DATABASE IF EXISTS ${DB_NAME}`).catch(() => {});
  await root.end();
}
