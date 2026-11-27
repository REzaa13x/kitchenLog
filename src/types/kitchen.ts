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
  geasteatsStaffId?: string | null;
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
  checkInCleanliness?: AttendanceCleanliness | null;
  checkOutCleanliness?: AttendanceCleanliness | null;
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
  checkInKitchenPhotoId?: string | null;
  checkOutKitchenPhotoId?: string | null;
  checkInPhotoId?: string | null;
  checkOutPhotoId?: string | null;
  earlyLeaveMinutes?: number | null;
  overnight?: boolean;
  clientRef?: string | null;
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
export interface AttendanceCleanliness {
  areas: { key: CleanlinessAreaKey; status: CleanlinessAreaStatus; note: string }[];
  kitchenPhotoDataUrl: string;
}

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

export type CleanlinessFollowupStatus = 'Perlu Ditangani' | 'Sedang Ditangani' | 'Selesai';

/** Tindak lanjut satu temuan area kebersihan (punya PJ, status, dan bukti penyelesaian). */
export interface CleanlinessFollowup {
  id: string;
  reportId: string;
  areaKey: CleanlinessAreaKey;
  areaLabel: string;
  note: string;
  status: CleanlinessFollowupStatus;
  picId: string | null;
  picEmail: string | null;
  picName: string | null;
  resolutionNote: string;
  resolutionPhotoId: string | null;
  resolvedById: string | null;
  resolvedByEmail: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Satu baris rekap operasional (satu staf pada satu shift). */
export interface OperationalReportRow {
  date: string;
  shift: ShiftType;
  assignmentId: string;
  staffId: string;
  staffName: string;
  staffEmail: string;
  isPic: boolean;
  checkInTime: string | null;
  checkOutTime: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  durationMinutes: number | null;
  overtimeMinutes: number;
  overnight: boolean;
  status: string;
  overdue: boolean;
  supervisorNote: string;
  attendanceId: string | null;
}

export interface OperationalReportSummary {
  from: string;
  to: string;
  totalScheduled: number;
  hadir: number;
  terlambat: number;
  pulangAwal: number;
  belumCheckout: number;
  belumAbsen: number;
  izin: number;
  sakit: number;
  alpa: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
  avgDurationMinutes: number | null;
  checklistBermasalah: number;
  followupTerbuka: number;
}

export interface OperationalReport {
  summary: OperationalReportSummary;
  rows: OperationalReportRow[];
  perStaff: {
    staffId: string;
    staffName: string;
    scheduled: number;
    hadir: number;
    terlambat: number;
    pulangAwal: number;
    belumCheckout: number;
    izin: number;
    sakit: number;
    alpa: number;
    belumAbsen: number;
    lateMinutes: number;
  }[];
  problemAreas: {
    date: string;
    shift: ShiftType;
    reportId: string;
    areaKey: string;
    areaLabel: string;
    note: string;
    picName: string;
    followupStatus: CleanlinessFollowupStatus;
    followupPic: string | null;
    resolvedAt: string | null;
  }[];
}

/** Satu entri jejak audit koreksi absensi. */
export interface AttendanceAuditEntry {
  id: string;
  attendanceId: string;
  action: string;
  actorId: string;
  actorEmail: string;
  actorName: string;
  reason: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

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
  | 'reports'
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
  cleanlinessFollowups?: CleanlinessFollowup[];
  itemReports: ItemReport[];
}
