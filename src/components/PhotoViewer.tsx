import React from 'react';
import { Camera, ImageOff, Upload } from 'lucide-react';
import { getPhotoSourceLabel, useStoredPhoto } from '../storage/photoDb';

interface PhotoViewerProps {
  photoId: string | null | undefined;
  alt: string;
  className?: string;
  aspectClass?: string;
}

export const PhotoViewer: React.FC<PhotoViewerProps> = ({
  photoId,
  alt,
  className = '',
  aspectClass = 'aspect-[4/3]',
}) => {
  const { url, source, loading } = useStoredPhoto(photoId);

  if (!photoId) return null;

  return (
    <figure className={`overflow-hidden rounded-lg border border-[var(--kl-border)] bg-[var(--kl-soft)] ${className}`}>
      <div className={`relative w-full ${aspectClass} bg-[var(--kl-track)]`}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--kl-ink-muted)]">
            Memuat foto…
          </div>
        ) : url ? (
          <img
            src={url}
            alt={alt}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center text-[var(--kl-ink-muted)]">
            <ImageOff className="w-5 h-5" aria-hidden="true" />
            <span className="text-xs">Pratinjau foto tidak tersedia</span>
          </div>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-[var(--kl-ink-sub)] bg-white border-t border-[var(--kl-border)]">
        <span className="inline-flex items-center gap-1.5 font-medium">
          {source === 'camera' ? (
            <Camera className="w-3.5 h-3.5 text-[var(--kl-accent)]" aria-hidden="true" />
          ) : (
            <Upload className="w-3.5 h-3.5 text-[var(--kl-ink-muted)]" aria-hidden="true" />
          )}
          {getPhotoSourceLabel(source)}
        </span>
      </figcaption>
    </figure>
  );
};
