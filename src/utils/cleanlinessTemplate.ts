import { CleanlinessAreaEntry, CleanlinessAreaKey } from '../types/kitchen';

export const CLEANLINESS_AREAS_TEMPLATE: Array<{ key: CleanlinessAreaKey; label: string }> = [
  { key: 'meja_persiapan', label: 'Meja persiapan' },
  { key: 'kompor_area_masak', label: 'Kompor dan area masak' },
  { key: 'wastafel', label: 'Wastafel' },
  { key: 'lantai', label: 'Lantai' },
  { key: 'tempat_sampah', label: 'Tempat sampah' },
  { key: 'area_penyimpanan', label: 'Area penyimpanan' },
];

export function createInitialCleanlinessAreas(): CleanlinessAreaEntry[] {
  return CLEANLINESS_AREAS_TEMPLATE.map((item) => ({
    key: item.key,
    label: item.label,
    status: 'Sudah Beres',
    note: '',
    photoId: null,
  }));
}
