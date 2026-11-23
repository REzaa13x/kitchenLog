import React, { useState } from 'react';
import {
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  History,
  Home,
  PackageOpen,
  UserPlus,
  Users,
} from 'lucide-react';
import { FacePhotoAvatar } from '../components/FacePhotoAvatar';
import { StatusIndicator } from '../components/StatusIndicator';
import { useKitchen } from '../storage/kitchenStore';
import { ShiftType, SupervisorAbsenceStatus } from '../types/kitchen';
import {
  formatDateIndo,
  formatDurationIndo,
  formatLateIndo,
  formatTimeDotWib,
  hasShiftEnded,
  SHIFT_META,
} from '../utils/wibTime';

interface SupervisorDashboardPageProps {
  onNavigateCleanlinessDetail: (date: string, shift: ShiftType) => void;
  onNavigateItemReports: () => void;
  onNavigateSchedule: () => void;
  onNavigateTeam: () => void;
  onNavigateHistory: () => void;
  onNavigateMyShift: () => void;
}

export const SupervisorDashboardPage: React.FC<SupervisorDashboardPageProps> = ({
  onNavigateCleanlinessDetail,
  onNavigateItemReports,
  onNavigateSchedule,
  onNavigateTeam,
  onNavigateHistory,
  onNavigateMyShift,
}) => {
  const { state, currentUser, nowWib, confirmAbsenceStatus } = useKitchen();

  const [confirmTarget, setConfirmTarget] = useState<{
    assignmentId: string;
    staffId: string;
    staffName: string;
    shift: ShiftType;
  } | null>(null);
  const [absenceChoice, setAbsenceChoice] = useState<SupervisorAbsenceStatus>('Alpa');
  const [absenceNote, setAbsenceNote] = useState('');
  const [absenceError, setAbsenceError] = useState('');

  const openItems = state.itemReports.filter((r) => r.status !== 'Selesai');
  const reportedItemsCount = openItems.filter((r) => r.status === 'Dilaporkan').length;
  const inProgressItemsCount = openItems.filter((r) => r.status === 'Ditindaklanjuti').length;

  const shifts: ShiftType[] = ['opening', 'closing'];

  const handleConfirmAbsence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmTarget) return;
    const res = await confirmAbsenceStatus(
      confirmTarget.assignmentId,
      confirmTarget.staffId,
      absenceChoice,
      absenceNote
    );
    if (!res.ok) {
      setAbsenceError(res.message);
      return;
    }
    setConfirmTarget(null);
    setAbsenceNote('');
    setAbsenceError('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-[var(--kl-tint-border)] bg-[var(--kl-tint)] text-xs font-bold text-[var(--kl-accent-deep)]">
              <span
                className="w-2 h-2 rounded-full bg-[var(--kl-accent)] shrink-0"
                aria-hidden="true"
              />
              <span>{state.kitchenName}</span>
            </span>
            <p className="text-xs font-medium text-[var(--kl-ink-muted)]">
              {formatDateIndo(nowWib.date)} ·{' '}
              <span className="font-mono tabular-nums font-semibold text-[var(--kl-accent)]">
                {formatTimeDotWib(nowWib.timeHHMM)}
              </span>
            </p>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--kl-ink)]">
            Dashboard Supervisor
          </h1>
          <p className="text-sm text-[var(--kl-ink-muted)]">
            Ringkasan kehadiran staf, status laporan kebersihan, dan tindak lanjut barang hari ini.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {currentUser &&
            state.assignments.some(
              (a) => a.date === nowWib.date && a.staffIds.includes(currentUser.id)
            ) && (
              <button
                type="button"
                onClick={onNavigateMyShift}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-xs sm:text-sm font-semibold text-[var(--kl-ink)] hover:bg-[var(--kl-soft)] inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Home className="w-4 h-4 text-[var(--kl-accent)]" aria-hidden="true" />
                <span>Shift Saya</span>
              </button>
            )}
          <button
            type="button"
            onClick={onNavigateHistory}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-xs sm:text-sm font-semibold text-[var(--kl-ink)] hover:bg-[var(--kl-soft)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <History className="w-4 h-4 text-[var(--kl-accent)]" aria-hidden="true" />
            <span>Riwayat</span>
          </button>
          <button
            type="button"
            onClick={onNavigateSchedule}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--kl-accent)] bg-white text-xs sm:text-sm font-semibold text-[var(--kl-accent)] hover:bg-[var(--kl-tint)] inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <CalendarPlus className="w-4 h-4" aria-hidden="true" />
            <span>Atur Jadwal Shift</span>
          </button>
        </div>
      </div>

      {/* Panduan Pengaturan Awal jika anggota tim atau jadwal hari ini belum ada */}
      {state.users.length <= 1 && (
        <section className="rounded-2xl border border-[var(--kl-tint-border)] bg-[var(--kl-tint)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-[var(--kl-accent-deep)]">
              Lengkapi Tim &amp; Jadwal Dapur Anda
            </h2>
            <p className="text-xs sm:text-sm text-[var(--kl-ink-sub)]">
              Tambahkan email Google staf dapur melalui menu Tim &amp; Akses agar setiap staf dapat melakukan absensi wajah dan pelaporan dari akun masing-masing.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateTeam}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold hover:bg-[var(--kl-accent-hover)] inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            <span>Tambah Anggota Tim</span>
          </button>
        </section>
      )}

      {/* Ringkasan Laporan Barang Terbuka */}
      <section className="rounded-2xl border border-[var(--kl-border)] bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#FEF3C7] text-[#92400E] flex items-center justify-center shrink-0">
            <PackageOpen className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-[var(--kl-ink)]">
                Laporan Barang Terbuka: <span className="font-mono tabular-nums">{openItems.length}</span>
              </h2>
              {openItems.length > 0 ? (
                <StatusIndicator label="Perlu Tindak Lanjut" tone="warning" />
              ) : (
                <StatusIndicator label="Semua Selesai" tone="success" />
              )}
            </div>
            <p className="text-xs text-[var(--kl-ink-muted)]">
              <span className="font-mono tabular-nums">{reportedItemsCount}</span> berstatus Dilaporkan ·{' '}
              <span className="font-mono tabular-nums">{inProgressItemsCount}</span> berstatus Ditindaklanjuti (termasuk lintas hari)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onNavigateItemReports}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold hover:bg-[var(--kl-accent-hover)] inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
        >
          <span>Kelola Laporan Barang</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </section>

      {/* Dua Kartu Utama: Opening & Closing */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {shifts.map((shift) => {
          const meta = SHIFT_META[shift];
          const assignment = state.assignments.find(
            (a) => a.date === nowWib.date && a.shift === shift
          );
          const cleanliness = state.cleanlinessReports.find(
            (r) => r.date === nowWib.date && r.shift === shift
          );

          const scheduledStaff = assignment
            ? assignment.staffIds
                .map((id) => state.users.find((u) => u.id === id))
                .filter((u): u is NonNullable<typeof u> => Boolean(u))
            : [];

          const attendanceForShift = assignment
            ? state.attendance.filter((r) => r.assignmentId === assignment.id)
            : [];

          const checkedInCount = attendanceForShift.filter((r) => Boolean(r.checkInTime)).length;
          const lateCount = attendanceForShift.filter(
            (r) => Boolean(r.checkInTime) && r.lateMinutes > 0
          ).length;

          const shiftEnded = hasShiftEnded(nowWib.date, shift, nowWib);
          const picUser = assignment
            ? state.users.find((u) => u.id === assignment.picId)
            : undefined;

          return (
            <section
              key={shift}
              className="rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-5 flex flex-col"
            >
              {/* Header Kartu Shift */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--kl-border)] pb-4">
                <div>
                  <p className="text-xs font-medium text-[var(--kl-ink-muted)] font-mono tabular-nums">
                    {meta.timeRangeLabel}
                  </p>
                  <h2 className="text-xl font-bold text-[var(--kl-ink)] mt-0.5">
                    Shift {meta.label}
                  </h2>
                  <p className="text-xs text-[var(--kl-ink-muted)] mt-0.5">
                    PIC Shift: <span className="font-semibold text-[var(--kl-ink)]">{picUser?.name ?? 'Belum dijadwalkan'}</span>
                  </p>
                </div>

                <StatusIndicator
                  label={cleanliness ? 'Kebersihan: Sudah Dikirim' : 'Kebersihan: Belum Dikirim'}
                  tone={cleanliness ? 'success' : 'warning'}
                />
              </div>

              {/* 4 Metrik Kunci Shift */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-[var(--kl-bg)] border border-[var(--kl-border)] p-3">
                  <p className="text-xs text-[var(--kl-ink-muted)]">Terjadwal</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-[var(--kl-ink)] mt-0.5">
                    {scheduledStaff.length}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--kl-bg)] border border-[var(--kl-border)] p-3">
                  <p className="text-xs text-[var(--kl-ink-muted)]">Sudah Check-in</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-[var(--kl-accent)] mt-0.5">
                    {checkedInCount}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--kl-bg)] border border-[var(--kl-border)] p-3">
                  <p className="text-xs text-[var(--kl-ink-muted)]">Terlambat</p>
                  <p
                    className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${
                      lateCount > 0 ? 'text-[#B45309]' : 'text-[var(--kl-ink)]'
                    }`}
                  >
                    {lateCount}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--kl-bg)] border border-[var(--kl-border)] p-3">
                  <p className="text-xs text-[var(--kl-ink-muted)]">Kebersihan</p>
                  <p className="text-xs font-semibold text-[var(--kl-ink)] mt-1.5">
                    {cleanliness ? 'Sudah Dikirim' : 'Belum Dikirim'}
                  </p>
                </div>
              </div>

              {/* Daftar Absensi Staf per Shift */}
              <div className="space-y-2.5 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[var(--kl-ink)] flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-[var(--kl-accent)]" aria-hidden="true" />
                    <span>Kehadiran Staf</span>
                  </h3>
                  {!shiftEnded && (
                    <span className="text-xs text-[var(--kl-ink-muted)]">
                      Konfirmasi Izin/Sakit/Alpa terbuka setelah {meta.endHHMM.replace(':', '.')} WIB
                    </span>
                  )}
                </div>

                {!assignment || scheduledStaff.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--kl-border-strong)] p-4 text-sm text-[var(--kl-ink-muted)]">
                    Belum ada staf terjadwal untuk shift {meta.label} hari ini.
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--kl-border)] border border-[var(--kl-border)] rounded-xl overflow-hidden bg-white">
                    {scheduledStaff.map((staff) => {
                      const rec = attendanceForShift.find((r) => r.staffId === staff.id);
                      const isPic = assignment.picId === staff.id;
                      const canConfirmAbsence =
                        shiftEnded && !rec?.checkInTime && !rec?.supervisorStatus;

                      return (
                        <div
                          key={staff.id}
                          className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-semibold text-[var(--kl-ink)]">
                                {staff.name}
                              </span>
                              <span className="text-xs text-[var(--kl-ink-muted)]">· {staff.jobTitle}</span>
                              {isPic && (
                                <span className="text-xs font-semibold text-[var(--kl-accent)]">
                                  · PIC Shift
                                </span>
                              )}
                            </div>

                            {rec?.checkInTime ? (
                              <p className="text-xs text-[var(--kl-ink-muted)] font-mono tabular-nums">
                                Masuk {formatTimeDotWib(rec.checkInTime)} · Pulang{' '}
                                {formatTimeDotWib(rec.checkOutTime)}
                                {rec.durationMinutes !== null
                                  ? ` · Durasi ${formatDurationIndo(rec.durationMinutes)}`
                                  : ''}
                              </p>
                            ) : rec?.supervisorStatus ? (
                              <p className="text-xs text-[var(--kl-ink-muted)]">
                                Dikonfirmasi supervisor
                                {rec.supervisorNote ? `: ${rec.supervisorNote}` : ''}
                              </p>
                            ) : (
                              <p className="text-xs text-[var(--kl-ink-muted)]">Belum melakukan check-in</p>
                            )}

                            {(rec?.checkInPhotoId || rec?.checkOutPhotoId) && (
                              <div className="flex flex-wrap items-center gap-2 pt-1.5">
                                {rec?.checkInPhotoId && (
                                  <FacePhotoAvatar
                                    photoId={rec.checkInPhotoId}
                                    label="Masuk"
                                    staffName={staff.name}
                                    timeLabel={formatTimeDotWib(rec.checkInTime)}
                                  />
                                )}
                                {rec?.checkOutPhotoId && (
                                  <FacePhotoAvatar
                                    photoId={rec.checkOutPhotoId}
                                    label="Pulang"
                                    staffName={staff.name}
                                    timeLabel={formatTimeDotWib(rec.checkOutTime)}
                                  />
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {rec?.supervisorStatus ? (
                              <StatusIndicator
                                label={rec.supervisorStatus}
                                tone={rec.supervisorStatus === 'Alpa' ? 'danger' : 'warning'}
                              />
                            ) : rec?.checkInTime ? (
                              <StatusIndicator
                                label={formatLateIndo(rec.lateMinutes)}
                                tone={rec.lateMinutes > 0 ? 'warning' : 'success'}
                              />
                            ) : (
                              <>
                                <StatusIndicator
                                  label="Belum Check-in"
                                  tone={shiftEnded ? 'danger' : 'neutral'}
                                />
                                {canConfirmAbsence && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setConfirmTarget({
                                        assignmentId: assignment.id,
                                        staffId: staff.id,
                                        staffName: staff.name,
                                        shift,
                                      });
                                      setAbsenceChoice('Alpa');
                                      setAbsenceNote('');
                                      setAbsenceError('');
                                    }}
                                    className="min-h-[36px] px-2.5 py-1 rounded-lg border border-[var(--kl-border-strong)] bg-[var(--kl-bg)] text-xs font-semibold text-[var(--kl-ink)] hover:bg-[var(--kl-tint)] whitespace-nowrap"
                                  >
                                    Konfirmasi Status
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Aksi Laporan Kebersihan Shift */}
              <div className="pt-2 border-t border-[var(--kl-border)] flex flex-wrap items-center justify-between gap-2">
                {cleanliness ? (
                  <>
                    <div className="text-xs text-[var(--kl-ink-muted)]">
                      Dikirim {cleanliness.picName} ·{' '}
                      <span className="font-mono tabular-nums">{cleanliness.submittedAt}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigateCleanlinessDetail(nowWib.date, shift)}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--kl-accent)] bg-[var(--kl-bg)] text-xs font-semibold text-[var(--kl-accent)] hover:bg-[var(--kl-tint)] inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
                      <span>Tinjau Laporan &amp; Foto</span>
                    </button>
                  </>
                ) : (
                  <div className="text-xs text-[var(--kl-ink-muted)] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[var(--kl-ink-muted)]" aria-hidden="true" />
                    <span>Menunggu PIC {meta.label} mengirim laporan kebersihan.</span>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Modal Konfirmasi Izin / Sakit / Alpa */}
      {confirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-konfirmasi-absen"
        >
          <form
            onSubmit={handleConfirmAbsence}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-[var(--kl-bg)] border border-[var(--kl-border)] p-5 space-y-4 shadow-xl"
          >
            <div>
              <h3 id="modal-konfirmasi-absen" className="text-lg font-bold text-[var(--kl-ink)]">
                Konfirmasi Status Kehadiran
              </h3>
              <p className="text-xs text-[var(--kl-ink-muted)] mt-0.5">
                {confirmTarget.staffName} · Shift {SHIFT_META[confirmTarget.shift].label}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--kl-ink)]">Pilih Status</label>
              <div className="grid grid-cols-3 gap-2">
                {(['Izin', 'Sakit', 'Alpa'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setAbsenceChoice(status)}
                    className={`min-h-[44px] rounded-xl border text-sm font-semibold ${
                      absenceChoice === status
                        ? status === 'Alpa'
                          ? 'border-[#B91C1C] bg-[#FEE2E2] text-[#991B1B]'
                          : 'border-[#D97706] bg-[#FEF3C7] text-[#92400E]'
                        : 'border-[var(--kl-border)] bg-white text-[var(--kl-ink-sub)]'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="absence-note" className="block text-sm font-medium text-[var(--kl-ink)]">
                Catatan Supervisor (Opsional)
              </label>
              <textarea
                id="absence-note"
                rows={2}
                value={absenceNote}
                onChange={(e) => setAbsenceNote(e.target.value)}
                placeholder="Contoh: Sudah mengabari pagi hari / tanpa keterangan"
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm text-[var(--kl-ink)]"
              />
            </div>

            {absenceError && (
              <p className="text-xs font-medium text-[#B91C1C]" role="alert">
                {absenceError}
              </p>
            )}

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm font-medium text-[var(--kl-ink-sub)]"
              >
                Batal
              </button>
              <button
                type="submit"
                className="min-h-[44px] flex-1 px-4 py-2 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold hover:bg-[var(--kl-accent-hover)]"
              >
                Simpan Status
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
