import React, { useEffect, useState } from 'react';
import { Calendar, Check, UserCheck } from 'lucide-react';
import { useKitchen } from '../storage/kitchenContext';
import { ShiftType } from '../types/kitchen';
import { formatDateIndo, SHIFT_META } from '../utils/wibTime';

export const SchedulePage: React.FC = () => {
  const { state, nowWib, upsertSchedule } = useKitchen();

  const staffUsers = [...state.users].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'staff' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const [selectedDate, setSelectedDate] = useState(nowWib.date);
  const [selectedShift, setSelectedShift] = useState<ShiftType>('opening');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [selectedPicId, setSelectedPicId] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const existing = state.assignments.find(
      (a) => a.date === selectedDate && a.shift === selectedShift
    );
    if (existing) {
      setSelectedStaffIds(existing.staffIds);
      setSelectedPicId(existing.picId);
    } else {
      setSelectedStaffIds([]);
      setSelectedPicId('');
    }
    setErrors({});
  }, [selectedDate, selectedShift, state.assignments]);

  const toggleStaff = (staffId: string) => {
    setSelectedStaffIds((prev) => {
      const exists = prev.includes(staffId);
      const next = exists ? prev.filter((id) => id !== staffId) : [...prev, staffId];
      if (!next.includes(selectedPicId)) {
        setSelectedPicId(next[0] ?? '');
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, staff: '', pic: '' }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!selectedDate) {
      nextErrors.date = 'Tanggal operasional wajib dipilih.';
    }
    if (selectedStaffIds.length === 0) {
      nextErrors.staff = 'Pilih minimal satu staf yang bertugas pada shift ini.';
    }
    if (!selectedPicId || !selectedStaffIds.includes(selectedPicId)) {
      nextErrors.pic = 'Tunjuk satu PIC Shift dari staf yang terpilih.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    await upsertSchedule(selectedDate, selectedShift, selectedStaffIds, selectedPicId);
  };

  const sortedAssignments = [...state.assignments].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.shift === 'opening' ? -1 : 1;
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-[var(--kl-tint-border)] bg-[var(--kl-tint)] text-xs font-bold text-[var(--kl-accent-deep)]">
          <span
            className="w-2 h-2 rounded-full bg-[var(--kl-accent)] shrink-0"
            aria-hidden="true"
          />
          <span>{state.kitchenName}</span>
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--kl-ink)]">Jadwal Shift</h1>
        <p className="text-sm text-[var(--kl-ink-muted)]">
          Atur penugasan staf dan tunjuk satu PIC untuk setiap shift Opening dan Closing.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Formulir Jadwal Shift */}
        <form
          onSubmit={handleSave}
          className="lg:col-span-5 rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-4"
        >
          <h2 className="text-base font-bold text-[var(--kl-ink)] flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--kl-accent)]" aria-hidden="true" />
            <span>Formulir Penjadwalan</span>
          </h2>

          <div className="space-y-1.5">
            <label htmlFor="schedule-date" className="block text-sm font-medium text-[var(--kl-ink)]">
              Tanggal Operasional (WIB)
            </label>
            <input
              id="schedule-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm font-mono tabular-nums text-[var(--kl-ink)]"
            />
            {errors.date && (
              <p className="text-xs font-medium text-[#B91C1C]" role="alert">
                {errors.date}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--kl-ink)]">Shift</label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--kl-track)] border border-[var(--kl-border)]">
              {(['opening', 'closing'] as const).map((shift) => (
                <button
                  key={shift}
                  type="button"
                  onClick={() => setSelectedShift(shift)}
                  className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
                    selectedShift === shift
                      ? 'bg-[var(--kl-accent)] text-white'
                      : 'text-[var(--kl-ink-sub)] hover:bg-white/70'
                  }`}
                >
                  {SHIFT_META[shift].label}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--kl-ink-muted)] font-mono tabular-nums">
              Jam operasional: {SHIFT_META[selectedShift].timeRangeLabel}
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--kl-ink)]">
              Pilih Staf Terjadwal ({selectedStaffIds.length} dipilih)
            </label>
            <div className="divide-y divide-[var(--kl-border)] rounded-xl border border-[var(--kl-border)] overflow-hidden">
              {staffUsers.map((staff) => {
                const checked = selectedStaffIds.includes(staff.id);
                return (
                  <button
                    key={staff.id}
                    type="button"
                    onClick={() => toggleStaff(staff.id)}
                    className={`w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
                      checked ? 'bg-[var(--kl-tint)]/75' : 'bg-white hover:bg-[var(--kl-bg)]'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--kl-ink)]">
                        {staff.name}
                        {staff.role === 'supervisor' ? ' (Admin)' : ''}
                      </p>
                      <p className="text-xs text-[var(--kl-ink-muted)]">{staff.jobTitle}</p>
                    </div>
                    <span
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                        checked
                          ? 'bg-[var(--kl-accent)] border-[var(--kl-accent)] text-white'
                          : 'border-[var(--kl-border-strong)] bg-white'
                      }`}
                    >
                      {checked && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                    </span>
                  </button>
                );
              })}
            </div>
            {errors.staff && (
              <p className="text-xs font-medium text-[#B91C1C]" role="alert">
                {errors.staff}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="schedule-pic" className="block text-sm font-medium text-[var(--kl-ink)]">
              Tunjuk PIC Shift (1 orang)
            </label>
            <select
              id="schedule-pic"
              value={selectedPicId}
              onChange={(e) => {
                setSelectedPicId(e.target.value);
                setErrors((prev) => ({ ...prev, pic: '' }));
              }}
              disabled={selectedStaffIds.length === 0}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm text-[var(--kl-ink)] disabled:bg-[var(--kl-soft)]"
            >
              <option value="">
                {selectedStaffIds.length === 0
                  ? 'Pilih staf terlebih dahulu'
                  : '— Pilih satu PIC Shift —'}
              </option>
              {staffUsers
                .filter((u) => selectedStaffIds.includes(u.id))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
            {errors.pic && (
              <p className="text-xs font-medium text-[#B91C1C]" role="alert">
                {errors.pic}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="min-h-[48px] w-full px-5 py-3 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold hover:bg-[var(--kl-accent-hover)]"
          >
            Simpan Jadwal Shift
          </button>
        </form>

        {/* Daftar Jadwal Tersimpan */}
        <section className="lg:col-span-7 rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-4">
          <h2 className="text-base font-bold text-[var(--kl-ink)]">Daftar Jadwal Terdaftar</h2>

          {sortedAssignments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--kl-border-strong)] p-6 text-center text-sm text-[var(--kl-ink-muted)]">
              Belum ada jadwal shift yang tersimpan. Pilih tanggal, shift, staf, dan PIC pada formulir di samping untuk membuat jadwal pertama.
            </div>
          ) : (
            <div className="divide-y divide-[var(--kl-border)]">
              {sortedAssignments.map((asg) => {
                const pic = state.users.find((u) => u.id === asg.picId);
                const staffNames = asg.staffIds
                  .map((id) => state.users.find((u) => u.id === id)?.name)
                  .filter(Boolean);
                const isSelected =
                  asg.date === selectedDate && asg.shift === selectedShift;

                return (
                  <div
                    key={asg.id}
                    className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--kl-ink-muted)]">
                        <span className="font-semibold text-[var(--kl-ink)]">
                          {formatDateIndo(asg.date)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-[var(--kl-accent)]">
                          Shift {SHIFT_META[asg.shift].label}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {SHIFT_META[asg.shift].timeRangeLabel}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--kl-ink)]">
                        Staf: {staffNames.join(', ')}
                      </p>
                      <p className="text-xs text-[var(--kl-ink-muted)] inline-flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5 text-[var(--kl-accent)]" aria-hidden="true" />
                        <span>PIC Shift: {pic?.name ?? '—'}</span>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate(asg.date);
                        setSelectedShift(asg.shift);
                      }}
                      className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 ${
                        isSelected
                          ? 'border-[var(--kl-accent)] bg-[var(--kl-tint)] text-[var(--kl-accent-deep)]'
                          : 'border-[var(--kl-border-strong)] bg-[var(--kl-bg)] text-[var(--kl-ink)] hover:bg-[var(--kl-soft)]'
                      }`}
                    >
                      {isSelected ? 'Sedang Diedit' : 'Ubah Jadwal'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
