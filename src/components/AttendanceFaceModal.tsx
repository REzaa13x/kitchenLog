import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, X } from 'lucide-react';
import { savePhotoToIndexedDB } from '../storage/photoDb';
import { ShiftType, AttendanceCleanliness, CleanlinessAreaStatus } from '../types/kitchen';
import { CLEANLINESS_AREAS_TEMPLATE } from '../utils/cleanlinessTemplate';
import { formatTimeDotWib, SHIFT_META } from '../utils/wibTime';
import { PhotoViewer } from './PhotoViewer';

interface AttendanceFaceModalProps {
  open: boolean;
  mode: 'checkin' | 'checkout';
  staffName: string;
  shift: ShiftType;
  currentTimeHHMM: string;
  onClose: () => void;
  onConfirm: (photoId: string, cleanliness: AttendanceCleanliness) => Promise<{ ok: boolean; message: string }>;
}

type PhotoTarget = 'kitchen' | 'face';

// Both upload and camera evidence share the backend's size ceiling.
async function compressPhoto(source: CanvasImageSource, width: number, height: number) {
  if (!width || !height) throw new Error('Foto belum siap. Coba ambil ulang.');
  const scale = Math.min(1, 1280 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Pemrosesan foto tidak tersedia di browser ini.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.8, 0.6, 0.4]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.startsWith('data:image/jpeg;base64,') && dataUrl.length <= 2 * 1024 * 1024) {
      const blob = await (await fetch(dataUrl)).blob();
      return { dataUrl, blob };
    }
  }
  throw new Error('Foto masih melebihi 2 MB. Pilih foto yang lebih kecil.');
}

