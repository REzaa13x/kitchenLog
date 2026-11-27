import 'dotenv/config';
import express from 'express';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import { registerExtraRoutes } from './routes-extra.js';
import { createGeasteats } from './geasteats.js';
import { registerFrontend } from './frontend.js';
import { registerPhotos, assertAttendancePhoto } from './photos.js';
import { registerOperations } from './operations.js';
import { isShift, lateMinutes, summarizeAttendance } from './attendance-rules.js';
import { SHIFT_TASKS, findTask } from './shift-tasks.js';
import { encryptSecret, decryptSecret, credentialsEnabled } from './credential-vault.js';

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
const isAdmin = (id, email) => id === 'u_supervisor_75d4f29fee493805' && String(email).toLowerCase() === 'admin@gmail.com';

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
app.use(express.json({ limit: '4mb' }));

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

const geasteats = createGeasteats({ getPool, hashPassword });

// ---------- Middleware autentikasi ----------

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Autentikasi diperlukan.' });

    const [rows] = await getPool().query(
      `SELECT s.token, s.expires_at, u.id, u.username, u.email, u.name, u.phone, u.role, u.job_title, u.email_verified, u.geasteats_staff_id
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

    if (session.geasteats_staff_id) {
      try {
        if (!await geasteats.active(session.geasteats_staff_id)) {
          await getPool().query('DELETE FROM sessions WHERE user_id = ?', [session.id]);
          return res.status(401).json({ error: 'Akun Geasteats tidak aktif.' });
        }
      } catch { return res.status(503).json({ error: 'Geasteats tidak dapat memverifikasi sesi.' }); }
    }
    req.user = {
      id: session.id,
      geasteatsStaffId: session.geasteats_staff_id,
      username: session.username,
      email: session.email,
      name: session.name,
      phone: session.phone,
      role: isAdmin(session.id, session.email) ? 'supervisor' : 'staff',
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
  return { ws, isSupervisor: isAdmin(userId, email) };
}

// ---------- Auth ----------

app.post('/api/auth/register', async (req, res) => {
  return res.status(403).json({ error: 'Pendaftaran publik ditutup. Hubungi Admin.' });
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
  if (typeof identifier !== 'string' || identifier.length > 200 || typeof password !== 'string' || password.length < 1 || password.length > 128) return res.status(400).json({ error: 'Username dan password tidak valid.' });
  const clean = identifier.trim().toLowerCase();
  if (!isEmail(clean) && !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(clean)) return res.status(400).json({ error: 'Username tidak valid.' });
  try {
    const pool = getPool();
    const [rows] = await pool.query(isEmail(clean) ? 'SELECT * FROM users WHERE email = ? LIMIT 1' : 'SELECT * FROM users WHERE username = ? LIMIT 1', [clean]);
    const local = rows[0];
    let user;
    if (geasteats.enabled() && (isEmail(clean) || local?.geasteats_staff_id)) {
      try { user = await geasteats.login(isEmail(clean) ? clean : local.email, password); }
      catch (err) {
        if (!local || local.geasteats_staff_id || err.status !== 503) return res.status(err.status || 503).json({ error: 'Login Geasteats gagal.' });
      }
    }
    if (!user && local && !local.geasteats_staff_id && verifyPassword(password, local.password_hash)) user = local;
    if (!user) {
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
        id: user.id, geasteatsStaffId: user.geasteats_staff_id, username: user.username, email: user.email, name: user.name, phone: user.phone,
        role: isAdmin(user.id, user.email) ? 'supervisor' : 'staff', jobTitle: user.job_title, emailVerified: Boolean(user.email_verified),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal masuk.', detail: String(err?.message || err) });
  }
});

app.post('/api/integrations/geasteats/sync', requireAuth, async (req, res) => {
  if (!isAdmin(req.user.id, req.user.email)) return res.status(403).json({ error: 'Hanya Admin.' });
  try { res.json(await geasteats.sync()); }
  catch (err) { res.status(err.status || 503).json({ error: 'Sinkronisasi Geasteats gagal.' }); }
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
  res.json({ ok: true, message: 'Hubungi Admin untuk mengatur ulang password.' });
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
    const [followRows] = await pool.query('SELECT * FROM cleanliness_followups WHERE workspace_id = ? ORDER BY created_at DESC', [workspaceId]);
    const [userRows] = await pool.query('SELECT u.id, u.email, u.username, u.geasteats_staff_id FROM users u JOIN staff s ON s.email = u.email WHERE s.workspace_id = ?', [workspaceId]);
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
        geasteatsStaffId: userRows.find(u => u.id === userByEmail.get(String(s.email).toLowerCase()))?.geasteats_staff_id || null,
        username: usernameByEmail.get(String(s.email).toLowerCase()) || null,
        name: s.name, email: s.email, role: isAdmin(userByEmail.get(String(s.email).toLowerCase()), s.email) ? 'supervisor' : 'staff', jobTitle: s.job_title,
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
        checkInKitchenPhotoId: a.check_in_kitchen_photo_id ?? null,
        checkOutKitchenPhotoId: a.check_out_kitchen_photo_id ?? null,
        checkInPhotoId: a.check_in_photo_id,
        checkOutPhotoId: a.check_out_photo_id,
        checkInCleanliness: safeJson(a.check_in_cleanliness, null),
        checkOutCleanliness: safeJson(a.check_out_cleanliness, null),
        earlyLeaveMinutes: a.early_leave_minutes ?? null,
        overnight: Boolean(Number(a.overnight || 0)),
        clientRef: a.client_ref ?? null,
        supervisorStatus: a.supervisor_status,
        supervisorNote: a.supervisor_note,
        updatedAt: String(a.updated_at || ''),
      })),
      cleanlinessFollowups: followRows.map((f) => ({
        id: f.id,
        reportId: f.report_id,
        areaKey: f.area_key,
        areaLabel: f.area_label,
        note: f.note,
        status: f.status,
        picId: f.pic_id,
        picEmail: f.pic_email,
        picName: f.pic_name,
        resolutionNote: f.resolution_note || '',
        resolutionPhotoId: f.resolution_photo_id,
        resolvedById: f.resolved_by_id,
        resolvedByEmail: f.resolved_by_email,
        resolvedAt: f.resolved_at ? String(f.resolved_at) : null,
        createdAt: String(f.created_at || ''),
        updatedAt: String(f.updated_at || ''),
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

const cleanlinessAreaKeys = ['meja_persiapan', 'kompor_area_masak', 'wastafel', 'lantai', 'tempat_sampah', 'area_penyimpanan'];
const AREA_LABELS = {
  meja_persiapan: 'Meja Persiapan',
  kompor_area_masak: 'Kompor & Area Masak',
  wastafel: 'Wastafel',
  lantai: 'Lantai',
  tempat_sampah: 'Tempat Sampah',
  area_penyimpanan: 'Area Penyimpanan',
};
function validAttendanceEvidence({ photoId, cleanliness } = {}) {
  if (typeof photoId !== 'string' || !photoId.trim() || photoId.length > 200) return false;
  if (!cleanliness || !Array.isArray(cleanliness.areas) || cleanliness.areas.length !== 6) return false;
  const keys = new Set();
  for (const area of cleanliness.areas) {
    if (!area || !cleanlinessAreaKeys.includes(area.key) || keys.has(area.key)) return false;
    if (!['Sudah Beres', 'Perlu Ditangani'].includes(area.status)) return false;
    if (typeof area.note !== 'string' || area.note.length > 1000 || (area.status === 'Perlu Ditangani' && !area.note.trim())) return false;
    keys.add(area.key);
  }
  const photo = cleanliness.kitchenPhotoDataUrl;
  if (typeof photo !== 'string' || photo.length > 2800000) return false;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);
  if (!match || match[2].length % 4 !== 0) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 2 * 1024 * 1024 || bytes.toString('base64') !== match[2]) return false;
  if (match[1] === 'png') return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (match[1] === 'jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

// The deployed schema stores membership in assignments.staff_ids (no assignment_staff table).
async function attendanceAssignment(workspaceId, assignmentId, user) {
  const [rows] = await getPool().query('SELECT id, shift, shift_date, staff_ids FROM assignments WHERE id = ? AND workspace_id = ? LIMIT 1', [assignmentId, workspaceId]);
  if (!rows.length) return { status: 404, error: 'Jadwal shift tidak ditemukan.' };
  const [staff] = await getPool().query('SELECT id FROM staff WHERE workspace_id = ? AND email = ?', [workspaceId, user.email]);
  const ids = [user.id, ...staff.map(s => s.id)];
  if (!String(rows[0].staff_ids || '').split(',').some(id => ids.includes(id.trim()))) return { status: 403, error: 'Anda tidak ditugaskan pada shift ini.' };
  return { ...rows[0], ids, shiftDate: String(rows[0].shift_date).slice(0, 10) };
}

const CLIENT_REF_RE = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Catat absen masuk/pulang dengan aturan shift nyata:
 *  - hanya untuk shift hari ini (atau shift kemarin yang masih terbuka, mis. closing lewat tengah malam)
 *  - keterlambatan dihitung dari jam mulai shift
 *  - pulang lebih awal & durasi dihitung, termasuk lintas tengah malam
 *  - `clientRef` membuat percobaan ulang idempoten (tidak menggandakan absensi)
 *  - foto wajah wajib sudah tersimpan di server dan milik akun sendiri
 */
function attendanceHandler(action) {
  const isCheckIn = action === 'check-in';
  return async (req, res) => {
    const { workspaceId, assignmentId, staffId, photoId, kitchenPhotoId = null } = req.body ?? {};
    if (staffId !== req.user.id) return res.status(403).json({ error: 'Anda hanya dapat mencatat absensi akun sendiri.' });
    // Bukti absensi = foto wajah. Checklist kebersihan diisi terpisah di halaman
    // Laporan Kebersihan; bila klien lama masih mengirimnya, tetap divalidasi.
    const hasCleanliness = req.body?.cleanliness !== undefined && req.body?.cleanliness !== null;
    if (hasCleanliness && !validAttendanceEvidence(req.body)) {
      return res.status(400).json({ error: 'Checklist kebersihan yang dikirim tidak lengkap atau tidak valid.' });
    }
    if (typeof photoId !== 'string' || !photoId.trim()) return res.status(400).json({ error: 'Foto wajah wajib diambil atau diunggah.' });
    const clientRef = typeof req.body?.clientRef === 'string' && CLIENT_REF_RE.test(req.body.clientRef) ? req.body.clientRef : null;
    let connection;
    try {
      const access = await loadWorkspace(req.user.id, req.user.email, String(workspaceId || ''));
      if (access.error) return res.status(access.status).json({ error: access.error });
      const now = wibNow();
      const [h, m] = now.time.split(':').map(Number);
      const minutes = h * 60 + m;

      const asg = await attendanceAssignment(workspaceId, assignmentId, req.user);
      if (asg.error) return res.status(asg.status).json({ error: asg.error });
      if (!isShift(asg.shift)) return res.status(400).json({ error: 'Shift pada jadwal tidak valid.' });

      // Absen masuk hanya untuk shift hari ini (atau closing kemarin yang lewat tengah malam).
      // Absen pulang tetap boleh sampai 7 hari agar "lupa checkout" bisa ditutup sendiri.
      const dayDiff = Math.round((Date.parse(`${now.date}T00:00:00Z`) - Date.parse(`${asg.shiftDate}T00:00:00Z`)) / 86_400_000);
      const openFromYesterday = dayDiff === 1 && asg.shift === 'closing';
      if (dayDiff < 0) return res.status(409).json({ error: 'Shift ini belum dimulai.' });
      if (isCheckIn && dayDiff > 0 && !openFromYesterday) return res.status(409).json({ error: 'Shift sudah lewat; hubungi Admin untuk koreksi absensi.' });
      if (!isCheckIn && dayDiff > 7) return res.status(409).json({ error: 'Absen pulang hanya dapat diisi maksimal 7 hari setelah shift; hubungi Admin.' });

      await assertAttendancePhoto(getPool(), workspaceId, req.user.id, photoId);

      if (kitchenPhotoId !== null) await assertAttendancePhoto(getPool(), workspaceId, req.user.id, kitchenPhotoId);
      const refColumn = isCheckIn ? 'client_ref' : 'check_out_client_ref';
      connection = await getPool().getConnection();
      await connection.beginTransaction();
      await connection.query('SELECT id FROM assignments WHERE id = ? AND workspace_id = ? FOR UPDATE', [assignmentId, workspaceId]);
      const [existing] = await connection.query(
        'SELECT * FROM attendance WHERE workspace_id = ? AND assignment_id = ? AND staff_id IN (?) FOR UPDATE',
        [workspaceId, assignmentId, asg.ids]
      );

      // Retry idempoten: permintaan yang sama tidak boleh menggandakan catatan.
      if (clientRef && existing.some((a) => a[refColumn] === clientRef)) {
        await connection.rollback();
        const done = existing.find((a) => a[refColumn] === clientRef);
        return res.json({ ok: true, duplicate: true, checkInTime: done.check_in_time, checkOutTime: done.check_out_time });
      }

      if (isCheckIn) {
        if (existing.some((a) => a.check_in_time)) {
          await connection.rollback();
          return res.status(409).json({ error: 'Absen masuk sudah dicatat. Jika ini kesalahan, minta Admin mengoreksi.' });
        }
        if (existing.some((a) => a.supervisor_status)) {
          await connection.rollback();
          return res.status(409).json({ error: 'Kehadiran sudah ditandai Admin; hubungi Admin untuk perubahan.' });
        }
        const dayOffset = asg.shiftDate < now.date ? 1 : 0;
        const late = lateMinutes(asg.shift, minutes, dayOffset);
        if (existing.length) {
          await connection.query(
            `UPDATE attendance SET check_in_time = ?, check_in_minutes = ?, late_minutes = ?, check_in_photo_id = ?, check_in_cleanliness = COALESCE(?, check_in_cleanliness), check_in_kitchen_photo_id = ?, client_ref = ?
              WHERE id = ?`,
            [now.time, minutes, late, photoId, (hasCleanliness ? JSON.stringify(req.body.cleanliness) : null), kitchenPhotoId, clientRef, existing[0].id]
          );
        } else {
          await connection.query(
            `INSERT INTO attendance (id, workspace_id, assignment_id, att_date, shift, staff_id, staff_email,
              check_in_time, check_in_minutes, late_minutes, check_in_photo_id, check_in_cleanliness, check_in_kitchen_photo_id, client_ref)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [uid('att'), workspaceId, assignmentId, asg.shiftDate, asg.shift, staffId, req.user.email,
              now.time, minutes, late, photoId, (hasCleanliness ? JSON.stringify(req.body.cleanliness) : null), kitchenPhotoId, clientRef]
          );
        }
        await connection.commit();
        return res.json({ ok: true, checkInTime: now.time, lateMinutes: late });
      }

      const open = existing.find((a) => a.check_in_time && !a.check_out_time);
      if (!open) {
        await connection.rollback();
        return res.status(409).json({
          error: existing.some((a) => a.check_out_time)
            ? 'Absen keluar sudah dicatat. Jika ini kesalahan, minta Admin mengoreksi.'
            : 'Absen masuk belum dicatat.',
        });
      }
      const summary = summarizeAttendance({ shift: asg.shift, checkInMinutes: open.check_in_minutes, checkOutMinutes: minutes });
      await connection.query(
        `UPDATE attendance SET check_out_time = ?, check_out_minutes = ?, duration_minutes = ?,
           early_leave_minutes = ?, overnight = ?, check_out_photo_id = ?, check_out_cleanliness = COALESCE(?, check_out_cleanliness), check_out_kitchen_photo_id = ?, check_out_client_ref = ?
         WHERE id = ?`,
        [now.time, minutes, summary.durationMinutes, summary.earlyLeaveMinutes, summary.overnight ? 1 : 0,
          photoId, (hasCleanliness ? JSON.stringify(req.body.cleanliness) : null), kitchenPhotoId, clientRef, open.id]
      );
      await connection.commit();
      return res.json({
        ok: true,
        checkOutTime: now.time,
        durationMinutes: summary.durationMinutes,
        earlyLeaveMinutes: summary.earlyLeaveMinutes,
        overtimeMinutes: summary.overtimeMinutes,
        overnight: summary.overnight,
      });
    } catch (err) {
      if (connection) await connection.rollback().catch(() => {});
      return res.status(err.status || 500).json({ error: err.status ? err.message : `Gagal mencatat absen ${isCheckIn ? 'masuk' : 'keluar'}.` });
    } finally {
      connection?.release();
    }
  };
}

