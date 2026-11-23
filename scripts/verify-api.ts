// Uji end-to-end seluruh API terhadap MySQL lokal (XAMPP).
const BASE = 'http://localhost:5100';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log(`ok    ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`FAIL  ${name}${extra ? ' :: ' + extra : ''}`);
  }
}

async function api(path: string, opts: { method?: string; body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(BASE + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function main() {
  const email = `uji.${Date.now()}@dapurops.test`;

  // 1. health
  const h = await api('/api/health');
  ok('health 200 + db_connected', h.status === 200 && h.data?.db_connected === true, JSON.stringify(h.data));

  // 2. register
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Uji Coba', email, phone: '08123456789', password: 'dapur12345' },
  });
  ok('register 201 + token', reg.status === 201 && !!reg.data?.token, JSON.stringify(reg.data));
  const token = reg.data?.token;
  const wsId = reg.data?.workspace?.id;

  // 3. register email duplikat
  const dup = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Uji Coba', email, phone: '08123456789', password: 'dapur12345' },
  });
  ok('register email duplikat -> 409', dup.status === 409);

  // 4. validasi nomor telepon salah
  const badPhone = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'X', email: `x${Date.now()}@t.test`, phone: '123', password: 'dapur12345' },
  });
  ok('register telepon salah -> 400', badPhone.status === 400);

  // 5. login
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email, password: 'dapur12345' },
  });
  ok('login 200', login.status === 200 && !!login.data?.token);
  ok('login menyimpan nomor telepon', login.data?.user?.phone === '08123456789');

  // 6. login password salah
  const badLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email, password: 'salahbanget' },
  });
  ok('login password salah -> 401', badLogin.status === 401);

  // 7. state tanpa token
  const noAuth = await api(`/api/state?workspaceId=${wsId}`);
  ok('state tanpa token -> 401', noAuth.status === 401);

  // 8. state dengan token
  const st = await api(`/api/state?workspaceId=${wsId}`, { token });
  ok('state 200', st.status === 200, JSON.stringify(st.data));
  ok('state punya 1 staf (supervisor)', st.data?.users?.length === 1);
  ok('state array kosong valid', Array.isArray(st.data?.assignments) && Array.isArray(st.data?.attendance));

  // 9. tambah staf
  const staff = await api('/api/staff', {
    method: 'POST',
    token,
    body: { workspaceId: wsId, name: 'Budi Santoso', email: `budi.${Date.now()}@t.test`, role: 'staff', jobTitle: 'Juru Masak' },
  });
  ok('tambah staf 201', staff.status === 201, JSON.stringify(staff.data));
  const staffId = staff.data?.id;

  // 10. tambah staf email salah
  const badStaff = await api('/api/staff', {
    method: 'POST',
    token,
    body: { workspaceId: wsId, name: 'X', email: 'bukanemail', role: 'staff', jobTitle: 'X' },
  });
  ok('tambah staf email salah -> 400', badStaff.status === 400);

  // 11. jadwal shift
  const today = new Date().toISOString().slice(0, 10);
  const asg = await api('/api/assignments', {
    method: 'POST',
    token,
    body: { workspaceId: wsId, date: today, shift: 'opening', staffIds: [staffId], picId: staffId },
  });
  ok('simpan jadwal 201', asg.status === 201, JSON.stringify(asg.data));

  // 12. jadwal shift tidak valid
  const badAsg = await api('/api/assignments', {
    method: 'POST',
    token,
    body: { workspaceId: wsId, date: today, shift: 'sore', staffIds: [staffId], picId: staffId },
  });
  ok('shift tidak valid -> 400', badAsg.status === 400);

  // 13. absen masuk
  const stateAfterAsg = await api(`/api/state?workspaceId=${wsId}`, { token });
  const assignmentId = stateAfterAsg.data?.assignments?.[0]?.id;
  const ci = await api('/api/attendance/check-in', {
    method: 'POST',
    token,
    body: { workspaceId: wsId, assignmentId, staffId, photoId: null },
  });
  ok('absen masuk 200', ci.status === 200, JSON.stringify(ci.data));

  // 14. absen keluar
  const co = await api('/api/attendance/check-out', {
    method: 'POST',
    token,
    body: { workspaceId: wsId, assignmentId, staffId, photoId: null },
  });
  ok('absen keluar 200', co.status === 200, JSON.stringify(co.data));

  // 15. konfirmasi izin
  const ab = await api('/api/attendance/absence', {
    method: 'POST',
    token,
    body: { workspaceId: wsId, assignmentId, staffId, status: 'Izin', note: 'Ada urusan keluarga' },
  });
  ok('konfirmasi izin 200', ab.status === 200, JSON.stringify(ab.data));

  // 16. laporan kebersihan
  const areas = [
    { key: 'wastafel', label: 'Wastafel', status: 'Perlu Ditangani', note: 'Mampet', photoId: null },
  ];
  const clean = await api('/api/cleanliness', {
    method: 'POST',
    token,
    body: {
      workspaceId: wsId, date: today, shift: 'opening', picId: staffId, picName: 'Budi Santoso',
      areas, generalPhotoId: null, handoverNote: 'Stok saus siap',
    },
  });
  ok('simpan laporan kebersihan 200', clean.status === 200, JSON.stringify(clean.data));
  const cleanId = clean.data?.id;

  // 17. konfirmasi ringkasan serah terima
  const conf = await api(`/api/cleanliness/${cleanId}/confirm-summary`, {
    method: 'POST',
    token,
    body: { workspaceId: wsId, summary: '1. Area Wastafel perlu ditangani: mampet.', handoverNote: 'Stok saus siap' },
  });
  ok('konfirmasi ringkasan 200', conf.status === 200, JSON.stringify(conf.data));

  // 18. laporan barang
  const item = await api('/api/items', {
    method: 'POST',
    token,
    body: {
      workspaceId: wsId, type: 'Barang Hilang', itemName: 'Pisau daging', quantity: 2,
      location: 'Area Potong', lastKnownLocation: 'Rak 2', notes: 'Tidak ada', shift: 'opening', date: today,
    },
  });
  ok('laporan barang 201', item.status === 201, JSON.stringify(item.data));
  const itemId = item.data?.id;

  // 19. ubah status barang
  const itemStatus = await api(`/api/items/${itemId}/status`, {
    method: 'PATCH',
    token,
    body: { workspaceId: wsId, status: 'Ditindaklanjuti', resolutionNote: 'Sedang dicari' },
  });
  ok('ubah status barang 200', itemStatus.status === 200);

  // 20. status tidak valid
  const badStatus = await api(`/api/items/${itemId}/status`, {
    method: 'PATCH',
    token,
    body: { workspaceId: wsId, status: 'Entah' },
  });
  ok('status tidak valid -> 400', badStatus.status === 400);

  // 21. foto
  const photo = await api('/api/photos', {
    method: 'POST',
    token,
    body: { workspaceId: wsId, dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(200), source: 'camera' },
  });
  ok('simpan foto 201', photo.status === 201, JSON.stringify(photo.data));
  const photoId = photo.data?.id;

  // 22. baca foto
  const getPhoto = await api(`/api/photos/${photoId}?workspaceId=${wsId}`, { token });
  ok('baca foto 200', getPhoto.status === 200 && !!getPhoto.data?.data_url);

  // 23. state akhir memuat semua data
  const final = await api(`/api/state?workspaceId=${wsId}`, { token });
  ok('state: 2 staf', final.data?.users?.length === 2, String(final.data?.users?.length));
  ok('state: 1 jadwal', final.data?.assignments?.length === 1);
  ok('state: 1 absensi', final.data?.attendance?.length === 1);
  ok('state: 1 laporan kebersihan', final.data?.cleanlinessReports?.length === 1);
  ok('state: 1 laporan barang', final.data?.itemReports?.length === 1);
  ok('state: ringkasan tersimpan', final.data?.cleanlinessReports?.[0]?.confirmedAiSummary?.includes('Wastafel'));
  ok('state: status izin tersimpan', final.data?.attendance?.[0]?.supervisorStatus === 'Izin');

  // 24. workspace lain tidak bisa diakses (isolasi)
  const other = await api('/api/state?workspaceId=ws-palsu', { token });
  ok('workspace asing -> 404', other.status === 404);

  // 25. logout
  const out = await api('/api/auth/logout', { method: 'POST', token });
  ok('logout 200', out.status === 200);
  const afterLogout = await api(`/api/state?workspaceId=${wsId}`, { token });
  ok('token mati setelah logout -> 401', afterLogout.status === 401);

  // 26. endpoint tidak dikenal (tanpa token -> 401 karena middleware auth lebih dulu;
  //     dengan token valid -> 404 JSON)
  const nfNoAuth = await api('/api/tidak-ada');
  ok('endpoint asing tanpa token -> 401', nfNoAuth.status === 401);
  const tokenBaru = (await api('/api/auth/login', { method: 'POST', body: { email, password: 'dapur12345' } })).data?.token;
  const nf = await api('/api/tidak-ada', { token: tokenBaru });
  ok('endpoint asing dengan token -> 404 JSON', nf.status === 404 && !!nf.data?.error, JSON.stringify(nf));

  console.log(`\n=== RINGKASAN: ${pass} lulus, ${fail} gagal ===`);
  if (fail > 0) console.log('Gagal:', failures.join(' | '));
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('ERROR FATAL:', e);
  process.exit(1);
});
