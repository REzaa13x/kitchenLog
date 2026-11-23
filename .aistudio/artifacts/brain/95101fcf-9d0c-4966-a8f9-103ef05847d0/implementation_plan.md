# KitchenLog — Operasional Harian Dapur & Serah Terima Shift

KitchenLog adalah aplikasi web responsif berbahasa Indonesia untuk mencatat absensi staf per shift, laporan kebersihan berbasis foto, catatan serah terima antar-shift, serta pelaporan dan penanganan barang rusak atau hilang. Aplikasi dirancang untuk penggunaan satu tangan di HP bagi staf dan PIC Shift, serta dashboard terstruktur di laptop bagi Supervisor, dengan penyimpanan persisten lokal (`localStorage` dan `IndexedDB`).

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Seluruh keputusan desain dari sesi klarifikasi telah dikunci dan digabungkan dengan kebutuhan operasional KitchenLog.

- **Pengaturan Waktu (Terkonfirmasi)**: Menggunakan zona waktu `Asia/Jakarta` (WIB) asli disertai kontrol **Simulasi Jam** di panel Mode Demo. Hal ini memungkinkan penguji mencoba skenario check-in tepat waktu, keterlambatan per menit tanpa masa toleransi, serah terima pukul 12.00 WIB, dan konfirmasi `Izin`/`Sakit`/`Alpa` setelah shift berakhir kapan saja.
- **Pengambilan Foto Bukti (Terkonfirmasi)**: Mendukung kamera langsung di dalam aplikasi (`getUserMedia`) dengan pratinjau dan tombol ulang, sekaligus menyediakan opsi unggah file perangkat. Setiap bukti foto diberi label sumber (`Foto Kamera` atau `Foto Unggahan`) agar keaslian waktu pengambilan terlihat jelas.
- **Tata Letak Navigasi (Terkonfirmasi)**: Menggunakan sidebar kiri tetap pada layar laptop/desktop untuk kenyamanan Supervisor meninjau tabel dan laporan, serta bilah navigasi bawah pada layar HP agar seluruh kontrol utama staf berada dalam jangkauan ibu jari.

---

## 1. Overview & Core Concept

- **Apa yang Dilakukan**: Menyatukan empat alur harian dapur dalam satu sistem terikat penugasan shift:
  1. **Absensi Berbasis Penugasan**: Check-in dan check-out Opening (`06.00–12.00 WIB`) serta Closing (`12.00–17.00 WIB`) yang menghitung keterlambatan per menit dan durasi kerja secara akurat tanpa tertukar di jam pergantian `12.00 WIB`.
  2. **Laporan Kebersihan & Serah Terima**: Checklist 6 area dapur wajib bagi PIC Shift dengan bukti foto kondisi umum, foto khusus untuk area `Perlu Ditangani`, dan kolom `Catatan Serah Terima` dari Opening yang otomatis muncul pada tim Closing.
  3. **Laporan Barang Rusak atau Hilang**: Formulir cepat dari halaman `Hari Ini` dengan validasi spesifik jenis laporan dan alur penanganan `Dilaporkan` → `Ditindaklanjuti` → `Selesai`.
  4. **Kontrol & Riwayat Supervisor**: Pengaturan jadwal serta penunjukan PIC, konfirmasi status absen pasca-shift, tindak lanjut barang, dan arsip riwayat per tanggal dan shift.
- **Target Pengguna**: Staf Dapur (akses HP), PIC Shift Opening & Closing (akses HP), dan Supervisor Dapur (akses laptop & HP).
- **Nilai Utama**: Menghilangkan catatan kertas dan pesan chat yang tercecer pada jam sibuk pergantian shift, dengan kejelasan bukti foto dan akuntabilitas status yang langsung terlihat saat berganti akun di Mode Demo.

---

## 2. User Experience & Visual Design

### Alur Pengguna Utama

