import React, { useMemo, useState } from 'react';
import { ClipboardCheck, History, PackageOpen } from 'lucide-react';
import { FacePhotoAvatar } from '../components/FacePhotoAvatar';
import { StatusIndicator } from '../components/StatusIndicator';
import { useKitchen } from '../storage/kitchenStore';
import { ShiftType } from '../types/kitchen';
import {
  formatDateIndo,
  formatDurationIndo,
  formatLateIndo,
  formatTimeDotWib,
  SHIFT_META,
} from '../utils/wibTime';

interface HistoryPageProps {
  onNavigateCleanlinessDetail: (date: string, shift: ShiftType) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  onNavigateCleanlinessDetail,
}) => {
  const { state, nowWib } = useKitchen();

  const availableDates = useMemo(() => {
    const set = new Set<string>([nowWib.date]);
    state.assignments.forEach((a) => set.add(a.date));
    state.cleanlinessReports.forEach((c) => set.add(c.date));
    state.itemReports.forEach((i) => set.add(i.date));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [state.assignments, state.cleanlinessReports, state.itemReports, nowWib.date]);

  const [filterDate, setFilterDate] = useState<string>(availableDates[1] ?? availableDates[0]);
  const [filterShift, setFilterShift] = useState<'all' | ShiftType>('all');

  const shiftsToShow: ShiftType[] =
    filterShift === 'all' ? ['opening', 'closing'] : [filterShift];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-[var(--kl-tint-border)] bg-[var(--kl-tint)] text-xs font-bold text-[var(--kl-accent-deep)]">
            <span
              className="w-2 h-2 rounded-full bg-[var(--kl-accent)] shrink-0"
              aria-hidden="true"
            />
            <span>{state.kitchenName}</span>
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--kl-ink)] flex items-center gap-2">
            <History className="w-6 h-6 text-[var(--kl-accent)]" aria-hidden="true" />
            <span>Riwayat Operasional</span>
          </h1>
          <p className="text-sm text-[var(--kl-ink-muted)]">
            Telusuri catatan absensi, laporan kebersihan, dan laporan barang berdasarkan tanggal dan shift.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Filter tanggal riwayat"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm text-[var(--kl-ink)]"
          >
            {availableDates.map((d) => (
              <option key={d} value={d}>
                {formatDateIndo(d)}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-xl border border-[var(--kl-border)] bg-[var(--kl-track)] p-1">
            {(
              [
                { value: 'all', label: 'Semua Shift' },
                { value: 'opening', label: 'Opening' },
                { value: 'closing', label: 'Closing' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilterShift(opt.value)}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap ${
                  filterShift === opt.value
                    ? 'bg-white text-[var(--kl-ink)] shadow-xs'
                    : 'text-[var(--kl-ink-muted)] hover:text-[var(--kl-ink)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {shiftsToShow.map((shift) => {
          const assignment = state.assignments.find(
            (a) => a.date === filterDate && a.shift === shift
          );
          const cleanliness = state.cleanlinessReports.find(
            (r) => r.date === filterDate && r.shift === shift
          );
          const itemReports = state.itemReports.filter(
            (i) => i.date === filterDate && i.shift === shift
          );
          const pic = assignment
            ? state.users.find((u) => u.id === assignment.picId)
            : undefined;

          return (
            <section
              key={shift}
              className="rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--kl-border)] pb-4">
                <div>
                  <p className="text-xs text-[var(--kl-ink-muted)] font-mono tabular-nums">
                    {formatDateIndo(filterDate)} · {SHIFT_META[shift].timeRangeLabel}
                  </p>
                  <h2 className="text-lg font-bold text-[var(--kl-ink)] mt-0.5">
                    Shift {SHIFT_META[shift].label}
                  </h2>
                  <p className="text-xs text-[var(--kl-ink-muted)]">
                    PIC Shift: {pic?.name ?? 'Tidak ada jadwal'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusIndicator
                    label={cleanliness ? 'Kebersihan: Sudah Dikirim' : 'Kebersihan: Belum Dikirim'}
                    tone={cleanliness ? 'success' : 'warning'}
                  />
                  {cleanliness && (
                    <button
                      type="button"
                      onClick={() => onNavigateCleanlinessDetail(filterDate, shift)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--kl-accent)] bg-[var(--kl-bg)] text-xs font-semibold text-[var(--kl-accent)] hover:bg-[var(--kl-tint)] inline-flex items-center gap-1.5"
                    >
                      <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Lihat Laporan Kebersihan</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Tabel Absensi */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-[var(--kl-ink)]">Catatan Absensi Staf</h3>
                {!assignment || assignment.staffIds.length === 0 ? (
                  <p className="text-sm text-[var(--kl-ink-muted)]">
                    Tidak ada penugasan staf pada shift ini.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-[var(--kl-border)]">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[var(--kl-bg)] border-b border-[var(--kl-border)] text-xs text-[var(--kl-ink-muted)]">
                        <tr>
                          <th className="py-2.5 px-3.5 font-semibold">Nama Staf</th>
                          <th className="py-2.5 px-3.5 font-semibold">Check-in</th>
                          <th className="py-2.5 px-3.5 font-semibold">Check-out</th>
                          <th className="py-2.5 px-3.5 font-semibold">Durasi</th>
                          <th className="py-2.5 px-3.5 font-semibold">Foto Wajah</th>
                          <th className="py-2.5 px-3.5 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--kl-border)]">
                        {assignment.staffIds.map((staffId) => {
                          const staff = state.users.find((u) => u.id === staffId);
                          const rec = state.attendance.find(
                            (r) => r.assignmentId === assignment.id && r.staffId === staffId
                          );
                          const isPic = assignment.picId === staffId;

                          return (
                            <tr key={staffId} className="hover:bg-[var(--kl-bg)]/60">
                              <td className="py-2.5 px-3.5 font-medium text-[var(--kl-ink)] whitespace-nowrap">
                                {staff?.name ?? staffId}
                                {isPic ? ' (PIC)' : ''}
                              </td>
                              <td className="py-2.5 px-3.5 font-mono tabular-nums text-xs text-[var(--kl-ink-sub)] whitespace-nowrap">
                                {formatTimeDotWib(rec?.checkInTime)}
                              </td>
                              <td className="py-2.5 px-3.5 font-mono tabular-nums text-xs text-[var(--kl-ink-sub)] whitespace-nowrap">
                                {formatTimeDotWib(rec?.checkOutTime)}
                              </td>
                              <td className="py-2.5 px-3.5 font-mono tabular-nums text-xs text-[var(--kl-ink-sub)] whitespace-nowrap">
                                {formatDurationIndo(rec?.durationMinutes)}
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
                                {rec?.checkInPhotoId || rec?.checkOutPhotoId ? (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {rec?.checkInPhotoId && (
                                      <FacePhotoAvatar
                                        photoId={rec.checkInPhotoId}
                                        label="Masuk"
                                        staffName={staff?.name ?? staffId}
                                        timeLabel={formatTimeDotWib(rec.checkInTime)}
                                      />
                                    )}
                                    {rec?.checkOutPhotoId && (
                                      <FacePhotoAvatar
                                        photoId={rec.checkOutPhotoId}
                                        label="Pulang"
                                        staffName={staff?.name ?? staffId}
                                        timeLabel={formatTimeDotWib(rec.checkOutTime)}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-[var(--kl-ink-muted)]">—</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
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
                                  <StatusIndicator label="Belum Check-in" tone="neutral" />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Laporan Barang Shift Ini */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-[var(--kl-ink)] flex items-center gap-1.5">
                  <PackageOpen className="w-4 h-4 text-[#B45309]" aria-hidden="true" />
                  <span>Laporan Barang pada Shift Ini ({itemReports.length})</span>
                </h3>
                {itemReports.length === 0 ? (
                  <p className="text-xs text-[var(--kl-ink-muted)]">
                    Tidak ada laporan barang baru pada tanggal dan shift ini.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--kl-border)] rounded-xl border border-[var(--kl-border)] bg-[var(--kl-bg)]">
                    {itemReports.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-[var(--kl-ink)]">
                            {item.itemName} ({item.quantity} unit) · {item.type}
                          </p>
                          <p className="text-[var(--kl-ink-muted)]">
                            Lokasi: {item.location} · Pelapor: {item.reporterName}
                          </p>
                        </div>
                        <StatusIndicator
                          label={item.status}
                          tone={
                            item.status === 'Selesai'
                              ? 'success'
                              : item.status === 'Ditindaklanjuti'
                              ? 'warning'
                              : 'danger'
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
