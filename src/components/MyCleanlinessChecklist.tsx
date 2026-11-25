import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Loader2, Save } from 'lucide-react';
import { useKitchen } from '../storage/kitchenContext';
import type { AttendanceCleanliness, CleanlinessAreaKey, CleanlinessAreaStatus, ShiftType } from '../types/kitchen';
import { CLEANLINESS_AREAS_TEMPLATE } from '../utils/cleanlinessTemplate';
import { formatDateIndo, formatTimeDotWib, SHIFT_META } from '../utils/wibTime';

interface MyCleanlinessChecklistProps {
  date: string;
  shift: ShiftType;
}

type AreaState = Record<string, { status: CleanlinessAreaStatus | ''; note: string }>;

const emptyAreas = (): AreaState =>
  Object.fromEntries(CLEANLINESS_AREAS_TEMPLATE.map((a) => [a.key, { status: '', note: '' }]));

/**
 * Checklist kebersihan milik staf yang sedang login, untuk satu tanggal+shift.
 *
 * Dipisah dari laporan PIC shift: setiap staf mengisi checklist 6 area miliknya
 * sendiri, dan isinya tersimpan pada catatan absensinya (check-in / check-out).
 */
export const MyCleanlinessChecklist: React.FC<MyCleanlinessChecklistProps> = ({ date, shift }) => {
  const { state, currentUser, submitMyCleanliness } = useKitchen();
  const [areas, setAreas] = useState<AreaState>(emptyAreas);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const record = useMemo(
    () =>
      state.attendance.find(
        (r) => r.staffId === currentUser?.id && r.date === date && r.shift === shift
      ),
    [state.attendance, currentUser?.id, date, shift]
  );

  const savedCheckIn = record?.checkInCleanliness ?? null;
  const savedCheckOut = record?.checkOutCleanliness ?? null;
  const hasCheckIn = Boolean(record?.checkInTime);
  const hasCheckOut = Boolean(record?.checkOutTime);

  // Isi form dari checklist yang sudah tersimpan (utamakan check-out bila ada).
  useEffect(() => {
    const source: AttendanceCleanliness | null = savedCheckOut ?? savedCheckIn;
    if (!source?.areas?.length) {
      setAreas(emptyAreas());
      return;
    }
    const next = emptyAreas();
    for (const area of source.areas) {
      if (!next[area.key]) continue;
      next[area.key] = { status: area.status, note: area.note ?? '' };
    }
    setAreas(next);
  }, [savedCheckIn, savedCheckOut]);

  if (!currentUser) return null;

  const setArea = (key: CleanlinessAreaKey, patch: Partial<{ status: CleanlinessAreaStatus | ''; note: string }>) => {
    setAreas((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    setError(null);
  };

  const submit = async () => {
    if (!submitMyCleanliness) {
      setError('Penyimpanan checklist hanya tersedia pada mode MySQL.');
      return;
    }
    const missing = CLEANLINESS_AREAS_TEMPLATE.flatMap((a) => {
      const value = areas[a.key];
      if (!value?.status) return [`Pilih kondisi ${a.label}.`];
      if (value.status === 'Perlu Ditangani' && !value.note.trim()) return [`Isi catatan ${a.label}.`];
      return [];
    });
    if (missing.length) {
      setError(missing.join(' '));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: AttendanceCleanliness = {
        areas: CLEANLINESS_AREAS_TEMPLATE.map((a) => ({
          key: a.key,
          status: areas[a.key].status as CleanlinessAreaStatus,
          note: areas[a.key].note.trim(),
        })),
        // Foto dapur terpisah; checklist ini cukup status + catatan.
        kitchenPhotoDataUrl: '',
      };
      const res = await submitMyCleanliness({ date, shift, cleanliness: payload });
      if (!res.ok) setError(res.message);
      else setSavedAt(new Date().toISOString());
    } finally {
      setSaving(false);
    }
  };

  const completed = CLEANLINESS_AREAS_TEMPLATE.filter((a) => {
    const value = areas[a.key];
    return value?.status && (value.status !== 'Perlu Ditangani' || value.note.trim());
  }).length;
  const issueCount = CLEANLINESS_AREAS_TEMPLATE.filter((a) => areas[a.key]?.status === 'Perlu Ditangani').length;

  return (
    <section className="rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--kl-border)] pb-3">
        <div>
          <p className="text-xs font-medium text-[var(--kl-ink-muted)]">
            Checklist pribadi · {formatDateIndo(date, false)} · Shift {SHIFT_META[shift].label}
          </p>
          <h2 className="text-base font-bold text-[var(--kl-ink)] flex items-center gap-2 mt-0.5">
            <ClipboardList className="w-4 h-4 text-[var(--kl-accent)]" aria-hidden="true" />
            <span>Checklist Kebersihan Saya (6 Area)</span>
          </h2>
        </div>
        <span
          className={`inline-flex px-2.5 py-1 rounded-lg border text-xs font-bold ${
            completed === 6
              ? 'bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]'
              : 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]'
          }`}
        >
          {completed === 6 ? 'Lengkap 6/6' : `${completed}/6 terisi`}
        </span>
      </div>

      {!hasCheckIn && (
        <p className="text-xs text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg p-2.5">
          Anda belum check-in hari ini. Checklist tetap bisa diisi dan akan tersimpan pada catatan absensi Anda.
        </p>
      )}
      {hasCheckIn && (
        <p className="text-xs text-[var(--kl-ink-muted)]">
          Masuk {formatTimeDotWib(record?.checkInTime)}
          {hasCheckOut ? ` · Pulang ${formatTimeDotWib(record?.checkOutTime)}` : ' · belum check-out'}
          {savedCheckIn || savedCheckOut ? ' · checklist tersimpan' : ''}
        </p>
      )}

      <div className="divide-y divide-[var(--kl-border)]">
        {CLEANLINESS_AREAS_TEMPLATE.map((area, index) => {
          const value = areas[area.key];
          return (
            <div key={area.key} className="py-3 first:pt-0 last:pb-0 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--kl-ink)]">
                  {index + 1}. {area.label}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:w-72">
                  {(['Sudah Beres', 'Perlu Ditangani'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setArea(area.key, { status: option })}
                      className={`min-h-[40px] px-3 rounded-lg border text-xs font-semibold ${
                        value?.status === option
                          ? option === 'Sudah Beres'
                            ? 'bg-[#15803D] text-white border-[#15803D]'
                            : 'bg-[#B45309] text-white border-[#B45309]'
                          : 'bg-white text-[var(--kl-ink-sub)] border-[var(--kl-border-strong)]'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              {value?.status === 'Perlu Ditangani' && (
                <input
                  aria-label={`Catatan ${area.label}`}
                  placeholder="Catatan kendala wajib diisi"
                  maxLength={1000}
                  value={value.note}
                  onChange={(e) => setArea(area.key, { note: e.target.value })}
                  className="w-full min-h-[40px] rounded-lg border border-[var(--kl-border-strong)] px-3 text-sm"
                />
              )}
            </div>
          );
        })}
      </div>

      {issueCount > 0 && (
        <p className="text-xs text-[#92400E]">
          {issueCount} area Perlu Ditangani akan otomatis menjadi tugas tindak lanjut untuk Admin/PJ.
        </p>
      )}
      {error && <p role="alert" className="text-sm font-medium text-[#B91C1C]">{error}</p>}
      {savedAt && !error && (
        <p role="status" className="text-sm font-medium text-[#15803D] inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" /> Checklist tersimpan.
        </p>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={() => void submit()}
        className="min-h-[44px] px-4 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 w-full sm:w-auto"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Simpan Checklist Saya
      </button>
      <p className="text-[11px] text-[var(--kl-ink-muted)]">
        Simpan sebelum check-out agar tercatat pada absensi Anda. Perubahan setelah check-out akan menggantikan checklist pulang.
      </p>
    </section>
  );
};
