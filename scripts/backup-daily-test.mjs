// Uji backup harian: nama file bertanggal, retensi hanya menyentuh file milik
// proses ini, dan backup kedua di hari yang sama tidak menimpa yang pertama.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mysql from 'mysql2/promise';

const run = promisify(execFile);
const database = `dapurops_daily_${crypto.randomBytes(5).toString('hex')}`;
const dir = await fs.mkdtemp(join(tmpdir(), 'dapurops-daily-'));
const conn = await mysql.createConnection({ host: '127.0.0.1', user: 'root' });
await conn.query(`CREATE DATABASE \`${database}\``);
await conn.query(`USE \`${database}\``);
try {
  await conn.query('CREATE TABLE evidence (id INT PRIMARY KEY, note TEXT, photo LONGBLOB) ENGINE=InnoDB');
  await conn.query("INSERT INTO evidence VALUES (1, 'dapur ✓', ?)", [Buffer.from([1, 2, 3])]);
  const env = {
    ...process.env,
    DB_HOST: '127.0.0.1',
    DB_USER: 'root',
    DB_PASSWORD: '',
    DB_NAME: database,
    BACKUP_PATH: dir,
    BACKUP_KEEP_DAYS: '14',
    BACKUP_VERIFY_HOST: '127.0.0.1',
    BACKUP_VERIFY_USER: 'root',
    WEBROOT: dir,
  };

  const first = await run(process.execPath, ['scripts/backup-daily.mjs'], { env, cwd: process.cwd(), timeout: 300_000 });
  const parsed = JSON.parse(first.stdout.trim().split(/\r?\n/).pop());
  assert.equal(parsed.status, 'PASS');
  assert.match(parsed.file, /dapurops-\d{8}\.sql$/);
  assert.equal(parsed.restore, 'PASS', 'drill restore ikut dijalankan');
  assert.ok(parsed.insideWebroot, 'peringatan bila folder backup berada di dalam webroot');

  // Backup kedua di hari yang sama tidak boleh menimpa.
  await assert.rejects(
    () => run(process.execPath, ['scripts/backup-daily.mjs'], { env, cwd: process.cwd(), timeout: 300_000 }),
    (err) => /sudah ada/.test(String(err.stderr || err.message))
  );

  // File asing & backup baru tidak boleh terhapus; backup tua milik kita dihapus.
  const foreign = join(dir, 'catatan-penting.txt');
  await fs.writeFile(foreign, 'jangan hapus');
  const oldOwn = join(dir, 'dapurops-20200101.sql');
  await fs.writeFile(oldOwn, '-- old');
  await fs.writeFile(`${oldOwn}.json`, '{}');
  const old = new Date(Date.now() - 30 * 86_400_000);
  await fs.utimes(oldOwn, old, old);
  await fs.utimes(`${oldOwn}.json`, old, old);

  const second = await run(process.execPath, ['scripts/backup-daily.mjs', '--no-verify'], {
    env: { ...env, BACKUP_PATH: join(dir, 'kedua') },
    cwd: process.cwd(),
    timeout: 300_000,
  });
  assert.equal(JSON.parse(second.stdout.trim().split(/\r?\n/).pop()).restore, 'SKIPPED');

  // Jalankan retensi lewat modul yang sama (dipanggil tidak langsung): panggil ulang
  // dengan folder lama setelah menghapus file hari ini agar bisa menulis lagi.
  const todayFile = parsed.file;
  await fs.rm(todayFile, { force: true });
  await fs.rm(`${todayFile}.json`, { force: true });
  const third = await run(process.execPath, ['scripts/backup-daily.mjs', '--no-verify'], { env, cwd: process.cwd(), timeout: 300_000 });
  const thirdParsed = JSON.parse(third.stdout.trim().split(/\r?\n/).pop());
  assert.equal(thirdParsed.removed, 2, 'backup lama + manifestnya dihapus retensi');
  await assert.rejects(() => fs.access(oldOwn), 'backup kedaluwarsa dihapus');
  await fs.access(foreign); // file asing tetap ada
  await fs.access(thirdParsed.file);

  console.log(JSON.stringify({ daily: 'PASS', file: thirdParsed.file, retention: 'hanya file milik proses', restore: 'PASS' }));
} finally {
  await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await conn.end();
  await fs.rm(dir, { recursive: true, force: true });
}
