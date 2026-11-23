import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { auth } from '../firebase';
import { CleanlinessAreaEntry, ItemReport } from '../types/kitchen';
import { StatusIndicator } from './StatusIndicator';

interface AiHandoverSummaryBoxProps {
  areas: CleanlinessAreaEntry[];
  handoverNote: string;
  openItemReports: ItemReport[];
  confirmedSummary?: string | null;
  confirmedAt?: string | null;
  confirmedBy?: string | null;
  onConfirmSummary: (summaryText: string) => Promise<void> | void;
}

export const AiHandoverSummaryBox: React.FC<AiHandoverSummaryBoxProps> = ({
  areas,
  handoverNote,
  openItemReports,
  confirmedSummary,
  confirmedAt,
  confirmedBy,
  onConfirmSummary,
}) => {
  const [draft, setDraft] = useState(confirmedSummary ?? '');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [justConfirmed, setJustConfirmed] = useState(false);

  useEffect(() => {
    if (confirmedSummary) {
      setDraft(confirmedSummary);
    }
  }, [confirmedSummary]);

  const issueAreas = areas.filter((a) => a.status === 'Perlu Ditangani');

  const handleGenerate = async () => {
    setLoading(true);
    setErrorMsg(null);
    setConfirmError(null);
    setJustConfirmed(false);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }

      const response = await fetch('/api/handover-summary', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          issueAreas: issueAreas.map((a) => ({
            label: a.label,
            note: a.note,
          })),
          handoverNote,
          openItemReports: openItemReports.map((item) => ({
            type: item.type,
            itemName: item.itemName,
            quantity: item.quantity,
            location: item.location,
            lastKnownLocation: item.lastKnownLocation,
            notes: item.notes,
            status: item.status,
          })),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        summary?: string;
        error?: string;
      };

      if (!response.ok || !data.summary) {
        setErrorMsg(
          data.error ||
            'Ringkasan AI gagal dibuat. Anda tetap dapat menulis dan menyimpan catatan serah terima secara manual.'
        );
        return;
      }

      setDraft(data.summary);
    } catch {
      setErrorMsg(
        'Ringkasan AI gagal dibuat karena gangguan jaringan. Anda tetap dapat menyimpan catatan serah terima secara manual.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!draft.trim()) {
      setConfirmError('Isi draf ringkasan terlebih dahulu sebelum menekan Konfirmasi Ringkasan.');
      return;
    }
    setConfirmError(null);
    await onConfirmSummary(draft.trim());
    setJustConfirmed(true);
  };

  const isConfirmedSynced =
    Boolean(confirmedSummary) && draft.trim() === (confirmedSummary ?? '').trim();

  return (
    <div className="rounded-xl border border-[var(--kl-tint-border)] bg-[var(--kl-bg)] p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-bold text-[var(--kl-ink)]">
              Ringkasan Serah Terima AI (Khusus PIC Opening)
            </h4>
            {confirmedSummary ? (
              <StatusIndicator
                label={isConfirmedSynced ? 'Terkonfirmasi untuk Closing' : 'Perlu Konfirmasi Ulang'}
                tone={isConfirmedSynced ? 'success' : 'warning'}
              />
            ) : null}
          </div>
          <p className="text-xs text-[var(--kl-ink-muted)]">
            Merangkum maksimal 3 poin tindak lanjut dari checklist “Perlu Ditangani” ({issueAreas.length}), catatan serah terima, dan laporan barang terbuka ({openItemReports.length}).
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={handleGenerate}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--kl-accent)] text-white text-xs sm:text-sm font-semibold hover:bg-[var(--kl-accent-hover)] disabled:opacity-60 inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{loading ? 'Membuat Ringkasan…' : 'Buat Ringkasan AI'}</span>
        </button>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-[#FECACA] bg-[#FEE2E2] px-3.5 py-2.5 text-xs text-[#991B1B] flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {(draft || errorMsg) && (
        <div className="space-y-2">
          <label
            htmlFor="ai-handover-draft"
            className="block text-xs font-semibold text-[var(--kl-ink)]"
          >
            Draf Ringkasan Serah Terima (dapat diedit sebelum dikonfirmasi)
          </label>
          <textarea
            id="ai-handover-draft"
            rows={4}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setJustConfirmed(false);
              if (confirmError) setConfirmError(null);
            }}
            placeholder="Klik 'Buat Ringkasan AI' untuk menyusun draf otomatis, atau tulis maksimal 3 poin tindak lanjut secara manual."
            className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm text-[var(--kl-ink)] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--kl-accent)]"
          />

          {confirmError && (
            <p className="text-xs font-medium text-[#B91C1C]" role="alert">
              {confirmError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {confirmedSummary && confirmedAt ? (
              <span className="text-xs text-[var(--kl-accent-deep)]">
                Terkonfirmasi {confirmedBy ? `oleh ${confirmedBy}` : ''} ·{' '}
                <span className="font-mono tabular-nums">{confirmedAt}</span>
              </span>
            ) : justConfirmed ? (
              <span className="text-xs font-medium text-[var(--kl-accent-deep)] inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                Ringkasan siap ditampilkan ke tim Closing.
              </span>
            ) : (
              <span className="text-xs text-[var(--kl-ink-muted)]">
                Tekan Konfirmasi Ringkasan agar tampil di halaman Hari Ini tim Closing.
              </span>
            )}

            <button
              type="button"
              onClick={handleConfirm}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--kl-accent)] bg-white text-xs sm:text-sm font-semibold text-[var(--kl-accent)] hover:bg-[var(--kl-tint)] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span>Konfirmasi Ringkasan</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
