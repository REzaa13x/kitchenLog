import React, { useState } from 'react';
import { User, X } from 'lucide-react';
import { useStoredPhoto } from '../storage/photoDb';
import { PhotoViewer } from './PhotoViewer';

interface FacePhotoAvatarProps {
  photoId: string | null | undefined;
  label: string;
  staffName: string;
  timeLabel?: string | null;
}

export const FacePhotoAvatar: React.FC<FacePhotoAvatarProps> = ({
  photoId,
  label,
  staffName,
  timeLabel,
}) => {
  const { url } = useStoredPhoto(photoId);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!photoId) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="group inline-flex items-center gap-2 rounded-lg border border-[var(--kl-border)] bg-[var(--kl-bg)] pr-2.5 pl-1 py-1 hover:border-[var(--kl-accent)] transition-colors text-left"
        title={`Lihat foto wajah ${label} ${staffName}`}
      >
        <div className="w-8 h-8 rounded-md overflow-hidden bg-[var(--kl-track)] shrink-0 flex items-center justify-center">
          {url ? (
            <img
              src={url}
              alt={`Wajah ${staffName} (${label})`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-4 h-4 text-[var(--kl-ink-muted)]" aria-hidden="true" />
          )}
        </div>
        <div className="leading-tight">
          <p className="text-[11px] font-semibold text-[var(--kl-ink)] group-hover:text-[var(--kl-accent)]">
            Wajah {label}
          </p>
          {timeLabel && (
            <p className="text-[10px] font-mono tabular-nums text-[var(--kl-ink-muted)]">
              {timeLabel}
            </p>
          )}
        </div>
      </button>

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[var(--kl-bg)] border border-[var(--kl-border)] p-4 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-[var(--kl-ink)]">
                  Foto Wajah {label} · {staffName}
                </p>
                {timeLabel && (
                  <p className="text-xs font-mono tabular-nums text-[var(--kl-ink-muted)]">
                    {timeLabel}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl hover:bg-[var(--kl-soft)]"
                aria-label="Tutup pratinjau wajah"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <PhotoViewer
              photoId={photoId}
              alt={`Foto wajah ${label} ${staffName}`}
              aspectClass="aspect-square"
            />
          </div>
        </div>
      )}
    </>
  );
};
