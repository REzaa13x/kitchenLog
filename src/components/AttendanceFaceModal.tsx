import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, X } from 'lucide-react';
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
  /** Bukti absensi cukup foto wajah; checklist kebersihan diisi di halaman Kebersihan. */
  onConfirm: (photoId: string, clientRef: string) => Promise<{ ok: boolean; message: string; retryable?: boolean }>;
}

type PhotoTarget = 'face';

// Foto wajah disimpan seukuran bukti absensi (bukan foto dapur resolusi penuh).
async function compressPhoto(source: CanvasImageSource, width: number, height: number) {
  if (!width || !height) throw new Error('Foto belum siap. Coba ambil ulang.');
  const scale = Math.min(1, 960 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Pemrosesan foto tidak tersedia di browser ini.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.8, 0.6, 0.4]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.startsWith('data:image/jpeg;base64,') && dataUrl.length <= 512 * 1024) {
      const blob = await (await fetch(dataUrl)).blob();
      return { dataUrl, blob };
    }
  }
  throw new Error('Foto masih melebihi 512 KB. Pilih foto yang lebih kecil.');
}

export const AttendanceFaceModal: React.FC<AttendanceFaceModalProps> = ({
  open, mode, staffName, shift, currentTimeHHMM, onClose, onConfirm,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef(0);
  const cameraRequestRef = useRef(0);
  const busyRef = useRef(false);
  // Ref klien: percobaan ulang setelah gagal memakai ref yang sama agar server
  // mengenali submit ganda, bukan membuat absensi kedua.
  const clientRefRef = useRef<string>(`${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  // Foto wajah yang bytes-nya sudah ada tetapi unggahannya belum berhasil.
  const pendingFaceRef = useRef<{ id: string; blob: Blob; source: 'camera' | 'upload' } | null>(null);

  const [photoId, setPhotoId] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const busy = submitting || photoLoading;

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  useEffect(() => {
    if (!open) return undefined;
    // Setiap kali modal dibuka, mulai sesi baru & ref klien baru.
    sessionRef.current += 1;
    const session = sessionRef.current;
    clientRefRef.current = `${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    // Reset juga state "sedang sibuk": kalau tidak, modal bisa terbuka dalam
    // kondisi terkunci (mis. "Menyimpan…" dari sesi sebelumnya).
    busyRef.current = false;
    setSubmitting(false);
    setPhotoLoading(false);
    setCameraLoading(false);
    setPhotoId(null);
    setSubmitError(null);
    setSubmitFailed(false);
    setCameraError(null);
    setCameraOpen(false);
    pendingFaceRef.current = null;
    return () => {
      if (session === sessionRef.current) {
        stopCamera();
        sessionRef.current += 1;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const openCamera = async () => {
    if (busyRef.current) return;
    setCameraError(null);
    // Tutup stream lama lebih dulu: beberapa perangkat hanya mengizinkan satu
    // kamera aktif, dan stream yang tertinggal membuat percobaan berikut gagal.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Kamera tidak tersedia di browser ini. Gunakan unggah foto sebagai alternatif.');
      return;
    }
    const session = sessionRef.current;
    const request = ++cameraRequestRef.current;
    setCameraLoading(true);
    try {
      let stream: MediaStream;
      try {
        // Bukti wajah: kamera depan.
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' } }, audio: false });
      } catch (error) {
        if (!(error instanceof DOMException) || !['NotFoundError', 'OverconstrainedError'].includes(error.name)) throw error;
        if (session !== sessionRef.current || request !== cameraRequestRef.current) return;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      if (session !== sessionRef.current || request !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      if (session === sessionRef.current && request === cameraRequestRef.current) {
        setCameraError('Kamera tidak dapat diakses atau izin ditolak. Gunakan unggah foto sebagai alternatif.');
      }
    } finally {
      if (session === sessionRef.current && request === cameraRequestRef.current) setCameraLoading(false);
    }
  };

  useEffect(() => {
    if (!cameraOpen) return;
    const video = videoRef.current;
    if (video && streamRef.current) {
      video.srcObject = streamRef.current;
      video.play().catch(() => {});
    }
  }, [cameraOpen]);

  const captureOrUpload = async (file?: File) => {
    if (busyRef.current) return;
    const session = sessionRef.current;
    busyRef.current = true;
    setPhotoLoading(true);
    setSubmitError(null);
    setSubmitFailed(false);
    let url: string | undefined;
    try {
      let photo;
      if (file) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
          throw new Error('Gunakan foto JPEG/PNG/WebP maksimal 10 MB.');
        }
        url = URL.createObjectURL(file);
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('Foto tidak dapat dibaca. Pilih foto lain.'));
          image.src = url!;
        });
        photo = await compressPhoto(image, image.naturalWidth, image.naturalHeight);
      } else {
        const video = videoRef.current;
        if (!video || !video.videoWidth || video.readyState < 2) {
          throw new Error('Kamera belum siap. Tunggu pratinjau sebelum mengambil foto.');
        }
        photo = await compressPhoto(video, video.videoWidth, video.videoHeight);
      }
      if (session !== sessionRef.current) return;
      // Simpan bytes + ID lebih dulu: walau unggah gagal, foto tidak perlu diambil ulang.
      const pendingId = `photo-${crypto.randomUUID()}`;
      pendingFaceRef.current = { id: pendingId, blob: photo.blob, source: file ? 'upload' : 'camera' };
      try {
        const savedId = await savePhotoToIndexedDB(photo.blob, file ? 'upload' : 'camera', pendingId);
        if (session !== sessionRef.current) return;
        setPhotoId(savedId);
        pendingFaceRef.current = null;
      } catch (uploadError) {
        if (session !== sessionRef.current) return;
        setPhotoId(pendingId);
        setSubmitFailed(true);
        const message = uploadError instanceof Error ? uploadError.message : 'Foto gagal diunggah.';
        setSubmitError(`${message} Foto tetap tersimpan — tekan tombol coba lagi untuk mengunggah ulang.`);
      }
      stopCamera();
    } catch (error) {
      if (session === sessionRef.current) {
        setSubmitError(error instanceof Error ? error.message : 'Foto gagal disimpan. Coba ulang atau unggah foto lain.');
      }
    } finally {
      if (url) URL.revokeObjectURL(url);
      if (session === sessionRef.current) {
        busyRef.current = false;
        setPhotoLoading(false);
      }
    }
  };

  const handleSubmitAttendance = async () => {
    if (busyRef.current) return;
    if (!photoId) {
      setSubmitFailed(false);
      setSubmitError('Foto wajah wajib diambil atau diunggah untuk setiap check-in dan check-out.');
      return;
    }
    const session = sessionRef.current;
    busyRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    stopCamera();
    try {
      // Unggah ulang foto wajah bila percobaan sebelumnya gagal (bytes tetap ada).
      if (pendingFaceRef.current) {
        const pending = pendingFaceRef.current;
        try {
          await savePhotoToIndexedDB(pending.blob, pending.source, pending.id);
          pendingFaceRef.current = null;
          if (session !== sessionRef.current) return;
          setPhotoId(pending.id);
        } catch (uploadError) {
          if (session === sessionRef.current) {
            setSubmitFailed(true);
            setSubmitError(
              uploadError instanceof Error
                ? `${uploadError.message} Absensi belum dikirim. Periksa koneksi lalu tekan coba lagi.`
                : 'Foto wajah belum berhasil diunggah. Absensi belum dikirim.'
            );
          }
          return;
        }
      }
      const result = await onConfirm(photoId!, clientRefRef.current);
      if (session !== sessionRef.current) return;
      if (!result.ok) {
        // Kegagalan TIDAK menutup modal: foto tetap ada untuk dicoba lagi.
        setSubmitFailed(true);
        setSubmitError(result.message || 'Absensi gagal disimpan. Coba lagi.');
      } else {
        close();
      }
    } catch {
      if (session === sessionRef.current) {
        setSubmitFailed(true);
        setSubmitError('Absensi gagal disimpan. Periksa koneksi lalu coba lagi dengan tombol di bawah.');
      }
    } finally {
      if (session === sessionRef.current) {
        busyRef.current = false;
        setSubmitting(false);
      }
    }
  };

  const close = () => {
    sessionRef.current += 1;
    stopCamera();
    onClose();
  };

  if (!open) return null;
  const actionLabel = mode === 'checkin' ? 'Check-in' : 'Check-out';
  const buttonClass = 'min-h-[44px] px-4 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm font-semibold disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-[2px] p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="face-attendance-title">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--kl-bg)] border border-[var(--kl-border)] shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-[var(--kl-bg)] border-b border-[var(--kl-border)]">
          <div>
            <h2 id="face-attendance-title" className="text-lg font-bold">Bukti Absensi · {actionLabel}</h2>
            <p className="text-xs">{staffName} · Shift {SHIFT_META[shift].label} · {formatTimeDotWib(currentTimeHHMM)}</p>
          </div>
          <button type="button" onClick={close} disabled={submitting} className={buttonClass} aria-label="Tutup verifikasi wajah"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="rounded-xl bg-[var(--kl-tint)] border border-[var(--kl-tint-border)] p-3 text-xs text-[var(--kl-accent-deep)]">
            Cukup <strong>foto wajah</strong> untuk mencatat {actionLabel}. Checklist kebersihan 6 area diisi terpisah di halaman
            <strong> Laporan Kebersihan</strong> — tidak perlu diulang di sini.
          </div>

          <fieldset disabled={busy} className="space-y-3">
            <legend className="font-semibold">Foto wajah (wajib)</legend>
            <p className="text-xs">Pastikan wajah terlihat jelas dan pencahayaan cukup.</p>
            {photoId ? (
              <div className="space-y-2">
                <PhotoViewer photoId={photoId} alt={`Foto wajah ${staffName} saat ${actionLabel}`} className="max-w-[240px]" />
                <button
                  type="button"
                  onClick={() => { setPhotoId(null); pendingFaceRef.current = null; setSubmitError(null); setSubmitFailed(false); }}
                  className={buttonClass}
                >
                  Ambil Ulang
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void openCamera()} className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold inline-flex items-center gap-2">
                    <Camera className="w-4 h-4" aria-hidden="true" /> Buka Kamera Wajah
                  </button>
                  <label className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm font-semibold inline-flex items-center cursor-pointer">
                    <span>Unggah Foto</span>
                    <input
                      id="attendance-face-photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void captureOrUpload(file);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>

                {cameraOpen && (
                  <div className="space-y-2">
                    <div className="relative overflow-hidden rounded-xl border border-[var(--kl-border)] bg-black">
                      <video ref={videoRef} muted playsInline className="w-full" aria-label="Pratinjau kamera wajah" />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div data-camera-guide="oval" className="w-32 h-40 rounded-full border-2 border-white/80" />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void captureOrUpload()} className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold">
                        Ambil Foto Wajah
                      </button>
                      <button type="button" onClick={stopCamera} className={buttonClass}>Tutup Kamera</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </fieldset>

          {cameraLoading && <p role="status">Membuka kamera…</p>}
          {photoLoading && <p role="status">Memproses foto…</p>}
          {cameraError && <p role="alert" className="text-sm text-[#92400E] bg-[#FEF3C7] rounded-xl p-3">{cameraError}</p>}
          {submitError && (
            <div role="alert" className="text-sm text-[#991B1B] bg-[#FEE2E2] rounded-xl p-3 space-y-1">
              <p className="font-semibold">Absensi belum tercatat.</p>
              <p>{submitError}</p>
              <p className="text-xs">Foto tetap tersimpan di layar ini. Periksa koneksi, lalu tekan tombol coba lagi — foto tidak perlu diambil ulang.</p>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={close} disabled={submitting} className={buttonClass}>Batal</button>
            <button type="button" disabled={busy} onClick={() => void handleSubmitAttendance()} className="min-h-[48px] flex-1 px-4 py-2.5 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              {submitting ? 'Menyimpan…' : submitFailed ? `Coba Lagi ${actionLabel}` : `Konfirmasi ${actionLabel}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
