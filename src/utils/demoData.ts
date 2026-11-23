import type {
  AttendanceRecord,
  CleanlinessAreaEntry,
  CleanlinessReport,
  ItemReport,
  KitchenLogState,
  ShiftAssignment,
  UserAccount,
} from '../types/kitchen';
import { CLEANLINESS_AREAS_TEMPLATE } from './cleanlinessTemplate';

/**
 * Data contoh untuk MODE DEMO — hanya dipakai saat aplikasi dijalankan tanpa
 * Firebase (lihat src/storage/demoStore.tsx). Semua data ada di memori:
 * tidak ada yang dikirim ke Firestore, tidak ada yang tersimpan permanen.
 *
 * Tanggal sengaja memakai tanggal hari ini (WIB) supaya halaman "Hari Ini"
 * langsung menampilkan isi, bukan keadaan kosong.
 */

export const DEMO_WORKSPACE_ID = 'demo-dapur';

function todayWib(): string {
  const now = new Date();
  const wib = new Date(now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60_000);
  return wib.toISOString().slice(0, 10);
}

export function buildDemoState(): KitchenLogState {
  const date = todayWib();

  const users: UserAccount[] = [
    { id: 'u-supervisor', name: 'Bagus Azha R.', email: 'bagusazhareko@gmail.com', role: 'supervisor', jobTitle: 'Supervisor Dapur' },
    { id: 'u-pic-opening', name: 'Budi Santoso', email: 'budi@kitchenlog.demo', role: 'staff', jobTitle: 'PIC Opening' },
    { id: 'u-pic-closing', name: 'Sari Wulandari', email: 'sari@kitchenlog.demo', role: 'staff', jobTitle: 'PIC Closing' },
    { id: 'u-cook', name: 'Andi Pratama', email: 'andi@kitchenlog.demo', role: 'staff', jobTitle: 'Juru Masak' },
    { id: 'u-support', name: 'Rina Kartika', email: 'rina@kitchenlog.demo', role: 'staff', jobTitle: 'Support' },
  ];

  const assignments: ShiftAssignment[] = [
    { id: 'asg-open', date, shift: 'opening', staffIds: ['u-pic-opening', 'u-cook', 'u-support'], picId: 'u-pic-opening' },
    { id: 'asg-close', date, shift: 'closing', staffIds: ['u-pic-closing', 'u-cook'], picId: 'u-pic-closing' },
  ];

  const attendance: AttendanceRecord[] = [
    {
      id: 'att-1', assignmentId: 'asg-open', date, shift: 'opening', staffId: 'u-pic-opening',
      staffEmail: 'budi@kitchenlog.demo', checkInTime: '05:52', checkInMinutes: 352,
      checkOutTime: '12:05', checkOutMinutes: 725, lateMinutes: 0, durationMinutes: 373,
      checkInPhotoId: null, checkOutPhotoId: null, supervisorStatus: null, updatedAt: `${date} 12:05 WIB`,
    },
    {
      id: 'att-2', assignmentId: 'asg-open', date, shift: 'opening', staffId: 'u-cook',
      staffEmail: 'andi@kitchenlog.demo', checkInTime: '06:18', checkInMinutes: 378,
      checkOutTime: null, checkOutMinutes: null, lateMinutes: 18, durationMinutes: null,
      checkInPhotoId: null, checkOutPhotoId: null, supervisorStatus: null, updatedAt: `${date} 06:18 WIB`,
    },
    {
      id: 'att-3', assignmentId: 'asg-open', date, shift: 'opening', staffId: 'u-support',
      staffEmail: 'rina@kitchenlog.demo', checkInTime: null, checkInMinutes: null,
      checkOutTime: null, checkOutMinutes: null, lateMinutes: 0, durationMinutes: null,
      checkInPhotoId: null, checkOutPhotoId: null, supervisorStatus: 'Izin',
      supervisorNote: 'Izin keperluan keluarga, sudah memberi kabar sehari sebelumnya.',
      updatedAt: `${date} 05:30 WIB`,
    },
  ];

  const areas: CleanlinessAreaEntry[] = CLEANLINESS_AREAS_TEMPLATE.map((tpl) => {
    const issue = tpl.key === 'wastafel' || tpl.key === 'lantai';
    return {
      key: tpl.key,
      label: tpl.label,
      status: issue ? 'Perlu Ditangani' : 'Sudah Beres',
      note:
        tpl.key === 'wastafel'
          ? 'Saluran agak mampet, air menggenang setelah dipakai'
          : tpl.key === 'lantai'
            ? 'Ada genangan di dekat wastafel, licin'
            : '',
      photoId: null,
    };
  });

  const cleanlinessReports: CleanlinessReport[] = [
    {
      id: 'clean-open', date, shift: 'opening', picId: 'u-pic-opening',
      picEmail: 'budi@kitchenlog.demo', picName: 'Budi Santoso',
      submittedAt: '23 Nov 2026, 11.45 WIB', submittedTimeHHMM: '11:45',
      areas,
      generalPhotoId: 'demo-photo-1',
      handoverNote: 'Stok saus dasar di chiller rak 2 sudah siap. Kompor kanan api agak kecil, perlu dicek teknisi.',
      confirmedAiSummary: null,
      aiSummaryConfirmedAt: null,
      aiSummaryConfirmedBy: null,
    },
  ];

  const itemReports: ItemReport[] = [
    {
      id: 'item-1', type: 'Barang Hilang', itemName: 'Pisau daging', quantity: 2,
      location: 'Area Potong', lastKnownLocation: 'Rak 2', discoveredAt: `${date} 07:40 WIB`,
      notes: 'Tidak ada di tempat biasa setelah shift kemarin', photoId: null,
      reporterId: 'u-pic-opening', reporterEmail: 'budi@kitchenlog.demo', reporterName: 'Budi Santoso',
      shift: 'opening', date, status: 'Dilaporkan', resolutionNote: '',
      createdAt: `${date} 07:40 WIB`, updatedAt: `${date} 07:40 WIB`,
    },
    {
      id: 'item-2', type: 'Barang Rusak', itemName: 'Blender', quantity: 1,
      location: 'Dapur Panas', lastKnownLocation: '', discoveredAt: `${date} 07:55 WIB`,
      notes: 'Tidak menyala saat dites', photoId: null,
      reporterId: 'u-pic-opening', reporterEmail: 'budi@kitchenlog.demo', reporterName: 'Budi Santoso',
      shift: 'opening', date, status: 'Ditindaklanjuti', resolutionNote: '',
      createdAt: `${date} 07:55 WIB`, updatedAt: `${date} 08:10 WIB`,
    },
    {
      id: 'item-3', type: 'Barang Rusak', itemName: 'Sendok sayur', quantity: 3,
      location: 'Area Masak', lastKnownLocation: '', discoveredAt: `${date} 06:30 WIB`,
      notes: 'Gagang patah', photoId: null,
      reporterId: 'u-cook', reporterEmail: 'andi@kitchenlog.demo', reporterName: 'Andi Pratama',
      shift: 'opening', date, status: 'Selesai',
      resolutionNote: 'Sudah diganti dari stok cadangan',
      createdAt: `${date} 06:30 WIB`, updatedAt: `${date} 09:00 WIB`,
    },
  ];

  return {
    kitchenName: 'Dapur Demo (Mode Demo)',
    users,
    assignments,
    attendance,
    cleanlinessReports,
    itemReports,
  };
}
