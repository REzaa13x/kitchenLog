import type { CleanlinessAreaEntry, ItemReport } from '../types/kitchen';

/**
 * Penyusun Ringkasan Serah Terima — berjalan sepenuhnya di sisi aplikasi.
 *
 * Tidak ada panggilan jaringan, tidak ada API key, dan tidak ada data yang
 * dikirim ke pihak ketiga. Ringkasan dibentuk secara deterministik dari data
 * yang sudah tercatat di laporan, sehingga hasilnya selalu bisa ditelusuri
 * kembali ke sumbernya.
 */

export interface HandoverSummaryInput {
  areas: CleanlinessAreaEntry[];
  handoverNote: string;
  openItemReports: ItemReport[];
}

/** Batas jumlah poin tindak lanjut pada ringkasan. */
export const MAX_SUMMARY_POINTS = 3;
/** Batas panjang ringkasan, selaras dengan batas pada firestore.rules (1500). */
export const MAX_SUMMARY_CHARS = 1500;
const MAX_NOTE_CHARS = 220;

const EMPTY_SUMMARY = 'Belum ada tindak lanjut tercatat.';

interface Candidate {
  /** Semakin kecil, semakin didahulukan. */
  priority: number;
  /** Urutan asli di dalam kelompoknya, agar hasil stabil. */
  order: number;
  text: string;
}

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function clip(text: string, limit = MAX_NOTE_CHARS): string {
  const clean = tidy(text);
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1).trimEnd()}…`;
}

/** Menghindari titik ganda saat catatan pengguna sudah diakhiri titik. */
function asSentence(text: string): string {
  const clean = tidy(text);
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function unitLabel(quantity: number): string {
  const qty = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
  return `${qty} unit`;
}

function buildCandidates(input: HandoverSummaryInput): Candidate[] {
  const candidates: Candidate[] = [];

  const openReports = input.openItemReports.filter((item) => item.status !== 'Selesai');

  // 1. Barang hilang didahulukan: menyangkut kehilangan aset dan perlu
  //    pengamanan segera oleh tim berikutnya.
  openReports
    .filter((item) => item.type === 'Barang Hilang')
    .forEach((item, i) => {
      const lastSeen = tidy(item.lastKnownLocation ?? '');
      const notes = tidy(item.notes ?? '');
      const parts = [
        `Barang hilang: ${tidy(item.itemName)} (${unitLabel(item.quantity)}) dari ${tidy(item.location)}`,
        lastSeen ? `terakhir terlihat di ${lastSeen}` : '',
        notes ? `catatan: ${clip(notes, 120)}` : '',
      ].filter(Boolean);
      candidates.push({ priority: 0, order: i, text: asSentence(parts.join(', ')) });
    });

  // 2. Area kebersihan berstatus "Perlu Ditangani" — tindak lanjut operasional
  //    yang paling sering harus dilanjutkan shift Closing.
  input.areas
    .filter((area) => area.status === 'Perlu Ditangani')
    .forEach((area, i) => {
      const note = tidy(area.note ?? '');
      candidates.push({
        priority: 1,
        order: i,
        text: note
          ? asSentence(`Area ${tidy(area.label)} perlu ditangani: ${clip(note)}`)
          : asSentence(`Area ${tidy(area.label)} perlu ditangani`),
      });
    });

  // 3. Barang rusak — perlu diketahui tim Closing, tetapi bukan kehilangan aset.
  openReports
    .filter((item) => item.type === 'Barang Rusak')
    .forEach((item, i) => {
      const notes = tidy(item.notes ?? '');
      const parts = [
        `Barang rusak: ${tidy(item.itemName)} (${unitLabel(item.quantity)}) di ${tidy(item.location)}`,
        notes ? `catatan: ${clip(notes, 120)}` : '',
      ].filter(Boolean);
      candidates.push({ priority: 2, order: i, text: asSentence(parts.join(', ')) });
    });

  // 4. Catatan serah terima manual dari PIC Opening, sebagai pelengkap.
  const handoverNote = tidy(input.handoverNote);
  if (handoverNote) {
    candidates.push({
      priority: 3,
      order: 0,
      text: asSentence(`Catatan serah terima: ${clip(handoverNote)}`),
    });
  }

  return candidates.sort((a, b) => a.priority - b.priority || a.order - b.order);
}

/**
 * Menyusun draf ringkasan serah terima maksimal 3 poin.
 * Jika data tidak memuat masalah apa pun, kembalikan kalimat baku.
 */
export function buildHandoverSummary(input: HandoverSummaryInput): string {
  const candidates = buildCandidates(input);

  if (candidates.length === 0) return EMPTY_SUMMARY;

  const shown = candidates.slice(0, MAX_SUMMARY_POINTS);
  const remaining = candidates.length - shown.length;

  const lines = shown.map((candidate, i) => `${i + 1}. ${candidate.text}`);
  if (remaining > 0) {
    // Tidak ada data yang disembunyikan: sisa tindak lanjut tetap disebutkan.
    lines.push(`(+${remaining} tindak lanjut lain tercatat di laporan.)`);
  }

  let summary = lines.join('\n');
  if (summary.length > MAX_SUMMARY_CHARS) {
    summary = `${summary.slice(0, MAX_SUMMARY_CHARS - 1).trimEnd()}…`;
  }
  return summary;
}
