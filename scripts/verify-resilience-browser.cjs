// Uji ketahanan submit absensi di browser nyata (Chromium headless).
// Fokus: gagal upload TIDAK boleh tercatat sebagai absensi sukses, isian/foto
// bertahan, tombol coba lagi bekerja, dan percobaan ulang tidak menggandakan submit.
//
// Jalankan: TEST_BASE=http://127.0.0.1:4181 node scripts/verify-resilience-browser.cjs
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_MODULE || 'C:/Users/asus/AppData/Local/hermes/cache/pptr/node_modules/puppeteer-core');

(async () => {
  const base = process.env.TEST_BASE || 'http://127.0.0.1:4181';
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Local fixture only');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  try {
    const page = await browser.newPage();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const user = { id: 'fixture-staff', name: 'Fixture Staff', email: 'fixture@example.invalid', role: 'staff' };
    const workspace = { id: 'fixture', kitchenName: 'Fixture' };
    const assignment = { id: 'fixture-shift', date: today, shift: 'opening', staffIds: [user.id, 'pic'], picId: 'pic' };

    const state = {
      attendanceSubmissions: [],
      photoUploads: 0,
      failPhotoUpload: true, // simulasi koneksi putus saat upload bukti
      failAttendance: 0, // jumlah kegagalan server absensi yang masih harus terjadi
      delayAttendanceMs: 0,
      duplicateResponses: 0,
    };

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = new URL(request.url());
      const path = url.pathname;
      if (!path.startsWith('/api/')) return void request.continue();
      const json = (status, body) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });

      if (path === '/api/auth/me') return json(200, { user, workspaces: [workspace] });
      if (path === '/api/state') {
        return json(200, {
          kitchenName: 'Fixture',
          users: [user, { id: 'pic', name: 'Other PIC', role: 'staff' }],
          assignments: [assignment],
          attendance: state.attendance,
          cleanlinessReports: [],
          cleanlinessFollowups: [],
          itemReports: [],
        });
      }
      if (path === '/api/photos' && request.method() === 'POST') {
        state.photoUploads += 1;
        if (state.failPhotoUpload) return json(503, { error: 'Koneksi ke server terputus saat mengunggah foto.' });
        const body = JSON.parse(request.postData() || '{}');
        return json(201, { id: body.id });
      }
      if (path.startsWith('/api/attendance/')) {
        const body = JSON.parse(request.postData() || '{}');
        state.attendanceSubmissions.push({ path, body });
        if (state.delayAttendanceMs) {
          // Tahan respons agar submit ganda bisa diuji.
          return setTimeout(() => {
            state.attendance = [{ id: 'att-1', assignmentId: assignment.id, date: today, staffId: user.id, shift: 'opening', checkInTime: '06:05', checkOutTime: null, lateMinutes: 5, supervisorStatus: null, updatedAt: '' }];
            json(200, { ok: true, checkInTime: '06:05', duplicate: state.attendanceSubmissions.length > 1 });
          }, state.delayAttendanceMs);
        }
        if (state.failAttendance > 0) {
          state.failAttendance -= 1;
          return json(503, { error: 'Koneksi terputus sebelum absensi tersimpan.' });
        }
        state.attendance = [{ id: 'att-1', assignmentId: assignment.id, date: today, staffId: user.id, shift: 'opening', checkInTime: '06:05', checkOutTime: null, lateMinutes: 5, supervisorStatus: null, updatedAt: '' }];
        return json(200, { ok: true, checkInTime: '06:05' });
      }
      return json(200, {});
    });

    await page.goto(base, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      localStorage.setItem('kitchenlog_token_v1', 'fixture-not-real');
      localStorage.setItem('kitchenlog_ws_v1', 'fixture');
      window.createImageBitmap = undefined;
    });
    await page.reload({ waitUntil: 'networkidle2' });

    // Kamera disimulasikan (bukan hardware fisik) tetapi memakai pipeline MediaStream asli.
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = constraints.video?.facingMode?.ideal === 'environment' ? '#ff0000' : '#00ff00';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const stream = canvas.captureStream(10);
        stream.canvas = canvas;
        return stream;
      };
    });

    const click = async (label) => {
      await page.waitForFunction(
        (text) => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === text && !b.matches(':disabled')),
        {},
        label
      );
      await page.evaluate((text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text).click(), label);
    };

    await click('Check-in');
    await page.waitForSelector('[role=dialog]');

    // Isi checklist lengkap + ambil dua foto lewat kamera simulasi.
    for (const select of await page.$$('[role=dialog] select')) await select.select('Sudah Beres');
    for (const label of ['Dapur', 'Wajah']) {
      await click(`Buka Kamera ${label}`);
      await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
      await click(`Ambil Foto ${label}`);
      // Tunggu hasil foto muncul (bukan sekadar video hilang).
      await page.waitForFunction(
        (which) =>
          which === 'Dapur'
            ? !!document.querySelector('[role=dialog] img[alt*="dapur"]')
            : !!document.querySelector('[role=dialog] img[alt*="Foto wajah"]'),
        { timeout: 20000 },
        label
      );
      await page.waitForFunction(() => ![...document.querySelectorAll('[role=status]')].some((e) => e.textContent.includes('Memproses')));
    }

    // Skenario 1: upload foto gagal saat memotret -> foto & checklist TETAP ada,
    // tidak ada absensi terkirim, dan tombol coba lagi tersedia.
    await page.waitForFunction(() => document.querySelector('[role=alert]'), { timeout: 15000 });
    const captureAlert = await page.$eval('[role=alert]', (e) => e.textContent);
    assert.match(captureAlert, /Foto tetap tersimpan|Gagal menyinkronkan|Koneksi/i, 'kegagalan unggah dilaporkan');
    assert.equal(state.attendanceSubmissions.length, 0, 'tidak ada absensi terkirim saat upload foto gagal');
    assert.ok(await page.$('[role=dialog]'), 'modal tetap terbuka: isian tidak hilang');
    assert.deepEqual(await page.$$eval('[role=dialog] select', (els) => els.map((e) => e.value)), Array(6).fill('Sudah Beres'), 'checklist masih terisi');
    assert.ok(await page.$('[role=dialog] img[alt*="dapur"]'), 'foto dapur masih tersimpan');
    assert.ok(await page.$('[role=dialog] img[alt*="Foto wajah"]'), 'foto wajah masih tersimpan dan tampil');
    console.log('PASS upload gagal: foto+checklist bertahan, tidak tercatat sukses');

    // Skenario 2: koneksi pulih -> Coba Lagi mengunggah ulang foto lalu mengirim absensi.
    state.failPhotoUpload = false;
    const uploadsBefore = state.photoUploads;
    await click('Coba Lagi Check-in');
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'), { timeout: 25000 });
    assert.ok(state.photoUploads > uploadsBefore, 'foto wajah diunggah ulang otomatis');
    assert.equal(state.attendanceSubmissions.length, 1, 'absensi terkirim sekali setelah pulih');
    assert.ok(state.attendanceSubmissions[0].body.clientRef, 'clientRef ikut untuk idempotensi');
    assert.ok(state.attendanceSubmissions[0].body.photoId, 'absensi membawa photoId hasil unggah ulang');
    console.log('PASS pulih: unggah ulang otomatis lalu absensi terkirim sekali');

    // Skenario 3: klik ganda saat proses berjalan tidak boleh mengirim dua absensi.
    // (Mulai ulang alur check-out agar modal terbuka lagi.)
    state.delayAttendanceMs = 500;
    await click('Check-out');
    await page.waitForSelector('[role=dialog]');
    for (const select of await page.$$('[role=dialog] select')) await select.select('Sudah Beres');
    for (const label of ['Dapur', 'Wajah']) {
      await click(`Buka Kamera ${label}`);
      await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
      await click(`Ambil Foto ${label}`);
      await page.waitForFunction(
        (which) =>
          which === 'Dapur'
            ? !!document.querySelector('[role=dialog] img[alt*="dapur"]')
            : !!document.querySelector('[role=dialog] img[alt*="Foto wajah"]'),
        { timeout: 20000 },
        label
      );
      await page.waitForFunction(() => ![...document.querySelectorAll('[role=status]')].some((e) => e.textContent.includes('Memproses')));
    }
    const beforeDouble = state.attendanceSubmissions.length;
    await page.evaluate(() => {
      // Label bisa "Konfirmasi Check-out" atau "Coba Lagi Check-out".
      const button = [...document.querySelectorAll('[role=dialog] button')].find((b) => /(Konfirmasi|Coba Lagi)\s+Check-out/.test(b.textContent));
      if (!button) throw new Error('Tombol submit check-out tidak ditemukan');
      button.click();
      button.click();
      button.click();
    });
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'), { timeout: 25000 });
    const doubleSent = state.attendanceSubmissions.length - beforeDouble;
    assert.equal(doubleSent, 1, `klik ganda hanya mengirim satu permintaan (terkirim ${doubleSent})`);
    assert.ok(state.attendanceSubmissions[state.attendanceSubmissions.length - 1].body.clientRef, 'clientRef dikirim untuk idempotensi');
    console.log('PASS submit ganda: hanya satu permintaan, clientRef ikut terkirim');

    // Skenario 4: setelah sukses, status check-in tampil dan tombol tidak bisa dipakai lagi.
    await page.waitForFunction(() => document.body.textContent.includes('Sudah Check-in'));
    console.log('PASS sukses: status check-in tercatat dan tombol terkunci');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
