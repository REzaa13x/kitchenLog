/**
 * Server pengembangan lokal (Vite middleware).
 *
 * Dipakai oleh `npm run dev` dan `npm run dev:demo` di laptop.
 * Di panel hosting, layanan backend memakai `server.ts` -> `server/index.js`
 * (API MySQL), sedangkan frontend disajikan statis dari `dist/`.
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

async function startServer() {
  const app = express();

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
  });
}

startServer().catch((err) => {
  console.error('Gagal menjalankan dev server:', err);
  process.exit(1);
});
