// Katalog "Rekap Pekerjaan" per shift — satu sumber kebenaran untuk server & UI.
//
// Daftar opening diambil dari daftar operasional dapur (7 poin). Daftar closing
// disusun padanannya agar penutupan shift punya cakupan yang setara.
//
// `key` dipakai sebagai identitas stabil: JANGAN mengubah key untuk tugas lama,
// karena riwayat centang tersimpan berdasarkan key. Untuk mengganti teks, ubah
// `label` saja. Untuk menambah tugas baru, tambahkan key baru di akhir.

export const SHIFT_TASKS = {
  opening: [
    {
      key: 'persiapan-dapur',
      label: 'Persiapan dapur',
      detail: 'Sapu, lap meja, lap kompor, cuci piring kotor jika ada',
    },
    { key: 'masak-nasi', label: 'Masak nasi 2 rice cooker', detail: '' },
    { key: 'cek-bahan-kosong', label: 'Pengecekan bahan-bahan kosong untuk belanja', detail: '' },
    { key: 'teh-air-gula', label: 'Bikin teh dan air gula', detail: '' },
    { key: 'nasi-goreng-basic', label: 'Bikin nasi goreng basic tanpa kecap', detail: '' },
    {
      key: 'bawang-cabe-chopper',
      label: 'Bawang dan cabe untuk nasi goreng jika habis, di chopper',
      detail: '',
    },
    { key: 'marinasi-ayam', label: 'Marinasi ayam', detail: '' },
  ],
  closing: [
    {
      key: 'bersihkan-alat-masak',
      label: 'Bersihkan kompor, rice cooker, dan peralatan masak',
      detail: 'Matikan dan pastikan tidak ada sisa masakan menempel',
    },
    { key: 'cuci-peralatan', label: 'Cuci dan tiriskan piring, gelas, dan peralatan dapur', detail: '' },
    { key: 'bersihkan-area', label: 'Bersihkan meja persiapan, wastafel, dan lantai dapur', detail: '' },
    { key: 'buang-sampah', label: 'Buang sampah dan ganti kantong tempat sampah', detail: '' },
    {
      key: 'simpan-sisa-bahan',
      label: 'Simpan sisa bahan ke tempat penyimpanan dan beri label tanggal',
      detail: '',
    },
    { key: 'matikan-listrik', label: 'Matikan lampu, kipas, dan peralatan listrik yang tidak perlu', detail: '' },
    { key: 'kunci-dapur', label: 'Kunci pintu dapur dan serahkan kunci ke PIC closing', detail: '' },
  ],
};

export const SHIFT_KEYS = Object.keys(SHIFT_TASKS);

/** Daftar key yang sah untuk satu shift, dipakai untuk validasi request. */
export function taskKeysFor(shift) {
  if (!SHIFT_KEYS.includes(shift)) return [];
  return SHIFT_TASKS[shift].map((task) => task.key);
}

/** Cari definisi tugas; mengembalikan null bila key tidak dikenal. */
export function findTask(shift, key) {
  if (!SHIFT_KEYS.includes(shift)) return null;
  return SHIFT_TASKS[shift].find((task) => task.key === key) ?? null;
}
