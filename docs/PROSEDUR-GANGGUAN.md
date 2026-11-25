# Prosedur Gangguan & Pemulihan DapurOps

Dokumen untuk Admin/pemilik. Fokus: apa yang dilakukan saat aplikasi bermasalah, tanpa kehilangan data bukti.

## 1. Kontak & urutan eskalasi

1. Admin dapur (cek jadwal, absensi, koreksi).
2. Pemilik teknis (server, database, deploy).
3. Provider hosting (jika DB/panel down).

Catat waktu kejadian, gejala, dan aksi yang dilakukan. Jangan menghapus data untuk "membersihkan" masalah.

## 2. Cek cepat (5 menit)

```sh
curl -s https://dapurops.ngolab.online/api/health
```

- `{"ok":true,"db_connected":true}` → aplikasi & DB sehat; masalah biasanya di perangkat/jaringan staf.
- `503` / `db_connected:false` → masalah database atau kredensial; lanjut ke bagian 4.
- Tidak ada respons → proses backend mati atau hosting down; cek panel proses.

## 3. Gangguan per gejala

| Gejala | Dugaan | Tindakan |
| --- | --- | --- |
| Staf tidak bisa login, pesan "Sesi sudah berakhir" | Token kedaluwarsa/dicabut (reset password atau akun Geasteats nonaktif) | Minta staf login ulang. Bila akun nonaktif, aktifkan di Geasteats lalu **Sinkronkan staf**. |
| Absensi gagal terus, pesan koneksi | Jaringan staf / backend lambat | Pastikan `/api/health` OK. Minta staf tekan **Coba Lagi** tanpa menutup layar. |
| Foto tidak muncul di perangkat Admin | Foto lama (sebelum migrasi) atau sesi berbeda | Cek `/api/photos/:id` dengan token Admin. Foto lama tetap terbaca; foto baru ada di tabel `private_photos`. |
| Rekap kosong padahal ada shift | Filter tanggal/staf salah, atau jadwal belum dibuat | Longgarkan rentang tanggal, pilih "Semua staf". |
| "Lupa check-out" menumpuk | Staf tidak menutup shift | Buka **Rekap → Koreksi**, isi jam pulang + alasan. Tercatat di audit. |
| Kamera tidak terbuka di HP | Izin browser ditolak / bukan HTTPS | Pastikan HTTPS. Arahkan staf memakai **Unggah Foto**. |

## 4. Database bermasalah

1. **Jangan** menjalankan `database/dapurops-schema.sql` pada DB berisi data (file itu berisi `DROP TABLE`).
2. Cek koneksi & kredensial di environment proses backend (jangan pernah menaruhnya di chat/Git).
3. Bila data dicurigai rusak: **hentikan mutasi** (minta staf berhenti absen), backup kondisi terkini, baru investigasi.
4. Pulihkan hanya dari backup yang sudah lolos verifikasi (bagian 5), ke **database baru**, lalu arahkan aplikasi setelah smoke test.

## 5. Backup harian (wajib aktif)

Backup menulis ke folder **di luar webroot** (default `../dapurops-backups`).

```sh
# jalankan manual (uji)
node --env-file=.env scripts/backup-daily.mjs

# tanpa drill restore (lebih cepat)
node --env-file=.env scripts/backup-daily.mjs --no-verify
```

- Nama file: `dapurops-YYYYMMDD.sql` + `.json` (manifest SHA-256).
- Backup di hari yang sama **tidak menimpa** file sebelumnya.
- Retensi default 14 hari; hanya file berpola nama itu yang dihapus.
- Output `{"status":"PASS", ... "restore":"PASS"}` berarti dump **dan** drill restore berhasil.

**Jadwal otomatis** (pilih salah satu, jam 03.00 WIB agar sepi):

```cron
# crontab -e  (server Linux, WIB)
0 3 * * * cd /path/ke/kitchenLog && /usr/bin/node --env-file=.env scripts/backup-daily.mjs >> /var/log/dapurops-backup.log 2>&1
```

Panel Kroombox: buat **Cron Job** dengan perintah yang sama (lihat menu Cron di panel situs).

Periksa hasilnya: log berisi `"status":"PASS"`, dan folder backup bertambah setiap hari. Bila log berisi `FAIL`, tangani sebelum kejadian nyata.

## 6. Uji pemulihan (sekali per bulan)

