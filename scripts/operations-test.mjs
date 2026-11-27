// Uji nyata MySQL + HTTP untuk aturan shift, koreksi absensi, audit, rekap,
// ekspor CSV, dan tindak lanjut kebersihan. Tidak menyentuh ngola_dapurops.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import express from 'express';
import mysql from 'mysql2/promise';
import { registerPhotos, assertAttendancePhoto } from '../server/photos.js';
import { registerOperations } from '../server/operations.js';
import { isShift, lateMinutes, summarizeAttendance, isCheckoutOverdue, workedMinutes } from '../server/attendance-rules.js';

// ---------- Unit: aturan shift ----------
assert.equal(isShift('opening'), true);
assert.equal(isShift('malam'), false);
assert.equal(lateMinutes('opening', 6 * 60), 0, 'tepat waktu');
assert.equal(lateMinutes('opening', 6 * 60 + 17), 17, 'terlambat 17 menit');
assert.equal(lateMinutes('opening', 5 * 60 + 50), 0, 'datang lebih awal bukan negatif');
assert.equal(workedMinutes(6 * 60, 12 * 60), 360);
assert.equal(workedMinutes(23 * 60 + 30, 30), 60, 'lintas tengah malam tidak negatif');
assert.equal(summarizeAttendance({ shift: 'closing', checkInMinutes: 13 * 60, checkOutMinutes: 16 * 60 }).earlyLeaveMinutes, 60, 'pulang lebih awal');
assert.equal(summarizeAttendance({ shift: 'opening', checkInMinutes: 7 * 60, checkOutMinutes: null }).durationMinutes, null, 'belum checkout');
assert.equal(isCheckoutOverdue({ shiftDate: '2026-11-25', shift: 'closing', checkInMinutes: 12 * 60, checkOutMinutes: null, now: { date: '2026-11-26', minutes: 2 * 60 } }), true, 'lupa checkout melewati hari');
assert.equal(isCheckoutOverdue({ shiftDate: '2026-11-25', shift: 'closing', checkInMinutes: 12 * 60, checkOutMinutes: null, now: { date: '2026-11-25', minutes: 17 * 60 } }), false, 'masih dalam masa tenggang');
assert.equal(isCheckoutOverdue({ shiftDate: '2026-11-25', shift: 'closing', checkInMinutes: 12 * 60, checkOutMinutes: 17 * 60, now: { date: '2026-11-25', minutes: 23 * 60 } }), false, 'sudah checkout');

const database = `dapurops_ops_test_${crypto.randomBytes(6).toString('hex')}`;
const config = process.env.TEST_MYSQL_URL ? ((u) => ({ host: u.hostname, port: Number(u.port) || 3306, user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) }))(new URL(process.env.TEST_MYSQL_URL)) : { host: '127.0.0.1', user: 'root' };
const conn = await mysql.createConnection(config);
await conn.query(`CREATE DATABASE \`${database}\``);
await conn.query(`USE \`${database}\``);
const schema = await fs.readFile(new URL('../database/dapurops-schema.sql', import.meta.url), 'utf8');
for (const sql of schema.replace(/CREATE DATABASE IF NOT EXISTS[\s\S]*?;/, '').replace(/USE `ngola_dapurops`;/, '').split(';')) if (sql.trim()) await conn.query(sql);
for (const file of ['20261123-staff-accounts.sql', '20261123-attendance-cleanliness.sql', '20261125-geasteats.sql', '20261125-photos.sql', '20261126-operations.sql']) {
  for (const sql of (await fs.readFile(new URL(`../database/migrations/${file}`, import.meta.url), 'utf8')).split(';')) if (sql.trim()) await conn.query(sql);
}
const db = mysql.createPool({ ...config, database, dateStrings: true });
const app = express();
app.use(express.json({ limit: '1mb' }));
const requireAuth = async (req, res, next) => {
  const [[user]] = await db.query('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > NOW()', [req.headers.authorization?.replace(/^Bearer /, '') || '']);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = { ...user, role: user.id === 'admin' ? 'supervisor' : 'staff' };
  next();
};
const loadWorkspace = async (id, email, workspaceId) => {
  const [[ws]] = await db.query('SELECT * FROM workspaces WHERE id = ?', [workspaceId]);
  if (!ws) return { status: 404, error: 'Ruang kerja tidak ditemukan.' };
  const member = ws.owner_id === id || String(ws.member_emails).split(',').map((s) => s.trim().toLowerCase()).includes(String(email).toLowerCase());
  if (!member) return { status: 403, error: 'Bukan anggota.' };
  return { ws, isSupervisor: id === 'admin' };
};
registerPhotos(app, { getPool: () => db, requireAuth, loadWorkspace });
registerOperations(app, { getPool: () => db, requireAuth, loadWorkspace, assertPhotoOwned: assertAttendancePhoto });
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = async (path, body, method = 'GET', token = 'admin-token') => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await r.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: r.status, body: parsed, text, headers: r.headers };
};

