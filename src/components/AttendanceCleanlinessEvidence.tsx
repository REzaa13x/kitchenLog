import React from 'react';
import { PhotoViewer } from './PhotoViewer';
import { AttendanceRecord } from '../types/kitchen';
import { CLEANLINESS_AREAS_TEMPLATE } from '../utils/cleanlinessTemplate';
export function AttendanceCleanlinessEvidence({ record }: { record?: AttendanceRecord }) {
  return <>{([['Check-in', record?.checkInCleanliness], ['Check-out', record?.checkOutCleanliness]] as const).map(([label,evidence]) => evidence && <details key={label} className="mt-2 rounded-lg border p-2 text-sm">
    <summary className="cursor-pointer font-medium">Bukti kebersihan {label}</summary>
    <ul className="space-y-1 my-2">{evidence.areas.map(a=><li key={a.key}>{CLEANLINESS_AREAS_TEMPLATE.find(t=>t.key===a.key)?.label}: {a.status}{a.note ? ` — ${a.note}` : ''}</li>)}</ul>
    {evidence.kitchenPhotoId ? <PhotoViewer photoId={evidence.kitchenPhotoId} alt={`Kondisi dapur ${label}`} className="max-w-full w-72" /> : evidence.kitchenPhotoDataUrl ? <img src={evidence.kitchenPhotoDataUrl} alt={`Kondisi dapur ${label}`} loading="lazy" className="max-w-full w-72 rounded-lg"/> : <p>Foto tidak tersedia pada checklist lama.</p>}
  </details>)}</>;
}
