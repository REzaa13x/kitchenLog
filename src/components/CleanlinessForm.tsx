import React, { useState } from 'react';
import { CheckCircle2, ClipboardCheck, Send } from 'lucide-react';
import { createInitialCleanlinessAreas } from '../utils/cleanlinessTemplate';
import { useKitchen } from '../storage/kitchenContext';
import { CleanlinessAreaEntry, CleanlinessAreaStatus, ShiftType } from '../types/kitchen';
import { formatDateIndo, SHIFT_META } from '../utils/wibTime';
import { HandoverSummaryBox } from './HandoverSummaryBox';
import { PhotoCaptureField } from './PhotoCaptureField';
import { StatusIndicator } from './StatusIndicator';

interface CleanlinessFormProps {
  date: string;
  shift: ShiftType;
  picId: string;
  picName: string;
  onViewDetail: (date: string, shift: ShiftType) => void;
}

export const CleanlinessForm: React.FC<CleanlinessFormProps> = ({
  date,
  shift,
  picId,
  picName,
  onViewDetail,
}) => {
  const { state, nowWib, submitCleanlinessReport, showToast } = useKitchen();

  const existingReport = state.cleanlinessReports.find(
    (r) => r.date === date && r.shift === shift
  );

  const openItemReports = state.itemReports.filter((r) => r.status !== 'Selesai');

  const [areas, setAreas] = useState<CleanlinessAreaEntry[]>(() =>
    createInitialCleanlinessAreas()
  );
  const [generalPhotoId, setGeneralPhotoId] = useState<string | null>(null);
  const [handoverNote, setHandoverNote] = useState('');
  const [confirmedAiSummary, setConfirmedAiSummary] = useState<string | null>(null);
  const [aiConfirmedAt, setAiConfirmedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (existingReport) {
    const issueCount = existingReport.areas.filter(
      (a) => a.status === 'Perlu Ditangani'
    ).length;

    return (
      <section className="rounded-2xl border border-[var(--kl-tint-border)] bg-white p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-[var(--kl-ink-muted)]">
              Laporan Kebersihan · Shift {SHIFT_META[shift].label}
            </p>
            <h3 className="text-lg font-bold text-[var(--kl-ink)] mt-0.5">
              Laporan Kebersihan Sudah Dikirim
            </h3>
          </div>
          <StatusIndicator label="Sudah Dikirim" tone="success" size="md" />
        </div>

        <div className="text-sm text-[var(--kl-ink-sub)] flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>PIC: {existingReport.picName}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{existingReport.submittedAt}</span>
          <span aria-hidden="true">·</span>
          <span>
            {issueCount === 0
              ? 'Semua 6 area Sudah Beres'
              : `${issueCount} area Perlu Ditangani`}
          </span>
        </div>

        {shift === 'opening' && (
          <p className="text-xs text-[var(--kl-ink-muted)]">
            {existingReport.confirmedAiSummary
              ? 'Ringkasan Serah Terima sudah dikonfirmasi untuk tim Closing.'
              : 'Anda dapat menyusun dan mengonfirmasi Ringkasan Serah Terima melalui Detail Laporan.'}
          </p>
        )}

        <button
          type="button"
          onClick={() => onViewDetail(date, shift)}
          className="min-h-[44px] w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[var(--kl-accent)] bg-[var(--kl-bg)] text-sm font-semibold text-[var(--kl-accent)] hover:bg-[var(--kl-tint)] inline-flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
          <span>
            {shift === 'opening'
              ? 'Lihat Detail & Ringkasan Serah Terima'
              : 'Lihat Detail & Foto Laporan'}
          </span>
        </button>
      </section>
    );
  }

  const updateAreaStatus = (index: number, status: CleanlinessAreaStatus) => {
    setAreas((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, status } : item))
    );
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`area-note-${index}`];
      delete next[`area-photo-${index}`];
      return next;
    });
  };

  const updateAreaNote = (index: number, note: string) => {
    setAreas((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, note } : item))
    );
    if (note.trim()) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`area-note-${index}`];
        return next;
      });
    }
  };

  const updateAreaPhoto = (index: number, photoId: string | null) => {
    setAreas((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, photoId } : item))
    );
    if (photoId) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`area-photo-${index}`];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};

    areas.forEach((area, idx) => {
      if (area.status === 'Perlu Ditangani') {
        if (!area.note.trim()) {
          nextErrors[`area-note-${idx}`] = `Catatan wajib diisi untuk ${area.label} yang Perlu Ditangani.`;
        }
        if (!area.photoId) {
          nextErrors[`area-photo-${idx}`] = `Foto area wajib dilampirkan untuk ${area.label}.`;
        }
      }
    });

    if (!generalPhotoId) {
      nextErrors.generalPhoto = 'Minimal satu foto kondisi umum kitchen wajib diambil atau diunggah.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      await submitCleanlinessReport({
        date,
        shift,
        picId,
        picName,
        areas,
        generalPhotoId: generalPhotoId!,
        handoverNote,
        confirmedAiSummary,
        aiSummaryConfirmedAt: aiConfirmedAt,
        aiSummaryConfirmedBy: confirmedAiSummary ? picName : null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--kl-border)] pb-4">
        <div>
          <p className="text-xs font-medium text-[var(--kl-ink-muted)]">
            Tugas PIC Shift {SHIFT_META[shift].label} · {formatDateIndo(date, false)}
          </p>
          <h3 className="text-lg font-bold text-[var(--kl-ink)] mt-0.5 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-[var(--kl-accent)]" aria-hidden="true" />
            <span>Laporan Kebersihan &amp; Checklist Area</span>
          </h3>
          <p className="text-xs text-[var(--kl-ink-muted)] mt-1">
            {shift === 'opening'
              ? 'Isi menjelang serah terima pukul 12.00 WIB.'
              : 'Isi setelah pembersihan akhir menjelang pukul 17.00 WIB.'}
          </p>
        </div>
        <StatusIndicator label="Belum Dikirim" tone="warning" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="divide-y divide-[var(--kl-border)]">
          {areas.map((area, index) => {
            const isIssue = area.status === 'Perlu Ditangani';
            return (
              <div key={area.key} className="py-4 first:pt-0 last:pb-0 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <p className="text-sm font-semibold text-[var(--kl-ink)]">
                      {index + 1}. {area.label}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:w-72">
                    <button
                      type="button"
                      onClick={() => updateAreaStatus(index, 'Sudah Beres')}
                      className={`min-h-[44px] px-3 py-2 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
                        area.status === 'Sudah Beres'
                          ? 'border-[#1B4332] bg-[#E4EFE8] text-[#143627]'
                          : 'border-[var(--kl-border)] bg-[var(--kl-bg)] text-[var(--kl-ink-muted)] hover:bg-[var(--kl-soft)]'
                      }`}
                    >
                      Sudah Beres
                    </button>
                    <button
                      type="button"
                      onClick={() => updateAreaStatus(index, 'Perlu Ditangani')}
                      className={`min-h-[44px] px-3 py-2 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
                        area.status === 'Perlu Ditangani'
                          ? 'border-[#D97706] bg-[#FEF3C7] text-[#92400E]'
                          : 'border-[var(--kl-border)] bg-[var(--kl-bg)] text-[var(--kl-ink-muted)] hover:bg-[var(--kl-soft)]'
                      }`}
                    >
                      Perlu Ditangani
                    </button>
                  </div>
                </div>

                {isIssue && (
                  <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-4 space-y-3">
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`area-note-${area.key}`}
                        className="block text-xs font-semibold text-[#92400E]"
                      >
                        Catatan Kondisi {area.label} <span className="text-[#B91C1C]">*</span>
                      </label>
                      <textarea
                        id={`area-note-${area.key}`}
                        rows={2}
                        value={area.note}
                        onChange={(e) => updateAreaNote(index, e.target.value)}
                        placeholder={`Jelaskan kendala kebersihan pada ${area.label.toLowerCase()}…`}
                        className="w-full px-3 py-2 rounded-lg border border-[#FCD34D] bg-white text-sm text-[var(--kl-ink)] focus:outline-none focus:ring-2 focus:ring-[#B45309]"
                      />
                      {errors[`area-note-${index}`] && (
                        <p className="text-xs font-medium text-[#B91C1C]" role="alert">
                          {errors[`area-note-${index}`]}
                        </p>
                      )}
                    </div>

                    <PhotoCaptureField
                      label={`Foto Area ${area.label}`}
                      helperText="Wajib jika Perlu Ditangani"
                      required
                      photoId={area.photoId}
                      onChange={(newId) => updateAreaPhoto(index, newId)}
                      error={errors[`area-photo-${index}`]}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-[var(--kl-border)] pt-4">
          <PhotoCaptureField
            label="Foto Kondisi Umum Kitchen"
            helperText="Wajib minimal 1 foto saat pelaporan"
            required
            photoId={generalPhotoId}
            onChange={(newId) => {
              setGeneralPhotoId(newId);
              if (newId && errors.generalPhoto) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.generalPhoto;
                  return next;
                });
              }
            }}
            error={errors.generalPhoto}
          />
        </div>

        {shift === 'opening' && (
          <div className="border-t border-[var(--kl-border)] pt-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="handover-note" className="block text-sm font-semibold text-[var(--kl-ink)]">
                Catatan Serah Terima untuk Tim Closing
              </label>
              <p className="text-xs text-[var(--kl-ink-muted)]">
                Catatan ini akan langsung tampil di halaman Hari Ini untuk tim Closing pada tanggal yang sama.
              </p>
              <textarea
                id="handover-note"
                rows={3}
                value={handoverNote}
                onChange={(e) => setHandoverNote(e.target.value)}
                placeholder="Contoh: Stok saus dasar di chiller rak 2 sudah siap, kompor kanan api agak kecil…"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--kl-border-strong)] bg-[var(--kl-bg)] text-sm text-[var(--kl-ink)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--kl-accent)]"
              />
            </div>

            <HandoverSummaryBox
              areas={areas}
              handoverNote={handoverNote}
              openItemReports={openItemReports}
              confirmedSummary={confirmedAiSummary}
              confirmedAt={aiConfirmedAt}
              confirmedBy={picName}
              onConfirmSummary={(summaryText) => {
                setConfirmedAiSummary(summaryText);
                const label = `${formatDateIndo(nowWib.date, false)}, ${nowWib.timeHHMM.replace(':', '.')} WIB`;
                setAiConfirmedAt(label);
                showToast('Ringkasan serah terima dikonfirmasi. Kirim laporan untuk meneruskannya ke tim Closing.');
              }}
            />
          </div>
        )}

        {Object.keys(errors).length > 0 && (
          <p className="text-xs font-medium text-[#B91C1C] bg-[#FEE2E2] border border-[#FECACA] rounded-lg px-3.5 py-2.5">
            Masih ada kolom wajib yang belum dilengkapi. Periksa pesan merah di atas sebelum mengirim.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-[48px] w-full px-5 py-3 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold hover:bg-[var(--kl-accent-hover)] disabled:opacity-60 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" aria-hidden="true" />
          <span>{submitting ? 'Mengirim Laporan…' : 'Kirim Laporan Kebersihan'}</span>
        </button>
      </form>
    </section>
  );
};
