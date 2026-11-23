import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, RefreshCw, Upload, X } from 'lucide-react';
import { savePhotoToIndexedDB } from '../storage/photoDb';
import { ShiftType } from '../types/kitchen';
import { formatTimeDotWib, SHIFT_META } from '../utils/wibTime';
import { PhotoViewer } from './PhotoViewer';

interface AttendanceFaceModalProps {
  open: boolean;
  mode: 'checkin' | 'checkout';
  staffName: string;
  shift: ShiftType;
  currentTimeHHMM: string;
  onClose: () => void;
  onConfirm: (photoId: string) => Promise<{ ok: boolean; message: string }>;
}

export const AttendanceFaceModal: React.FC<AttendanceFaceModalProps> = ({
  open,
  mode,
  staffName,
  shift,
  currentTimeHHMM,
  onClose,
  onConfirm,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [photoId, setPhotoId] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startFrontCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Kamera depan tidak tersedia di browser ini. Silakan unggah foto wajah melalui tombol di bawah.'
      );
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'user' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      window.requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCameraError(
        'Kamera tidak dapat diakses atau izin ditolak. Gunakan tombol Unggah Foto Wajah sebagai alternatif.'
      );
    }
  };

  useEffect(() => {
    if (open) {
      setPhotoId(null);
      setSubmitError(null);
      setCameraError(null);
      startFrontCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open]);

  if (!open) return null;

  const handleCaptureFace = async () => {
    const video = videoRef.current;
    if (!video) return;
    setSubmitError(null);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
    );
    if (blob) {
      const savedId = await savePhotoToIndexedDB(blob, 'camera');
      setPhotoId(savedId);
      stopCamera();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError(null);
    setSubmitError(null);
    const savedId = await savePhotoToIndexedDB(file, 'upload');
    setPhotoId(savedId);
    stopCamera();
    e.target.value = '';
  };

  const handleSubmitAttendance = async () => {
    if (!photoId) {
      setSubmitError('Foto wajah wajib diambil atau diunggah sebelum konfirmasi absen.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await onConfirm(photoId);
      if (!res.ok) {
        setSubmitError(res.message);
        return;
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const actionLabel = mode === 'checkin' ? 'Check-in' : 'Check-out';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="face-attendance-title"
    >
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--kl-bg)] border border-[var(--kl-border)] shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-[var(--kl-bg)] border-b border-[var(--kl-border)]">
          <div>
            <h2 id="face-attendance-title" className="text-lg font-bold text-[var(--kl-ink)]">
              Verifikasi Wajah · {actionLabel}
            </h2>
            <p className="text-xs text-[var(--kl-ink-muted)]">
              {staffName} · Shift {SHIFT_META[shift].label} ·{' '}
              <span className="font-mono tabular-nums">{formatTimeDotWib(currentTimeHHMM)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-[var(--kl-ink-sub)] hover:bg-[var(--kl-soft)]"
            aria-label="Tutup verifikasi wajah"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!photoId ? (
            <div className="space-y-3">
              {cameraActive ? (
                <div className="rounded-2xl border border-[var(--kl-accent)] bg-[#141A17] overflow-hidden">
                  <div className="relative aspect-[4/3] bg-black">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    >
                      <div className="w-40 h-52 rounded-full border-2 border-dashed border-white/60" />
                    </div>
                  </div>
                  <div className="p-3 bg-[var(--kl-ink)]">
                    <button
                      type="button"
                      onClick={handleCaptureFace}
                      className="min-h-[48px] w-full px-4 py-2.5 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold hover:bg-[var(--kl-accent-hover)] inline-flex items-center justify-center gap-2"
                    >
                      <Camera className="w-4 h-4" aria-hidden="true" />
                      <span>Ambil Foto Wajah</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--kl-border-strong)] bg-white p-5 text-center space-y-3">
                  <p className="text-sm font-medium text-[var(--kl-ink)]">
                    Ambil atau unggah foto wajah untuk {actionLabel}
                  </p>
                  <button
                    type="button"
                    onClick={startFrontCamera}
                    className="min-h-[44px] w-full px-4 py-2 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold hover:bg-[var(--kl-accent-hover)] inline-flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4" aria-hidden="true" />
                    <span>Coba Buka Kamera Depan</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] w-full px-4 py-2.5 rounded-xl border border-[var(--kl-border-strong)] bg-white text-xs sm:text-sm font-medium text-[var(--kl-ink)] hover:bg-[var(--kl-soft)] inline-flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                <span>Unggah Foto Wajah (Foto Unggahan)</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <PhotoViewer photoId={photoId} alt={`Foto wajah ${staffName} saat ${actionLabel}`} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPhotoId(null);
                    startFrontCamera();
                  }}
                  className="min-h-[44px] flex-1 px-3 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-xs font-semibold text-[var(--kl-ink)] hover:bg-[var(--kl-soft)] inline-flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Foto Ulang</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] flex-1 px-3 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-xs font-semibold text-[var(--kl-ink)] hover:bg-[var(--kl-soft)] inline-flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Ganti Unggahan</span>
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={handleFileUpload}
            className="hidden"
          />

          {cameraError && (
            <p className="text-xs text-[#92400E] bg-[#FEF3C7] border border-[#FDE68A] rounded-xl px-3 py-2">
              {cameraError}
            </p>
          )}

          {submitError && (
            <p
              role="alert"
              className="text-xs font-medium text-[#991B1B] bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-3 py-2"
            >
              {submitError}
            </p>
          )}

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] px-4 py-2.5 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm font-medium text-[var(--kl-ink-sub)]"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={!photoId || submitting}
              onClick={handleSubmitAttendance}
              className="min-h-[48px] flex-1 px-4 py-2.5 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold hover:bg-[var(--kl-accent-hover)] disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span>{submitting ? 'Menyimpan…' : `Konfirmasi ${actionLabel}`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