// Absensi masuk/pulang
app.post('/api/attendance/check-in', requireAuth, attendanceHandler('check-in'));
app.post('/api/attendance/check-out', requireAuth, attendanceHandler('check-out'));

// Rekap Pekerjaan per shift: katalog tugas + progres centang per staf.
// GET  /api/shift-tasks?workspaceId=..&date=YYYY-MM-DD&shift=opening
// PATCH /api/shift-tasks  { workspaceId, date, shift, taskKey, done, note? }
app.get('/api/shift-tasks', requireAuth, async (req, res) => {
  const workspaceId = String(req.query.workspaceId || '');
  const date = String(req.query.date || '');
  const shift = String(req.query.shift || '');
  try {
    const access = await loadWorkspace(req.user.id, req.user.email, workspaceId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (!isShift(shift)) return res.status(400).json({ error: 'Shift tidak valid.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Tanggal tidak valid.' });

    const [rows] = await getPool().query(
      'SELECT staff_id, task_key, done, note, updated_at FROM shift_task_progress WHERE workspace_id = ? AND task_date = ? AND shift = ?',
      [workspaceId, date, shift]
    );
    res.json({
      shift,
      date,
      tasks: SHIFT_TASKS[shift] ?? [],
      progress: rows.map((row) => ({
        staffId: row.staff_id,
        taskKey: row.task_key,
        done: Boolean(row.done),
        note: row.note ?? '',
        updatedAt: row.updated_at,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Gagal memuat rekap pekerjaan.' });
  }
});

app.patch('/api/shift-tasks', requireAuth, async (req, res) => {
  const b = req.body ?? {};
  const workspaceId = String(b.workspaceId || '');
  const date = String(b.date || '');
  const shift = String(b.shift || '');
  const taskKey = String(b.taskKey || '');
  try {
    const access = await loadWorkspace(req.user.id, req.user.email, workspaceId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (!isShift(shift)) return res.status(400).json({ error: 'Shift tidak valid.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Tanggal tidak valid.' });
    if (!findTask(shift, taskKey)) return res.status(400).json({ error: 'Tugas tidak dikenal untuk shift ini.' });
    if (typeof b.done !== 'boolean') return res.status(400).json({ error: 'Status centang harus berupa boolean.' });
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, 500) : null;

    // Hanya staf yang ditugaskan pada shift itu (atau Admin) yang boleh mencentang.
    const [assignments] = await getPool().query(
      'SELECT staff_ids FROM assignments WHERE workspace_id = ? AND shift_date = ? AND shift = ? LIMIT 1',
      [workspaceId, date, shift]
    );
    if (!assignments.length) return res.status(404).json({ error: 'Jadwal shift tidak ditemukan untuk tanggal ini.' });
    const [staff] = await getPool().query('SELECT id FROM staff WHERE workspace_id = ? AND email = ?', [workspaceId, req.user.email]);
    const ids = [req.user.id, ...staff.map((s) => s.id)];
    const assigned = String(assignments[0].staff_ids || '').split(',').some((id) => ids.includes(id.trim()));
    if (!assigned && !access.isSupervisor) return res.status(403).json({ error: 'Anda tidak ditugaskan pada shift ini.' });

    await getPool().query(
      `INSERT INTO shift_task_progress (id, workspace_id, task_date, shift, staff_id, task_key, done, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE done = VALUES(done), note = VALUES(note)`,
      [uid('stp'), workspaceId, date, shift, req.user.id, taskKey, b.done ? 1 : 0, note]
    );
    res.json({ ok: true, taskKey, done: b.done });
  } catch {
    res.status(500).json({ error: 'Gagal menyimpan rekap pekerjaan.' });
  }
});

// Checklist kebersihan pribadi staf (terpisah dari laporan PIC shift).
// Disimpan pada catatan absensi staf tersebut; bila belum ada absensi, dibuat
// baris absensi tanpa jam masuk/pulang (statusnya tetap "Belum Absen").
app.post('/api/cleanliness/my-checklist', requireAuth, async (req, res) => {
  const b = req.body ?? {};
  const workspaceId = String(b.workspaceId || '');
  let connection;
  try {
    const access = await loadWorkspace(req.user.id, req.user.email, workspaceId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (!isShift(b.shift)) return res.status(400).json({ error: 'Shift tidak valid.' });
    if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return res.status(400).json({ error: 'Tanggal tidak valid.' });
    const cleanliness = b.cleanliness;
    if (!cleanliness || !Array.isArray(cleanliness.areas) || cleanliness.areas.length !== 6) {
      return res.status(400).json({ error: 'Checklist enam area wajib lengkap.' });
    }
    const keys = new Set();
    for (const area of cleanliness.areas) {
      if (!cleanlinessAreaKeys.includes(area.key) || keys.has(area.key)) return res.status(400).json({ error: 'Area checklist tidak valid.' });
      if (!['Sudah Beres', 'Perlu Ditangani'].includes(area.status)) return res.status(400).json({ error: 'Status area tidak valid.' });
      if (typeof area.note !== 'string' || area.note.length > 1000) return res.status(400).json({ error: 'Catatan area terlalu panjang.' });
      if (area.status === 'Perlu Ditangani' && !area.note.trim()) return res.status(400).json({ error: 'Catatan wajib untuk area Perlu Ditangani.' });
      keys.add(area.key);
    }

    const [assignments] = await getPool().query(
      'SELECT * FROM assignments WHERE workspace_id = ? AND shift_date = ? AND shift = ? LIMIT 1',
      [workspaceId, b.date, b.shift]
    );
    const assignment = assignments[0];
    if (!assignment) return res.status(404).json({ error: 'Jadwal shift tidak ditemukan untuk tanggal ini.' });

    const [staff] = await getPool().query('SELECT id FROM staff WHERE workspace_id = ? AND email = ?', [workspaceId, req.user.email]);
    const ids = [req.user.id, ...staff.map((s) => s.id)];
    if (!String(assignment.staff_ids || '').split(',').some((id) => ids.includes(id.trim()))) {
      return res.status(403).json({ error: 'Anda tidak ditugaskan pada shift ini.' });
    }

    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [existing] = await connection.query(
      'SELECT * FROM attendance WHERE workspace_id = ? AND assignment_id = ? AND staff_id IN (?) FOR UPDATE',
      [workspaceId, assignment.id, ids]
    );
    try { await assertAttendancePhoto(connection, workspaceId, req.user.id, cleanliness.kitchenPhotoId); }
    catch (err) { if (err.status !== 400) throw err; await connection.rollback(); return res.status(400).json({ error: 'Foto dapur wajib diunggah dan harus milik Anda.' }); }
    const payload = JSON.stringify({ areas: cleanliness.areas, kitchenPhotoId: cleanliness.kitchenPhotoId, kitchenPhotoDataUrl: '' });
    let attendanceId;
    if (existing.length) {
      const row = existing[0];
      // Checklist pulang bila sudah check-out, selain itu checklist masuk.
      const column = row.check_out_time ? 'check_out_cleanliness' : 'check_in_cleanliness';
      await connection.query(`UPDATE attendance SET ${column} = ? WHERE id = ?`, [payload, row.id]);
      attendanceId = row.id;
    } else {
      attendanceId = uid('att');
      await connection.query(
        `INSERT INTO attendance (id, workspace_id, assignment_id, att_date, shift, staff_id, staff_email, check_in_cleanliness)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [attendanceId, workspaceId, assignment.id, b.date, b.shift, req.user.id, req.user.email, payload]
      );
    }

    // Temuan "Perlu Ditangani" tetap harus punya tindak lanjut yang bisa dipantau Admin.
    for (const area of cleanliness.areas.filter((a) => a.status === 'Perlu Ditangani')) {
      await connection.query(
        `INSERT INTO cleanliness_followups (id, workspace_id, report_id, area_key, area_label, note, status, pic_id, pic_email, pic_name)
         VALUES (?, ?, ?, ?, ?, ?, 'Perlu Ditangani', ?, ?, ?)
         ON DUPLICATE KEY UPDATE note = VALUES(note), updated_at = CURRENT_TIMESTAMP`,
        [uid('fu'), workspaceId, `attendance:${attendanceId}`, area.key, AREA_LABELS[area.key] || area.key, area.note.trim(), req.user.id, req.user.email, req.user.name]
      );
    }

    await connection.commit();
    res.json({ ok: true, attendanceId });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ error: 'Gagal menyimpan checklist kebersihan.' });
  } finally {
    connection?.release();
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
    if (b.picId !== req.user.id) return res.status(403).json({ error: 'Laporan hanya dapat dikirim PIC dengan akun sendiri.' });
    const [assigned] = await getPool().query('SELECT pic_id FROM assignments WHERE workspace_id = ? AND shift_date = ? AND shift = ?', [workspaceId, b.date || now.date, b.shift]);
    const [members] = await getPool().query('SELECT id FROM staff WHERE workspace_id = ? AND email = ?', [workspaceId, req.user.email]);
    if (!assigned.some(a => [req.user.id, ...members.map(s => s.id)].includes(a.pic_id))) return res.status(403).json({ error: 'Anda bukan PIC shift ini.' });
    if (!Array.isArray(b.areas) || b.areas.length !== 6 || new Set(b.areas.map(a => a.key)).size !== 6 || b.areas.some(a => !cleanlinessAreaKeys.includes(a.key) || !['Sudah Beres', 'Perlu Ditangani'].includes(a.status) || typeof a.note !== 'string' || a.note.length > 1000 || (a.status === 'Perlu Ditangani' && !a.note.trim()))) return res.status(400).json({ error: 'Checklist enam area wajib lengkap.' });
    try {
      await assertAttendancePhoto(getPool(), workspaceId, req.user.id, b.generalPhotoId);
      for (const area of b.areas) {
        if (area.status === 'Perlu Ditangani' || area.photoId != null) await assertAttendancePhoto(getPool(), workspaceId, req.user.id, area.photoId);
      }
    } catch (err) { if (err.status !== 400) throw err; return res.status(400).json({ error: 'Foto dapur dan foto area bermasalah wajib diunggah dan harus milik Anda.' }); }
    const id = uid('clean');
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
        id, workspaceId, b.date || now.date, b.shift, b.picId, req.user.email, req.user.name,
        `${b.date || now.date} ${now.time} WIB`, now.time,
        JSON.stringify(b.areas ?? []), b.generalPhotoId || null, b.handoverNote || '',
        b.confirmedAiSummary || null, b.aiSummaryConfirmedAt || null, b.aiSummaryConfirmedBy || null,
      ]
    );
    // Temuan "Perlu Ditangani" harus punya tindak lanjut, bukan berhenti sebagai catatan.
    const [[saved]] = await getPool().query(
      'SELECT id FROM cleanliness_reports WHERE workspace_id = ? AND report_date = ? AND shift = ? LIMIT 1',
      [workspaceId, b.date || now.date, b.shift]
    );
    const reportId = saved?.id || id;
    const problemAreas = b.areas.filter((a) => a.status === 'Perlu Ditangani');
    for (const area of problemAreas) {
      await getPool().query(
        `INSERT INTO cleanliness_followups (id, workspace_id, report_id, area_key, area_label, note, status, pic_id, pic_email, pic_name)
         VALUES (?, ?, ?, ?, ?, ?, 'Perlu Ditangani', ?, ?, ?)
         ON DUPLICATE KEY UPDATE note = VALUES(note), updated_at = CURRENT_TIMESTAMP`,
        [uid('fu'), workspaceId, reportId, area.key, AREA_LABELS[area.key] || area.key, area.note.trim(), b.picId, req.user.email, req.user.name]
      );
    }
    res.json({ ok: true, id: reportId });
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
    if (!access.isSupervisor) return res.status(403).json({ error: 'Hanya Admin yang dapat mengubah status barang.' });
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

// Foto: rute privat (bukti tersimpan di server, terbaca dari perangkat lain).
registerPhotos(app, { getPool, requireAuth, loadWorkspace });

// 404 JSON untuk rute /api yang tidak dikenal
registerExtraRoutes(app, { getPool, requireAuth, loadWorkspace, uid, wibNow, isEmail, hashPassword, encryptSecret, decryptSecret });
registerOperations(app, { getPool, requireAuth, loadWorkspace, assertPhotoOwned: assertAttendancePhoto });

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

registerFrontend(app);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KitchenLog API berjalan pada port ${PORT}`);
  console.log(`Database: ${dbConfig.database || '(belum diset)'} @ ${dbConfig.host}:${dbConfig.port}`);
});
