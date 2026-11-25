import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Loader2, RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import { useKitchen } from '../storage/kitchenContext';
import type {
  AttendanceAuditEntry,
  OperationalReport,
  OperationalReportRow,
} from '../types/kitchen';
import {
  formatDateIndo,
  formatDurationIndo,
  formatLateIndo,
  formatTimeDotWib,
  SHIFT_META,
} from '../utils/wibTime';

/** Format menit menjadi "HH:MM" untuk input koreksi. */
function minutesToHHMM(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '';
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function todayWib(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const STATUS_TONE: Record<string, string> = {
  Hadir: 'bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]',
  'Hadir (Terlambat)': 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]',
  'Belum Check-out': 'bg-[#FFE4E6] text-[#B91C1C] border-[#FECDD3]',
  'Belum Absen': 'bg-[var(--kl-soft)] text-[var(--kl-ink-sub)] border-[var(--kl-border)]',
  Izin: 'bg-[#E0E7FF] text-[#3730A3] border-[#C7D2FE]',
  Sakit: 'bg-[#FCE7F3] text-[#9D174D] border-[#FBCFE8]',
  Alpa: 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]',
};

interface CorrectionDraft {
  row: OperationalReportRow;
  checkInTime: string;
  checkOutTime: string;
  reason: string;
  supervisorStatus: '' | 'Izin' | 'Sakit' | 'Alpa';
  supervisorNote: string;
}