1. **Masuk / Pilih Akun Demo**: Pengguna memilih salah satu akun berlabel **Mode Demo** (Supervisor, PIC Opening, PIC Closing, atau Staf Reguler) dan dapat menyetel jam simulasi WIB bila ingin menguji skenario jam tertentu atau mereset data demo.
2. **Alur Staf & PIC di HP (`Hari Ini`)**:
   - Melihat kartu jadwal shift hari ini (tanggal WIB, nama shift, jam mulai–selesai), status kehadiran, dan tombol besar satu-tangan **Check-in** / **Check-out**.
   - Jika shift Closing, otomatis melihat panel **Catatan Serah Terima dari Opening** beserta pengingat **Laporan Barang Terbuka** lintas shift/hari.
   - Tombol utama **Laporkan Barang** tersedia langsung dari halaman `Hari Ini` untuk membuka formulir ringkas dengan validasi di dekat kolom terkait.
   - Khusus **PIC Shift**, muncul bagian **Laporan Kebersihan Shift** berisi 6 checklist area (`Meja persiapan`, `Kompor dan area masak`, `Wastafel`, `Lantai`, `Tempat sampah`, `Area penyimpanan`), pengambilan foto kamera/unggahan, dan kolom `Catatan Serah Terima` (khusus Opening).
3. **Alur Supervisor di Laptop (`Dashboard` & Modul Operasional)**:
   - **Dashboard Supervisor**: Dua kartu ringkasan utama berdampingan (**Opening** dan **Closing**) menampilkan jumlah staf terjadwal, sudah check-in, terlambat, status laporan kebersihan (`Belum Dikirim` / `Sudah Dikirim`), serta daftar staf yang perlu konfirmasi pasca-shift (`Izin`, `Sakit`, `Alpa`) dan ringkasan laporan barang terbuka.
   - **Jadwal Shift**: Formulir memilih tanggal operasional, shift, daftar staf, dan menunjuk tepat satu PIC untuk shift tersebut.
   - **Detail Laporan Kebersihan**: Menampilkan hasil per area, foto dengan label sumber (`Foto Kamera` / `Foto Unggahan`), catatan area bermasalah, catatan serah terima, nama PIC, dan waktu kirim.
   - **Daftar & Detail Laporan Barang**: Filter berdasarkan jenis (`Barang Rusak` / `Barang Hilang`) dan status (`Dilaporkan` / `Ditindaklanjuti` / `Selesai`), serta alur pembaruan status yang mewajibkan `Catatan Hasil Penanganan` sebelum status menjadi `Selesai`.
   - **Riwayat**: Penelusuran arsip berdasarkan tanggal operasional WIB dan shift (`Opening` / `Closing`).

### Identitas Visual & Tema

- **Arah Estetika**: *Clean Culinary Operations* — bersih, tenang, higienis, dan sangat terbaca di lingkungan dapur yang sibuk maupun layar laptop supervisor.
- **Palet Warna (Disiplin 60-30-10)**:
  - **Kanvas Netral Dominan (60%)**: Latar krem muda hangat (`#FAF7F0` / `--background`) yang lembut di mata tanpa silau.
  - **Permukaan Struktural (30%)**: Putih bersih (`#FFFFFF`) dan krem permukaan sekunder (`#F2EDE2`) dengan garis batas tipis (`#E2DDD2`), teks utama gelap arang (`#1A211D`), teks sekunder (`#525E57`).
  - **Aksen & Status Semantik (10%)**:
    - Hijau tua utama (`#1B4332`) untuk aksi utama, tombol aktif, dan penanda `Tepat Waktu` / `Sudah Beres` / `Sudah Dikirim` / `Selesai`.
    - Kuning perhatian (`#B45309` teks di atas `#FEF3C7` lembut) untuk `Terlambat`, `Perlu Ditangani`, `Dilaporkan`, dan `Ditindaklanjuti`.
    - Merah masalah (`#B91C1C` teks di atas `#FEE2E2` lembut) untuk `Alpa`, `Barang Rusak/Hilang` prioritas, dan pesan validasi kolom.
    - Setiap status selalu menyertakan **teks dan ikon eksplisit**, tidak pernah bergantung pada warna saja.
- **Tipografi & Hierarki**:
  - *Display & Judul*: `Plus Jakarta Sans` (tegas, modern, terbaca cepat di HP dan desktop).
  - *Teks Antarmuka*: `DM Sans` (15px–16px di formulir mobile agar nyaman dibaca).
  - *Jam WIB, Menit Keterlambatan, & Durasi*: `JetBrains Mono` dengan `tabular-nums` agar angka sejajar rapi pada tabel dan kartu shift.
- **Tata Letak & Kedalaman**:
  - Maksimal 1 tingkat elevasi kartu dengan pembatas garis tipis (tanpa kartu bersarang atau garis aksen kiri tebal).
  - Metadata (tanggal, jam shift, jumlah) disajikan sebagai teks bersih dengan pemisah `·`, bukan tumpukan kapsul/pill.
  - Target sentuh minimal `44×44px` di HP, tinggi area sticky mobile maksimal 15% tinggi layar, dan respons mikro-interaksi `≤ 200ms` dengan konfirmasi toast saat data tersimpan.