try {
  await db.query("INSERT INTO users (id,email,password_hash,name,role) VALUES ('admin','admin@gmail.com','x','Admin','supervisor'),('cook','cook@test.invalid','x','Siti','staff'),('peer','peer@test.invalid','x','Budi','staff')");
  await db.query("INSERT INTO sessions (token,user_id,expires_at) VALUES ('admin-token','admin',DATE_ADD(NOW(),INTERVAL 1 DAY)),('cook-token','cook',DATE_ADD(NOW(),INTERVAL 1 DAY)),('peer-token','peer',DATE_ADD(NOW(),INTERVAL 1 DAY))");
  await db.query("INSERT INTO workspaces (id,kitchen_name,owner_id,owner_email,member_emails,supervisor_emails) VALUES ('ws','Dapur Uji','admin','admin@gmail.com','admin@gmail.com,cook@test.invalid,peer@test.invalid','admin@gmail.com')");
  await db.query("INSERT INTO staff (id,workspace_id,name,email,role,job_title) VALUES ('s-cook','ws','Siti','cook@test.invalid','staff','Cook'),('s-peer','ws','Budi','peer@test.invalid','staff','Cook')");

  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() + 7 * 3600000 - 86400000).toISOString().slice(0, 10);
  await db.query("INSERT INTO assignments (id,workspace_id,shift_date,shift,staff_ids,pic_id) VALUES ('asg-open','ws',?,'opening','cook,peer','cook'),('asg-close','ws',?,'closing','peer','peer')", [today, today]);
  await db.query("INSERT INTO attendance (id,workspace_id,assignment_id,att_date,shift,staff_id,staff_email,check_in_time,check_in_minutes,late_minutes) VALUES ('att-cook','ws','asg-open',?,'opening','cook','cook@test.invalid','06:20',380,20)", [today]);

  // ---------- Koreksi absensi: hanya Admin ----------
  assert.equal((await call('/attendance/correction', { workspaceId: 'ws', attendanceId: 'att-cook', checkInTime: '06:00', reason: 'Salah input jam' }, 'POST', 'cook-token')).status, 403, 'staf tidak boleh mengoreksi');
  assert.equal((await call('/attendance/correction', { workspaceId: 'ws', attendanceId: 'att-cook', checkInTime: '06:00', reason: 'x' }, 'POST')).status, 400, 'alasan terlalu pendek ditolak');
  assert.equal((await call('/attendance/correction', { workspaceId: 'ws', attendanceId: 'att-cook', checkInTime: '6:00', reason: 'Format salah' }, 'POST')).status, 400, 'format jam harus HH:MM');
  assert.equal((await call('/attendance/correction', { workspaceId: 'ws', attendanceId: 'att-cook', checkInTime: '06:20', reason: 'Tidak ada perubahan' }, 'POST')).status, 409, 'tanpa perubahan tidak menulis audit');

  const corrected = await call('/attendance/correction', { workspaceId: 'ws', attendanceId: 'att-cook', checkInTime: '06:00', checkOutTime: '12:00', reason: 'Staf lupa checkout, jam pulang dikonfirmasi PIC' }, 'POST');
  assert.equal(corrected.status, 200, 'Admin mengoreksi absensi');
  assert.equal(corrected.body.before.lateMinutes, 20, 'nilai asli dipertahankan di audit');
  assert.equal(corrected.body.after.lateMinutes, 0, 'koreksi menghitung ulang keterlambatan');
  assert.equal(corrected.body.after.durationMinutes, 360, 'durasi dihitung ulang');
  const [[row]] = await db.query("SELECT * FROM attendance WHERE id='att-cook'");
  assert.equal(row.check_out_time, '12:00');
  assert.equal(row.late_minutes, 0);
  const audit = await call('/attendance/audit?workspaceId=ws');
  assert.equal(audit.status, 200);
  assert.equal(audit.body.audit.length, 1, 'satu jejak audit tercatat');
  assert.equal(audit.body.audit[0].actorEmail, 'admin@gmail.com', 'pelaku tercatat');
  assert.match(audit.body.audit[0].reason, /lupa checkout/);
  assert.ok(audit.body.audit[0].before.checkInTime, 'catatan asli tersimpan');
  assert.equal(audit.body.audit[0].after.checkOutTime, '12:00');
  assert.equal((await call('/attendance/audit?workspaceId=ws', undefined, 'GET', 'cook-token')).status, 403, 'audit hanya untuk Admin');

  // Koreksi untuk absensi yang belum ada (lupa absen total).
  const created = await call('/attendance/correction', { workspaceId: 'ws', assignmentId: 'asg-close', staffId: 'peer', checkInTime: '12:05', checkOutTime: '17:00', reason: 'Staf lupa absen, jadwal terverifikasi PIC' }, 'POST');
  assert.equal(created.status, 200, 'Admin membuat absensi yang terlewat');
  assert.ok(created.body.attendanceId);
  const [[createdRow]] = await db.query('SELECT * FROM attendance WHERE id = ?', [created.body.attendanceId]);
  assert.equal(createdRow.shift, 'closing');
  assert.equal(createdRow.late_minutes, 5);
  assert.equal((await call('/attendance/correction', { workspaceId: 'ws', assignmentId: 'asg-close', staffId: 'outsider', checkInTime: '12:05', reason: 'Staf bukan anggota' }, 'POST')).status, 400, 'staf luar dapur ditolak');

  // Status ketidakhadiran tidak boleh menimpa kehadiran nyata.
  assert.equal((await call('/attendance/correction', { workspaceId: 'ws', attendanceId: 'att-cook', supervisorStatus: 'Alpa', reason: 'Mencoba menimpa kehadiran' }, 'POST')).status, 409, 'kehadiran hadir tidak bisa diubah jadi Alpa');
  assert.equal((await call('/attendance/correction', { workspaceId: 'ws', attendanceId: 'att-cook', clearCheckIn: true, clearCheckOut: true, supervisorStatus: 'Izin', supervisorNote: 'Surat izin diterima', reason: 'Koreksi status izin' }, 'POST')).status, 200, 'setelah jam dikosongkan, status izin boleh');
  const [[izinRow]] = await db.query("SELECT * FROM attendance WHERE id='att-cook'");
  assert.equal(izinRow.supervisor_status, 'Izin');
  assert.equal(izinRow.check_in_time, null);

  // ---------- Rekap operasional ----------
  const report = await call(`/reports/operational?workspaceId=ws&from=${yesterday}&to=${today}`);
  assert.equal(report.status, 200);
  assert.equal(report.body.summary.totalScheduled, 3, 'dua staf opening + satu staf closing');
  assert.equal(report.body.summary.izin, 1);
  assert.equal(report.body.summary.terlambat, 1, 'koreksi closing 5 menit terlambat');
  assert.equal(report.body.rows.length, 3);
  const cookRow = report.body.rows.find((r) => r.staffName === 'Siti');
  assert.equal(cookRow.status, 'Izin');
  assert.equal(report.body.perStaff.length, 2, 'ringkasan per staf');
  assert.equal((await call(`/reports/operational?workspaceId=ws&from=${today}&to=${yesterday}`)).status, 400, 'rentang terbalik ditolak');
  assert.equal((await call('/reports/operational?workspaceId=ws&from=2020-01-01&to=2026-01-01')).status, 400, 'rentang terlalu panjang ditolak');
  const filtered = await call(`/reports/operational?workspaceId=ws&from=${yesterday}&to=${today}&staffId=s-peer`);
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.rows.length, 2, 'filter staf: jadwal opening + closing');
  assert.ok(filtered.body.rows.every((r) => r.staffName === 'Budi'), 'hanya baris staf terpilih');

  // Ekspor CSV: hanya Admin, isi lengkap, dan aman untuk Excel.
  assert.equal((await call(`/reports/operational.csv?workspaceId=ws&from=${yesterday}&to=${today}`, undefined, 'GET', 'cook-token')).status, 403, 'staf tidak boleh ekspor');
  const csv = await call(`/reports/operational.csv?workspaceId=ws&from=${yesterday}&to=${today}`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /rekap-dapurops/);
  // `text` dibaca via response.text() sehingga BOM sudah dikonsumsi decoder; cek byte mentah.
  const csvBytes = await fetch(`${base}/reports/operational.csv?workspaceId=ws&from=${yesterday}&to=${today}`, { headers: { Authorization: 'Bearer admin-token' } }).then((r) => r.arrayBuffer());
  assert.deepEqual([...new Uint8Array(csvBytes).slice(0, 3)], [0xef, 0xbb, 0xbf], 'BOM agar Excel membaca UTF-8');
  assert.match(csv.text, /Tanggal,Shift,Nama Staf/);
  assert.match(csv.text, /Ringkasan,Nilai/);
  assert.match(csv.text, /Temuan Kebersihan/);

  // ---------- Tindak lanjut kebersihan ----------
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
  await db.query("INSERT INTO private_photos (workspace_id,id,user_id,source,mime_type,data) VALUES ('ws','proof-cook','cook','camera','image/png',?)", [png]);
  await db.query("INSERT INTO private_photos (workspace_id,id,user_id,source,mime_type,data) VALUES ('ws','proof-peer','peer','camera','image/png',?)", [png]);
  const reportId = 'clean-1';
  await db.query("INSERT INTO cleanliness_reports (id,workspace_id,report_date,shift,pic_id,pic_email,pic_name,submitted_at,submitted_time,areas_json,general_photo_id,handover_note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [reportId, 'ws', today, 'opening', 'cook', 'cook@test.invalid', 'Siti', `${today} 11:00 WIB`, '11:00', JSON.stringify([{ key: 'kompor_area_masak', status: 'Perlu Ditangani', note: 'Kerak minyak' }]), null, '']);
  await db.query("INSERT INTO cleanliness_followups (id,workspace_id,report_id,area_key,area_label,note,status,pic_id,pic_email,pic_name) VALUES ('fu-1','ws',?,'kompor_area_masak','Kompor & Area Masak','Kerak minyak','Perlu Ditangani','cook','cook@test.invalid','Siti')", [reportId]);

  const followups = await call('/cleanliness/followups?workspaceId=ws');
  assert.equal(followups.status, 200);
  assert.equal(followups.body.followups.length, 1);
  assert.equal(followups.body.followups[0].status, 'Perlu Ditangani');
  assert.equal(followups.body.followups[0].picName, 'Siti', 'temuan punya penanggung jawab');
  assert.equal((await call('/cleanliness/followups/fu-1', { workspaceId: 'ws', status: 'Selesai', resolutionNote: 'Sudah dibersihkan' }, 'PATCH', 'peer-token')).status, 403, 'bukan PJ tidak boleh menutup');
  assert.equal((await call('/cleanliness/followups/fu-1', { workspaceId: 'ws', status: 'Selesai', resolutionNote: 'Sudah dibersihkan' }, 'PATCH', 'cook-token')).status, 400, 'selesai wajib bukti foto');
  assert.equal((await call('/cleanliness/followups/fu-1', { workspaceId: 'ws', status: 'Selesai', resolutionPhotoId: 'proof-peer' }, 'PATCH', 'cook-token')).status, 400, 'selesai wajib catatan');
  assert.equal((await call('/cleanliness/followups/fu-1', { workspaceId: 'ws', status: 'Sedang Ditangani' }, 'PATCH', 'cook-token')).status, 200, 'PJ dapat mengubah status');
  const done = await call('/cleanliness/followups/fu-1', { workspaceId: 'ws', status: 'Selesai', resolutionNote: 'Kompor sudah dibersihkan dan difoto', resolutionPhotoId: 'proof-cook' }, 'PATCH', 'cook-token');
  assert.equal(done.status, 200, 'PJ menutup temuan dengan bukti');
  const [[fu]] = await db.query("SELECT * FROM cleanliness_followups WHERE id='fu-1'");
  assert.equal(fu.status, 'Selesai');
  assert.equal(fu.resolved_by_email, 'cook@test.invalid');
  assert.ok(fu.resolved_at);
  assert.equal(fu.resolution_photo_id, 'proof-cook');
  assert.equal((await call('/cleanliness/followups/fu-1', { workspaceId: 'ws', picId: 'cook' }, 'PATCH', 'cook-token')).status, 403, 'hanya Admin menetapkan PJ');
  assert.equal((await call('/cleanliness/followups/fu-1', { workspaceId: 'ws', picId: 's-peer' }, 'PATCH')).status, 200, 'Admin menetapkan PJ');
  const [[reassigned]] = await db.query("SELECT pic_name FROM cleanliness_followups WHERE id='fu-1'");
  assert.equal(reassigned.pic_name, 'Budi');

  // Rekap memuat temuan + status tindak lanjut.
  const report2 = await call(`/reports/operational?workspaceId=ws&from=${yesterday}&to=${today}`);
  assert.equal(report2.body.summary.checklistBermasalah, 1);
  assert.equal(report2.body.summary.followupTerbuka, 0, 'temuan sudah selesai');
  assert.equal(report2.body.problemAreas[0].followupPic, 'Budi');

  console.log('PASS aturan shift (telat/pulang awal/lintas tengah malam/lupa checkout), koreksi absensi + audit, rekap + filter + CSV, tindak lanjut kebersihan dengan bukti');
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await conn.end();
  await db.end();
}
