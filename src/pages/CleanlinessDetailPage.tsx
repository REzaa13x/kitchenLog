import React, { useEffect, useState } from 'react';
import { ArrowLeft, MessageSquareText, Save, Sparkles } from 'lucide-react';
import { HandoverSummaryBox } from '../components/HandoverSummaryBox';
import { CleanlinessFollowupCard } from '../components/CleanlinessFollowupCard';
import { PhotoViewer } from '../components/PhotoViewer';
import { StatusIndicator } from '../components/StatusIndicator';
import { useKitchen } from '../storage/kitchenContext';
import { ShiftType } from '../types/kitchen';
import { formatDateIndo, SHIFT_META } from '../utils/wibTime';

interface CleanlinessDetailPageProps {
  targetDate: string;
  targetShift: ShiftType;
  onBack?: () => void;
}

export const CleanlinessDetailPage: React.FC<CleanlinessDetailPageProps> = ({
  targetDate,
  targetShift,
  onBack,
}) => {
  const { state, currentUser, confirmOpeningAiSummary } = useKitchen();

  const [date, setDate] = useState(targetDate);
  const [shift, setShift] = useState<ShiftType>(targetShift);
  const [manualHandoverDraft, setManualHandoverDraft] = useState('');
  const [savingManualNote, setSavingManualNote] = useState(false);

  useEffect(() => {
    setDate(targetDate);
    setShift(targetShift);
  }, [targetDate, targetShift]);

  const report = state.cleanlinessReports.find(
    (r) => r.date === date && r.shift === shift
  );

  useEffect(() => {
    setManualHandoverDraft(report?.handoverNote ?? '');
  }, [report?.id, report?.handoverNote]);

  const openItemReports = state.itemReports.filter((r) => r.status !== 'Selesai');

  const assignment = state.assignments.find((a) => a.date === date && a.shift === shift);
  const isPicOpeningViewer =
    shift === 'opening' &&
    Boolean(currentUser) &&
    (currentUser?.id === report?.picId || currentUser?.id === assignment?.picId);

  const availableDates = Array.from(
    new Set([
      date,
      ...state.assignments.map((a) => a.date),
      ...state.cleanlinessReports.map((r) => r.date),
    ])
  ).sort((a, b) => b.localeCompare(a));

  const handleSaveManualHandover = async () => {
    if (!report) return;
    setSavingManualNote(true);
    try {
      await confirmOpeningAiSummary(
        report.id,
        report.confirmedAiSummary || manualHandoverDraft || 'Belum ada tindak lanjut tercatat.',
        manualHandoverDraft
      );
    } finally {
      setSavingManualNote(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="min-h-[36px] text-xs font-semibold text-[var(--kl-accent)] hover:underline inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Kembali</span>
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-[var(--kl-tint-border)] bg-[var(--kl-tint)] text-xs font-bold text-[var(--kl-accent-deep)]">
              <span
                className="w-2 h-2 rounded-full bg-[var(--kl-accent)] shrink-0"
                aria-hidden="true"
              />
              <span>{state.kitchenName}</span>
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--kl-ink)]">
            Detail Laporan Kebersihan
          </h1>
          <p className="text-sm text-[var(--kl-ink-muted)]">
            Hasil checklist 6 area dapur, catatan kondisi, dan bukti foto kondisi kitchen.
          </p>
        </div>

        {/* Selector Tanggal & Shift */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Pilih tanggal laporan kebersihan"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-[44px] px-3 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm text-[var(--kl-ink)]"
          >
            {availableDates.map((d) => (
              <option key={d} value={d}>
                {formatDateIndo(d)}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-xl border border-[var(--kl-border)] bg-[var(--kl-track)] p-1">
            {(['opening', 'closing'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setShift(s)}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold ${
                  shift === s ? 'bg-[var(--kl-accent)] text-white' : 'text-[var(--kl-ink-sub)]'
                }`}
              >
                {SHIFT_META[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!report ? (
        <div className="rounded-2xl border border-[var(--kl-border)] bg-white p-8 text-center space-y-2">
          <div className="flex justify-center">
            <StatusIndicator label="Belum Dikirim" tone="warning" size="md" />
          </div>
          <h2 className="text-lg font-bold text-[var(--kl-ink)] pt-1">
            Laporan Kebersihan Shift {SHIFT_META[shift].label} Belum Tersedia
          </h2>
          <p className="text-sm text-[var(--kl-ink-muted)] max-w-md mx-auto">
            PIC Shift {SHIFT_META[shift].label} untuk tanggal {formatDateIndo(date)} belum mengirimkan laporan kebersihan.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Metadata Laporan */}
          <section className="rounded-2xl border border-[var(--kl-border)] bg-white p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--kl-ink-muted)]">
                <span>{formatDateIndo(report.date)}</span>
                <span aria-hidden="true">·</span>
                <span>Shift {SHIFT_META[report.shift].label}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{report.submittedAt}</span>
              </div>
              <h2 className="text-lg font-bold text-[var(--kl-ink)]">
                PIC Pengirim: {report.picName}
              </h2>
            </div>

            <StatusIndicator label="Sudah Dikirim" tone="success" size="md" />
          </section>

          {/* Ringkasan Serah Terima & Catatan Serah Terima (khusus Opening) */}
          {report.shift === 'opening' && (
            <section className="rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-4">
              <h3 className="text-base font-bold text-[var(--kl-ink)] flex items-center gap-2">
                <MessageSquareText className="w-4 h-4 text-[var(--kl-accent)]" aria-hidden="true" />
                <span>Catatan &amp; Ringkasan Serah Terima untuk Tim Closing</span>
              </h3>

              {isPicOpeningViewer ? (
                <>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="detail-manual-handover"
                      className="block text-xs font-semibold text-[var(--kl-ink-muted)]"
                    >
                      Catatan Serah Terima Manual
                    </label>
                    <textarea
                      id="detail-manual-handover"
                      rows={3}
                      value={manualHandoverDraft}
                      onChange={(e) => setManualHandoverDraft(e.target.value)}
                      placeholder="Tulis catatan serah terima secara manual untuk tim Closing…"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--kl-border-strong)] bg-[var(--kl-bg)] text-sm text-[var(--kl-ink)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--kl-accent)]"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={savingManualNote}
                        onClick={handleSaveManualHandover}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-[var(--kl-border-strong)] bg-white text-xs font-semibold text-[var(--kl-ink)] hover:bg-[var(--kl-soft)] inline-flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {savingManualNote ? 'Menyimpan…' : 'Simpan Catatan Manual'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <HandoverSummaryBox
                    areas={report.areas}
                    handoverNote={manualHandoverDraft}
                    openItemReports={openItemReports}
                    confirmedSummary={report.confirmedAiSummary}
                    confirmedAt={report.aiSummaryConfirmedAt}
                    confirmedBy={report.aiSummaryConfirmedBy}
                    onConfirmSummary={async (summaryText) => {
                      await confirmOpeningAiSummary(
                        report.id,
                        summaryText,
                        manualHandoverDraft
                      );
                    }}
                  />
                </>
              ) : (
                <div className="space-y-3">
                  {report.confirmedAiSummary && (
                    <div className="rounded-xl bg-[var(--kl-tint)] border border-[var(--kl-tint-border)] p-4 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[var(--kl-accent-deep)] inline-flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                          Ringkasan Serah Terima (Terkonfirmasi)
                        </span>
                        {report.aiSummaryConfirmedAt && (
                          <span className="text-xs text-[var(--kl-ink-sub)] font-mono tabular-nums">
                            {report.aiSummaryConfirmedAt}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--kl-ink)] whitespace-pre-line leading-relaxed">
                        {report.confirmedAiSummary}
                      </p>
                    </div>
                  )}

                  <div className="rounded-xl bg-[var(--kl-bg)] border border-[var(--kl-border)] p-3.5 space-y-1">
                    <p className="text-xs font-semibold text-[var(--kl-ink-muted)]">
                      Catatan Serah Terima PIC Opening
                    </p>
                    <p className="text-sm text-[var(--kl-ink)] leading-relaxed">
                      {report.handoverNote || 'Tidak ada catatan serah terima khusus.'}
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Foto Kondisi Umum Kitchen */}
          <section className="rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-3">
            <h3 className="text-base font-bold text-[var(--kl-ink)]">Foto Kondisi Umum Kitchen</h3>
            <PhotoViewer
              photoId={report.generalPhotoId}
              alt={`Kondisi umum kitchen shift ${SHIFT_META[report.shift].label}`}
              className="max-w-xl"
            />
          </section>

          {/* Checklist 6 Area */}
          <section className="rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-4">
            <h3 className="text-base font-bold text-[var(--kl-ink)]">Hasil Checklist 6 Area</h3>
            <div className="divide-y divide-[var(--kl-border)]">
              {report.areas.map((area, idx) => {
                const needsAction = area.status === 'Perlu Ditangani';
                return (
                  <div key={area.key} className="py-4 first:pt-0 last:pb-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--kl-ink)]">
                        {idx + 1}. {area.label}
                      </p>
                      <StatusIndicator
                        label={area.status}
                        tone={needsAction ? 'warning' : 'success'}
                      />
                    </div>

                    {needsAction && (
                      <CleanlinessFollowupCard
                        reportId={report.id}
                        areaKey={area.key}
                        areaLabel={area.label}
                        note={area.note}
                      />
                    )}
                    {needsAction && area.photoId && (
                      <PhotoViewer
                        photoId={area.photoId}
                        alt={`Foto kendala area ${area.label}`}
                        className="max-w-sm"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
