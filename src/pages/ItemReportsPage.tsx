import React, { useMemo, useState } from 'react';
import { CheckCircle2, Plus, Wrench } from 'lucide-react';
import { ItemReportModal } from '../components/ItemReportModal';
import { PhotoViewer } from '../components/PhotoViewer';
import { StatusIndicator } from '../components/StatusIndicator';
import { useKitchen } from '../storage/kitchenContext';
import { ItemReportStatus, ItemReportType } from '../types/kitchen';
import { formatDateIndo, SHIFT_META } from '../utils/wibTime';

export const ItemReportsPage: React.FC = () => {
  const { state, currentUser, updateItemReportStatus } = useKitchen();

  const [typeFilter, setTypeFilter] = useState<'Semua' | ItemReportType>('Semua');
  const [statusFilter, setStatusFilter] = useState<'Semua' | ItemReportStatus>('Semua');
  const [selectedId, setSelectedId] = useState<string | null>(
    state.itemReports[0]?.id ?? null
  );
  const [modalOpen, setModalOpen] = useState(false);

  const [resolutionInputs, setResolutionInputs] = useState<Record<string, string>>({});
  const [resolutionErrors, setResolutionErrors] = useState<Record<string, string>>({});

  const filteredReports = useMemo(() => {
    return state.itemReports.filter((item) => {
      const matchType = typeFilter === 'Semua' || item.type === typeFilter;
      const matchStatus = statusFilter === 'Semua' || item.status === statusFilter;
      return matchType && matchStatus;
    });
  }, [state.itemReports, typeFilter, statusFilter]);

  const activeReport =
    filteredReports.find((r) => r.id === selectedId) ?? filteredReports[0] ?? null;

  const isSupervisor = currentUser?.role === 'supervisor';

  const getStatusTone = (status: ItemReportStatus) => {
    if (status === 'Selesai') return 'success';
    if (status === 'Ditindaklanjuti') return 'warning';
    return 'danger';
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-[var(--kl-tint-border)] bg-[var(--kl-tint)] text-xs font-bold text-[var(--kl-accent-deep)]">
            <span
              className="w-2 h-2 rounded-full bg-[var(--kl-accent)] shrink-0"
              aria-hidden="true"
            />
            <span>{state.kitchenName}</span>
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--kl-ink)]">
            Daftar &amp; Detail Laporan Barang
          </h1>
          <p className="text-sm text-[var(--kl-ink-muted)]">
            Laporan barang rusak atau hilang tetap terbuka lintas shift dan hari hingga diselesaikan.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold hover:bg-[var(--kl-accent-hover)] inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Laporkan Barang</span>
        </button>
      </div>

      {/* Filter Jenis & Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border border-[var(--kl-border)] bg-white p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--kl-ink-muted)] px-1">Jenis:</span>
          <div className="inline-flex flex-wrap gap-1 rounded-xl bg-[var(--kl-track)] p-1">
            {(['Semua', 'Barang Rusak', 'Barang Hilang'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap ${
                  typeFilter === t
                    ? 'bg-white text-[var(--kl-ink)] shadow-xs'
                    : 'text-[var(--kl-ink-muted)] hover:text-[var(--kl-ink)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--kl-ink-muted)] px-1">Status:</span>
          <div className="inline-flex flex-wrap gap-1 rounded-xl bg-[var(--kl-track)] p-1">
            {(['Semua', 'Dilaporkan', 'Ditindaklanjuti', 'Selesai'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap ${
                  statusFilter === s
                    ? 'bg-white text-[var(--kl-ink)] shadow-xs'
                    : 'text-[var(--kl-ink-muted)] hover:text-[var(--kl-ink)]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Master-Detail Daftar & Detail */}
      {filteredReports.length === 0 ? (
        <div className="rounded-2xl border border-[var(--kl-border)] bg-white p-8 text-center space-y-2">
          <p className="text-base font-bold text-[var(--kl-ink)]">Tidak Ada Laporan yang Cocok</p>
          <p className="text-sm text-[var(--kl-ink-muted)]">
            Coba ubah filter jenis atau status, atau buat laporan barang baru.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Daftar Laporan */}
          <div className="lg:col-span-5 rounded-2xl border border-[var(--kl-border)] bg-white divide-y divide-[var(--kl-border)] overflow-hidden">
            {filteredReports.map((item) => {
              const isSelected = activeReport?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left p-4 transition-colors space-y-2 ${
                    isSelected ? 'bg-[var(--kl-tint)]/75' : 'bg-white hover:bg-[var(--kl-bg)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-[var(--kl-ink)]">
                      {item.itemName}{' '}
                      <span className="font-mono tabular-nums font-medium text-[var(--kl-ink-muted)]">
                        ({item.quantity} unit)
                      </span>
                    </p>
                    <StatusIndicator label={item.status} tone={getStatusTone(item.status)} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--kl-ink-muted)]">
                    <span className="font-semibold text-[var(--kl-ink-sub)]">{item.type}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.location}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDateIndo(item.date, false)}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail Laporan */}
          {activeReport && (
            <section className="lg:col-span-7 rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--kl-border)] pb-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--kl-ink-muted)]">
                    <span>{activeReport.type}</span>
                    <span aria-hidden="true">·</span>
                    <span>Shift {SHIFT_META[activeReport.shift].label}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{activeReport.discoveredAt}</span>
                  </div>
                  <h2 className="text-xl font-bold text-[var(--kl-ink)]">
                    {activeReport.itemName} ({activeReport.quantity} unit)
                  </h2>
                  <p className="text-xs text-[var(--kl-ink-muted)]">
                    Dilaporkan oleh{' '}
                    <span className="font-semibold text-[var(--kl-ink)]">
                      {activeReport.reporterName}
                    </span>
                  </p>
                </div>

                <StatusIndicator
                  label={activeReport.status}
                  tone={getStatusTone(activeReport.status)}
                  size="md"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-[var(--kl-bg)] border border-[var(--kl-border)] p-3.5">
                  <p className="text-xs text-[var(--kl-ink-muted)]">Lokasi Kejadian</p>
                  <p className="font-semibold text-[var(--kl-ink)] mt-0.5">
                    {activeReport.location}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--kl-bg)] border border-[var(--kl-border)] p-3.5">
                  <p className="text-xs text-[var(--kl-ink-muted)]">Tanggal &amp; Shift Pelaporan</p>
                  <p className="font-semibold text-[var(--kl-ink)] mt-0.5">
                    {formatDateIndo(activeReport.date, false)} · Shift{' '}
                    {SHIFT_META[activeReport.shift].label}
                  </p>
                </div>
              </div>

              {activeReport.type === 'Barang Hilang' && activeReport.lastKnownLocation && (
                <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3.5 space-y-1">
                  <p className="text-xs font-semibold text-[#92400E]">
                    Lokasi Terakhir Diketahui / Sudah Diperiksa
                  </p>
                  <p className="text-sm text-[var(--kl-ink)]">{activeReport.lastKnownLocation}</p>
                </div>
              )}

              {activeReport.notes && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[var(--kl-ink-muted)]">Catatan Pelapor</p>
                  <p className="text-sm text-[var(--kl-ink)] leading-relaxed">
                    {activeReport.notes}
                  </p>
                </div>
              )}

              {activeReport.photoId && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[var(--kl-ink-muted)]">Foto Bukti</p>
                  <PhotoViewer
                    photoId={activeReport.photoId}
                    alt={`Foto ${activeReport.itemName}`}
                    className="max-w-md"
                  />
                </div>
              )}

              {/* Hasil Penanganan yang Sudah Ada */}
              {activeReport.resolutionNote && (
                <div className="rounded-xl bg-[var(--kl-tint)] border border-[var(--kl-tint-border)] p-4 space-y-1">
                  <p className="text-xs font-semibold text-[var(--kl-accent-deep)]">
                    Catatan Hasil Penanganan
                  </p>
                  <p className="text-sm text-[var(--kl-ink)]">{activeReport.resolutionNote}</p>
                </div>
              )}

              {/* Panel Tindak Lanjut Supervisor */}
              {isSupervisor && activeReport.status !== 'Selesai' && (
                <div className="border-t border-[var(--kl-border)] pt-4 space-y-3">
                  <h3 className="text-sm font-bold text-[var(--kl-ink)]">
                    Tindak Lanjut Supervisor
                  </h3>

                  <div className="space-y-1.5">
                    <label
                      htmlFor={`res-note-${activeReport.id}`}
                      className="block text-xs font-semibold text-[var(--kl-ink)]"
                    >
                      Catatan Hasil Penanganan{' '}
                      <span className="text-[var(--kl-ink-muted)] font-normal">
                        (Wajib diisi sebelum mengubah status ke Selesai)
                      </span>
                    </label>
                    <textarea
                      id={`res-note-${activeReport.id}`}
                      rows={2}
                      value={
                        resolutionInputs[activeReport.id] ?? activeReport.resolutionNote ?? ''
                      }
                      onChange={(e) => {
                        setResolutionInputs((prev) => ({
                          ...prev,
                          [activeReport.id]: e.target.value,
                        }));
                        if (e.target.value.trim()) {
                          setResolutionErrors((prev) => ({
                            ...prev,
                            [activeReport.id]: '',
                          }));
                        }
                      }}
                      placeholder="Contoh: Barang sudah diganti / sudah ditemukan di area gudang…"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--kl-border-strong)] bg-[var(--kl-bg)] text-sm text-[var(--kl-ink)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--kl-accent)]"
                    />
                    {resolutionErrors[activeReport.id] && (
                      <p className="text-xs font-medium text-[#B91C1C]" role="alert">
                        {resolutionErrors[activeReport.id]}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {activeReport.status === 'Dilaporkan' && (
                      <button
                        type="button"
                        onClick={async () => {
                          const note =
                            resolutionInputs[activeReport.id] ?? activeReport.resolutionNote ?? '';
                          await updateItemReportStatus(activeReport.id, 'Ditindaklanjuti', note);
                        }}
                        className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D97706] bg-[#FEF3C7] text-sm font-semibold text-[#92400E] hover:bg-[#FDE68A] inline-flex items-center gap-2"
                      >
                        <Wrench className="w-4 h-4" aria-hidden="true" />
                        <span>Tandai Ditindaklanjuti</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={async () => {
                        const note =
                          resolutionInputs[activeReport.id] ?? activeReport.resolutionNote ?? '';
                        const res = await updateItemReportStatus(activeReport.id, 'Selesai', note);
                        if (!res.ok) {
                          setResolutionErrors((prev) => ({
                            ...prev,
                            [activeReport.id]: res.message,
                          }));
                        }
                      }}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold hover:bg-[var(--kl-accent-hover)] inline-flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      <span>Tandai Selesai</span>
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <ItemReportModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
};
