import { PhotoViewer } from '../components/PhotoViewer';
import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle,
  ClipboardList,
  LogIn,
  LogOut,
  MessageSquareText,
  PackageOpen,
  Plus,
  Sparkles,
} from 'lucide-react';
import { AttendanceFaceModal } from '../components/AttendanceFaceModal';
import { AttendanceCleanlinessEvidence } from '../components/AttendanceCleanlinessEvidence';
import { CleanlinessForm } from '../components/CleanlinessForm';
import { ShiftTaskList } from '../components/ShiftTaskList';
import { FacePhotoAvatar } from '../components/FacePhotoAvatar';
import { ItemReportModal } from '../components/ItemReportModal';
import { StatusIndicator } from '../components/StatusIndicator';
import { useKitchen } from '../storage/kitchenContext';
import { ShiftType } from '../types/kitchen';
import {
  formatDateIndo,
  formatDurationIndo,
  formatLateIndo,
  formatTimeDotWib,
  hasShiftEnded,
  SHIFT_META,
} from '../utils/wibTime';

import { visibleAssignments } from '../utils/visibleAssignments';

interface TodayPageProps {
  onNavigateCleanlinessDetail: (date: string, shift: ShiftType) => void;
  onNavigateItemReports: () => void;
}

export const TodayPage: React.FC<TodayPageProps> = ({
  onNavigateCleanlinessDetail,
  onNavigateItemReports,
}) => {
  const { state, currentUser, nowWib, checkIn, checkOut } = useKitchen();
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [attendanceFeedback, setAttendanceFeedback] = useState<Record<string, string>>({});
  const [faceModal, setFaceModal] = useState<{
    assignmentId: string;
    shift: ShiftType;
    mode: 'checkin' | 'checkout';
  } | null>(null);

  const todayAssignments = useMemo(() => {
    if (!currentUser) return [];
    return visibleAssignments(state.assignments, state.attendance, currentUser.id, nowWib.date)
      .sort((a, b) => (a.shift === 'opening' ? -1 : 1) - (b.shift === 'opening' ? -1 : 1));
  }, [state.assignments, state.attendance, currentUser, nowWib.date]);

  const todayOpeningReport = useMemo(
    () =>
      state.cleanlinessReports.find(
        (r) => r.date === nowWib.date && r.shift === 'opening'
      ),
    [state.cleanlinessReports, nowWib.date]
  );

  const isAssignedClosing = todayAssignments.some((a) => a.shift === 'closing');
  const isPicOpening = todayAssignments.some(
    (a) => a.shift === 'opening' && a.picId === currentUser?.id
  );

  const openItemReports = useMemo(
    () => state.itemReports.filter((r) => r.status !== 'Selesai'),
    [state.itemReports]
  );

  // Checklist kebersihan milik staf ini pada shift hari ini (bukan laporan PIC shift).
  const myChecklistDone = useMemo(() => {
    if (!currentUser) return false;
    const shift = todayAssignments[0]?.shift;
    if (!shift) return false;
    const record = state.attendance.find(
      (r) => r.staffId === currentUser.id && r.date === nowWib.date && r.shift === shift
    );
    return Boolean(record?.checkInCleanliness || record?.checkOutCleanliness);
  }, [state.attendance, currentUser, nowWib.date, todayAssignments]);

  if (!currentUser) return null;

  return (
    <div className="space-y-6">
      {/* Header + Tombol Cepat Laporkan Barang */}
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
            Hari Ini, {currentUser.name}
          </h1>
          <p className="text-sm text-[var(--kl-ink-muted)]">{currentUser.jobTitle}</p>
        </div>

        <button
          type="button"
          onClick={() => setItemModalOpen(true)}
          className="min-h-[48px] w-full sm:w-auto px-5 py-3 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold hover:bg-[var(--kl-accent-hover)] active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Laporkan Barang</span>
        </button>
      </div>

      {/* Jadwal Shift & Absensi */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--kl-ink)]">Jadwal &amp; Absensi Shift Hari Ini</h2>

        {todayAssignments.length === 0 ? (
          <div className="rounded-2xl border border-[var(--kl-border)] bg-white p-5 text-sm text-[var(--kl-ink-muted)]">
            Anda tidak memiliki penugasan shift untuk hari ini ({formatDateIndo(nowWib.date, false)}) di {state.kitchenName}.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {todayAssignments.map((assignment) => {
              const meta = SHIFT_META[assignment.shift];
              const isPic = assignment.picId === currentUser.id;
              const picUser = state.users.find((u) => u.id === assignment.picId);
              const record = state.attendance.find(
                (r) => r.assignmentId === assignment.id && r.staffId === currentUser.id
              );
              const shiftEnded = hasShiftEnded(assignment.date, assignment.shift, nowWib);
              const hasCheckedIn = Boolean(record?.checkInTime);
              const hasCheckedOut = Boolean(record?.checkOutTime);
              const hasSupStatus = Boolean(record?.supervisorStatus);
              const err = attendanceFeedback[assignment.id];

              return (
                <article
                  key={assignment.id}
                  className="rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--kl-ink-muted)]">
                        <span>{formatDateIndo(assignment.date, false)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{meta.timeRangeLabel}</span>
                      </div>
                      <h3 className="text-lg font-bold text-[var(--kl-ink)]">
                        Shift {meta.label}
                        {isPic ? ' · Anda PIC Shift' : ''}
                      </h3>
                      <p className="text-xs text-[var(--kl-ink-muted)]">
                        PIC Shift: {picUser?.name ?? 'Belum ditunjuk'} · {assignment.staffIds.length}{' '}
                        staf terjadwal
                      </p>
                    </div>

                    {hasSupStatus && record?.supervisorStatus ? (
                      <StatusIndicator
                        label={record.supervisorStatus}
                        tone={record.supervisorStatus === 'Alpa' ? 'danger' : 'warning'}
                      />
                    ) : hasCheckedIn && record ? (
                      <StatusIndicator
                        label={formatLateIndo(record.lateMinutes)}
                        tone={record.lateMinutes > 0 ? 'warning' : 'success'}
                      />
                    ) : (
                      <StatusIndicator
                        label="Belum Check-in"
                        tone={shiftEnded ? 'danger' : 'neutral'}
                      />
                    )}
                  </div>

                  {/* Ringkasan Jam Masuk, Pulang, Durasi */}
                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-[var(--kl-bg)] border border-[var(--kl-border)] p-3 text-xs">
                    <div>
                      <p className="text-[var(--kl-ink-muted)]">Check-in</p>
                      <p className="font-mono tabular-nums font-semibold text-[var(--kl-ink)] mt-0.5">
                        {formatTimeDotWib(record?.checkInTime)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[var(--kl-ink-muted)]">Check-out</p>
                      <p className="font-mono tabular-nums font-semibold text-[var(--kl-ink)] mt-0.5">
                        {formatTimeDotWib(record?.checkOutTime)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[var(--kl-ink-muted)]">Durasi</p>
                      <p className="font-mono tabular-nums font-semibold text-[var(--kl-ink)] mt-0.5">
                        {formatDurationIndo(record?.durationMinutes)}
                      </p>
                    </div>
                  </div>

                  {(record?.checkInPhotoId || record?.checkOutPhotoId || record?.checkInKitchenPhotoId || record?.checkOutKitchenPhotoId) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {record?.checkInKitchenPhotoId && <div className="w-32 whitespace-normal"><p className="text-xs font-semibold">Dapur · Masuk</p><PhotoViewer photoId={record.checkInKitchenPhotoId} alt="Kondisi dapur saat check-in" /></div>}
                      {record?.checkOutKitchenPhotoId && <div className="w-32 whitespace-normal"><p className="text-xs font-semibold">Dapur · Pulang</p><PhotoViewer photoId={record.checkOutKitchenPhotoId} alt="Kondisi dapur saat check-out" /></div>}
                      {record?.checkInPhotoId && (
                        <FacePhotoAvatar
                          photoId={record.checkInPhotoId}
                          label="Masuk"
                          staffName={currentUser.name}
                          timeLabel={formatTimeDotWib(record.checkInTime)}
                        />
                      )}
                      {record?.checkOutPhotoId && (
                        <FacePhotoAvatar
                          photoId={record.checkOutPhotoId}
                          label="Pulang"
                          staffName={currentUser.name}
                          timeLabel={formatTimeDotWib(record.checkOutTime)}
                        />
                      )}
                    </div>
                  )}

                  <AttendanceCleanlinessEvidence record={record}/>
                  {record?.supervisorNote && (
                    <p className="text-xs text-[var(--kl-ink-sub)] bg-[var(--kl-soft)] rounded-lg px-3 py-2">
                      Catatan Admin: {record.supervisorNote}
                    </p>
                  )}

                  {err && (
                    <p className="text-xs font-medium text-[#B91C1C]" role="alert">
                      {err}
                    </p>
                  )}

                  {/* Tombol Check-in & Check-out satu tangan */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={hasCheckedIn || hasSupStatus}
                      onClick={() => {
                        setAttendanceFeedback((p) => ({ ...p, [assignment.id]: '' }));
                        setFaceModal({
                          assignmentId: assignment.id,
                          shift: assignment.shift,
                          mode: 'checkin',
                        });
                      }}
                      className={`min-h-[48px] px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap ${
                        hasCheckedIn || hasSupStatus
                          ? 'bg-[var(--kl-soft)] text-[var(--kl-ink-muted)] border border-[var(--kl-border)] cursor-not-allowed'
                          : 'bg-[var(--kl-accent)] text-white hover:bg-[var(--kl-accent-hover)] active:scale-[0.99]'
                      }`}
                    >
                      <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{hasCheckedIn ? 'Sudah Check-in' : 'Check-in'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={!hasCheckedIn || hasCheckedOut}
                      onClick={() => {
                        setAttendanceFeedback((p) => ({ ...p, [assignment.id]: '' }));
                        setFaceModal({
                          assignmentId: assignment.id,
                          shift: assignment.shift,
                          mode: 'checkout',
                        });
                      }}
                      className={`min-h-[48px] px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap ${
                        !hasCheckedIn || hasCheckedOut
                          ? 'bg-[var(--kl-soft)] text-[var(--kl-ink-muted)] border border-[var(--kl-border)] cursor-not-allowed'
                          : 'bg-[var(--kl-ink)] text-white hover:bg-[var(--kl-ink-sub)] active:scale-[0.99]'
                      }`}
                    >
                      <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{hasCheckedOut ? 'Sudah Check-out' : 'Check-out'}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Rekap Pekerjaan: daftar tugas shift yang bisa dicentang staf */}
      {todayAssignments.map((assignment) => (
        <ShiftTaskList key={`tasks-${assignment.id}`} date={nowWib.date} shift={assignment.shift} />
      ))}

      {/* Ringkasan Serah Terima & Catatan dari Opening (tampil untuk Tim Closing & PIC Opening) */}
      {(isAssignedClosing || isPicOpening || currentUser.role === 'supervisor') && (
        <section className="rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[var(--kl-ink)] flex items-center gap-2">
              <MessageSquareText className="w-4 h-4 text-[var(--kl-accent)]" aria-hidden="true" />
              <span>Serah Terima Shift Opening → Closing</span>
            </h2>
            {todayOpeningReport ? (
              <span className="text-xs text-[var(--kl-ink-muted)]">
                Dari {todayOpeningReport.picName} ·{' '}
                <span className="font-mono tabular-nums">{todayOpeningReport.submittedAt}</span>
              </span>
            ) : null}
          </div>

          {todayOpeningReport ? (
            <div className="space-y-3">
              {todayOpeningReport.confirmedAiSummary && (
                <div className="rounded-xl bg-[var(--kl-tint)] border border-[var(--kl-tint-border)] p-4 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[var(--kl-accent-deep)] inline-flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                      Ringkasan Tindak Lanjut Opening (Terkonfirmasi)
                    </span>
                    {todayOpeningReport.aiSummaryConfirmedAt && (
                      <span className="text-xs text-[var(--kl-ink-sub)] font-mono tabular-nums">
                        {todayOpeningReport.aiSummaryConfirmedAt}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--kl-ink)] whitespace-pre-line leading-relaxed">
                    {todayOpeningReport.confirmedAiSummary}
                  </p>
                </div>
              )}

              <div className="rounded-xl bg-[var(--kl-bg)] border border-[var(--kl-border)] p-3.5 space-y-1">
                <p className="text-xs font-semibold text-[var(--kl-ink-muted)]">
                  Catatan Serah Terima PIC Opening
                </p>
                <p className="text-sm text-[var(--kl-ink)] leading-relaxed">
                  {todayOpeningReport.handoverNote
                    ? todayOpeningReport.handoverNote
                    : 'PIC Opening tidak menambahkan catatan serah terima khusus.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onNavigateCleanlinessDetail(nowWib.date, 'opening')}
                className="min-h-[40px] text-xs font-semibold text-[var(--kl-accent)] hover:underline inline-flex items-center gap-1"
              >
                <span>
                  {isPicOpening
                    ? 'Buka Laporan Kebersihan Opening & Ringkasan Serah Terima'
                    : 'Buka Detail Laporan Kebersihan Opening'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-[var(--kl-ink-muted)]">
              Laporan kebersihan &amp; catatan serah terima dari PIC Opening hari ini belum dikirim.
            </p>
          )}
        </section>
      )}

      {/* Bagian Khusus PIC Shift: Form atau Status Laporan Kebersihan */}
      {todayAssignments
        .filter((a) => a.picId === currentUser.id)
        .map((picAssignment) => (
          <CleanlinessForm
            key={`clean-form-${picAssignment.id}`}
            date={picAssignment.date}
            shift={picAssignment.shift}
            picId={currentUser.id}
            picName={currentUser.name}
            onViewDetail={onNavigateCleanlinessDetail}
          />
        ))}

      {/* Daftar Laporan Barang Masih Terbuka (Lintas Shift & Lintas Hari) */}
      <section className="rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[var(--kl-ink)] flex items-center gap-2">
              <PackageOpen className="w-4 h-4 text-[#B45309]" aria-hidden="true" />
              <span>Laporan Barang Masih Terbuka ({openItemReports.length})</span>
            </h2>
            <p className="text-xs text-[var(--kl-ink-muted)] mt-0.5">
              Tetap tampil lintas shift dan pergantian hari hingga diselesaikan supervisor.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateItemReports}
            className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--kl-border)] bg-[var(--kl-bg)] text-xs font-semibold text-[var(--kl-ink)] hover:bg-[var(--kl-soft)] inline-flex items-center gap-1 whitespace-nowrap"
          >
            <span>Lihat Semua</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {openItemReports.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-[#15803D] py-2">
            <CheckCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Tidak ada laporan barang rusak atau hilang yang masih terbuka.</span>
          </div>
        ) : (
          <div className="divide-y divide-[var(--kl-border)]">
            {openItemReports.map((item) => (
              <div
                key={item.id}
                className="py-3 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--kl-ink)]">
                      {item.itemName} ({item.quantity} unit)
                    </span>
                    <StatusIndicator
                      label={item.type}
                      tone={item.type === 'Barang Rusak' ? 'danger' : 'warning'}
                    />
                  </div>
                  <p className="text-xs text-[var(--kl-ink-muted)]">
                    Lokasi: {item.location} · Pelapor: {item.reporterName} (Shift{' '}
                    {SHIFT_META[item.shift].label}, {formatDateIndo(item.date, false)})
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <StatusIndicator
                    label={item.status}
                    tone={item.status === 'Dilaporkan' ? 'warning' : 'neutral'}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Shortcut status checklist kebersihan staf (bukan laporan PIC shift) */}
      {!todayAssignments.some((a) => a.picId === currentUser.id) && (
        <section className="rounded-2xl border border-[var(--kl-border)] bg-[var(--kl-bg)] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-sm text-[var(--kl-ink-sub)]">
            <ClipboardList className="w-4 h-4 text-[var(--kl-accent)] mt-0.5" aria-hidden="true" />
            <div className="space-y-0.5">
              <span>
                Checklist Kebersihan Anda:{' '}
                <strong>{myChecklistDone ? 'Sudah Diisi' : 'Belum Diisi'}</strong>
              </span>
              <p className="text-xs text-[var(--kl-ink-muted)]">
                Checklist 6 area diisi di halaman Laporan Kebersihan. Status laporan PIC shift berbeda dengan checklist pribadi Anda.
              </p>
            </div>
          </div>
          {todayAssignments[0] && (
            <button
              type="button"
              onClick={() => onNavigateCleanlinessDetail(nowWib.date, todayAssignments[0].shift)}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white border border-[var(--kl-border-strong)] text-xs font-semibold text-[var(--kl-accent)] hover:bg-[var(--kl-soft)]"
            >
              {myChecklistDone ? 'Lihat Checklist' : 'Isi Checklist'}
            </button>
          )}
        </section>
      )}

      <ItemReportModal
        open={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        defaultShift={todayAssignments[0]?.shift}
      />

      <AttendanceFaceModal
        open={Boolean(faceModal)}
        mode={faceModal?.mode ?? 'checkin'}
        staffName={currentUser.name}
        shift={faceModal?.shift ?? 'opening'}
        currentTimeHHMM={nowWib.timeHHMM}
        onClose={() => setFaceModal(null)}
        onConfirm={async (photoId, clientRef, kitchenPhotoId) => {
          if (!faceModal) {
            return { ok: false, message: 'Sesi absensi tidak ditemukan.' };
          }
          const res =
            faceModal.mode === 'checkin'
              ? await checkIn(faceModal.assignmentId, currentUser.id, photoId, undefined, clientRef, kitchenPhotoId)
              : await checkOut(faceModal.assignmentId, currentUser.id, photoId, undefined, clientRef, kitchenPhotoId);
          if (!res.ok) {
            setAttendanceFeedback((p) => ({
              ...p,
              [faceModal.assignmentId]: res.message,
            }));
          } else {
            setAttendanceFeedback((p) => ({
              ...p,
              [faceModal.assignmentId]: '',
            }));
          }
          return res;
        }}
      />
    </div>
  );
};
