# Runbook operasional KitchenLog

## Status / batas bukti

- Audit statis `server/index.js`, `server/routes-extra.js`, `database/dapurops-schema.sql`; tidak mengubah API/data produksi. Tidak commit, deploy, atau memasang scheduler.
- Backup/restore nyata lulus lokal: Windows XAMPP MariaDB **10.4.32**, Node **24.9.0**, `mysql.exe` + `mysqldump.exe` di `C:/xampp/mysql/bin`. Fixture disposable: 2 tabel, 2 baris; Unicode, kutip, newline, BLOB, NULL, tabel kosong. Schema hash + data hash sama setelah restore; checksum palsu/overwrite ditolak. Fixture bukan salinan produksi atau bukti seluruh migrasi aplikasi.
- **Belum layak menyatakan semua gate selesai:** temuan otorisasi di bawah; restore produksi ke staging belum diuji; CLI/izin DB hosting belum dibuktikan; uji kamera/izin/perilaku jaringan di telepon fisik Android/iPhone belum dilakukan. Simulasi browser bukan bukti perangkat fisik.

## Temuan keamanan: blokir rilis sampai ditinjau

Temuan tabel berikut merekam **baseline saat audit dimulai**, bukan klaim bahwa patch paralel belum diterapkan. Saat penutupan, `index.js` sudah terlihat menambah validasi PIC/checklist; worker lain juga mengubah foto dan jadwal. Pemilik rilis wajib memeriksa diff final dan regression test sebelum menandai temuan selesai; laporan ini tidak menyertifikasi patch paralel.

Semua rute data berikut memakai `requireAuth` dan cek anggota workspace. Masalahnya **bukan anonymous write**, tetapi izin terlalu luas / otorisasi objek / pemalsuan atribusi oleh anggota terautentikasi. Tidak mengirim request mutasi untuk membuktikan temuan ini di produksi.

| Prioritas | Rute / lokasi | Temuan dan tindak lanjut |
| --- | --- | --- |
| Kritis | `POST /api/cleanliness`, `index.js:548–577` | `picId`, `picName`, tanggal, konfirmasi/nama/waktu konfirmator dari body; tidak memverifikasi PIC shift. `id` dari body + upsert PK global dapat menimpa isi laporan workspace lain bila ID diketahui, walau akses hanya dicek untuk workspace body. Ikat aktor/PIC pada sesi+assignment; tolak ID milik workspace lain; validasi checklist/foto; konfirmasi server-only. |
| Kritis | `POST /api/photos`, `index.js:624–642` | `id` dari body + `ON DUPLICATE KEY UPDATE data_url` tanpa scope/owner dapat mengganti bukti workspace lain bila ID diketahui. Validasi hanya panjang, bukan magic bytes/MIME. ID server-generated atau update bersyarat workspace+owner; validasi format/ukuran. |
| Tinggi | `POST /api/cleanliness/:id/confirm-summary`, `routes-extra.js:128–148` | Semua anggota dapat menimpa ringkasan/handover; tidak ada aturan PIC/supervisor. Nama aktor sesi benar, tetapi izin konfirmasi belum dibatasi. |
| Tinggi | `PATCH /api/items/:id/status`, `index.js:605–621` | Semua anggota dapat menutup/membuka ulang laporan; tanpa aturan supervisor, transisi, audit actor. Tentukan izin eksplisit, enforce backend. |
| Sedang | `POST /api/items`, `index.js:580–603` | ID/email pelapor dari sesi, tetapi nama dari body; validasi jumlah, tanggal, bukti minim. Gunakan nama sesi dan validasi skema. |
| Sedang | `POST /api/assignments`, `routes-extra.js:73–94`; `/attendance/absence:97–125` | Sudah supervisor-only, tetapi staf/PIC tidak dibuktikan anggota workspace/assignment; lookup staf absensi hanya ID. Validasi relasi server-side. |
| Sedang | `attendanceAssignment`, `index.js:465–471` | Memeriksa keanggotaan assignment, bukan tanggal assignment; check-in/out dapat memakai jadwal hari lain. Verifikasi aturan tanggal/shift, termasuk lintas tengah malam. |
| Sedang | `/api/health`, error handler | Detail error DB dan nama DB bisa keluar; sanitasi detail pada production. Jangan log kredensial atau data URL. |

Schema: PK `photos.id` / `cleanliness_reports.id` global menjelaskan risiko upsert lintas workspace. FK workspace `ON DELETE CASCADE`: penghapusan dapur menghapus bukti terkait. CSV `staff_ids`/`pic_id` tidak punya FK; constraint DB tidak menggantikan validasi relasi aplikasi. `dapurops-schema.sql` **bukan backup**, berisi `DROP TABLE`, belum seluruh migrasi terbaru; petunjuk register publik di footer sudah usang (register ditutup). Jangan import ke DB berisi data.

## Backup server-only