---

## 3. Key Product Decisions & Trade-Offs

- **Keterkaitan Absensi dengan ID Penugasan Shift (`assignmentId`)**
  - *Pendekatan*: Setiap tombol Check-in/Check-out dan catatan absensi terikat ke `assignmentId` spesifik, bukan sekadar `(userId, tanggal)`.
  - *Mengapa*: Pukul `12.00 WIB` adalah waktu check-out Opening sekaligus check-in Closing. Mengikat ke penugasan mencegah dua pencatatan tertukar bila staf bertugas di salah satu atau dua shift pada hari yang sama.
  - *Alternatif yang Ditolak*: Pencatatan absensi berdasarkan jam kedatangan saja, karena rentan salah mencocokkan shift di jam perbatasan `12.00 WIB`.

- **Penyimpanan Hibrida `localStorage` + `IndexedDB` di Browser**
  - *Pendekatan*: Seluruh data terstruktur (akun, jadwal, absensi, laporan kebersihan, laporan barang, pengaturan simulasi jam) disimpan di `localStorage`, sedangkan berkas foto biner/Blob disimpan di `IndexedDB` dan direferensikan lewat `photoId`.
  - *Mengapa*: Menghindari batas kuota `localStorage` (~5MB) saat pengguna mengambil banyak foto kebersihan dan barang rusak, sekaligus menjaga perubahan langsung sinkron antar-akun demo di browser yang sama setelah refresh.
  - *Alternatif yang Ditolak*: Menyimpan foto base64 langsung di `localStorage`, karena cepat penuh dan melambatkan serialisasi state.

- **Simulasi Jam WIB Opsional di Atas Jam `Asia/Jakarta` Asli**
  - *Pendekatan*: Secara default jam berjalan mengikuti waktu `Asia/Jakarta` real-time, namun di panel Mode Demo pengguna dapat memilih jam simulasi (misalnya `06.08`, `12.05`, atau `17.30 WIB`) yang langsung memengaruhi perhitungan keterlambatan dan ketersediaan aksi pasca-shift.
  - *Mengapa*: Memastikan penguji dapat memverifikasi seluruh aturan bisnis (misalnya `Terlambat 8 menit`, `Durasi 5 jam 52 menit`, dan konfirmasi `Alpa` setelah pukul `12.00` atau `17.00`) kapan pun aplikasi dibuka.

---

## 4. Technical Architecture & Data Strategy

### Diagram Arsitektur & Alur Data

```
┌────────────────────────────────────────────────────────────────────────┐
│                       KitchenLog App Shell                             │
│  ┌───────────────────────────┐   ┌──────────────────────────────────┐  │
│  │ Mode Demo & Jam WIB State │──▶│ Responsive Navigation            │  │
│  │ (Akun Aktif + Simulasi)   │   │ • Laptop: Sidebar Kiri Tetap     │  │
│  └───────────────────────────┘   │ • HP: Bottom Bar (≤15% Viewport) │  │
│                                  └──────────────────────────────────┘  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           ▼                       ▼                       ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌────────────────────────┐
│ Halaman Staf & PIC  │ │ Modul Laporan & Foto│ │ Dashboard Supervisor   │
│ • Hari Ini          │ │ • Kamera Langsung   │ │ • Ringkasan Shift      │
│ • Check-in/out WIB  │ │   (getUserMedia)    │ │ • Jadwal & Tunjuk PIC  │
│ • Serah Terima      │ │ • Unggah File       │ │ • Konfirmasi Absen     │
│ • Checklist PIC     │ │   (Foto Unggahan)   │ │ • Tindak Lanjut Barang │
│ • Form Lapor Barang │ │                     │ │ • Riwayat Date & Shift │
└──────────┬──────────┘ └──────────┬──────────┘ └───────────┬────────────┘
           │                       │                        │
           ▼                       ▼                        ▼
┌─────────────────────────────────┐ ┌────────────────────────────────────┐
│ localStorage (kitchenlog_v1)    │ │ IndexedDB (kitchenlog_photos_db)   │
│ • Users, Schedules, Attendance  │ │ • Blob / DataURL Foto + Metadata   │
│ • CleanlinessReports, ItemRpts  │ │ • Sumber: Kamera vs Unggahan       │
└─────────────────────────────────┘ └────────────────────────────────────┘
```

