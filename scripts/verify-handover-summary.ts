// Uji perilaku penyusun Ringkasan Serah Terima.
// Dijalankan dengan: npx tsx scripts/verify-handover-summary.ts
import { buildHandoverSummary, MAX_SUMMARY_CHARS } from '../src/utils/handoverSummary';
import type { CleanlinessAreaEntry, ItemReport } from '../src/types/kitchen';

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(`FAIL  ${name}`);
    console.log(`      harap: ${JSON.stringify(expected)}`);
    console.log(`      dapat: ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

function area(label: string, status: CleanlinessAreaEntry['status'], note = ''): CleanlinessAreaEntry {
  return { key: 'lantai', label, status, note, photoId: null };
}

function item(over: Partial<ItemReport>): ItemReport {
  return {
    id: 'x',
    type: 'Barang Rusak',
    itemName: 'Blender',
    quantity: 1,
    location: 'Dapur',
    lastKnownLocation: '',
    discoveredAt: '2026-11-23 08:00 WIB',
    notes: '',
    photoId: null,
    reporterId: 'u1',
    reporterName: 'Budi',
    reporterEmail: 'budi@example.com',
    shift: 'opening',
    date: '2026-11-23',
    status: 'Dilaporkan',
    resolutionNote: '',
    createdAt: '2026-11-23 08:00 WIB',
    updatedAt: '2026-11-23 08:00 WIB',
    ...over,
  };
}

// 1. Data kosong -> kalimat baku
check(
  'tanpa data -> kalimat baku',
  buildHandoverSummary({ areas: [], handoverNote: '', openItemReports: [] }),
  'Belum ada tindak lanjut tercatat.'
);

// 2. Semua area "Sudah Beres" dan tidak ada barang -> tetap baku
check(
  'semua beres -> kalimat baku',
  buildHandoverSummary({
    areas: [area('Lantai', 'Sudah Beres')],
    handoverNote: '   ',
    openItemReports: [],
  }),
  'Belum ada tindak lanjut tercatat.'
);

// 3. Barang hilang didahulukan di atas area dan catatan
const out3 = buildHandoverSummary({
  areas: [area('Wastafel', 'Perlu Ditangani', 'ada genangan')],
  handoverNote: 'stok saus siap',
  openItemReports: [item({ type: 'Barang Hilang', itemName: 'Pisau daging', quantity: 2, lastKnownLocation: 'Rak 2' })],
});
console.log('\n--- contoh 3 ---\n' + out3 + '\n');
check('poin 1 = barang hilang', out3.split('\n')[0].startsWith('1. Barang hilang: Pisau daging (2 unit)'), true);
check('barang hilang menyebut lokasi terakhir', out3.includes('terakhir terlihat di Rak 2'), true);

// 4. Maksimal 3 poin + sisa dilaporkan
const out4 = buildHandoverSummary({
  areas: [
    area('Lantai', 'Perlu Ditangani', 'licin'),
    area('Wastafel', 'Perlu Ditangani', 'mampet'),
    area('Kompor', 'Perlu Ditangani', 'berkerak'),
  ],
  handoverNote: 'catatan tambahan',
  openItemReports: [item({ type: 'Barang Hilang', itemName: 'Gelas', quantity: 3, lastKnownLocation: 'Rak atas' })],
});
console.log('--- contoh 4 ---\n' + out4 + '\n');
const numbered = out4.split('\n').filter((l) => /^\d+\.\s/.test(l));
check('jumlah poin bernomor maksimal 3', numbered.length, 3);
check('sisa tindak lanjut disebutkan', out4.includes('(+2 tindak lanjut lain tercatat di laporan.)'), true);

// 5. Barang rusak & area tanpa catatan
const out5 = buildHandoverSummary({
  areas: [area('Kulkas', 'Perlu Ditangani')],
  handoverNote: '',
  openItemReports: [item({ type: 'Barang Rusak', itemName: 'Blender', quantity: 1, notes: 'tidak menyala' })],
});
console.log('--- contoh 5 ---\n' + out5 + '\n');
check('area tanpa catatan tetap rapi', out5.includes('Area Kulkas perlu ditangani.'), true);
check('barang rusak menyertakan catatan', out5.includes('catatan: tidak menyala.'), true);

// 6. Barang berstatus Selesai diabaikan
check(
  'barang selesai diabaikan',
  buildHandoverSummary({
    areas: [],
    handoverNote: '',
    openItemReports: [item({ type: 'Barang Hilang', status: 'Selesai' })],
  }),
  'Belum ada tindak lanjut tercatat.'
);

// 7. Catatan sangat panjang dipotong, tetap di bawah batas Firestore
const out7 = buildHandoverSummary({
  areas: [area('Lantai', 'Perlu Ditangani', 'x'.repeat(5000))],
  handoverNote: 'y'.repeat(5000),
  openItemReports: [item({ type: 'Barang Hilang', notes: 'z'.repeat(5000) })],
});
check('panjang ringkasan <= batas', out7.length <= MAX_SUMMARY_CHARS, true);

// 8. Deterministik: input sama -> output sama
const args = {
  areas: [area('Lantai', 'Perlu Ditangani', 'licin')],
  handoverNote: 'stok siap',
  openItemReports: [item({ type: 'Barang Hilang', itemName: 'Sendok', quantity: 4 })],
};
check('deterministik', buildHandoverSummary(args), buildHandoverSummary(args));

// 9. Tidak ada titik ganda
const out9 = buildHandoverSummary({
  areas: [area('Lantai', 'Perlu Ditangani', 'licin.')],
  handoverNote: '',
  openItemReports: [],
});
check('tidak ada titik ganda', out9.includes('..'), false);

console.log(`\n${failures === 0 ? 'SEMUA LULUS' : `${failures} GAGAL`}`);
process.exit(failures === 0 ? 0 : 1);
