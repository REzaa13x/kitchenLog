import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Circle, ClipboardList, Loader2, RotateCw } from 'lucide-react';
import { useKitchen } from '../storage/kitchenContext';
import type { ShiftType } from '../types/kitchen';
import { SHIFT_META } from '../utils/wibTime';

interface ShiftTask {
  key: string;
  label: string;
  detail?: string;
}

interface ProgressRow {
  staffId: string;
  taskKey: string;
  done: boolean;
  note?: string;
}

interface ShiftTaskListProps {
  date: string;
  shift: ShiftType;
  /** Bila diisi, hanya menampilkan progres staf ini. Kosong = ringkasan semua staf. */
  staffId?: string;
  readOnly?: boolean;
}

/**
 * Rekap Pekerjaan satu shift. Daftar tugas berasal dari server (satu sumber
 * kebenaran), progres centang disimpan per staf per tanggal.
 */
export const ShiftTaskList: React.FC<ShiftTaskListProps> = ({ date, shift, staffId, readOnly = false }) => {
  const { currentUser, fetchShiftTasks, toggleShiftTask } = useKitchen();
  const [tasks, setTasks] = useState<ShiftTask[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Fungsi dari context berubah identitas setiap render provider. Menaruhnya
  // langsung di dependency useEffect membuat daftar tugas memuat ulang terus
  // (fetch berulang) sehingga halaman terasa berat. Simpan di ref agar efek
  // hanya bergantung pada tanggal & shift.
  const fetchRef = useRef(fetchShiftTasks);
  fetchRef.current = fetchShiftTasks;

  const load = useCallback(async () => {
    const fetcher = fetchRef.current;
    if (!fetcher) {
      setLoading(false);
      setError('Rekap pekerjaan hanya tersedia pada mode MySQL.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetcher({ date, shift });
      if (!data) {
        setError('Gagal memuat rekap pekerjaan.');
        setTasks([]);
        setProgress([]);
        return;
      }
      setTasks(data.tasks ?? []);
      setProgress(data.progress ?? []);
    } finally {
      setLoading(false);
    }
  }, [date, shift]);

  useEffect(() => {
    void load();
  }, [load]);

  // Baris progres milik staf yang sedang dilihat.
  const mine = useMemo(() => {
    const target = staffId ?? currentUser?.id;
    const map = new Map<string, boolean>();
    for (const row of progress) {
      if (row.staffId === target) map.set(row.taskKey, row.done);
    }
    return map;
  }, [progress, staffId, currentUser?.id]);

  const doneCount = tasks.filter((t) => mine.get(t.key)).length;
  const total = tasks.length;
  const allDone = total > 0 && doneCount === total;

  const toggle = async (task: ShiftTask) => {
    if (readOnly || savingKey) return;
    if (!toggleShiftTask) {
      setError('Rekap pekerjaan hanya tersedia pada mode MySQL.');
      return;
    }
    const next = !mine.get(task.key);
    setSavingKey(task.key);
    setError(null);
    // Optimistis: UI langsung berubah, dikembalikan bila server menolak.
    setProgress((prev) => {
      const target = staffId ?? currentUser?.id ?? '';
      const rest = prev.filter((row) => !(row.staffId === target && row.taskKey === task.key));
      return [...rest, { staffId: target, taskKey: task.key, done: next }];
    });
    try {
      const res = await toggleShiftTask({ date, shift, taskKey: task.key, done: next });
      if (!res.ok) {
        setError(res.message);
        setProgress((prev) => {
          const target = staffId ?? currentUser?.id ?? '';
          const rest = prev.filter((row) => !(row.staffId === target && row.taskKey === task.key));
          return [...rest, { staffId: target, taskKey: task.key, done: !next }];
        });
      }
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-[var(--kl-border)] bg-white p-5">
        <p role="status" className="text-sm text-[var(--kl-ink-muted)] inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat rekap pekerjaan…
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--kl-border)] pb-3">
        <div>
          <p className="text-xs font-medium text-[var(--kl-ink-muted)]">
            Shift {SHIFT_META[shift].label} · {date}
          </p>
          <h2 className="text-base font-bold text-[var(--kl-ink)] flex items-center gap-2 mt-0.5">
            <ClipboardList className="w-4 h-4 text-[var(--kl-accent)]" aria-hidden="true" />
            <span>Rekap Pekerjaan {SHIFT_META[shift].label}</span>
          </h2>
        </div>
        <span
          className={`inline-flex px-2.5 py-1 rounded-lg border text-xs font-bold ${
            allDone
              ? 'bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]'
              : 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]'
          }`}
        >
          {doneCount}/{total} selesai
        </span>
      </div>

      {error && (
        <div role="alert" className="text-sm text-[#991B1B] bg-[#FEE2E2] rounded-xl p-3 flex items-start justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 min-h-[36px] px-2.5 rounded-lg border border-[#FECACA] bg-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RotateCw className="w-3.5 h-3.5" /> Coba Lagi
          </button>
        </div>
      )}

      {total === 0 ? (
        <p className="text-sm text-[var(--kl-ink-muted)]">Belum ada daftar tugas untuk shift ini.</p>
      ) : (
        <ol className="divide-y divide-[var(--kl-border)]">
          {tasks.map((task, index) => {
            const done = Boolean(mine.get(task.key));
            return (
              <li key={task.key} className="py-2.5 first:pt-0 last:pb-0">
                <button
                  type="button"
                  disabled={readOnly || Boolean(savingKey)}
                  onClick={() => void toggle(task)}
                  aria-pressed={done}
                  className="w-full text-left flex items-start gap-3 disabled:opacity-60"
                >
                  {done ? (
                    <CheckCircle2 className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" aria-hidden="true" />
                  ) : (
                    <Circle className="w-5 h-5 text-[var(--kl-ink-muted)] shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                  <span className="min-w-0">
                    <span className={`text-sm block ${done ? 'text-[var(--kl-ink-muted)] line-through' : 'text-[var(--kl-ink)] font-medium'}`}>
                      {index + 1}. {task.label}
                    </span>
                    {task.detail ? (
                      <span className="text-xs text-[var(--kl-ink-muted)] block">{task.detail}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <p className="text-[11px] text-[var(--kl-ink-muted)]">
        Centang disimpan per staf, jadi rekap tiap orang tidak saling menimpa. Admin melihat semua progres di Rekap Operasional.
      </p>
    </section>
  );
};
