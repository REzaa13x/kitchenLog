// @kp-no-patch
/**
 * Pintu masuk layanan backend KitchenLog.
 *
 * Panel Kroombox menjalankan `node server.ts` untuk layanan backend.
 * Berkas ini hanya meneruskan ke API MySQL yang sesungguhnya ada di
 * `server/index.js` (Express + mysql2 + auth token sesi).
 *
 * Penanda `@kp-no-patch` di baris pertama mencegah panel menulis ulang berkas ini.
 */
import './server/index.js';
