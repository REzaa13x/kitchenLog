/**
 * Server pengembangan lokal.
 *
 * - Menyajikan aplikasi lewat Vite (mode pengembangan) atau dist/ (produksi).
 * - Mem-proxy /api ke layanan API MySQL agar frontend bisa memanggil
 *   /api/... tanpa konfigurasi CORS saat diuji di laptop.
 *
 * API-nya sendiri dijalankan terpisah: `npm run api`
 * (server/index.js dengan DB_HOST/DB_NAME sesuai .env).
 */
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: ['.env.local', '.env'] });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT) || 3000;
const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:5100';

async function startServer() {
  const app = express();

  // Proxy /api -> layanan API MySQL (tanpa dependensi tambahan).
  app.use('/api', async (req, res) => {
    try {
      const targetUrl = API_TARGET + req.originalUrl;
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks);

      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string' && !['host', 'connection', 'content-length'].includes(k)) {
          headers[k] = v;
        }
      }

      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
      });

      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key)) {
          res.setHeader(key, value);
        }
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    } catch (err) {
      res.status(502).json({
        error: 'API tidak dapat dihubungi. Jalankan `npm run api` terlebih dahulu.',
        detail: String((err as Error)?.message || err),
        target: API_TARGET,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: ROOT,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(ROOT, 'dist');
    if (!fs.existsSync(distDir)) {
      console.error(`Folder build tidak ditemukan di ${distDir}. Jalankan "npm run build" dulu.`);
      process.exit(1);
    }
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KitchenLog dev server berjalan pada http://0.0.0.0:${PORT}`);
    console.log(`Proxy /api -> ${API_TARGET}`);
  });
}

startServer().catch((err) => {
  console.error('Gagal menjalankan dev server:', err);
  process.exit(1);
});
