// Uji backup + restore pada database nyata hasil migrasi DapurOps.
// Membuat DB disposable, mengisi data operasional, membackup, menghapus data,
// lalu memulihkan dan membandingkan jumlah baris + isi bukti foto.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import mysql from 'mysql2/promise';

const run = promisify(execFile);
const database = `dapurops_backup_test_${crypto.randomBytes(5).toString('hex')}`;
const outDir = await fs.mkdtemp((await import('node:os')).tmpdir() + '/dapurops-backup-');
const sqlFile = `${outDir}/backup.sql`;
const env = {
  ...process.env,
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_USER: 'root',
  DB_PASSWORD: '',
  DB_NAME: database,
  BACKUP_VERIFY_HOST: '127.0.0.1',
  BACKUP_VERIFY_PORT: '3306',
  BACKUP_VERIFY_USER: 'root',
  BACKUP_VERIFY_PASSWORD: '',
};

const conn = await mysql.createConnection({ host: '127.0.0.1', user: 'root' });
await conn.query(`CREATE DATABASE \`${database}\``);
await conn.query(`USE \`${database}\``);
try {
  // Skema + seluruh migrasi (termasuk migrasi operasional baru).
  const schema = await fs.readFile(new URL('../database/dapurops-schema.sql', import.meta.url), 'utf8');
  for (const sql of schema.replace(/CREATE DATABASE IF NOT EXISTS[\s\S]*?;/, '').replace(/USE `ngola_dapurops`;/, '').split(';')) if (sql.trim()) await conn.query(sql);
  for (const file of ['20261123-staff-accounts.sql', '20261123-attendance-cleanliness.sql', '20261125-geasteats.sql', '20261125-photos.sql', '20261126-operations.sql']) {
    for (const sql of (await fs.readFile(new URL(`../database/migrations/${file}`, import.meta.url), 'utf8')).split(';')) if (sql.trim()) await conn.query(sql);
  }

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
  await conn.query("INSERT INTO users (id,email,password_hash,name,role) VALUES ('admin','admin@gmail.com','scrypt$x','Admin','supervisor'),('cook','cook@test.invalid','scrypt$y','Siti','staff')");
  await conn.query("INSERT INTO workspaces (id,kitchen_name,owner_id,owner_email,member_emails,supervisor_emails) VALUES ('ws','Dapur Uji','admin','admin@gmail.com','admin@gmail.com,cook@test.invalid','admin@gmail.com')");
  await conn.query("INSERT INTO staff (id,workspace_id,name,email,role,job_title) VALUES ('s1','ws','Siti','cook@test.invalid','staff','Cook')");
  await conn.query("INSERT INTO assignments (id,workspace_id,shift_date,shift,staff_ids,pic_id) VALUES ('a1','ws','2026-11-25','opening','cook','cook')");
  await conn.query("INSERT INTO attendance (id,workspace_id,assignment_id,att_date,shift,staff_id,staff_email,check_in_time,check_in_minutes,late_minutes,overnight) VALUES ('att1','ws','a1','2026-11-25','opening','cook','cook@test.invalid','06:15',375,15,0)");
  await conn.query("INSERT INTO private_photos (workspace_id,id,user_id,source,mime_type,data) VALUES ('ws','face1','cook','camera','image/png',?)", [png]);
  await conn.query("INSERT INTO attendance_audit (id,workspace_id,attendance_id,action,actor_id,actor_email,actor_name,reason,before_json,after_json) VALUES ('aud1','ws','att1','correction','admin','admin@gmail.com','Admin','Uji audit','{\"lateMinutes\":15}','{\"lateMinutes\":0}')");
  await conn.query("INSERT INTO cleanliness_followups (id,workspace_id,report_id,area_key,area_label,note,status,pic_id,pic_email,pic_name) VALUES ('fu1','ws','r1','lantai','Lantai','Basah','Perlu Ditangani','cook','cook@test.invalid','Siti')");

  const counts = async () => {
    const tables = ['users', 'workspaces', 'staff', 'assignments', 'attendance', 'private_photos', 'attendance_audit', 'cleanliness_followups'];
    const result = {};
    for (const t of tables) result[t] = Number((await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``))[0][0].n);
    return result;
  };
  const before = await counts();

  const backupRun = await run(process.execPath, ['scripts/backup-verify.mjs', 'backup', sqlFile], { env, cwd: process.cwd() });
  assert.match(backupRun.stdout, /"backup":"PASS"/);

  // Rusak data (simulasi kehilangan): hapus bukti foto + absensi.
  await conn.query('DELETE FROM private_photos');
  await conn.query('DELETE FROM attendance');
  const damaged = await counts();
  assert.equal(damaged.private_photos, 0);
  assert.equal(damaged.attendance, 0);

  const verifyRun = await run(process.execPath, ['scripts/backup-verify.mjs', 'verify', sqlFile], { env, cwd: process.cwd() });
  assert.match(verifyRun.stdout, /"restore":"PASS"/);
  assert.match(verifyRun.stdout, /"tables":12/, 'seluruh 12 tabel skema + migrasi ikut terpulihkan');

  // Verifikasi restore tidak menyentuh DB sumber (drill memakai DB disposable).
  assert.deepEqual(await counts(), damaged, 'verify tidak menimpa database sumber');

  // Pemulihan nyata: import backup ke DB yang sama seperti prosedur darurat.
  const mysqlBin = process.platform === 'win32' ? 'C:/xampp/mysql/bin/mysql.exe' : 'mysql';
  const dump = await fs.readFile(sqlFile, 'utf8');
  // Buang pernyataan pembuatan/ penggunaan database agar menimpa DB uji yang sama.
  const statements = dump.split(/;\r?\n/).filter((s) => s.trim() && !/^CREATE DATABASE/i.test(s.trim()) && !/^USE /i.test(s.trim()));
  await conn.query('SET FOREIGN_KEY_CHECKS=0');
  for (const statement of statements) {
    const text = statement.trim();
    if (!text) continue;
    await conn.query(text).catch((err) => {
      // Index/FK tambahan boleh gagal bila sudah ada setelah restore tabel.
      if (!/Duplicate key name|already exists/i.test(err.message)) throw err;
    });
  }
  await conn.query('SET FOREIGN_KEY_CHECKS=1');

  const after = await counts();
  assert.deepEqual(after, before, 'semua tabel pulih ke jumlah baris semula');
  const [[photo]] = await conn.query("SELECT data FROM private_photos WHERE id='face1'");
  assert.ok(Buffer.compare(Buffer.from(photo.data), png) === 0, 'bukti foto byte-identik setelah restore');
  const [[auditRow]] = await conn.query("SELECT reason FROM attendance_audit WHERE id='aud1'");
  assert.equal(auditRow.reason, 'Uji audit', 'jejak audit ikut pulih');
  const [[att]] = await conn.query("SELECT check_in_time, late_minutes FROM attendance WHERE id='att1'");
  assert.equal(att.check_in_time, '06:15');

  console.log(JSON.stringify({ restore: 'PASS', tables: Object.keys(before).length, rows: Object.values(before).reduce((a, b) => a + b, 0), photo: 'byte-identical', audit: 'preserved' }));
} finally {
  await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await conn.end();
  await fs.rm(outDir, { recursive: true, force: true });
}
