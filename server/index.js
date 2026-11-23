import express from 'express';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import { registerExtraRoutes } from './routes-extra.js';

/**
 * KitchenLog — Backend API (MySQL)
 *
 * Melayani data operasional dapur: workspaces, staff, jadwal, absensi,
 * laporan kebersihan, laporan barang, dan foto.
 *
 * Autentikasi: email + password (scrypt) + token sesi di tabel `sessions`.
 * Semua endpoint data WAJIB menyertakan header `Authorization: Bearer <token>`.
 *
 * Dijalankan sebagai layanan backend panel (prefix /api).
 */

const PORT = Number(process.env.PORT) || 5055;

// Panel menyediakan DATABASE_URL (format mysql://user:pass@host:port/db).
// Variabel terpisah juga didukung agar mudah diuji lokal.
function parseDbConfig() {
  const url = process.env.DATABASE_URL || process.env.MYSQL_URL || '';
  if (url) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port) || 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ''),
    };
  }
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
  };
}

const dbConfig = parseDbConfig();
let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...dbConfig,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      charset: 'utf8mb4',
      dateStrings: true,
    });
  }
  return pool;
}

// ---------- Utilitas keamanan ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${derived.toString('base64')}`;
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, N, r, p, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = crypto.scryptSync(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function normalizePhone(v) {
  let d = String(v || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+62')) d = '0' + d.slice(3);
  else if (d.startsWith('62')) d = '0' + d.slice(2);
  else if (d.startsWith('8')) d = '0' + d;
  return d.replace(/\D/g, '');
}

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
const isPhone = (v) => /^08\d{8,11}$/.test(normalizePhone(v));

function todayWib() {
  const now = new Date();
  const wib = new Date(now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60_000);
  return wib.toISOString().slice(0, 10);
}

function wibNow() {
  const now = new Date();
  const wib = new Date(now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60_000);
  return {
    date: wib.toISOString().slice(0, 10),
    time: `${String(wib.getUTCHours()).padStart(2, '0')}:${String(wib.getUTCMinutes()).padStart(2, '0')}`,
  };
}

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;

// ---------- Aplikasi ----------

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// CORS: izinkan origin panel + lokal saat pengujian.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = [
    'https://dapurops.ngolab.online',
    'http://localhost:3000',
    'http://localhost:5173',
  ];
  if (origin && (allowed.includes(origin) || origin.endsWith('.ngolab.online'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Health check: dipakai panel untuk smoke test.
app.get('/api/health', async (_req, res) => {
  try {
    const [rows] = await getPool().query('SELECT 1 AS ok');
    res.json({
      ok: true,
      service: 'kitchenlog-api',
      database: dbConfig.database || null,
      db_connected: rows?.[0]?.ok === 1,
      time: wibNow(),
    });
  } catch (err) {
    res.status(503).json({ ok: false, error: 'Database tidak dapat dihubungi', detail: String(err?.message || err) });
  }
});

// ---------- Middleware autentikasi ----------

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Autentikasi diperlukan.' });

    const [rows] = await getPool().query(
      `SELECT s.token, s.expires_at, u.id, u.username, u.email, u.name, u.phone, u.role, u.job_title, u.email_verified
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? LIMIT 1`,
      [token]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Sesi tidak valid atau sudah berakhir.' });

    const session = rows[0];
    if (new Date(session.expires_at).getTime() < Date.now()) {
      await getPool().query('DELETE FROM sessions WHERE token = ?', [token]);
      return res.status(401).json({ error: 'Sesi sudah berakhir. Silakan masuk kembali.' });
    }

    req.user = {
      id: session.id,
      username: session.username,
      email: session.email,
      name: session.name,
      phone: session.phone,
      role: session.role,
      jobTitle: session.job_title,
      emailVerified: Boolean(session.email_verified),
    };
    req.token = token;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Gagal memverifikasi sesi.', detail: String(err?.message || err) });
  }
}

/** Pastikan pengguna adalah anggota workspace; kembalikan data workspace. */
async function loadWorkspace(userId, email, workspaceId) {
  const [rows] = await getPool().query(
    `SELECT * FROM workspaces WHERE id = ? LIMIT 1`,
    [workspaceId]
  );
  if (rows.length === 0) return { error: 'Ruang kerja tidak ditemukan.', status: 404 };
  const ws = rows[0];
  const members = String(ws.member_emails || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const isMember = ws.owner_id === userId || members.includes(String(email).toLowerCase());
  if (!isMember) return { error: 'Anda bukan anggota ruang kerja ini.', status: 403 };
  return { ws, isSupervisor: ws.owner_id === userId || members.includes(String(email).toLowerCase()) && String(ws.supervisor_emails || '').split(',').map(s => s.trim().toLowerCase()).includes(String(email).toLowerCase()) };
}

// ---------- Auth ----------

app.post('/api/auth/register', async (req, res) => {
  return res.status(403).json({ error: 'Pendaftaran publik ditutup. Hubungi Supervisor.' });
});

// ponytail: per-process limiter; use a shared store for multiple backend replicas.
const loginAttempts = new Map();
app.post('/api/auth/login', async (req, res) => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) if (entry.until <= now) loginAttempts.delete(key);
  const ipKey = `ip:${req.ip}`;
  const identifierKey = typeof (req.body?.username ?? req.body?.email) === 'string'
    ? `account:${(req.body.username ?? req.body.email).trim().toLowerCase().slice(0, 200)}` : ipKey;
  for (const [key, limit] of [[ipKey, 30], [identifierKey, 10]]) {
    const entry = loginAttempts.get(key) || { count: 0, until: now + 15 * 60_000 };
    if (entry.count >= limit || (!loginAttempts.has(key) && loginAttempts.size >= 10000)) {
      res.setHeader('Retry-After', '900');
      return res.status(429).json({ error: 'Terlalu banyak percobaan masuk. Coba lagi nanti.' });
    }
    entry.count++;
    loginAttempts.set(key, entry);
  }
  const { username, email, password } = req.body ?? {};
  const identifier = username ?? email;
  if (typeof identifier !== 'string' || identifier.length > 200 || typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Username dan password tidak valid.' });
  const clean = identifier.trim().toLowerCase();
  if (!isEmail(clean) && !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(clean)) return res.status(400).json({ error: 'Username tidak valid.' });
  try {
    const pool = getPool();
    const [rows] = await pool.query(isEmail(clean) ? "SELECT u.* FROM users u WHERE u.email = ? AND (u.role = 'supervisor' OR EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_id = u.id OR (FIND_IN_SET(u.email, REPLACE(w.member_emails, ' ', '')) > 0 AND FIND_IN_SET(u.email, REPLACE(w.supervisor_emails, ' ', '')) > 0))) LIMIT 1" : 'SELECT * FROM users WHERE username = ? LIMIT 1', [clean]);
    if (rows.length === 0) return res.status(401).json({ error: 'Username atau password salah.' });
    const user = rows[0];
    if (!verifyPassword(String(password), user.password_hash)) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }
    const token = newToken();
    await pool.query(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))',
      [token, user.id]
    );
    res.json({
      token,
      user: {
        id: user.id, username: user.username, email: user.email, name: user.name, phone: user.phone,
        role: user.role, jobTitle: user.job_title, emailVerified: Boolean(user.email_verified),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal masuk.', detail: String(err?.message || err) });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    await getPool().query('DELETE FROM sessions WHERE token = ?', [req.token]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Gagal keluar.' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const [wsRows] = await getPool().query(
      'SELECT id, kitchen_name FROM workspaces WHERE owner_id = ? OR FIND_IN_SET(?, REPLACE(member_emails, " ", "")) > 0',
      [req.user.id, req.user.email]
    );
    res.json({
      user: req.user,
      workspaces: wsRows.map((w) => ({ id: w.id, kitchenName: w.kitchen_name })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat profil.', detail: String(err?.message || err) });
  }
});

app.post('/api/auth/forgot-password', (_req, res) => {
  res.json({ ok: true, message: 'Hubungi Supervisor untuk mengatur ulang password.' });
});

// ---------- Data operasional ----------

/** Ambil seluruh state satu workspace (dipakai saat aplikasi dibuka). */
app.get('/api/state', requireAuth, async (req, res) => {
  const workspaceId = String(req.query.workspaceId || '');
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId wajib diisi.' });
  try {
    const access = await loadWorkspace(req.user.id, req.user.email, workspaceId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const pool = getPool();
    const [staffRows] = await pool.query('SELECT * FROM staff WHERE workspace_id = ? ORDER BY created_at', [workspaceId]);
    const [asgRows] = await pool.query('SELECT * FROM assignments WHERE workspace_id = ? ORDER BY shift_date, shift', [workspaceId]);
    const [attRows] = await pool.query('SELECT * FROM attendance WHERE workspace_id = ? ORDER BY att_date, shift', [workspaceId]);
    const [cleanRows] = await pool.query('SELECT * FROM cleanliness_reports WHERE workspace_id = ? ORDER BY report_date, shift', [workspaceId]);
    const [itemRows] = await pool.query('SELECT * FROM item_reports WHERE workspace_id = ? ORDER BY created_at DESC', [workspaceId]);
    const [userRows] = await pool.query('SELECT u.id, u.email, u.username FROM users u JOIN staff s ON s.email = u.email WHERE s.workspace_id = ?', [workspaceId]);
    const usernameByEmail = new Map(userRows.map(u => [String(u.email).toLowerCase(), u.username]));
    const userByEmail = new Map(userRows.map((u) => [String(u.email).toLowerCase(), u.id]));
    const staffIdToEmail = new Map(staffRows.map((s) => [s.id, String(s.email).toLowerCase()]));
    // Terjemahkan id staff menjadi id akun (bila emailnya terdaftar), agar
    // frontend yang memakai currentUser.id selalu cocok.
    const resolveId = (id) => {
      if (!id) return id;
      const email = staffIdToEmail.get(id);
      if (!email) return id;
      return userByEmail.get(email) || id;
    };

    res.json({
      kitchenName: access.ws.kitchen_name,
      users: staffRows.map((s) => ({
        // id memakai id akun (users.id) bila email cocok, agar currentUser.id
        // dapat dicocokkan dengan staffIds/picId. staff_id tetap dikirim terpisah.
        id: userByEmail.get(String(s.email).toLowerCase()) || s.id,
        staffId: s.id,
        username: usernameByEmail.get(String(s.email).toLowerCase()) || null,
        name: s.name, email: s.email, role: s.role, jobTitle: s.job_title,
      })),
      assignments: asgRows.map((a) => ({
        id: a.id,
        date: String(a.shift_date).slice(0, 10),
        shift: a.shift,
        staffIds: String(a.staff_ids || '').split(',').filter(Boolean).map(resolveId),
        picId: resolveId(a.pic_id),
      })),
      attendance: attRows.map((a) => ({
        id: a.id,
        assignmentId: a.assignment_id,
        date: String(a.att_date).slice(0, 10),
        shift: a.shift,
        staffId: resolveId(a.staff_id),
        staffEmail: a.staff_email,
        checkInTime: a.check_in_time,
        checkInMinutes: a.check_in_minutes,
        checkOutTime: a.check_out_time,
        checkOutMinutes: a.check_out_minutes,
        lateMinutes: a.late_minutes,
        durationMinutes: a.duration_minutes,
        checkInPhotoId: a.check_in_photo_id,
        checkOutPhotoId: a.check_out_photo_id,
        supervisorStatus: a.supervisor_status,
        supervisorNote: a.supervisor_note,
        updatedAt: String(a.updated_at || ''),
      })),
      cleanlinessReports: cleanRows.map((c) => ({
        id: c.id,
        date: String(c.report_date).slice(0, 10),
        shift: c.shift,
        picId: c.pic_id,
        picEmail: c.pic_email,
        picName: c.pic_name,
        submittedAt: c.submitted_at,
        submittedTimeHHMM: c.submitted_time,
        areas: safeJson(c.areas_json, []),
        generalPhotoId: c.general_photo_id,
        handoverNote: c.handover_note || '',
        confirmedAiSummary: c.confirmed_summary,
        aiSummaryConfirmedAt: c.summary_confirmed_at,
        aiSummaryConfirmedBy: c.summary_confirmed_by,
      })),
      itemReports: itemRows.map((i) => ({
        id: i.id,
        type: i.type,
        itemName: i.item_name,
        quantity: i.quantity,
        location: i.location,
        lastKnownLocation: i.last_known_location || '',
        discoveredAt: i.discovered_at,
        notes: i.notes || '',
        photoId: i.photo_id,
        reporterId: i.reporter_id,
        reporterEmail: i.reporter_email,
        reporterName: i.reporter_name,
        shift: i.shift,
        date: String(i.report_date).slice(0, 10),
        status: i.status,
        resolutionNote: i.resolution_note || '',
        createdAt: String(i.created_at || ''),
        updatedAt: String(i.updated_at || ''),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat data.', detail: String(err?.message || err) });
  }
});

function safeJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

// Absensi masuk/pulang
app.post('/api/attendance/check-in', requireAuth, async (req, res) => {
  const { workspaceId, assignmentId, staffId, photoId } = req.body ?? {};
  if (staffId !== req.user.id) return res.status(403).json({ error: 'Anda hanya dapat mencatat absensi akun sendiri.' });
  try {
    const access = await loadWorkspace(req.user.id, req.user.email, String(workspaceId || ''));
    if (access.error) return res.status(access.status).json({ error: access.error });
    const now = wibNow();
    const [h, m] = now.time.split(':').map(Number);
    const minutes = h * 60 + m;

    const [asg] = await getPool().query('SELECT shift FROM assignments WHERE id = ? AND workspace_id = ? LIMIT 1', [assignmentId, workspaceId]);
    if (asg.length === 0) return res.status(404).json({ error: 'Jadwal shift tidak ditemukan.' });

    await getPool().query(
      `INSERT INTO attendance (id, workspace_id, assignment_id, att_date, shift, staff_id, staff_email,
        check_in_time, check_in_minutes, late_minutes, check_in_photo_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE check_in_time = VALUES(check_in_time),
         check_in_minutes = VALUES(check_in_minutes), check_in_photo_id = VALUES(check_in_photo_id)`,
      [uid('att'), workspaceId, assignmentId, now.date, asg[0].shift, staffId, req.user.email, now.time, minutes, photoId || null]
    );
    res.json({ ok: true, checkInTime: now.time });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mencatat absen masuk.', detail: String(err?.message || err) });
  }
});

app.post('/api/attendance/check-out', requireAuth, async (req, res) => {
  const { workspaceId, assignmentId, staffId, photoId } = req.body ?? {};
  if (staffId !== req.user.id) return res.status(403).json({ error: 'Anda hanya dapat mencatat absensi akun sendiri.' });
  try {
    const access = await loadWorkspace(req.user.id, req.user.email, String(workspaceId || ''));
    if (access.error) return res.status(access.status).json({ error: access.error });
    const now = wibNow();
    const [h, m] = now.time.split(':').map(Number);
    const minutes = h * 60 + m;
    await getPool().query(
      `UPDATE attendance SET check_out_time = ?, check_out_minutes = ?,
         duration_minutes = IF(check_in_minutes IS NULL, NULL, ? - check_in_minutes),
         check_out_photo_id = ?
       WHERE workspace_id = ? AND assignment_id = ? AND staff_id = ?`,
      [now.time, minutes, minutes, photoId || null, workspaceId, assignmentId, staffId]
    );
    res.json({ ok: true, checkOutTime: now.time });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mencatat absen keluar.', detail: String(err?.message || err) });
  }
});

// Laporan kebersihan
app.post('/api/cleanliness', requireAuth, async (req, res) => {
  const b = req.body ?? {};
  const workspaceId = String(b.workspaceId || '');
  try {
    const access = await loadWorkspace(req.user.id, req.user.email, workspaceId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const now = wibNow();
    const id = b.id || uid('clean');
    await getPool().query(
      `INSERT INTO cleanliness_reports
        (id, workspace_id, report_date, shift, pic_id, pic_email, pic_name, submitted_at, submitted_time,
         areas_json, general_photo_id, handover_note, confirmed_summary, summary_confirmed_at, summary_confirmed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         areas_json = VALUES(areas_json), handover_note = VALUES(handover_note),
         general_photo_id = VALUES(general_photo_id), submitted_at = VALUES(submitted_at),
         submitted_time = VALUES(submitted_time), confirmed_summary = VALUES(confirmed_summary),
         summary_confirmed_at = VALUES(summary_confirmed_at), summary_confirmed_by = VALUES(summary_confirmed_by)`,
      [
        id, workspaceId, b.date || now.date, b.shift, b.picId, req.user.email, b.picName,
        `${b.date || now.date} ${now.time} WIB`, now.time,
        JSON.stringify(b.areas ?? []), b.generalPhotoId || null, b.handoverNote || '',
        b.confirmedAiSummary || null, b.aiSummaryConfirmedAt || null, b.aiSummaryConfirmedBy || null,
      ]
    );
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyimpan laporan kebersihan.', detail: String(err?.message || err) });
  }
});

// Laporan barang
app.post('/api/items', requireAuth, async (req, res) => {
  const b = req.body ?? {};
  const workspaceId = String(b.workspaceId || '');
  try {
    const access = await loadWorkspace(req.user.id, req.user.email, workspaceId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const now = wibNow();
    const id = uid('item');
    await getPool().query(
      `INSERT INTO item_reports
        (id, workspace_id, type, item_name, quantity, location, last_known_location, discovered_at, notes,
         photo_id, reporter_id, reporter_email, reporter_name, shift, report_date, status, resolution_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Dilaporkan', '')`,
      [
        id, workspaceId, b.type, b.itemName, Number(b.quantity) || 1, b.location, b.lastKnownLocation || '',
        b.discoveredAt || `${now.date} ${now.time} WIB`, b.notes || '', b.photoId || null,
        req.user.id, req.user.email, b.reporterName || req.user.name, b.shift || 'opening', b.date || now.date,
      ]
    );
    res.status(201).json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyimpan laporan barang.', detail: String(err?.message || err) });
  }
});

app.patch('/api/items/:id/status', requireAuth, async (req, res) => {
  const { workspaceId, status, resolutionNote } = req.body ?? {};
  try {
    const access = await loadWorkspace(req.user.id, req.user.email, String(workspaceId || ''));
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (!['Dilaporkan', 'Ditindaklanjuti', 'Selesai'].includes(status)) {
      return res.status(400).json({ error: 'Status tidak valid.' });
    }
    await getPool().query(
      'UPDATE item_reports SET status = ?, resolution_note = ? WHERE id = ? AND workspace_id = ?',
      [status, resolutionNote || '', req.params.id, workspaceId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengubah status.', detail: String(err?.message || err) });
  }
});

// Foto
app.post('/api/photos', requireAuth, async (req, res) => {
  const { workspaceId, id, dataUrl, source } = req.body ?? {};
  try {
    const access = await loadWorkspace(req.user.id, req.user.email, String(workspaceId || ''));
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (!dataUrl || String(dataUrl).length < 20) return res.status(400).json({ error: 'Data foto tidak valid.' });
    if (String(dataUrl).length > 450_000) return res.status(413).json({ error: 'Foto terlalu besar.' });
    const photoId = id || uid('photo');
    await getPool().query(
      `INSERT INTO photos (id, workspace_id, data_url, source, uploader_email)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE data_url = VALUES(data_url)`,
      [photoId, workspaceId, dataUrl, source === 'upload' ? 'upload' : 'camera', req.user.email]
    );
    res.status(201).json({ ok: true, id: photoId });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyimpan foto.', detail: String(err?.message || err) });
  }
});

app.get('/api/photos/:id', requireAuth, async (req, res) => {
  const workspaceId = String(req.query.workspaceId || '');
  try {
    const access = await loadWorkspace(req.user.id, req.user.email, workspaceId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const [rows] = await getPool().query(
      'SELECT id, data_url, source, created_at FROM photos WHERE id = ? AND workspace_id = ? LIMIT 1',
      [req.params.id, workspaceId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Foto tidak ditemukan.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat foto.', detail: String(err?.message || err) });
  }
});

// 404 JSON untuk rute /api yang tidak dikenal
registerExtraRoutes(app, { getPool, requireAuth, loadWorkspace, uid, wibNow, isEmail, hashPassword });

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KitchenLog API berjalan pada port ${PORT}`);
  console.log(`Database: ${dbConfig.database || '(belum diset)'} @ ${dbConfig.host}:${dbConfig.port}`);
});
