export type UserRole = 'staff' | 'supervisor';

export type ShiftType = 'opening' | 'closing';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  jobTitle: string;
  /** Nomor telepon (opsional, tersimpan sebagai data profil). */
  phone?: string;
  /** ID baris tabel staff (bila berbeda dari id akun). */
  staffId?: string;
  username?: string;
}

export interface ShiftAssignment {
  id: string;
  date: string; // YYYY-MM-DD in Asia/Jakarta
  shift: ShiftType;
  staffIds: string[];
  picId: string;
}

export type SupervisorAbsenceStatus = 'Izin' | 'Sakit' | 'Alpa';

export interface AttendanceRecord {
  id: string;
  assignmentId: string;
  date: string; // YYYY-MM-DD in Asia/Jakarta
  shift: ShiftType;
  staffId: string;
  staffEmail: string;
  checkInTime: string | null; // HH:mm in WIB
  checkInMinutes: number | null; // minutes from 00:00 WIB
  checkOutTime: string | null; // HH:mm in WIB
  checkOutMinutes: number | null;
  lateMinutes: number; // 0 if on time
  durationMinutes: number | null;
  checkInPhotoId?: string | null;
  checkOutPhotoId?: string | null;
  supervisorStatus: SupervisorAbsenceStatus | null;
  supervisorNote?: string;
  updatedAt: string;
}

export type CleanlinessAreaKey =
  | 'meja_persiapan'
  | 'kompor_area_masak'
  | 'wastafel'
  | 'lantai'
  | 'tempat_sampah'
  | 'area_penyimpanan';

export type CleanlinessAreaStatus = 'Sudah Beres' | 'Perlu Ditangani';

export interface CleanlinessAreaEntry {
  key: CleanlinessAreaKey;
  label: string;
  status: CleanlinessAreaStatus;
  note: string;
  photoId: string | null;
}

export interface CleanlinessReport {
  id: string;
  date: string; // YYYY-MM-DD in Asia/Jakarta
  shift: ShiftType;
  picId: string;
  picEmail: string;
  picName: string;
  submittedAt: string; // Display timestamp WIB e.g. "17 Nov 2026, 11.45 WIB"
  submittedTimeHHMM: string; // e.g. "11:45"
  areas: CleanlinessAreaEntry[];
  generalPhotoId: string;
  handoverNote: string; // Khusus Opening, opsional/diisi untuk Closing
  confirmedAiSummary?: string | null;
  aiSummaryConfirmedAt?: string | null;
  aiSummaryConfirmedBy?: string | null;
}

export type ItemReportType = 'Barang Rusak' | 'Barang Hilang';
export type ItemReportStatus = 'Dilaporkan' | 'Ditindaklanjuti' | 'Selesai';

export interface ItemReport {
  id: string;
  type: ItemReportType;
  itemName: string;
  quantity: number;
  location: string;
  lastKnownLocation: string; // Wajib untuk Barang Hilang
  discoveredAt: string; // YYYY-MM-DD HH:mm WIB
  notes: string;
  photoId: string | null; // Wajib untuk Barang Rusak
  reporterId: string;
  reporterEmail: string;
  reporterName: string;
  shift: ShiftType;
  date: string; // YYYY-MM-DD in Asia/Jakarta
  status: ItemReportStatus;
  resolutionNote: string; // Wajib sebelum status berubah ke Selesai
  createdAt: string;
  updatedAt: string;
}

export type PhotoSource = 'camera' | 'upload';

export interface StoredPhoto {
  id: string;
  blob: Blob;
  source: PhotoSource;
  mimeType: string;
  createdAt: string;
}

export type AppView =
  | 'login'
  | 'today'
  | 'supervisor_dashboard'
  | 'schedule'
  | 'team'
  | 'cleanliness_detail'
  | 'item_reports'
  | 'history';

export interface KitchenLogState {
  kitchenName: string;
  users: UserAccount[];
  assignments: ShiftAssignment[];
  attendance: AttendanceRecord[];
  cleanlinessReports: CleanlinessReport[];
  itemReports: ItemReport[];
}
