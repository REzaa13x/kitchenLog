// Smoke test PRODUKSI: membuat staf uji sementara, memakai alur nyata lewat HTTPS,
// lalu membersihkan seluruh data uji. Tidak menyentuh data staf asli.
//
// Jalankan: ADMIN_USER=... ADMIN_PASS=... node scripts/production-smoke.mjs
const BASE = process.env.SMOKE_BASE || 'https://dapurops.ngolab.online/api';
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

if (!ADMIN_USER || !ADMIN_PASS) {
  console.error('ADMIN_USER dan ADMIN_PASS wajib diisi lewat environment (jangan di argumen).');
  process.exit(1);
}

const stamp = Date.now().toString(36).slice(-6);
const username = `smoke${stamp}`;
const password = `Smoke-${stamp}-Pass1`;
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
const AREAS = ['meja_persiapan', 'kompor_area_masak', 'wastafel', 'lantai', 'tempat_sampah', 'area_penyimpanan'];

let adminToken = null;
let staffId = null;
let assignmentId = null;
let attendanceId = null;

try {
  // 1. Login Admin
  const login = await api('/auth/login', { method: 'POST', body: { username: ADMIN_USER, password: ADMIN_PASS } });
  check('login Admin', login.status === 200 && Boolean(login.data?.token), `HTTP ${login.status}`);
  if (login.status !== 200) throw new Error('Login Admin gagal; hentikan smoke test.');
  adminToken = login.data.token;
  const workspaceId = login.data.user ? (await api('/auth/me', { token: adminToken })).data.workspaces[0].id : null;
  check('workspace Admin ditemukan', Boolean(workspaceId), workspaceId || '');
  if (!workspaceId) throw new Error('Workspace tidak ditemukan.');

  // 2. Admin membuat staf uji (username & password dibuat acak)
  const created = await api('/staff', {
    method: 'POST',
    token: adminToken,
    body: { workspaceId, name: `Smoke ${stamp}`, role: 'staff', jobTitle: 'Staf Uji', username, password },
  });
  check('Admin membuat staf uji', created.status === 201, `HTTP ${created.status}`);
  if (created.status !== 201) throw new Error('Gagal membuat staf uji.');
  staffId = created.data.id;

  // 3. Staf uji login
  const staffLogin = await api('/auth/login', { method: 'POST', body: { username, password } });
  check('staf uji login', staffLogin.status === 200 && Boolean(staffLogin.data?.token), `HTTP ${staffLogin.status}`);
  const staffToken = staffLogin.data.token;
  const staffUserId = staffLogin.data.user.id;

  // 4. Admin membuat jadwal hari ini untuk staf uji
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const sched = await api('/assignments', {
    method: 'POST',
    token: adminToken,
    body: { workspaceId, date: today, shift: 'closing', staffIds: [staffUserId], picId: staffUserId },
  });
  check('Admin membuat jadwal shift', sched.status === 201, `HTTP ${sched.status}`);
  assignmentId = sched.data?.id;

  // 5. Unggah foto bukti ke server (bukti lintas perangkat)
  const photoId = `smoke-${stamp}-face`;
  const upload = await api('/photos', {
    method: 'POST',
    token: staffToken,
    body: { workspaceId, id: photoId, source: 'camera', dataUrl: PNG },
  });
  check('foto bukti tersimpan di server', upload.status === 201 || upload.status === 200, `HTTP ${upload.status}`);

  // 6. Foto bisa dibaca ulang (dari "perangkat lain" = Admin)
  const readBack = await api(`/photos/${encodeURIComponent(photoId)}?workspaceId=${encodeURIComponent(workspaceId)}`, { token: adminToken });
  check('Admin membaca foto staf dari perangkat lain', readBack.status === 200 && String(readBack.data?.dataUrl || '').startsWith('data:image/'), `HTTP ${readBack.status}`);

  // 7. Check-in dengan bukti lengkap
  const evidence = { areas: AREAS.map((key) => ({ key, status: 'Sudah Beres', note: '' })), kitchenPhotoDataUrl: PNG };
  const clientRef = `smoke-${stamp}-ref`;
  const checkIn = await api('/attendance/check-in', {
    method: 'POST',
    token: staffToken,
    body: { workspaceId, assignmentId, staffId: staffUserId, photoId, cleanliness: evidence, clientRef },
  });
  check('check-in tercatat', checkIn.status === 200 && checkIn.data?.ok === true, `HTTP ${checkIn.status} ${JSON.stringify(checkIn.data).slice(0, 120)}`);

  // 8. Retry dengan clientRef sama harus idempoten (bukan dobel)
  const retry = await api('/attendance/check-in', {
    method: 'POST',
    token: staffToken,
    body: { workspaceId, assignmentId, staffId: staffUserId, photoId, cleanliness: evidence, clientRef },
  });
  check('retry idempoten (tidak menggandakan)', retry.status === 200 && retry.data?.duplicate === true, `HTTP ${retry.status} duplicate=${retry.data?.duplicate}`);

  // 9. Checklist "Perlu Ditangani" membuat tindak lanjut otomatis
  const problemEvidence = {
    areas: AREAS.map((key) => (key === 'kompor_area_masak' ? { key, status: 'Perlu Ditangani', note: `Smoke ${stamp} kerak` } : { key, status: 'Sudah Beres', note: '' })),
    kitchenPhotoDataUrl: PNG,
  };
  const clean = await api('/cleanliness', {
    method: 'POST',
    token: staffToken,
    body: { workspaceId, date: today, shift: 'closing', picId: staffUserId, picName: 'Smoke', areas: problemEvidence.areas, generalPhotoId: photoId, handoverNote: '' },
  });
  check('laporan kebersihan tersimpan', clean.status === 200, `HTTP ${clean.status}`);
  const follow = await api(`/cleanliness/followups?workspaceId=${encodeURIComponent(workspaceId)}`, { token: adminToken });
  const mine = (follow.data?.followups || []).filter((f) => String(f.note).includes(`Smoke ${stamp}`));
  check('temuan otomatis jadi tindak lanjut', mine.length === 1, `${mine.length} entri`);

  // 10. Admin menyelesaikan tindak lanjut dengan bukti
  if (mine.length) {
    const resolve = await api(`/cleanliness/followups/${encodeURIComponent(mine[0].id)}`, {
      method: 'PATCH',
      token: adminToken,
      body: { workspaceId, status: 'Selesai', resolutionNote: `Smoke ${stamp} dibersihkan`, resolutionPhotoId: photoId },
    });
    check('tindak lanjut selesai dengan bukti', resolve.status === 200, `HTTP ${resolve.status}`);
  }

  // 11. Rekap operasional + ekspor CSV
  const report = await api(`/reports/operational?workspaceId=${encodeURIComponent(workspaceId)}&from=${today}&to=${today}`, { token: adminToken });
  check('rekap operasional terbentuk', report.status === 200 && Array.isArray(report.data?.rows), `HTTP ${report.status}`);
  const csvRes = await fetch(`${BASE}/reports/operational.csv?workspaceId=${encodeURIComponent(workspaceId)}&from=${today}&to=${today}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const csvText = await csvRes.text();
  check('ekspor CSV berisi data', csvRes.status === 200 && csvText.includes('Nama Staf'), `HTTP ${csvRes.status}`);

  // 12. Koreksi absensi oleh Admin + audit
  const attRow = (report.data?.rows || []).find((r) => r.staffName === `Smoke ${stamp}`);
  attendanceId = attRow?.attendanceId || null;
  const correction = await api('/attendance/correction', {
    method: 'POST',
    token: adminToken,
    body: { workspaceId, attendanceId, checkOutTime: '17:00', reason: `Smoke ${stamp} uji koreksi` },
  });
  check('koreksi absensi Admin tersimpan', correction.status === 200, `HTTP ${correction.status}`);
  const audit = await api(`/attendance/audit?workspaceId=${encodeURIComponent(workspaceId)}`, { token: adminToken });
  const auditMine = (audit.data?.audit || []).filter((a) => String(a.reason).includes(`Smoke ${stamp}`));
  check('jejak audit mencatat koreksi', auditMine.length >= 1, `${auditMine.length} entri`);
  if (auditMine.length) {
    check('audit menyimpan nilai sebelum & sesudah', Boolean(auditMine[0].before) && Boolean(auditMine[0].after), 'before/after ada');
  }

  // 13. Staf tidak boleh mengoreksi absensi (otorisasi)
  const forbidden = await api('/attendance/correction', {
    method: 'POST',
    token: staffToken,
    body: { workspaceId, attendanceId, checkOutTime: '16:00', reason: 'Staf mencoba koreksi' },
  });
  check('staf ditolak saat mengoreksi', forbidden.status === 403, `HTTP ${forbidden.status}`);
} catch (error) {
  console.error('ERROR:', error.message);
  results.push({ name: 'eksekusi', ok: false, extra: error.message });
} finally {
  // Bersihkan data uji (urutan penting karena FK).
  if (adminToken) {
    try {
      const me = await api('/auth/me', { token: adminToken });
      const workspaceId = me.data?.workspaces?.[0]?.id;
      if (workspaceId) {
        const follow = await api(`/cleanliness/followups?workspaceId=${encodeURIComponent(workspaceId)}`, { token: adminToken });
        for (const f of follow.data?.followups || []) {
          if (String(f.note).includes(`Smoke ${stamp}`)) {
            await api(`/cleanliness/followups/${encodeURIComponent(f.id)}`, { method: 'PATCH', token: adminToken, body: { workspaceId, status: 'Sedang Ditangani' } }).catch(() => {});
          }
        }
      }
      if (staffId) await api(`/staff/${encodeURIComponent(staffId)}?workspaceId=${encodeURIComponent(await api('/auth/me', { token: adminToken }).then((r) => r.data.workspaces[0].id))}`, { method: 'DELETE', token: adminToken });
    } catch { /* pembersihan sebaik mungkin */ }
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\nRINGKASAN: ${results.length - failed.length}/${results.length} PASS`);
  console.log(JSON.stringify({ ok: failed.length === 0, failed: failed.map((f) => f.name) }));
  process.exitCode = failed.length === 0 ? 0 : 1;
}
