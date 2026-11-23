# KitchenLog — Operasional Harian Dapur

Aplikasi operasional harian dapur: absensi staf per shift, laporan kebersihan
berbasis foto, serah terima antar shift, dan pelaporan barang rusak/hilang.

## Menjalankan secara lokal

**Prasyarat:** Node.js

1. Install dependency:
   `npm install`
2. Jalankan aplikasi:
   `npm run dev`
3. Buka http://localhost:3000

Tidak ada API key yang perlu diisi. Pengaturan opsional (mis. `PORT`) dapat
disalin dari [.env.example](.env.example) menjadi `.env.local`.

## Perintah

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Menjalankan server + Vite (mode pengembangan) |
| `npm run build` | Build produksi ke `dist/` |
| `npm start` | Menjalankan server dari hasil build (`NODE_ENV=production`) |
| `npm run lint` | Pemeriksaan TypeScript (`tsc --noEmit`) |
| `npm run lint:rules` | Lint aturan Firestore |

## Catatan arsitektur

- **Frontend:** React + Vite, Firebase Auth & Firestore (`src/firebase.ts`).
- **Backend:** `server.ts` hanya menyajikan aplikasi (Vite middleware saat
  pengembangan, `dist/` statis saat produksi).
- **Ringkasan Serah Terima** disusun di sisi aplikasi melalui
  `src/utils/handoverSummary.ts` — deterministik, tanpa panggilan jaringan,
  tanpa API key, dan tanpa mengirim data operasional ke pihak ketiga.