1. Pastikan `node`, `mysql`, `mysqldump` tersedia. Windows XAMPP terdeteksi otomatis. Linux: pasang client sesuai versi server; MariaDB dapat memakai override `MYSQL_BIN=/usr/bin/mariadb`, `MYSQLDUMP_BIN=/usr/bin/mariadb-dump`. Override harus path executable, bukan perintah shell.
2. Set environment privat proses server: `DATABASE_URL` / `MYSQL_URL`, atau `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Tidak ada `VITE_*`. Jangan menaruh URL/password di argv/history, frontend, Git, atau chat. `--env-file` opsional Node 22+; untuk panel gunakan environment backend yang sudah ada.
3. Gunakan akun backup minimal SELECT/SHOW VIEW yang diperlukan client; tanpa izin DML/DDL. Script membaca metadata+baris saja pada sumber. Hindari DDL dan hentikan sementara mutasi operasional selama snapshot+verifikasi (hash sebelum/sesudah menolak perubahan teramati, bukan global write lock).
4. Jalankan dari root repo, output **di luar webroot/repo** pada volume privat:

   ```sh
   node --env-file=.env scripts/backup-verify.mjs backup /secure-backups/kitchenlog-YYYYMMDD-HHMM.sql
   # Windows: ganti path output dengan D:/private-backups/kitchenlog-YYYYMMDD-HHMM.sql
   ```

   Output: `.sql` + `.sql.json` (SHA-256 file, hash schema/data, jumlah baris setiap tabel). Exit nonzero berarti gagal; file lama tidak ditimpa. Rahasiakan keduanya: dump memuat password hash, session token, kontak, foto. Unix mode 0600/0700; Windows wajib ACL folder privat, mode POSIX tidak cukup.
5. Salin terenkripsi ke lokasi off-host berakses terbatas; verifikasi restore sebelum menghapus generasi lama. Usulan kebijakan untuk persetujuan pemilik: harian, 7 harian + 4 mingguan, target RPO 24 jam; RTO belum diukur untuk volume produksi. Tidak ada jadwal/retensi yang diaktifkan script. Monitor job eksternal dan umur backup setelah pemilik menyetujui penjadwalan.

Batas: hanya tabel dasar InnoDB tanpa trigger/routine/event/view; lainnya gagal tertutup, gunakan backup native yang ditinjau. Hash baris memuat satu tabel dalam RAM; kapasitas harus diuji dengan volume sebenarnya. Client dan server harus kompatibel; TLS koneksi remote belum dikonfigurasi oleh script, jalankan pada host DB/kanal privat aman atau gunakan backup native provider yang mendukung TLS terverifikasi. Password hanya diteruskan dalam environment child `MYSQL_PWD`, bukan argv/log; admin OS tetap bisa membacanya. Jangan memakai mesin multi-user tidak tepercaya.

## Restore drill / recovery

1. Sediakan server MySQL/MariaDB **lokal terisolasi**, versi/collation kompatibel sumber. Jangan tunnel loopback ke produksi. Set `BACKUP_VERIFY_HOST=127.0.0.1`, `BACKUP_VERIFY_PORT`, `BACKUP_VERIFY_USER`, `BACKUP_VERIFY_PASSWORD` di environment privat; akun drill perlu CREATE/DROP database disposable. Variabel sumber produksi tidak digunakan untuk restore.
2. Uji fixture bawaan, lalu verifikasi backup riil terpercaya:

   ```sh
   node scripts/backup-verify.mjs self-test
   node scripts/backup-verify.mjs verify /secure-backups/kitchenlog-YYYYMMDD-HHMM.sql
   ```

   `verify` memeriksa SHA-256 sebelum import; membuat DB acak `kl_verify_*`, import melalui client native, membandingkan nama tabel/jumlah baris/hash schema/hash isi, lalu menghapus **hanya DB yang dibuat proses ini** melalui `finally`. Tidak menerima nama target restore. Import SQL adalah eksekusi kode: hanya gunakan dump script sendiri yang dipercaya; hash mendeteksi korupsi, bukan tanda tangan keaslian. Putus listrik/kill paksa dapat menyisakan DB disposable; tinjau nama/ownership sebelum cleanup manual, jangan wildcard DROP.
3. Bila mismatch: jangan overwrite sumber/backup; periksa perubahan saat snapshot, versi client/server, collation, kapasitas RAM, izin. Simpan evidence exit/log yang disanitasi. Restore PASS bukan bukti aplikasi berjalan.
4. Pemulihan produksi butuh persetujuan pemilik, maintenance, backup kondisi terkini, restore ke DB **baru** lewat mekanisme provider yang ditinjau, migrasi kompatibel, smoke test login/workspace/shift/absensi/foto/rekap. Baru ubah koneksi aplikasi, restart, pastikan persistence. Jangan import langsung menimpa DB aktif. Cabut sesi lama setelah restore dengan proses yang disetujui. Rollback aplikasi + konfigurasi DB sebagai pasangan; rollback kode saja tidak mengembalikan data.

## Gate operasional sebelum go-live

- [ ] Temuan otorisasi diselesaikan pemilik API; regression test staf/PIC/admin/beda workspace, unauthorized 401/403; jangan menguji mutasi di production.
- [ ] Build/lint/test repo dan health `/api/health` lulus; proses `npm start` produksi menggunakan env backend benar, HTTPS, restart policy, log rotation/alert tanpa secrets.
- [ ] Migrasi terbaru ditinjau; backup sebelum migrasi; tidak menjalankan schema DROP. Hosting panel belum mendukung konversi same-site: jangan mengubah/deploy situs sebagai jalan pintas.
- [ ] Backup sumber riil, restore drill terisolasi, off-host recovery, kapasitas/latensi dan waktu pemulihan diuji. Scheduler/retensi baru setelah persetujuan eksplisit.
- [ ] Restart tetap mempertahankan foto/absensi/rekap. Foto ada di DB (`photos` dan JSON checklist absensi); filesystem lampiran masa depan perlu backup terpisah.
- [ ] Android + iPhone fisik HTTPS: izinkan/tolak kamera, ambil ulang, upload, opening/closing, jaringan lambat/putus, retry tidak menggandakan submit, logout/login, riwayat/rekap tetap benar. Catat OS/browser, hasil, bukti tanpa data pribadi.
- [ ] Monitoring: health DB, login error, 5xx, disk, usia backup, kegagalan restore drill. Gangguan: hentikan mutasi bila data diragukan; simpan bukti privat; beri tahu pemilik; jangan bersihkan data destruktif.