### Model Data Utama

- **User**: `id`, `name`, `role` (`staff` | `supervisor`), `positionLabel` (Staf / PIC / Supervisor).
- **ShiftAssignment**: `id`, `date` (`YYYY-MM-DD` WIB), `shift` (`opening` | `closing`), `staffIds[]`, `picId`.
- **AttendanceRecord**: `id`, `assignmentId` (unik per penugasan+staf), `date`, `shift`, `staffId`, `checkInTime` (ISO/WIB), `checkOutTime`, `lateMinutes`, `durationMinutes`, `supervisorStatus` (`Izin` | `Sakit` | `Alpa`), `supervisorNote`.
- **CleanlinessReport**: `id`, `date`, `shift` (kombinasi unik mencegah laporan ganda), `picId`, `picName`, `submittedAt`, `areas` (6 area dengan status `Sudah Beres` | `Perlu Ditangani`, catatan wajib bila bermasalah, dan `photoId`), `generalPhotoId`, `handoverNote` (khusus Opening).
- **ItemReport**: `id`, `type` (`Barang Rusak` | `Barang Hilang`), `itemName`, `quantity`, `location`, `lastKnownLocation` (wajib untuk hilang), `discoveredAt`, `notes`, `photoId` (wajib untuk rusak), `reporterId`, `reporterName`, `shift`, `date`, `status` (`Dilaporkan` | `Ditindaklanjuti` | `Selesai`), `resolutionNote` (wajib sebelum `Selesai`), `updatedAt`.
- **StoredPhoto (IndexedDB)**: `id`, `blob`, `source` (`camera` | `upload`), `createdAt`.

### Pemetaan Interaksi & Validasi Kritis

- **Absensi & Perhitungan Waktu**:
  - Tombol `Check-in` mengunci satu entri untuk `(assignmentId, staffId)`. Selisih menit dihitung tepat dari `06:00` (Opening) atau `12:00` (Closing) tanpa toleransi.
  - Tombol `Check-out` hanya aktif setelah `Check-in` tercatat dan menghitung durasi `checkOut - checkIn` dalam jam & menit.
  - Supervisor hanya melihat opsi konfirmasi `Izin` / `Sakit` / `Alpa` untuk staf yang `Belum Check-in` setelah jam berakhirnya shift (`12:00` untuk Opening, `17:00` untuk Closing).
- **Validasi Laporan Kebersihan**:
  - Memblokir pengiriman bila ada area belum dipilih, bila area `Perlu Ditangani` belum memiliki catatan dan foto area, atau bila `Foto Kondisi Umum Kitchen` belum diambil/diunggah. Pesan kesalahan tampil tepat di bawah kolom yang bermasalah.
- **Validasi Laporan Barang**:
  - Memblokir pengiriman bila `Barang Rusak` belum melampirkan foto kerusakan atau `Barang Hilang` belum mengisi lokasi terakhir yang diperiksa.
  - Memblokir perubahan status ke `Selesai` oleh Supervisor sebelum `Catatan Hasil Penanganan` diisi.
- **Data Demo Awal (Seeded Hari Ini WIB)**:
  - Jadwal hari ini (tanggal WIB aktif) sudah terisi untuk **Opening** (PIC Budi Santoso + Agus Pratama + Rudi Hermawan) dan **Closing** (PIC Siti Aminah + Dewi Lestari).
  - Contoh absensi: Agus Pratama sudah check-in `06.08` dan check-out `12.00` (`Terlambat 8 menit · Durasi 5 jam 52 menit`), Budi Santoso tepat waktu, sementara Rudi Hermawan, Siti Aminah, dan Dewi Lestari disisakan agar alur check-in/out dan konfirmasi pasca-shift bisa langsung diuji.
  - Laporan kebersihan **Opening** hari ini sudah dikirim lengkap beserta `Catatan Serah Terima` untuk tim Closing; laporan kebersihan **Closing** dibiarkan `Belum Dikirim` untuk pengujian PIC Closing.
  - Tersedia 1 laporan barang berstatus `Ditindaklanjuti` (dan 1 laporan `Dilaporkan` dari hari sebelumnya) yang tetap tampil di shift berikutnya untuk menguji penyelesaian oleh Supervisor.
