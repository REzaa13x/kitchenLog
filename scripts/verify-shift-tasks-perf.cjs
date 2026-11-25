// Uji performa: memastikan centang tugas TIDAK memicu muat ulang seluruh data
// dan daftar tugas tidak di-fetch berulang-ulang.
//
// Jalankan: TEST_BASE=http://127.0.0.1:4181 node scripts/verify-shift-tasks-perf.cjs
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_MODULE || 'C:/Users/asus/AppData/Local/hermes/cache/pptr/node_modules/puppeteer-core');

(async () => {
  const base = process.env.TEST_BASE || 'http://127.0.0.1:4181';
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

    const TASKS = [
      { key: 'persiapan-dapur', label: 'Persiapan dapur' },
      { key: 'masak-nasi', label: 'Masak nasi 2 rice cooker' },
      { key: 'cek-bahan-kosong', label: 'Pengecekan bahan-bahan kosong untuk belanja' },
      { key: 'teh-air-gula', label: 'Bikin teh dan air gula' },
      { key: 'nasi-goreng-basic', label: 'Bikin nasi goreng basic tanpa kecap' },
      { key: 'bawang-cabe-chopper', label: 'Bawang dan cabe untuk nasi goreng jika habis, di chopper' },
      { key: 'marinasi-ayam', label: 'Marinasi ayam' },
    ];

    const counts = { state: 0, shiftTasks: 0, patches: 0 };
    const progress = [];

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (!path.startsWith('/api/')) return void request.continue();
      const json = (status, body) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });

      if (path === '/api/auth/me') return json(200, { user, workspaces: [workspace] });
      if (path === '/api/state') {
        counts.state += 1;
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
        counts.shiftTasks += 1;
        return json(200, { tasks: TASKS, progress });
      }
      if (path === '/api/shift-tasks' && request.method() === 'PATCH') {
        counts.patches += 1;
        const body = JSON.parse(request.postData() || '{}');
        const existing = progress.find((p) => p.taskKey === body.taskKey);
        if (existing) existing.done = body.done;
        else progress.push({ staffId: user.id, taskKey: body.taskKey, done: body.done });
        return json(200, { ok: true });
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

    // Tunggu sebentar: kalau ada loop fetch, jumlahnya akan membengkak.
    await new Promise((r) => setTimeout(r, 2500));
    assert.equal(counts.shiftTasks, 1, `daftar tugas hanya di-fetch sekali saat dibuka (aktual: ${counts.shiftTasks})`);
    const stateAfterOpen = counts.state;
    console.log(`PASS buka halaman: /api/state ${stateAfterOpen}x, /api/shift-tasks ${counts.shiftTasks}x`);

    // Centang 3 tugas berurutan.
    for (const label of ['Persiapan dapur', 'Masak nasi 2 rice cooker', 'Marinasi ayam']) {
      await page.evaluate((text) => {
        const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text));
        if (!button) throw new Error('tombol tidak ditemukan: ' + text);
        button.click();
      }, label);
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), { timeout: 5000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 350));
    }
    await page.waitForFunction(() => document.body.textContent.includes('3/7 selesai'), { timeout: 10000 });

    assert.equal(counts.patches, 3, `tiga centang = tiga PATCH (aktual: ${counts.patches})`);
    assert.equal(counts.state, stateAfterOpen, `centang TIDAK memuat ulang /api/state (aktual: +${counts.state - stateAfterOpen})`);
    assert.equal(counts.shiftTasks, 1, `centang tidak memicu fetch daftar tugas ulang (aktual: ${counts.shiftTasks})`);
    console.log(`PASS centang 3 tugas: ${counts.patches} PATCH, 0 muat ulang /api/state, 0 fetch tambahan`);

    // Responsivitas: waktu dari klik sampai UI berubah.
    const t0 = Date.now();
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Bikin teh dan air gula'));
      button.click();
    });
    await page.waitForFunction(() => document.body.textContent.includes('4/7 selesai'), { timeout: 10000 });
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 1500, `UI merespons cepat (${elapsed}ms)`);
    console.log(`PASS responsif: UI berubah dalam ${elapsed}ms`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
