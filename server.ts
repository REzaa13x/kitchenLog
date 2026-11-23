import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

// Muat .env.local terlebih dahulu (sesuai instruksi README), lalu .env sebagai cadangan.
// dotenv memakai berkas pertama yang ditemukan untuk setiap variabel, sehingga
// .env.local menang atas .env tanpa menimpa variabel yang sudah ada di lingkungan.
dotenv.config({ path: ['.env.local', '.env'] });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getFirebaseProjectId(): string | null {
  try {
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) return null;
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { projectId?: string };
    if (!raw.projectId || raw.projectId === 'remixed-project-id') return null;
    return raw.projectId;
  } catch {
    return null;
  }
}

const firebaseProjectId = getFirebaseProjectId();
const adminApp = firebaseProjectId
  ? getApps().length
    ? getApp()
    : initializeApp({ projectId: firebaseProjectId })
  : null;

interface SummaryIssueArea {
  label: string;
  note: string;
}

interface SummaryOpenItem {
  type: string;
  itemName: string;
  quantity: number;
  location: string;
  lastKnownLocation?: string;
  notes?: string;
  status: string;
}

interface HandoverSummaryRequest {
  issueAreas?: SummaryIssueArea[];
  handoverNote?: string;
  openItemReports?: SummaryOpenItem[];
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/handover-summary', async (req, res) => {
    const authHeader = req.headers.authorization;
    const idToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';

    if (!adminApp) {
      res.status(503).json({
        error: 'Konfigurasi autentikasi server belum siap. Anda tetap dapat menyimpan catatan serah terima secara manual.',
      });
      return;
    }

    if (!idToken) {
      res.status(401).json({
        error: 'Autentikasi diperlukan. Silakan masuk dengan akun Google Anda terlebih dahulu.',
      });
      return;
    }

    try {
      const decoded = await getAuth(adminApp).verifyIdToken(idToken);
      if (!decoded.email_verified) {
        res.status(403).json({
          error: 'Email akun Google belum terverifikasi.',
        });
        return;
      }
    } catch {
      res.status(401).json({
        error: 'Sesi login Anda tidak valid atau telah berakhir. Silakan muat ulang atau masuk kembali.',
      });
      return;
    }

    const body = (req.body ?? {}) as HandoverSummaryRequest;
    const issueAreas = Array.isArray(body.issueAreas) ? body.issueAreas : [];
    const handoverNote = typeof body.handoverNote === 'string' ? body.handoverNote.trim() : '';
    const openItemReports = Array.isArray(body.openItemReports) ? body.openItemReports : [];

    const hasAnyData =
      issueAreas.length > 0 || handoverNote.length > 0 || openItemReports.length > 0;

    if (!hasAnyData) {
      res.json({ summary: 'Belum ada tindak lanjut tercatat.', isEmpty: true });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error:
          'Ringkasan AI gagal dibuat karena kunci layanan Gemini belum dikonfigurasi. Anda tetap dapat menulis dan menyimpan catatan serah terima secara manual.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const recordedLines: string[] = [];

    if (issueAreas.length > 0) {
      recordedLines.push('CHECKLIST KEBERSIHAN BERSTATUS "PERLU DITANGANI":');
      issueAreas.forEach((area, i) => {
        recordedLines.push(
          `- ${i + 1}. ${area.label}: ${area.note?.trim() || 'Tidak ada catatan tambahan'}`
        );
      });
    } else {
      recordedLines.push('CHECKLIST KEBERSIHAN BERSTATUS "PERLU DITANGANI": Tidak ada.');
    }

    recordedLines.push(
      `CATATAN SERAH TERIMA OPENING: ${handoverNote || 'Tidak ada catatan tertulis.'}`
    );

    if (openItemReports.length > 0) {
      recordedLines.push('LAPORAN BARANG RUSAK/HILANG YANG MASIH TERBUKA:');
      openItemReports.forEach((item, i) => {
        const extraLoc = item.lastKnownLocation
          ? ` | Lokasi terakhir: ${item.lastKnownLocation}`
          : '';
        const extraNote = item.notes ? ` | Catatan: ${item.notes}` : '';
        recordedLines.push(
          `- ${i + 1}. [${item.type} · ${item.status}] ${item.itemName} (${item.quantity} unit) di ${item.location}${extraLoc}${extraNote}`
        );
      });
    } else {
      recordedLines.push('LAPORAN BARANG RUSAK/HILANG YANG MASIH TERBUKA: Tidak ada.');
    }

    const systemInstruction = [
      'Anda adalah asisten operasional dapur KitchenLog.',
      'Tugas Anda membuat draf ringkasan serah terima shift Opening (06.00-12.00) untuk tim Closing (12.00-17.00) dalam bahasa Indonesia.',
      'ATURAN KETAT:',
      '1. Tampilkan MAKSIMAL 3 poin tindak lanjut bernomor (1., 2., 3.).',
      '2. Gunakan HANYA informasi yang tercatat pada data input. Dilarang mengarang, menebak, atau menambahkan informasi baru yang tidak tercatat.',
      '3. Jika seluruh data kosong/tidak ada masalah atau tindak lanjut tercatat, keluarkan persis: Belum ada tindak lanjut tercatat.',
      '4. Tulis ringkas, langsung ke inti tindakan operasional, tanpa pembuka atau penutup.',
    ].join('\n');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Berikut data operasional shift Opening yang tercatat:\n\n${recordedLines.join('\n')}\n\nBuat maksimal 3 poin tindak lanjut untuk tim Closing:`,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const text = (response.text ?? '').trim();
      if (!text) {
        res.status(502).json({
          error:
            'Ringkasan AI gagal dibuat karena respons kosong dari Gemini. Anda tetap dapat menyimpan catatan serah terima secara manual.',
        });
        return;
      }

      res.json({ summary: text, isEmpty: false });
    } catch (err) {
      console.error('Gagal memanggil Gemini API untuk ringkasan serah terima:', err);
      res.status(502).json({
        error:
          'Ringkasan AI gagal dibuat karena gangguan koneksi ke Gemini. Silakan tulis dan simpan catatan serah terima secara manual.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
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