export const OperationalReportPage: React.FC = () => {
  const { state, currentUser, nowWib, fetchOperationalReport, correctAttendance, fetchAttendanceAudit, showToast } = useKitchen();
  const [from, setFrom] = useState(() => addDays(todayWib(), -13));
  const [to, setTo] = useState(() => todayWib());
  const [staffId, setStaffId] = useState('');
  const [report, setReport] = useState<OperationalReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CorrectionDraft | null>(null);
  const [audit, setAudit] = useState<AttendanceAuditEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!fetchOperationalReport) {
      setError('Rekap operasional hanya tersedia pada mode MySQL.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOperationalReport({ from, to, staffId: staffId || undefined });
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat rekap.');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [fetchOperationalReport, from, to, staffId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadAudit = useCallback(async () => {
    if (!fetchAttendanceAudit) return;
    setAudit(await fetchAttendanceAudit());
  }, [fetchAttendanceAudit]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const staffOptions = useMemo(
    () => [...state.users].sort((a, b) => a.name.localeCompare(b.name)),
    [state.users]
  );

  const exportCsv = () => {
    // Ekspor lewat endpoint agar server yang menandatangani & memfilter data.
    const params = new URLSearchParams({ from, to });
    if (staffId) params.set('staffId', staffId);
    const token = localStorage.getItem('kitchenlog_token_v1') || '';
    const ws = localStorage.getItem('kitchenlog_ws_v1') || '';
    params.set('workspaceId', ws);
    // Unduhan butuh header Authorization, jadi ambil blob lalu simpan.
    void fetch(`/api/reports/operational.csv?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Gagal mengekspor rekap.');
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `rekap-dapurops-${from}_${to}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast('Rekap CSV diunduh.');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal mengekspor rekap.'));
  };

  const openCorrection = (row: OperationalReportRow) => {
    setDraft({
      row,
      checkInTime: minutesToHHMM(row.checkInTime ? Number(row.checkInTime.split(':')[0]) * 60 + Number(row.checkInTime.split(':')[1]) : null),
      checkOutTime: minutesToHHMM(row.checkOutTime ? Number(row.checkOutTime.split(':')[0]) * 60 + Number(row.checkOutTime.split(':')[1]) : null),
      reason: '',
      supervisorStatus: '',
      supervisorNote: row.supervisorNote || '',
    });
  };

  const submitCorrection = async () => {
    if (!draft || !correctAttendance) return;
    if (draft.reason.trim().length < 5) {
      setError('Alasan koreksi minimal 5 karakter agar jejak audit jelas.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await correctAttendance({
        ...(draft.row.attendanceId
          ? { attendanceId: draft.row.attendanceId }
          : { assignmentId: draft.row.assignmentId, staffId: draft.row.staffId }),
        checkInTime: draft.checkInTime || null,
        checkOutTime: draft.checkOutTime || null,
        clearCheckIn: !draft.checkInTime,
        clearCheckOut: !draft.checkOutTime,
        ...(draft.supervisorStatus ? { supervisorStatus: draft.supervisorStatus, supervisorNote: draft.supervisorNote } : {}),
        reason: draft.reason.trim(),
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setDraft(null);
      await load();
      await loadAudit();
      showToast('Koreksi tersimpan dan tercatat di audit.');
    } finally {
      setSaving(false);
    }
  };

  const summary = report?.summary;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--kl-ink)]">Rekap Operasional</h1>
        <p className="text-sm text-[var(--kl-ink-muted)]">
          Kehadiran, keterlambatan, pulang awal, temuan kebersihan, dan ekspor untuk evaluasi.
        </p>
      </header>

      {/* Filter */}
      <section className="rounded-2xl border border-[var(--kl-border)] bg-white p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="text-xs font-semibold text-[var(--kl-ink-sub)] space-y-1">
            <span>Dari tanggal</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[var(--kl-border-strong)] px-3 text-sm font-normal text-[var(--kl-ink)]"
            />
          </label>
          <label className="text-xs font-semibold text-[var(--kl-ink-sub)] space-y-1">
            <span>Sampai tanggal</span>
            <input
              type="date"
              value={to}
              min={from}
              max={todayWib()}
              onChange={(e) => setTo(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[var(--kl-border-strong)] px-3 text-sm font-normal text-[var(--kl-ink)]"
            />
          </label>
          <label className="text-xs font-semibold text-[var(--kl-ink-sub)] space-y-1">
            <span>Staf</span>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[var(--kl-border-strong)] px-3 text-sm font-normal text-[var(--kl-ink)] bg-white"
            >
              <option value="">Semua staf</option>
              {staffOptions.map((u) => (
                <option key={u.id} value={u.staffId || u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="min-h-[44px] flex-1 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>Muat ulang</span>
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!report || loading}
              className="min-h-[44px] px-3 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm font-semibold text-[var(--kl-ink)] inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-[#B91C1C]">
            {error}
          </p>
        )}
      </section>

      {/* Ringkasan */}
      {summary && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total jadwal', value: summary.totalScheduled, hint: `${formatDateIndo(summary.from, false)} – ${formatDateIndo(summary.to, false)}` },
            { label: 'Hadir', value: summary.hadir, hint: `${summary.terlambat} terlambat` },
            { label: 'Belum check-out', value: summary.belumCheckout, hint: `${summary.belumAbsen} belum absen` },
            { label: 'Temuan terbuka', value: summary.followupTerbuka, hint: `${summary.checklistBermasalah} temuan total` },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-[var(--kl-border)] bg-white p-4">
              <p className="text-xs font-semibold text-[var(--kl-ink-muted)]">{card.label}</p>
              <p className="text-2xl font-bold text-[var(--kl-ink)] tabular-nums mt-0.5">{card.value}</p>
              <p className="text-[11px] text-[var(--kl-ink-muted)] mt-1">{card.hint}</p>
            </div>
          ))}
          <div className="rounded-2xl border border-[var(--kl-border)] bg-white p-4">
            <p className="text-xs font-semibold text-[var(--kl-ink-muted)]">Izin / Sakit / Alpa</p>
            <p className="text-lg font-bold text-[var(--kl-ink)] tabular-nums mt-0.5">
              {summary.izin} / {summary.sakit} / {summary.alpa}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--kl-border)] bg-white p-4">
            <p className="text-xs font-semibold text-[var(--kl-ink-muted)]">Total menit terlambat</p>
            <p className="text-lg font-bold text-[var(--kl-ink)] tabular-nums mt-0.5">{summary.totalLateMinutes} menit</p>
          </div>
          <div className="rounded-2xl border border-[var(--kl-border)] bg-white p-4">
            <p className="text-xs font-semibold text-[var(--kl-ink-muted)]">Rata-rata durasi kerja</p>
            <p className="text-lg font-bold text-[var(--kl-ink)] mt-0.5">{formatDurationIndo(summary.avgDurationMinutes)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--kl-border)] bg-white p-4">
            <p className="text-xs font-semibold text-[var(--kl-ink-muted)]">Pulang lebih awal</p>
            <p className="text-lg font-bold text-[var(--kl-ink)] tabular-nums mt-0.5">{summary.pulangAwal} kali</p>
          </div>
        </section>
      )}

      {/* Ringkasan per staf */}
      {report && report.perStaff.length > 0 && (
        <section className="rounded-2xl border border-[var(--kl-border)] bg-white overflow-hidden">
          <h2 className="px-4 pt-4 text-base font-bold text-[var(--kl-ink)]">Ringkasan per Staf</h2>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead className="bg-[var(--kl-bg)] text-[var(--kl-ink-muted)] text-xs">
                <tr>
                  {['Staf', 'Jadwal', 'Hadir', 'Telat', 'Pulang awal', 'Belum out', 'Izin', 'Sakit', 'Alpa', 'Menit telat'].map((h) => (
                    <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.perStaff.map((s) => (
                  <tr key={s.staffId} className="border-t border-[var(--kl-border)]">
                    <td className="px-3 py-2 font-semibold text-[var(--kl-ink)] whitespace-nowrap">{s.staffName}</td>
                    <td className="px-3 py-2 tabular-nums">{s.scheduled}</td>
                    <td className="px-3 py-2 tabular-nums">{s.hadir}</td>
                    <td className="px-3 py-2 tabular-nums">{s.terlambat}</td>
                    <td className="px-3 py-2 tabular-nums">{s.pulangAwal}</td>
                    <td className="px-3 py-2 tabular-nums">{s.belumCheckout}</td>
                    <td className="px-3 py-2 tabular-nums">{s.izin}</td>
                    <td className="px-3 py-2 tabular-nums">{s.sakit}</td>
                    <td className="px-3 py-2 tabular-nums">{s.alpa}</td>
                    <td className="px-3 py-2 tabular-nums">{s.lateMinutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Rincian absensi + koreksi */}
      <section className="rounded-2xl border border-[var(--kl-border)] bg-white overflow-hidden">
        <div className="px-4 pt-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[var(--kl-ink)]">Rincian Absensi</h2>
          <span className="text-xs text-[var(--kl-ink-muted)]">{report?.rows.length ?? 0} baris</span>
        </div>
        {loading && !report ? (
          <p className="px-4 py-6 text-sm text-[var(--kl-ink-muted)] inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat rekap…
          </p>
        ) : !report || report.rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--kl-ink-muted)]">Belum ada jadwal pada rentang ini.</p>
        ) : (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead className="bg-[var(--kl-bg)] text-[var(--kl-ink-muted)] text-xs">
                <tr>
                  {['Tanggal', 'Shift', 'Staf', 'Masuk', 'Pulang', 'Durasi', 'Status', 'Tindakan'].map((h) => (
                    <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={`${r.assignmentId}-${r.staffId}`} className="border-t border-[var(--kl-border)] align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateIndo(r.date, false)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{SHIFT_META[r.shift]?.label ?? r.shift}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-semibold text-[var(--kl-ink)]">{r.staffName}</span>
                      {r.isPic && <span className="ml-1.5 text-[10px] font-bold text-[var(--kl-accent-deep)]">PIC</span>}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap">
                      {formatTimeDotWib(r.checkInTime)}
                      {r.lateMinutes > 0 && <span className="ml-1 text-[11px] font-semibold text-[#B45309]">+{r.lateMinutes}m</span>}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap">
                      {formatTimeDotWib(r.checkOutTime)}
                      {r.overnight && <span className="ml-1 text-[11px] font-semibold text-[#3730A3]">+1h</span>}
                      {r.earlyLeaveMinutes > 0 && <span className="ml-1 text-[11px] font-semibold text-[#B45309]">-{r.earlyLeaveMinutes}m</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDurationIndo(r.durationMinutes)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded-md border text-[11px] font-bold ${STATUS_TONE[r.status] ?? STATUS_TONE['Belum Absen']}`}>
                        {r.status}
                      </span>
                      {r.overdue && <span className="block text-[10px] font-semibold text-[#B91C1C] mt-0.5">Lupa check-out</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openCorrection(r)}
                        className="min-h-[36px] px-2.5 rounded-lg border border-[var(--kl-border-strong)] bg-white text-xs font-semibold text-[var(--kl-ink)] hover:bg-[var(--kl-soft)] inline-flex items-center gap-1"
                      >
                        <Wrench className="w-3.5 h-3.5" /> Koreksi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Temuan kebersihan */}
      <section className="rounded-2xl border border-[var(--kl-border)] bg-white overflow-hidden">
        <h2 className="px-4 pt-4 text-base font-bold text-[var(--kl-ink)] inline-flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#B45309]" /> Temuan Kebersihan &amp; Tindak Lanjut
        </h2>
        {!report || report.problemAreas.length === 0 ? (
          <p className="px-4 py-5 text-sm text-[var(--kl-ink-muted)]">Tidak ada area berstatus “Perlu Ditangani” pada rentang ini.</p>
        ) : (
          <ul className="divide-y divide-[var(--kl-border)] mt-2">
            {report.problemAreas.map((p) => (
              <li key={`${p.reportId}-${p.areaKey}`} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-[var(--kl-ink)]">
                    {p.areaLabel} · {formatDateIndo(p.date, false)} ({SHIFT_META[p.shift]?.label})
                  </p>
                  <p className="text-xs text-[var(--kl-ink-muted)]">{p.note}</p>
                  <p className="text-[11px] text-[var(--kl-ink-muted)]">
                    PIC laporan: {p.picName} · PJ tindak lanjut: {p.followupPic || 'belum ditetapkan'}
                    {p.resolvedAt ? ` · selesai ${p.resolvedAt}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 inline-flex px-2 py-0.5 rounded-md border text-[11px] font-bold ${
                    p.followupStatus === 'Selesai'
                      ? 'bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]'
                      : p.followupStatus === 'Sedang Ditangani'
                        ? 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]'
                        : 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]'
                  }`}
                >
                  {p.followupStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Jejak audit */}
      <section className="rounded-2xl border border-[var(--kl-border)] bg-white overflow-hidden">
        <h2 className="px-4 pt-4 text-base font-bold text-[var(--kl-ink)] inline-flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[var(--kl-accent)]" /> Jejak Audit Koreksi
        </h2>
        {audit.length === 0 ? (
          <p className="px-4 py-5 text-sm text-[var(--kl-ink-muted)]">Belum ada koreksi absensi tercatat.</p>
        ) : (
          <ul className="divide-y divide-[var(--kl-border)] mt-2">
            {audit.slice(0, 30).map((a) => (
              <li key={a.id} className="px-4 py-3 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--kl-ink)]">
                    {a.actorName} · <span className="font-normal text-[var(--kl-ink-muted)]">{a.actorEmail}</span>
                  </p>
                  <span className="text-[11px] font-mono text-[var(--kl-ink-muted)]">{a.createdAt}</span>
                </div>
                <p className="text-xs text-[var(--kl-ink-sub)]">Alasan: {a.reason}</p>
                <p className="text-[11px] font-mono text-[var(--kl-ink-muted)] break-words">
                  Sebelum: masuk {String(a.before?.checkInTime ?? '—')} / pulang {String(a.before?.checkOutTime ?? '—')} · Sesudah: masuk{' '}
                  {String(a.after?.checkInTime ?? '—')} / pulang {String(a.after?.checkOutTime ?? '—')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Modal koreksi */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="correction-title">
          <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--kl-bg)] border border-[var(--kl-border)] shadow-xl">
            <div className="sticky top-0 bg-[var(--kl-bg)] border-b border-[var(--kl-border)] px-5 py-4">
              <h2 id="correction-title" className="text-lg font-bold text-[var(--kl-ink)]">Koreksi Absensi</h2>
              <p className="text-xs text-[var(--kl-ink-muted)]">
                {draft.row.staffName} · {formatDateIndo(draft.row.date, false)} · Shift {SHIFT_META[draft.row.shift]?.label}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-[var(--kl-ink-sub)] space-y-1">
                  <span>Jam masuk</span>
                  <input
                    type="time"
                    value={draft.checkInTime}
                    onChange={(e) => setDraft({ ...draft, checkInTime: e.target.value })}
                    className="w-full min-h-[44px] rounded-xl border border-[var(--kl-border-strong)] px-3 text-sm font-normal"
                  />
                </label>
                <label className="text-xs font-semibold text-[var(--kl-ink-sub)] space-y-1">
                  <span>Jam pulang</span>
                  <input
                    type="time"
                    value={draft.checkOutTime}
                    onChange={(e) => setDraft({ ...draft, checkOutTime: e.target.value })}
                    className="w-full min-h-[44px] rounded-xl border border-[var(--kl-border-strong)] px-3 text-sm font-normal"
                  />
                </label>
              </div>
              <p className="text-[11px] text-[var(--kl-ink-muted)]">
                Kosongkan jam untuk menghapus catatan (mis. menandai Izin/Sakit/Alpa). Data asli tetap tersimpan di jejak audit.
              </p>
              <label className="text-xs font-semibold text-[var(--kl-ink-sub)] space-y-1 block">
                <span>Status ketidakhadiran (opsional)</span>
                <select
                  value={draft.supervisorStatus}
                  onChange={(e) => setDraft({ ...draft, supervisorStatus: e.target.value as CorrectionDraft['supervisorStatus'] })}
                  className="w-full min-h-[44px] rounded-xl border border-[var(--kl-border-strong)] px-3 text-sm font-normal bg-white"
                >
                  <option value="">Tetap / tidak ada</option>
                  <option value="Izin">Izin</option>
                  <option value="Sakit">Sakit</option>
                  <option value="Alpa">Alpa</option>
                </select>
              </label>
              {draft.supervisorStatus && (
                <label className="text-xs font-semibold text-[var(--kl-ink-sub)] space-y-1 block">
                  <span>Catatan Admin</span>
                  <input
                    type="text"
                    maxLength={500}
                    value={draft.supervisorNote}
                    onChange={(e) => setDraft({ ...draft, supervisorNote: e.target.value })}
                    className="w-full min-h-[44px] rounded-xl border border-[var(--kl-border-strong)] px-3 text-sm font-normal"
                    placeholder="Mis. surat izin diterima"
                  />
                </label>
              )}
              <label className="text-xs font-semibold text-[var(--kl-ink-sub)] space-y-1 block">
                <span>Alasan koreksi (wajib)</span>
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  rows={3}
                  value={draft.reason}
                  onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                  className="w-full rounded-xl border border-[var(--kl-border-strong)] px-3 py-2 text-sm font-normal"
                  placeholder="Mis. staf lupa check-out, jam dikonfirmasi PIC shift"
                />
              </label>
              {error && <p role="alert" className="text-sm font-medium text-[#B91C1C]">{error}</p>}
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => { setDraft(null); setError(null); }}
                  disabled={saving}
                  className="min-h-[44px] px-4 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm font-semibold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void submitCorrection()}
                  disabled={saving}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Simpan koreksi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentUser?.role !== 'supervisor' && (
        <p className="text-xs text-[var(--kl-ink-muted)]">
          Halaman ini hanya dapat dipakai Admin. Staf melihat absensinya di halaman Hari Ini.
        </p>
      )}
      <p className="text-[11px] text-[var(--kl-ink-muted)]">
        Zona waktu acuan: WIB · {formatDateIndo(nowWib.date)} {formatTimeDotWib(nowWib.timeHHMM)}
      </p>
    </div>
  );
};
