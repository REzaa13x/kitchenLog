import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { savePhotoToIndexedDB } from '../storage/photoDb';
import { PhotoViewer } from './PhotoViewer';

interface PhotoCaptureFieldProps {
  label: string;
  helperText?: string;
  photoId: string | null;
  onChange: (photoId: string | null) => void;
  error?: string;
  required?: boolean;
}

export const PhotoCaptureField: React.FC<PhotoCaptureFieldProps> = ({
  label,
  helperText,
  photoId,
  onChange,
  error,
  required = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{ blob: Blob; source: 'camera' | 'upload'; id: string } | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const upload = async (item: NonNullable<typeof pending>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(item);
    onChange(null);
    setSaving(true);
    setCameraError(null);
    try {
      const id = await savePhotoToIndexedDB(item.blob, item.source, item.id);
      if (!mounted.current) return;
      onChange(id);
      setPending(null);
    } catch {
      if (mounted.current) setCameraError('Unggah foto gagal. Foto tetap tersedia; tekan Coba Lagi Unggah Foto.');
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleOpenCamera = async () => {
    stopCameraStream();
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Kamera langsung tidak tersedia pada browser ini. Silakan gunakan tombol Unggah Foto.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (!mounted.current) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      setCameraOpen(true);
      window.requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCameraError(
        'Izin kamera ditolak atau kamera tidak terdeteksi. Gunakan tombol Unggah Foto sebagai alternatif.'
      );
    }
  };

  const handleCapturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || saving) return;
    setSaving(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.86)
      );
      if (blob) {
        await upload({ blob, source: 'camera', id: `photo-${crypto.randomUUID()}` });
      }
      stopCameraStream();
    } catch {
      setCameraError('Gagal menangkap gambar dari kamera. Coba lagi atau unggah file.');
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError(null);
    setSaving(true);
    try {
      await upload({ blob: file, source: 'upload', id: `photo-${crypto.randomUUID()}` });
    } catch {
      setCameraError('Gagal menyimpan foto unggahan ke penyimpanan lokal.');
    } finally {
      setSaving(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label className="text-sm font-medium text-[var(--kl-ink)]">
          {label}
          {required && <span className="text-[#B91C1C] ml-1">*</span>}
        </label>
        {helperText && <span className="text-xs text-[var(--kl-ink-muted)]">{helperText}</span>}
      </div>

      {cameraOpen && (
        <div className="rounded-xl border border-[var(--kl-accent)] bg-[#141A17] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 text-xs text-white bg-[var(--kl-ink)]">
            <span>Kamera Langsung — Arahkan ke area dapur</span>
            <button
              type="button"
              onClick={stopCameraStream}
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg hover:bg-white/10"
              aria-label="Tutup kamera"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="relative aspect-square bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div data-camera-guide="grid" aria-hidden="true" className="absolute inset-6 grid grid-cols-3 grid-rows-3 border-2 border-white/80 pointer-events-none">{Array.from({ length: 9 }, (_, i) => <div key={i} className="border border-white/40" />)}</div>
          </div>
          <div className="p-3 flex items-center justify-between gap-3 bg-[var(--kl-ink)]">
            <button
              type="button"
              onClick={stopCameraStream}
              className="min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium text-white/90 border border-white/20 hover:bg-white/10 whitespace-nowrap"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleCapturePhoto}
              className="min-h-[44px] flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--kl-accent)] text-white hover:bg-[var(--kl-accent-hover)] inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
              {saving ? 'Menyimpan…' : 'Ambil Foto'}
            </button>
          </div>
        </div>
      )}

      {pending && !cameraOpen && <div className="space-y-2">
        <PhotoViewer photoId={pending.id} alt={`${label} — menunggu unggahan`} className="max-w-sm" />
        <button type="button" disabled={saving} onClick={() => void upload(pending)} className="min-h-[44px] px-4 rounded-lg border text-sm font-semibold">{saving ? 'Mengunggah…' : 'Coba Lagi Unggah Foto'}</button>
      </div>}
      {photoId && !cameraOpen && (
        <div className="space-y-2">
          <PhotoViewer photoId={photoId} alt={label} className="max-w-sm" />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenCamera}
              className="min-h-[44px] px-3 py-2 rounded-lg border border-[var(--kl-border)] bg-white text-xs font-medium text-[var(--kl-ink)] hover:bg-[var(--kl-soft)] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Ambil Ulang Kamera
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] px-3 py-2 rounded-lg border border-[var(--kl-border)] bg-white text-xs font-medium text-[var(--kl-ink)] hover:bg-[var(--kl-soft)] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              Ganti Unggahan
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="min-h-[44px] px-3 py-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] text-xs font-medium text-[#991B1B] hover:bg-[#FEE2E2] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Hapus
            </button>
          </div>
        </div>
      )}

      {!photoId && !cameraOpen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={saving}
            onClick={handleOpenCamera}
            className="min-h-[46px] px-4 py-2.5 rounded-lg bg-[var(--kl-accent)] text-white text-sm font-medium hover:bg-[var(--kl-accent-hover)] active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Buka Kamera</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[46px] px-4 py-2.5 rounded-lg border border-[var(--kl-border-strong)] bg-white text-[var(--kl-ink)] text-sm font-medium hover:bg-[var(--kl-soft)] active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Unggah Foto (Foto Unggahan)</span>
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        aria-label={label}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {cameraError && (
        <p className="text-xs text-[#92400E] bg-[#FEF3C7] border border-[#FDE68A] rounded-lg px-3 py-2">
          {cameraError}
        </p>
      )}
      {error && (
        <p className="text-xs font-medium text-[#B91C1C]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
