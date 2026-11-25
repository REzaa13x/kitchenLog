// Uji browser: "Rekap Pekerjaan Opening/Closing" tampil, bisa dicentang,
// dan progres tersimpan ke server (bukan hanya di layar).
//
// Jalankan: TEST_BASE=http://127.0.0.1:4181 node scripts/verify-shift-tasks-browser.cjs
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_MODULE || 'C:/Users/asus/AppData/Local/hermes/cache/pptr/node_modules/puppeteer-core');

(async () => {
  const base = process.env.TEST_BASE || 'http://127.0.0.1:4181';
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Local fixture only');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const user = { id: 'fixture-staff', name: 'Fixture Staff', email: 'fixture@example.invalid', role: 'staff' };
    const workspace = { id: 'fixture', kitchenName: 'Fixture' };
    const assignment = { id: 'fixture-shift', date: today, shift: 'opening', staffIds: [user.id, 'pic'], picId: 'pic' };

    const OPENING_TASKS = [
      { key: 'persiapan-dapur', label: 'Persiapan dapur', detail: 'Sapu, lap meja, lap kompor, cuci piring kotor jika ada' },
      { key: 'masak-nasi', label: 'Masak nasi 2 rice cooker' },
      { key: 'cek-bahan-kosong', label: 'Pengecekan bahan-bahan kosong untuk belanja' },
      { key: 'teh-air-gula', label: 'Bikin teh dan air gula' },
      { key: 'nasi-goreng-basic', label: 'Bikin nasi goreng basic tanpa kecap' },
      { key: 'bawang-cabe-chopper', label: 'Bawang dan cabe untuk nasi goreng jika habis, di chopper' },
      { key: 'marinasi-ayam', label: 'Marinasi ayam' },
    ];

    const progress = [];
    const patches = [];

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (!path.startsWith('/api/')) return void request.continue();
      const json = (status, body) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });

      if (path === '/api/auth/me') return json(200, { user, workspaces: [workspace] });
      if (path === '/api/state') {
        return json(200, {
          kitchenName: 'Fixture',
          users: [user, { id: 'pic', name: 'PIC', role: 'staff' }],
          assignments: [assignment],
          attendance: [],
          cleanlinessReports: [],
          cleanlinessFollowups: [],
          itemReports: [],
        });
      }
      if (path === '/api/shift-tasks' && request.method() === 'GET') {
        return json(200, { tasks: OPENING_TASKS, progress });
      }
      if (path === '/api/shift-tasks' && request.method() === 'PATCH') {
        const body = JSON.parse(request.postData() || '{}');
        patches.push(body);
        const existing = progress.find((p) => p.staffId === user.id && p.taskKey === body.taskKey);
        if (existing) existing.done = body.done;
        else progress.push({ staffId: user.id, taskKey: body.taskKey, done: body.done });
        return json(200, { ok: true, taskKey: body.taskKey, done: body.done });
      }
      return json(200, {});
    });

    await page.goto(base, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      localStorage.setItem('kitchenlog_token_v1', 'fixture-not-real');
      localStorage.setItem('kitchenlog_ws_v1', 'fixture');
    });
    await page.reload({ waitUntil: 'networkidle2' });

    await page.waitForFunction(() => document.body.textContent.includes('Rekap Pekerjaan Opening'), { timeout: 20000 });
    const text = await page.evaluate(() => document.body.textContent);
    for (const task of OPENING_TASKS) {
      assert.ok(text.includes(task.label), `tugas tampil: ${task.label}`);
    }
    assert.match(text, /0\/7 selesai/, 'penghitung mulai dari 0/7');
    console.log('PASS 7 tugas opening tampil sesuai daftar');

    // Centang tugas ke-2 (Masak nasi).
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Masak nasi 2 rice cooker'));
      if (!button) throw new Error('tombol tugas tidak ditemukan');
      button.click();
    });
    await page.waitForFunction(() => document.body.textContent.includes('1/7 selesai'), { timeout: 15000 });
    assert.equal(patches.length, 1, 'satu permintaan centang terkirim');
    assert.deepEqual(
      { taskKey: patches[0].taskKey, done: patches[0].done, date: patches[0].date, shift: patches[0].shift },
      { taskKey: 'masak-nasi', done: true, date: today, shift: 'opening' },
      'payload centang benar'
    );
    console.log('PASS centang tersimpan ke server (1/7)');

    // Batal centang -> kembali 0/7.
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Masak nasi 2 rice cooker'));
      button.click();
    });
    await page.waitForFunction(() => document.body.textContent.includes('0/7 selesai'), { timeout: 15000 });
    assert.equal(patches.length, 2);
    assert.equal(patches[1].done, false, 'pembatalan centang terkirim');
    console.log('PASS centang bisa dibatalkan (0/7)');

    // Muat ulang: progres diambil dari server, bukan state lokal.
    progress.length = 0;
    progress.push({ staffId: user.id, taskKey: 'marinasi-ayam', done: true });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.body.textContent.includes('1/7 selesai'), { timeout: 20000 });
    console.log('PASS progres dimuat dari server setelah muat ulang');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
