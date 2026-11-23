import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useKitchen } from '../storage/kitchenContext';
import { ItemReportType, ShiftType } from '../types/kitchen';
import { formatDateIndo, formatTimeDotWib, SHIFT_META } from '../utils/wibTime';
import { PhotoCaptureField } from './PhotoCaptureField';

interface ItemReportModalProps {
  open: boolean;
  onClose: () => void;
  defaultShift?: ShiftType;
}

export const ItemReportModal: React.FC<ItemReportModalProps> = ({
  open,
  onClose,
  defaultShift,
}) => {
  const { state, currentUser, nowWib, createItemReport } = useKitchen();

  const userTodayAssignments = useMemo(() => {
    if (!currentUser) return [];
    return state.assignments.filter(
      (a) => a.date === nowWib.date && a.staffIds.includes(currentUser.id)
    );
  }, [state.assignments, currentUser, nowWib.date]);

  const initialShift: ShiftType =
    defaultShift ??
    userTodayAssignments[0]?.shift ??
    (nowWib.minutes < 12 * 60 ? 'opening' : 'closing');

  const [type, setType] = useState<ItemReportType>('Barang Rusak');
  const [shift, setShift] = useState<ShiftType>(initialShift);
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [location, setLocation] = useState('');
  const [lastKnownLocation, setLastKnownLocation] = useState('');
  const [discoveredTime, setDiscoveredTime] = useState(nowWib.timeHHMM);
  const [notes, setNotes] = useState('');
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!open || !currentUser) return null;

  const validateAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!itemName.trim()) {
      nextErrors.itemName = 'Nama barang wajib diisi.';
    }
    const qtyNum = Number(quantity);
    if (!quantity || Number.isNaN(qtyNum) || qtyNum < 1) {
      nextErrors.quantity = 'Jumlah minimal 1 unit.';
    }
    if (!location.trim()) {
      nextErrors.location = 'Lokasi barang wajib diisi.';
    }
    if (!discoveredTime.trim()) {
      nextErrors.discoveredTime = 'Waktu diketahui wajib diisi.';
    }
    if (type === 'Barang Rusak' && !photoId) {
      nextErrors.photoId = 'Foto kerusakan wajib dilampirkan untuk Barang Rusak.';
    }
    if (type === 'Barang Hilang' && !lastKnownLocation.trim()) {
      nextErrors.lastKnownLocation =
        'Lokasi terakhir yang diketahui atau sudah diperiksa wajib diisi untuk Barang Hilang.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const res = await createItemReport({
      type,
      itemName,
      quantity: Math.floor(qtyNum),
      location,
      lastKnownLocation,
      discoveredAt: `${formatDateIndo(nowWib.date, false)}, ${formatTimeDotWib(discoveredTime)}`,
      notes,
      photoId,
      reporterId: currentUser.id,
      reporterName: currentUser.name,
      shift,
      date: nowWib.date,
    });

    if (res.ok) {
      setItemName('');
      setQuantity('1');
      setLocation('');
      setLastKnownLocation('');
      setNotes('');
      setPhotoId(null);
      setErrors({});
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-lapor-barang-title"
    >
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--kl-bg)] border border-[var(--kl-border)] shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-[var(--kl-bg)] border-b border-[var(--kl-border)]">
          <div>
            <h2 id="modal-lapor-barang-title" className="text-lg font-bold text-[var(--kl-ink)]">
              Laporkan Barang · {state.kitchenName}
            </h2>
            <p className="text-xs text-[var(--kl-ink-muted)]">
              Pelapor: {currentUser.name} · Shift {SHIFT_META[shift].label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-[var(--kl-ink-sub)] hover:bg-[var(--kl-soft)]"
            aria-label="Tutup formulir"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={validateAndSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--kl-ink)]">Jenis Laporan</label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--kl-track)] border border-[var(--kl-border)]">
              {(['Barang Rusak', 'Barang Hilang'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setType(option);
                    setErrors({});
                  }}
                  className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                    type === option
                      ? 'bg-[var(--kl-accent)] text-white'
                      : 'text-[var(--kl-ink-sub)] hover:bg-white/70'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {userTodayAssignments.length > 1 || currentUser.role === 'supervisor' ? (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--kl-ink)]">Shift Terkait</label>
              <div className="grid grid-cols-2 gap-2">
                {(['opening', 'closing'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setShift(s)}
                    className={`min-h-[44px] px-3 rounded-lg border text-sm font-medium whitespace-nowrap ${
                      shift === s
                        ? 'border-[var(--kl-accent)] bg-[var(--kl-tint)] text-[var(--kl-accent-deep)]'
                        : 'border-[var(--kl-border)] bg-white text-[var(--kl-ink-sub)]'
                    }`}
                  >
                    {SHIFT_META[s].label} ({SHIFT_META[s].timeRangeLabel})
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="item-name" className="block text-sm font-medium text-[var(--kl-ink)]">
                Nama Barang <span className="text-[#B91C1C]">*</span>
              </label>
              <input
                id="item-name"
                type="text"
                value={itemName}
                onChange={(e) => {
                  setItemName(e.target.value);
                  if (errors.itemName) setErrors((prev) => ({ ...prev, itemName: '' }));
                }}
                placeholder="Contoh: Pisau Chef 20cm"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-[var(--kl-border-strong)] bg-white text-sm text-[var(--kl-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--kl-accent)]"
              />
              {errors.itemName && (
                <p className="text-xs font-medium text-[#B91C1C]" role="alert">
                  {errors.itemName}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="item-qty" className="block text-sm font-medium text-[var(--kl-ink)]">
                Jumlah <span className="text-[#B91C1C]">*</span>
              </label>
              <input
                id="item-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  if (errors.quantity) setErrors((prev) => ({ ...prev, quantity: '' }));
                }}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-[var(--kl-border-strong)] bg-white text-sm font-mono tabular-nums text-[var(--kl-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--kl-accent)]"
              />
              {errors.quantity && (
                <p className="text-xs font-medium text-[#B91C1C]" role="alert">
                  {errors.quantity}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="item-location" className="block text-sm font-medium text-[var(--kl-ink)]">
                Lokasi Kejadian <span className="text-[#B91C1C]">*</span>
              </label>
              <input
                id="item-location"
                type="text"
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  if (errors.location) setErrors((prev) => ({ ...prev, location: '' }));
                }}
                placeholder="Contoh: Meja persiapan"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-[var(--kl-border-strong)] bg-white text-sm text-[var(--kl-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--kl-accent)]"
              />
              {errors.location && (
                <p className="text-xs font-medium text-[#B91C1C]" role="alert">
                  {errors.location}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="item-time" className="block text-sm font-medium text-[var(--kl-ink)]">
                Waktu Diketahui (WIB) <span className="text-[#B91C1C]">*</span>
              </label>
              <input
                id="item-time"
                type="time"
                value={discoveredTime}
                onChange={(e) => {
                  setDiscoveredTime(e.target.value);
                  if (errors.discoveredTime)
                    setErrors((prev) => ({ ...prev, discoveredTime: '' }));
                }}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-[var(--kl-border-strong)] bg-white text-sm font-mono tabular-nums text-[var(--kl-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--kl-accent)]"
              />
              {errors.discoveredTime && (
                <p className="text-xs font-medium text-[#B91C1C]" role="alert">
                  {errors.discoveredTime}
                </p>
              )}
            </div>
          </div>

          {type === 'Barang Hilang' && (
            <div className="space-y-1.5">
              <label htmlFor="item-last-location" className="block text-sm font-medium text-[var(--kl-ink)]">
                Lokasi Terakhir Diketahui / Sudah Diperiksa <span className="text-[#B91C1C]">*</span>
              </label>
              <textarea
                id="item-last-location"
                rows={2}
                value={lastKnownLocation}
                onChange={(e) => {
                  setLastKnownLocation(e.target.value);
                  if (errors.lastKnownLocation) {
                    setErrors((prev) => ({ ...prev, lastKnownLocation: '' }));
                  }
                }}
                placeholder="Contoh: Rak gantungan sebelah kompor dan laci peralatan sudah dicek"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--kl-border-strong)] bg-white text-sm text-[var(--kl-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--kl-accent)]"
              />
              {errors.lastKnownLocation && (
                <p className="text-xs font-medium text-[#B91C1C]" role="alert">
                  {errors.lastKnownLocation}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="item-notes" className="block text-sm font-medium text-[var(--kl-ink)]">
              Catatan Kronologi / Kondisi
            </label>
            <textarea
              id="item-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Jelaskan kondisi kerusakan atau detail tambahan…"
              className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--kl-border-strong)] bg-white text-sm text-[var(--kl-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--kl-accent)]"
            />
          </div>

          <PhotoCaptureField
            label={type === 'Barang Rusak' ? 'Foto Kerusakan Barang' : 'Foto Pendukung (Opsional)'}
            helperText={type === 'Barang Rusak' ? 'Wajib dilampirkan' : 'Opsional'}
            required={type === 'Barang Rusak'}
            photoId={photoId}
            onChange={(newId) => {
              setPhotoId(newId);
              if (errors.photoId) setErrors((prev) => ({ ...prev, photoId: '' }));
            }}
            error={errors.photoId}
          />

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] px-4 py-2.5 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm font-medium text-[var(--kl-ink-sub)] hover:bg-[var(--kl-soft)]"
            >
              Batal
            </button>
            <button
              type="submit"
              className="min-h-[48px] flex-1 px-5 py-2.5 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold hover:bg-[var(--kl-accent-hover)] active:scale-[0.99] transition-all"
            >
              Kirim Laporan Barang
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
