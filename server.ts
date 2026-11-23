import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Muat .env.local terlebih dahulu (sesuai instruksi README), lalu .env sebagai cadangan.
// dotenv memakai berkas pertama yang ditemukan untuk setiap variabel, sehingga
// .env.local menang atas .env tanpa menimpa variabel yang sudah ada di lingkungan.
dotenv.config({ path: ['.env.local', '.env'] });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Catatan: Ringkasan Serah Terima disusun sepenuhnya di sisi klien
  // (src/utils/handoverSummary.ts). Tidak ada endpoint AI dan tidak ada
  // API key yang dibutuhkan, sehingga tidak ada data operasional dapur
  // yang dikirim ke layanan pihak ketiga.

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (!fs.existsSync(distDir)) {
      console.error(
        `Folder build tidak ditemukan di ${distDir}. Jalankan "npm run build" terlebih dahulu.`
      );
      process.exit(1);
    }
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KitchenLog server berjalan pada http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Gagal menjalankan server KitchenLog:', err);
  process.exit(1);
});
