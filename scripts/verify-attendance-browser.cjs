// Run against an isolated local preview: TEST_BASE=http://127.0.0.1:4181 node scripts/verify-attendance-browser.cjs
// Supply PUPPETEER_MODULE and CHROME_PATH if not installed/on PATH. All API traffic is intercepted.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_MODULE || 'puppeteer-core');

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
    const user = { id: 'fixture-staff', name: 'Fixture non-PIC', email: 'fixture@example.invalid', role: 'staff' };
    const workspace = { id: 'fixture', kitchenName: 'Fixture', role: 'staff' };
    const assignment = { id: 'fixture-shift', date: today, shift: 'opening', staffIds: [user.id, 'pic'], picId: 'pic' };
    let attendance = [];
    const submissions = [];
    await page.setRequestInterception(true);
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (!path.startsWith('/api/')) return void request.continue();
      let data = {};
      if (path === '/api/auth/me') data = { user, workspaces: [workspace] };
      else if (path === '/api/workspaces') data = { workspaces: [workspace] };
      else if (path === '/api/state') data = { kitchenName: 'Fixture', users: [user, { id: 'pic', name: 'Other PIC', role: 'staff' }], assignments: [assignment], attendance, cleanlinessReports: [], itemReports: [] };
      else if (path.startsWith('/api/attendance/')) {
        submissions.push(JSON.parse(request.postData()));
        attendance = [{ id: 'fixture-att', assignmentId: assignment.id, date: today, staffId: user.id, shift: 'opening', checkInTime: '08:00', checkOutTime: submissions.length === 2 ? '12:00' : null }];
        data = { ok: true };
      }
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(base, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      localStorage.setItem('kitchenlog_token_v1', 'fixture-not-real');
      localStorage.setItem('kitchenlog_active_workspace_v1', 'fixture');
      // Prove uploads work without createImageBitmap (Safari/older browser fallback).
      window.createImageBitmap = undefined;
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      // Synthetic media, not physical hardware: real MediaStream/video/canvas/IndexedDB pipeline.
      navigator.mediaDevices.getUserMedia = async constraints => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = constraints.video?.facingMode?.ideal === 'environment' ? '#ff0000' : '#00ff00';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const stream = canvas.captureStream(10);
        // Retain source canvas for the lifetime of its track.
        stream.canvas = canvas;
        return stream;
      };
    });
    const click = async label => {
      await page.waitForFunction(label => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === label && !b.matches(':disabled')), {}, label);
      await page.evaluate(label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label).click(), label);
    };
    const waitIdle = () => page.waitForFunction(() => !document.querySelector('[role=dialog] button:last-child')?.matches(':disabled') && ![...document.querySelectorAll('[role=status]')].some(e => e.textContent.includes('Memproses')));
    for (const action of ['Check-in', 'Check-out']) {
      await click(action);
      await page.waitForSelector('[role=dialog]');
      assert.equal(await page.$('video'), null, 'Camera never auto-starts');
      await click(`Konfirmasi ${action}`);
      await page.waitForSelector('[role=alert]');
      assert.match(await page.$eval('[role=alert]', e => e.textContent), /Foto wajah wajib/);
      for (const select of await page.$$('[role=dialog] select')) await select.select('Sudah Beres');
      await page.select('[role=dialog] select', 'Perlu Ditangani');
      await click(`Konfirmasi ${action}`);
      assert.match(await page.$eval('[role=alert]', e => e.textContent), /Isi catatan Meja persiapan/);
      await page.type('[aria-label="Catatan Meja persiapan"]', 'Fixture note');
      assert.match(await page.$eval('[role=dialog]', e => e.textContent), /Checklist lengkap: 6\/6/);
      if (action === 'Check-in') {
        for (const [label, guide] of [['Dapur', 'grid'], ['Wajah', 'oval']]) {
          await click(`Buka Kamera ${label}`);
          await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
          assert.ok(await page.$(`[data-camera-guide="${guide}"]`));
          await click(`Ambil Foto ${label}`);
          await page.waitForFunction(() => !document.querySelector('video'));
          await waitIdle();
        }
      } else {
        // Independent file uploads exercise native image decode and real canvas JPEG compression.
        await page.evaluate(() => { window.createImageBitmap = undefined; });
        for (const target of ['kitchen', 'face']) {
          await page.$eval(`#attendance-${target}-photo`, (input, target) => {
            const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1000;
            const ctx = canvas.getContext('2d'); ctx.fillStyle = target === 'kitchen' ? '#ff0000' : '#00ff00'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0));
            const transfer = new DataTransfer(); transfer.items.add(new File([bytes], `${target}.png`, { type: 'image/png' }));
            input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
          }, target);
          await page.waitForFunction(target => target === 'kitchen' ? !!document.querySelector('img[alt*="dapur"]') : !!document.querySelector('img[alt*="Foto wajah"]'), {}, target);
          await waitIdle();
        }
      }
      await click(`Konfirmasi ${action}`);
      await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
      console.log(`PASS non-PIC ${action}: missing requirements, notes, six statuses, separate kitchen/face ${action === 'Check-in' ? 'captures' : 'uploads'}`);
    }
    assert.equal(submissions.length, 2);
    for (const payload of submissions) {
      assert.ok(payload.photoId);
      assert.equal(payload.cleanliness.areas.length, 6);
      assert.match(payload.cleanliness.kitchenPhotoDataUrl, /^data:image\/jpeg;base64,/);
      assert.ok(payload.cleanliness.kitchenPhotoDataUrl.length <= 2 * 1024 * 1024);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