export const AttendanceFaceModal: React.FC<AttendanceFaceModalProps> = ({
  open, mode, staffName, shift, currentTimeHHMM, onClose, onConfirm,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef(0);
  const cameraRequestRef = useRef(0);
  const busyRef = useRef(false);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [kitchenPhoto, setKitchenPhoto] = useState('');
  const [cameraTarget, setCameraTarget] = useState<PhotoTarget | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [areas, setAreas] = useState<Record<string, { status: string; note: string }>>({});
  const completedAreas = CLEANLINESS_AREAS_TEMPLATE.filter(a => areas[a.key]?.status &&
    (areas[a.key].status !== 'Perlu Ditangani' || areas[a.key].note.trim())).length;
  const busy = submitting || photoLoading;

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };
  const stopCamera = () => {
    cameraRequestRef.current++;
    stopStream();
    setCameraTarget(null);
    setVideoReady(false);
    setCameraLoading(false);
  };
  const close = () => {
    sessionRef.current++;
    stopCamera();
    onClose();
  };

  useEffect(() => {
    sessionRef.current++;
    busyRef.current = false;
    setAreas({});
    setKitchenPhoto('');
    setPhotoId(null);
    setSubmitError(null);
    setCameraError(null);
    setSubmitting(false);
    setPhotoLoading(false);
    setCameraTarget(null);
    setCameraLoading(false);
    setVideoReady(false);
    return () => {
      sessionRef.current++;
      cameraRequestRef.current++;
      stopStream();
    };
  }, [open, mode, staffName]);

  // Attach only after the target's video has mounted; metadata gates capture.
  useEffect(() => {
    const video = videoRef.current;
    if (!cameraTarget || !video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {
      if (videoRef.current === video) {
        setCameraError('Pratinjau kamera gagal. Buka ulang kamera atau unggah foto.');
        stopCamera();
      }
    });
    return () => { video.srcObject = null; };
  }, [cameraTarget]);

  const startCamera = async (target: PhotoTarget) => {
    stopCamera();
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Kamera tidak tersedia. Gunakan unggah foto dapur atau wajah sesuai bagian.');
      return;
    }
    const session = sessionRef.current;
    const request = cameraRequestRef.current;
    setCameraLoading(true);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: target === 'kitchen' ? 'environment' : 'user' } }, audio: false,
        });
      } catch (error) {
        if (!(error instanceof DOMException) || !['NotFoundError', 'OverconstrainedError'].includes(error.name)) throw error;
        if (session !== sessionRef.current || request !== cameraRequestRef.current) return;
        // Single-camera devices may reject facingMode even when requested as ideal.
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      if (session !== sessionRef.current || request !== cameraRequestRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraTarget(target);
    } catch {
      if (session === sessionRef.current && request === cameraRequestRef.current) {
        setCameraError(`Kamera ${target === 'kitchen' ? 'dapur' : 'wajah'} tidak dapat diakses atau izin ditolak. Gunakan unggah foto sebagai alternatif.`);
      }
    } finally {
      if (session === sessionRef.current && request === cameraRequestRef.current) setCameraLoading(false);
    }
  };

  const processPhoto = async (target: PhotoTarget, source: 'camera' | 'upload', file?: File) => {
    if (busyRef.current) return;
    const session = sessionRef.current;
    busyRef.current = true;
    setPhotoLoading(true);
    setSubmitError(null);
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
        if (!video || !video.videoWidth || video.readyState < 2 || cameraTarget !== target) {
          throw new Error('Kamera belum siap. Tunggu pratinjau sebelum mengambil foto.');
        }
        photo = await compressPhoto(video, video.videoWidth, video.videoHeight);
      }
      if (session !== sessionRef.current) return;
      if (target === 'kitchen') setKitchenPhoto(photo.dataUrl);
      else {
        const savedId = await savePhotoToIndexedDB(photo.blob, source);
        if (session !== sessionRef.current) return;
        setPhotoId(savedId);
      }
      stopCamera();
    } catch (error) {
      if (session === sessionRef.current) setSubmitError(error instanceof Error ? error.message : 'Foto gagal disimpan. Coba ulang atau unggah foto lain.');
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
    const missing = CLEANLINESS_AREAS_TEMPLATE.flatMap(a => {
      if (!areas[a.key]?.status) return [`Pilih kondisi ${a.label}.`];
      return areas[a.key].status === 'Perlu Ditangani' && !areas[a.key].note.trim() ? [`Isi catatan ${a.label}.`] : [];
    });
    if (!kitchenPhoto) missing.push('Foto kondisi dapur wajib diambil atau diunggah.');
    if (!photoId) missing.push('Foto wajah wajib diambil atau diunggah untuk setiap check-in dan check-out.');
    if (missing.length) { setSubmitError(missing.join(' ')); return; }
    const session = sessionRef.current;
    busyRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    stopCamera();
    try {
      const result = await onConfirm(photoId!, {
        areas: CLEANLINESS_AREAS_TEMPLATE.map(a => ({ key: a.key, status: areas[a.key].status as CleanlinessAreaStatus, note: areas[a.key].note.trim() })),
        kitchenPhotoDataUrl: kitchenPhoto,
      });
      if (session !== sessionRef.current) return;
      if (!result.ok) setSubmitError(result.message || 'Absensi gagal disimpan. Coba lagi.');
      else close();
    } catch {
      if (session === sessionRef.current) setSubmitError('Absensi gagal disimpan. Periksa koneksi lalu coba lagi.');
    } finally {
      if (session === sessionRef.current) {
        busyRef.current = false;
        setSubmitting(false);
      }
    }
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
          <fieldset disabled={busy} className="space-y-3">
            <legend className="font-semibold">1. Checklist kebersihan wajib</legend>
            <p className="text-xs">Isi ulang sesuai kondisi saat {actionLabel}. Checklist dan foto setiap absensi terpisah.</p>
            <p role="status" className="text-sm font-medium">Checklist lengkap: {completedAreas}/{CLEANLINESS_AREAS_TEMPLATE.length}</p>
            {CLEANLINESS_AREAS_TEMPLATE.map(a => <div key={a.key} className="space-y-1">
              <label htmlFor={`attendance-${a.key}`} className="block text-sm font-medium">{a.label}</label>
              <select id={`attendance-${a.key}`} value={areas[a.key]?.status || ''} onChange={e => setAreas(p => ({ ...p, [a.key]: { status: e.target.value, note: p[a.key]?.note || '' } }))} className="w-full min-h-[44px] border rounded-lg px-3 bg-white">
                <option value="">Pilih kondisi</option><option>Sudah Beres</option><option>Perlu Ditangani</option>
              </select>
              {areas[a.key]?.status === 'Perlu Ditangani' && <input aria-label={`Catatan ${a.label}`} placeholder="Catatan kendala wajib" maxLength={1000} value={areas[a.key].note} onChange={e => setAreas(p => ({ ...p, [a.key]: { ...p[a.key], note: e.target.value } }))} className="w-full min-h-[44px] border rounded-lg px-3" />}
            </div>)}
          </fieldset>
          {(['kitchen', 'face'] as const).map(target => {
            const kitchen = target === 'kitchen';
            const label = kitchen ? 'Dapur' : 'Wajah';
            return <fieldset key={target} disabled={busy} className="space-y-3 border-t border-[var(--kl-border)] pt-4">
              <legend className="font-semibold">{kitchen ? '2. Foto kondisi dapur' : '3. Foto wajah'} (wajib)</legend>
              <p className="text-xs">{kitchen ? 'Kamera belakang: tampilkan area dapur dalam bingkai persegi. Bukan foto wajah.' : 'Kamera depan: posisikan wajah dalam oval, cukup cahaya. Wajib untuk semua staf pada setiap check-in dan check-out.'}</p>
              {kitchen && kitchenPhoto && <img src={kitchenPhoto} alt="Kondisi dapur saat absensi" className="w-full rounded-xl" />}
              {!kitchen && photoId && <PhotoViewer photoId={photoId} alt={`Foto wajah ${staffName} saat ${actionLabel}`} />}
              <button type="button" onClick={() => void startCamera(target)} disabled={cameraLoading} className={buttonClass}><Camera className="inline w-4 h-4 mr-2" aria-hidden="true" />Buka Kamera {label}</button>
              <label className="block text-sm font-medium" htmlFor={`attendance-${target}-photo`}>Unggah Foto {label} (JPEG/PNG/WebP, maks. 10 MB)</label>
              <input id={`attendance-${target}-photo`} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => {
                const file = e.target.files?.[0]; e.target.value = '';
                if (file) void processPhoto(target, 'upload', file);
              }} className="block w-full text-sm" />
              {cameraTarget === target && <div className="rounded-xl border overflow-hidden bg-black">
                <div className="relative aspect-[4/3]">
                  <video ref={videoRef} autoPlay playsInline muted onLoadedData={e => setVideoReady(e.currentTarget.videoWidth > 0 && e.currentTarget.readyState >= 2)} onLoadedMetadata={e => setVideoReady(e.currentTarget.videoWidth > 0 && e.currentTarget.readyState >= 2)} className={`w-full h-full object-cover ${kitchen ? '' : 'scale-x-[-1]'}`} />
                  <div aria-hidden="true" data-camera-guide={kitchen ? 'grid' : 'oval'} className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    {kitchen ? <div className="w-[90%] h-[85%] border-2 border-white/70 grid grid-cols-3 grid-rows-3">{Array.from({ length: 9 }, (_, i) => <div key={i} className="border border-white/30" />)}</div> : <div className="w-40 h-52 rounded-full border-2 border-dashed border-white/70" />}
                  </div>
                </div>
                <div className="p-3 flex gap-2">
                  <button type="button" disabled={!videoReady} onClick={() => void processPhoto(target, 'camera')} className={buttonClass}>Ambil Foto {label}</button>
                  <button type="button" onClick={stopCamera} className={buttonClass}>Tutup Kamera</button>
                </div>
              </div>}
            </fieldset>;
          })}
          {cameraLoading && <p role="status">Membuka kamera…</p>}
          {photoLoading && <p role="status">Memproses foto…</p>}
          {cameraError && <p role="alert" className="text-sm text-[#92400E] bg-[#FEF3C7] rounded-xl p-3">{cameraError}</p>}
          {submitError && <p role="alert" className="text-sm text-[#991B1B] bg-[#FEE2E2] rounded-xl p-3">{submitError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={close} disabled={submitting} className={buttonClass}>Batal</button>
            <button type="button" disabled={busy} onClick={() => void handleSubmitAttendance()} className="min-h-[48px] flex-1 px-4 py-2.5 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />{submitting ? 'Menyimpan…' : `Konfirmasi ${actionLabel}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