```sh
# 1. drill pada fixture (tidak menyentuh data asli)
BACKUP_VERIFY_HOST=127.0.0.1 BACKUP_VERIFY_USER=root node scripts/backup-verify.mjs self-test

# 2. verifikasi backup riil terakhir
BACKUP_VERIFY_HOST=127.0.0.1 BACKUP_VERIFY_USER=root node scripts/backup-verify.mjs verify /secure-backups/dapurops-YYYYMMDD.sql
```

Restore drill membuat database `kl_verify_*` sementara lalu menghapusnya sendiri. **Jangan** mengarahkan `BACKUP_VERIFY_*` ke produksi.

Uji regresi lengkap (butuh MySQL lokal):

```sh
node scripts/backup-restore-test.mjs   # backup + restore DB bermigrasi, bukti foto byte-identik
node scripts/backup-daily-test.mjs     # retensi & anti-timpa
```

## 7. Pemulihan produksi (bila benar-benar perlu)

1. Dapatkan persetujuan pemilik; umumkan maintenance.
2. Backup kondisi terkini (walau rusak) — jangan dilewati.
3. Restore ke **database baru** lewat mekanisme provider/`mysql`.
4. Jalankan migrasi yang belum ada, lalu smoke test: login staf, buka shift, check-in, lihat foto dari perangkat lain, buka rekap.
5. Baru arahkan aplikasi ke DB baru, restart, dan pastikan data bertahan setelah restart.
6. Cabut sesi lama (`DELETE FROM sessions`), minta semua staf login ulang.
7. Catat: waktu, durasi, jumlah baris hilang (jika ada), dan penyebab.

## 8. Migrasi skema terbaru

Jalankan **sekali** (backup dulu):

```sh
mysql -u USER -p NAMA_DB < database/migrations/20261125-photos.sql
mysql -u USER -p NAMA_DB < database/migrations/20261126-operations.sql
```

`20261126-operations.sql` menambah tabel `attendance_audit`, `cleanliness_followups`, serta kolom `early_leave_minutes`, `overnight`, `client_ref` pada `attendance`. Pernyataan `ALTER` tidak bisa diulang — jika dijalankan dua kali akan error "Duplicate column", abaikan bila kolom sudah ada.

## 9. Verifikasi cepat setelah deploy

```sh
node scripts/backend-auth-test.mjs     # auth, aturan shift, idempoten, otorisasi
node scripts/operations-test.mjs       # koreksi+audit, rekap, CSV, tindak lanjut
node scripts/photos-test.mjs           # foto server-side & lintas perangkat
```

Uji browser (butuh `vite preview` di port 4181):

```sh
npx vite preview --port 4181 &
TEST_BASE=http://127.0.0.1:4181 node scripts/verify-attendance-browser.cjs
TEST_BASE=http://127.0.0.1:4181 node scripts/verify-resilience-browser.cjs
```

## 10. Temuan nyata saat deploy produksi (25 Nov 2026)

Dicatat agar tidak terulang:

1. **Cron panel tidak mewarisi environment backend.** `node scripts/backup-daily.mjs` gagal
   `Missing/invalid database configuration`. Perbaikan: `backup-verify.mjs` kini memuat `.env`
   repo sendiri (tanpa menimpa env asli) dan tetap gagal tertutup bila tidak ada.
2. **`~` tidak di-expand** oleh cron panel. Perbaikan: `backup-daily.mjs` meng-expand `~` sendiri
   dan selalu memakai path absolut.
3. **Direktori kerja sandbox bisa bersifat sementara**, sehingga backup yang "PASS" bisa hilang
   bersama sandbox. Karena itu backup wajib dikirim keluar server:
   set `BACKUP_UPLOAD_URL` (+ `BACKUP_UPLOAD_TOKEN` bila perlu). Script akan keluar dengan
   status `PARTIAL` dan exit code 1 bila unggahan gagal.
4. **Redeploy tidak selalu memperbarui folder API.** Setelah redeploy, verifikasi berkas server
   (`server/operations.js`, `attendance-rules.js`, `photos.js` ada) dan restart proses bila perlu.
5. **SPA fallback** membuat URL apa pun (termasuk `/dapurops-backups/...`) membalas HTTP 200
   berisi `index.html`. Jangan simpulkan kebocoran dari status 200 — periksa isi/`sha256`.

## 11. Yang belum boleh diklaim selesai

- Uji kamera pada **HP fisik** Android/iPhone dengan HTTPS.
- Restore produksi penuh (drill sudah terbukti, restore produksi belum).
- Jadwal cron backup harus dipasang & dipantau di hosting.
