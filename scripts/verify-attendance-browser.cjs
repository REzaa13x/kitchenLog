// Uji absensi: wajah wajib; TEST_KITCHEN=1 menambahkan lampiran dapur opsional,
// lalu checklist kebersihan diisi terpisah di halaman Kebersihan.
//
// Jalankan: TEST_BASE=http://127.0.0.1:4181 node scripts/verify-attendance-browser.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const kitchen = process.env.TEST_KITCHEN === '1';
const artifacts = path.join(process.env.TEST_ARTIFACT_DIR || 'C:/Users/asus/AppData/Local/hermes/cache/scratch', 'attendance-kitchen');
fs.mkdirSync(artifacts, { recursive: true });
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
    await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 1 });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const user = { id: 'fixture-staff', name: 'Fixture non-PIC', email: 'fixture@example.invalid', role: 'staff' };
    const workspace = { id: 'fixture', kitchenName: 'Fixture' };
    const assignment = { id: 'fixture-shift', date: today, shift: 'opening', staffIds: [user.id, 'pic'], picId: 'pic' };
    let attendance = [];
    const submissions = [];
    const photoUploads = [];
    let failKitchen = kitchen;

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (!path.startsWith('/api/')) return void request.continue();
      const json = (status, body) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (path === '/api/auth/me') return json(200, { user, workspaces: [workspace] });
      if (path === '/api/state') {
        return json(200, {
          kitchenName: 'Fixture',
          users: [user, { id: 'pic', name: 'Other PIC', role: 'staff' }],
          assignments: [assignment],
          attendance,
          cleanlinessReports: [],
          cleanlinessFollowups: [],
          itemReports: [],
        });
      }
      if (path === '/api/photos') {
        photoUploads.push(JSON.parse(request.postData() || '{}'));
        if (failKitchen && photoUploads.length === 2) { failKitchen = false; return json(503, { error: 'Fixture upload interrupted' }); }
        return json(201, { id: JSON.parse(request.postData() || '{}').id });
      }
      if (path.startsWith('/api/attendance/')) {
        const body = JSON.parse(request.postData() || '{}');
        submissions.push({ path, body });
        attendance = [{
          id: 'fixture-att',
          assignmentId: assignment.id,
          date: today,
          staffId: user.id,
          shift: 'opening',
          checkInTime: '06:05',
          checkOutTime: submissions.length === 2 ? '12:00' : null,
          lateMinutes: 5,
          supervisorStatus: null,
          updatedAt: '',
        }];
        return json(200, { ok: true, checkInTime: '06:05', checkOutTime: '12:00' });
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

    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        canvas.getContext('2d').fillRect(0, 0, canvas.width, canvas.height);
        const stream = canvas.captureStream(10);
        stream.canvas = canvas;
        return stream;
      };
    });

    // Klik tombol pertama yang cocok & aktif; label tombol bisa berubah (mis. 'Coba Lagi Check-out').
    const click = async (label) => {
      await page.waitForFunction((text) => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === text && !b.disabled), { timeout: 20000 }, label);
      await page.evaluate((text) => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text && !b.disabled);
        if (!btn) throw new Error('Tombol tidak ditemukan: ' + text);
        btn.click();
      }, label);
    };

    for (const action of ['Check-in', 'Check-out']) {
      await click(action);
      await page.waitForSelector('[role=dialog]');

      // Checklist tetap terpisah; foto dapur opsional.
      const dialogText = await page.$eval('[role=dialog]', (e) => e.textContent);
      assert.match(dialogText, /Foto wajah \(wajib\)/, 'modal hanya meminta foto wajah');
      assert.doesNotMatch(dialogText, /Checklist kebersihan wajib/, 'checklist tidak lagi di modal absensi');
      assert.equal(await page.$$eval('[role=dialog] select', (els) => els.length), 0, 'tidak ada dropdown checklist di modal');

      // Tanpa foto -> ditolak dengan pesan jelas.
      await click(`Konfirmasi ${action}`);
      await page.waitForSelector('[role=alert]');
      assert.match(await page.$eval('[role=alert]', (e) => e.textContent), /Foto wajah wajib/);

      assert.match(dialogText, /Foto kondisi dapur \(opsional\)/);
      if (kitchen && action === 'Check-out') assert.equal(await page.$('[role=dialog] img'), null, 'new session clears both photos');
      // Ambil foto wajah lewat kamera simulasi.
      await click('Buka Kamera Wajah');
      await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
      assert.ok(await page.$('[data-camera-guide="oval"]'), 'panduan wajah (oval) tampil');
      if (kitchen) await page.screenshot({ path: path.join(artifacts, `${action}-oval.png`), fullPage: true });
      await click('Ambil Foto Wajah');
      await page.waitForFunction(() => !!document.querySelector('[role=dialog] img[alt*="Foto wajah"]'), { timeout: 20000 });
      await page.waitForFunction(() => ![...document.querySelectorAll('[role=status]')].some((e) => e.textContent.includes('Memproses')));

      if (kitchen) {
        await click('Buka Kamera Dapur');
        await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
        assert.ok(await page.$('[data-camera-guide="grid"]'));
        await page.screenshot({ path: path.join(artifacts, `${action}-grid.png`), fullPage: true });
        if (action === 'Check-out') {
          const fixture = path.join(artifacts, 'upload-fixture.png');
          fs.writeFileSync(fixture, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64'));
          await (await page.$('#attendance-kitchen-photo')).uploadFile(fixture);
        } else await click('Ambil Foto Dapur');
        await page.waitForFunction(() => !!document.querySelector('[role=dialog] img[alt*="Foto kondisi dapur"]'));
        await page.waitForFunction(() => ![...document.querySelectorAll('[role=status]')].some(e => e.textContent.includes('Memproses')));
        await page.screenshot({ path: path.join(artifacts, `${action}-photos.png`), fullPage: true });
        assert.equal(submissions.length, action === 'Check-in' ? 0 : 1, 'failed upload never submits attendance');
      }
      // Simpan absensi.
      await click(kitchen && action === 'Check-in' ? `Coba Lagi ${action}` : `Konfirmasi ${action}`);
      await page.waitForFunction(() => !document.querySelector('[role=dialog]'), { timeout: 20000 });
      console.log(`PASS ${action}: cukup foto wajah, tanpa checklist di modal`);
    }

    assert.equal(submissions.length, 2, 'dua absensi terkirim (masuk & pulang)');
    for (const { body } of submissions) {
      assert.ok(body.photoId, 'setiap absensi membawa photoId');
      assert.equal(Boolean(body.kitchenPhotoId), kitchen);
      if (kitchen) assert.notEqual(body.kitchenPhotoId, body.photoId);
      assert.equal(body.cleanliness, undefined, 'absensi tidak lagi mengirim checklist');
      assert.ok(body.clientRef, 'clientRef dikirim untuk idempotensi');
    }
    assert.equal(photoUploads.length >= 2, true, 'foto wajah diunggah ke server');
    if (kitchen) { assert.equal(photoUploads[1].id, photoUploads[2].id, 'kitchen retry retains ID'); console.log('PASS kitchen attachment both modes, grid, upload retry, session reset; screenshots:', artifacts); }

    // Halaman Kebersihan: status PIC vs checklist pribadi dibedakan.
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const nav = buttons.find((b) => b.textContent.trim() === 'Kebersihan');
      if (nav) nav.click();
    });
    await page.waitForFunction(() => document.body.textContent.includes('Checklist Kebersihan Saya (6 Area)'), { timeout: 15000 });
    const cleanlinessText = await page.evaluate(() => document.body.textContent);
    assert.match(cleanlinessText, /Laporan Kebersihan PIC Shift/, 'status laporan PIC dijelaskan terpisah');
    assert.match(cleanlinessText, /Checklist Kebersihan Saya \(6 Area\)/, 'staf punya checklist sendiri');
    console.log('PASS halaman Kebersihan: status PIC dan checklist pribadi dipisah');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
