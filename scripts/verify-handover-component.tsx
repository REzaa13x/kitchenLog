// Render komponen HandoverSummaryBox secara langsung (tanpa browser, tanpa login)
// untuk memastikan tampilannya benar dan tidak ada panggilan jaringan.
import React from 'react';
import { renderToString } from 'react-dom/server';
import { HandoverSummaryBox } from '../src/components/HandoverSummaryBox';
import type { CleanlinessAreaEntry, ItemReport } from '../src/types/kitchen';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    console.log(`ok    ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name} ${extra}`);
  }
}

const area = (label: string, status: CleanlinessAreaEntry['status'], note = ''): CleanlinessAreaEntry => ({
  key: 'lantai',
  label,
  status,
  note,
  photoId: null,
});

const item = (over: Partial<ItemReport>): ItemReport => ({
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
});

const props = {
  areas: [area('Lantai', 'Perlu Ditangani', 'licin'), area('Wastafel', 'Sudah Beres')],
  handoverNote: 'stok saus siap',
  openItemReports: [item({ type: 'Barang Hilang', itemName: 'Pisau daging', quantity: 2, lastKnownLocation: 'Rak 2' })],
  confirmedSummary: null,
  confirmedAt: null,
  confirmedBy: null,
  onConfirmSummary: () => {},
};

const html = renderToString(React.createElement(HandoverSummaryBox, props));
const text = html.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

console.log('--- teks yang dirender ---');
console.log(text.slice(0, 700));
console.log('');

check('judul tanpa kata "AI"', text.includes('Ringkasan Serah Terima (Khusus PIC Opening)') && !/\bAI\b/.test(text));
check('tombol "Susun Ringkasan" ada', text.includes('Susun Ringkasan'));
check('tidak ada tombol "Buat Ringkasan AI"', !text.includes('Buat Ringkasan AI'));
check('menyebut dihitung di perangkat ini', text.includes('tanpa mengirim data ke mana pun'));
check('menghitung area Perlu Ditangani = 1', text.includes('Perlu Ditangani” (1)'));
check('menghitung barang terbuka = 1', text.includes('laporan barang terbuka (1)'));

// Komponen dengan ringkasan yang sudah dikonfirmasi
const confirmedHtml = renderToString(
  React.createElement(HandoverSummaryBox, {
    ...props,
    confirmedSummary: '1. Barang hilang: Pisau daging.',
    confirmedAt: '23 Nov 2026, 08.20 WIB',
    confirmedBy: 'Budi',
  })
);
const confirmedText = confirmedHtml.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
check('status "Terkonfirmasi untuk Closing" muncul', confirmedText.includes('Terkonfirmasi untuk Closing'));
check('menampilkan nama pengonfirmasi', confirmedText.includes('oleh Budi'));

// Pastikan tidak ada kode jaringan di komponen maupun util
import fs from 'fs';
const boxSrc = fs.readFileSync('src/components/HandoverSummaryBox.tsx', 'utf-8');
const utilSrc = fs.readFileSync('src/utils/handoverSummary.ts', 'utf-8');
check('komponen tanpa fetch()', !/\bfetch\s*\(/.test(boxSrc));
check('komponen tanpa XMLHttpRequest', !/XMLHttpRequest/.test(boxSrc));
check('komponen tanpa import firebase', !/from '\.\.\/firebase'/.test(boxSrc));
check('util tanpa fetch()', !/\bfetch\s*\(/.test(utilSrc));
check('util tanpa import apa pun dari luar tipe', !/^import (?!type )/m.test(utilSrc));

console.log(`\n${failures === 0 ? 'SEMUA LULUS' : `${failures} GAGAL`}`);
process.exit(failures === 0 ? 0 : 1);
