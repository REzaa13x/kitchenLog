import React, { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, UserCheck } from 'lucide-react';
import { useKitchen } from '../storage/kitchenContext';
import type { CleanlinessAreaKey, CleanlinessFollowup } from '../types/kitchen';
import { PhotoCaptureField } from './PhotoCaptureField';
import { StatusIndicator } from './StatusIndicator';

interface CleanlinessFollowupCardProps {
  reportId: string;
  areaKey: CleanlinessAreaKey;
  areaLabel: string;
  note: string;
}

/**
 * Kartu tindak lanjut satu temuan "Perlu Ditangani".
 *
 * Temuan tidak berhenti sebagai catatan: ada penanggung jawab (PJ), status
 * (Perlu Ditangani → Sedang Ditangani → Selesai), dan bukti foto penyelesaian.
 */
export const CleanlinessFollowupCard: React.FC<CleanlinessFollowupCardProps> = ({
  reportId,
  areaKey,
  areaLabel,
  note,
}) => {
  const { state, currentUser, updateCleanlinessFollowup, showToast } = useKitchen();
  const followup: CleanlinessFollowup | undefined = useMemo(
    () => (state.cleanlinessFollowups ?? []).find((f) => f.reportId === reportId && f.areaKey === areaKey),
    [state.cleanlinessFollowups, reportId, areaKey]
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [proofPhotoId, setProofPhotoId] = useState<string | null>(null);
  const [assignee, setAssignee] = useState('');

  const isAdmin = currentUser?.role === 'supervisor';
  const isAssignee =
    Boolean(currentUser) &&
    [followup?.picId, followup?.picEmail].filter(Boolean).some(
      (v) => String(v).toLowerCase() === String(currentUser?.id).toLowerCase() || String(v).toLowerCase() === String(currentUser?.email).toLowerCase()
    );
  const canEdit = isAdmin || isAssignee;

  if (!followup) {
    return (
      <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-4 space-y-2">
        <p className="text-sm text-[var(--kl-ink)]">
          <span className="font-semibold text-[#92400E]">Catatan Area: </span>
          {note}
        </p>
        <p className="text-xs text-[#92400E]">
          Belum ada entri tindak lanjut untuk area ini. Muat ulang halaman; bila tetap kosong, minta Admin membuat tindak lanjut.
        </p>
      </div>
    );
  }

  const update = async (payload: Parameters<NonNullable<typeof updateCleanlinessFollowup>>[0]) => {
    if (!updateCleanlinessFollowup) {
      setError('Tindak lanjut hanya tersedia pada mode MySQL.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await updateCleanlinessFollowup(payload);
      if (!res.ok) setError(res.message);
      else showToast('Tindak lanjut diperbarui.');
    } finally {
      setBusy(false);
    }
  };

  const staffOptions = [...state.users].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-[var(--kl-ink)] min-w-0">
          <span className="font-semibold text-[#92400E]">Catatan Area: </span>
          {note}
        </p>
        <StatusIndicator
          label={followup.status}
          tone={followup.status === 'Selesai' ? 'success' : followup.status === 'Sedang Ditangani' ? 'warning' : 'danger'}
        />
      </div>

      <div className="text-xs text-[#92400E] space-y-0.5">
        <p>
          Penanggung jawab: <span className="font-semibold">{followup.picName || 'Belum ditetapkan'}</span>
        </p>
        {followup.resolvedAt && (
          <p>
            Diselesaikan oleh {followup.resolvedByEmail} · {followup.resolvedAt}
          </p>
        )}
        {followup.resolutionNote && <p>Catatan penyelesaian: {followup.resolutionNote}</p>}
      </div>

      {followup.status === 'Selesai' && followup.resolutionPhotoId && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[#15803D]">Bukti penyelesaian</p>
          <img
            src={`/api/photos/${encodeURIComponent(followup.resolutionPhotoId)}?workspaceId=${encodeURIComponent(
              localStorage.getItem('kitchenlog_ws_v1') || ''
            )}`}
            alt={`Bukti penyelesaian ${areaLabel}`}
            className="max-w-[220px] rounded-lg border border-[#BBF7D0]"
            onError={(e) => {
              // Foto privat butuh header Authorization; fallback ke pesan agar tidak broken image.
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <p className="text-[11px] text-[var(--kl-ink-muted)]">
            Bukti foto tersimpan di server. Bila pratinjau tidak tampil, buka dari halaman Riwayat Admin.
          </p>
        </div>
      )}

      {canEdit && followup.status !== 'Selesai' && (
        <div className="space-y-2 border-t border-[#FDE68A] pt-3">
          {isAdmin && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold text-[#92400E] space-y-1 flex-1 min-w-[160px]">
                <span>Tetapkan PJ</span>
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-[#FDE68A] bg-white px-2 text-sm font-normal"
                >
                  <option value="">Pilih staf…</option>
                  {staffOptions.map((u) => (
                    <option key={u.id} value={u.staffId || u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy || !assignee}
                onClick={() => void update({ id: followup.id, picId: assignee })}
                className="min-h-[40px] px-3 rounded-lg bg-[var(--kl-ink)] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <UserCheck className="w-3.5 h-3.5" /> Simpan PJ
              </button>
            </div>
          )}

          {followup.status === 'Perlu Ditangani' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void update({ id: followup.id, status: 'Sedang Ditangani' })}
              className="min-h-[40px] px-3 rounded-lg border border-[#FDE68A] bg-white text-xs font-semibold text-[#92400E] disabled:opacity-50"
            >
              Tandai Sedang Ditangani
            </button>
          )}

          <div className="space-y-2 rounded-lg bg-white border border-[#FDE68A] p-3">
            <p className="text-xs font-semibold text-[#92400E]">Selesaikan dengan bukti</p>
            <PhotoCaptureField
              label="Foto bukti penyelesaian"
              photoId={proofPhotoId}
              onChange={(id) => setProofPhotoId(id)}
            />
            <textarea
              rows={2}
              maxLength={1000}
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder="Catatan penyelesaian (wajib)"
              className="w-full rounded-lg border border-[#FDE68A] px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={busy || !proofPhotoId || resolutionNote.trim().length === 0}
              onClick={() =>
                void update({
                  id: followup.id,
                  status: 'Selesai',
                  resolutionNote: resolutionNote.trim(),
                  resolutionPhotoId: proofPhotoId,
                })
              }
              className="min-h-[40px] px-3 rounded-lg bg-[#15803D] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Tandai Selesai
            </button>
          </div>
        </div>
      )}

      {!canEdit && followup.status !== 'Selesai' && (
        <p className="text-xs text-[#92400E]">
          Hanya PJ atau Admin yang dapat memperbarui tindak lanjut ini.
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-[#B91C1C]">
          {error}
        </p>
      )}
    </div>
  );
};
