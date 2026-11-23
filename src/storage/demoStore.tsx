import React, { useEffect, useMemo, useState } from 'react';
import {
  KitchenContext,
  type AuthUserLike,
  type KitchenContextValue,
  type WorkspaceAccessStatus,
  type WorkspaceSummary,
} from './kitchenContext';
import { buildDemoState, DEMO_WORKSPACE_ID } from '../utils/demoData';
import { getRealWibNow } from '../utils/wibTime';
import type {
  AttendanceRecord,
  CleanlinessAreaEntry,
  ItemReport,
  KitchenLogState,
  ShiftType,
  SupervisorAbsenceStatus,
  UserAccount,
} from '../types/kitchen';

/**
 * KitchenProvider versi DEMO.
 *
 * Dipakai saat aplikasi dijalankan tanpa Firebase (npm run dev:demo).
 * Semua data ada di memori browser: tidak ada panggilan ke Firestore, tidak
 * ada autentikasi, dan tidak ada data yang dikirim ke mana pun. Setiap
 * perubahan hilang saat halaman dimuat ulang.
 *
 * Tujuannya hanya untuk meninjau tampilan sebelum hosting.
 */

/**
 * Pengguna demo. Bisa diganti lewat ?as=pic-opening untuk melihat tampilan
 * dari sudut pandang PIC Opening (yang memiliki tombol Susun Ringkasan).
 */
function resolveDemoUser(): UserAccount {
  const as = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('as')
    : null;
  if (as === 'pic-opening') {
    return {
      id: 'u-pic-opening',
      name: 'Budi Santoso',
      email: 'budi@kitchenlog.demo',
      role: 'staff',
      jobTitle: 'PIC Opening',
    };
  }
  return {
    id: 'u-supervisor',
    name: 'Bagus Azha R.',
    email: 'bagusazhareko@gmail.com',
    role: 'supervisor',
    jobTitle: 'Supervisor Dapur',
  };
}

const DEMO_USER: UserAccount = resolveDemoUser();

const DEMO_WORKSPACES: WorkspaceSummary[] = [
  { id: DEMO_WORKSPACE_ID, kitchenName: 'Dapur Demo (Mode Demo)' },
];

const DEMO_WORKSPACE_LABEL = 'Dapur Demo (Mode Demo)';

function stamp(date: string): string {
  const now = getRealWibNow();
  return `${date} ${now.timeHHMM} WIB`;
}

export const DemoKitchenProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<KitchenLogState>(() => buildDemoState());
  const [tick, setTick] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [workspaceAccessStatus] = useState<WorkspaceAccessStatus>('ready');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(DEMO_WORKSPACE_ID);

  // Jam WIB ikut berjalan, sama seperti mode Firebase.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Toast hilang sendiri.
  useEffect(() => {
    if (!toastMessage) return;
    const id = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(id);
  }, [toastMessage]);

  const nowWib = useMemo(() => {
    void tick;
    return getRealWibNow();
  }, [tick]);

  const showToast = (msg: string) => setToastMessage(msg);

  // --- Aksi tulis: hanya mengubah state di memori -------------------------

  const submitCleanlinessReport = async (payload: {
    date: string;
    shift: ShiftType;
    picId: string;
    picName: string;
    areas: CleanlinessAreaEntry[];
    generalPhotoId: string;
    handoverNote: string;
    confirmedAiSummary?: string | null;
    aiSummaryConfirmedAt?: string | null;
    aiSummaryConfirmedBy?: string | null;
  }) => {
    const now = getRealWibNow();
    setState((prev) => ({
      ...prev,
      cleanlinessReports: [
        ...prev.cleanlinessReports.filter(
          (r) => !(r.date === payload.date && r.shift === payload.shift)
        ),
        {
          id: `clean-${payload.date}-${payload.shift}`,
          date: payload.date,
          shift: payload.shift,
          picId: payload.picId,
          picEmail: DEMO_USER.email,
          picName: payload.picName,
          submittedAt: `${now.date} ${now.timeHHMM} WIB`,
          submittedTimeHHMM: now.timeHHMM,
          areas: payload.areas,
          generalPhotoId: payload.generalPhotoId,
          handoverNote: payload.handoverNote,
          confirmedAiSummary: payload.confirmedAiSummary ?? null,
          aiSummaryConfirmedAt: payload.aiSummaryConfirmedAt ?? null,
          aiSummaryConfirmedBy: payload.aiSummaryConfirmedBy ?? null,
        },
      ],
    }));
    return { ok: true, message: 'Laporan kebersihan tersimpan (mode demo, hanya di memori).' };
  };

  const confirmOpeningAiSummary = async (
    reportId: string,
    confirmedAiSummary: string,
    handoverNote?: string
  ) => {
    const now = getRealWibNow();
    setState((prev) => ({
      ...prev,
      cleanlinessReports: prev.cleanlinessReports.map((r) =>
        r.id === reportId
          ? {
              ...r,
              confirmedAiSummary,
              aiSummaryConfirmedAt: `${now.date} ${now.timeHHMM} WIB`,
              aiSummaryConfirmedBy: DEMO_USER.name,
              handoverNote: handoverNote ?? r.handoverNote,
            }
          : r
      ),
    }));
    return { ok: true, message: 'Ringkasan serah terima berhasil dikonfirmasi untuk tim Closing.' };
  };

  const createItemReport = async (payload: {
    type: ItemReport['type'];
    itemName: string;
    quantity: number;
    location: string;
    lastKnownLocation: string;
    discoveredAt: string;
    notes: string;
    photoId: string | null;
    reporterId: string;
    reporterName: string;
    shift: ShiftType;
    date: string;
  }) => {
    const id = `item-demo-${Date.now()}`;
    setState((prev) => ({
      ...prev,
      itemReports: [
        {
          id,
          ...payload,
          reporterEmail: DEMO_USER.email,
          status: 'Dilaporkan',
          resolutionNote: '',
          createdAt: stamp(payload.date),
          updatedAt: stamp(payload.date),
        },
        ...prev.itemReports,
      ],
    }));
    return { ok: true, message: 'Laporan barang tersimpan (mode demo, hanya di memori).' };
  };

  const updateItemReportStatus = async (
    reportId: string,
    status: ItemReport['status'],
    resolutionNote?: string
  ) => {
    setState((prev) => ({
      ...prev,
      itemReports: prev.itemReports.map((r) =>
        r.id === reportId
          ? {
              ...r,
              status,
              resolutionNote: resolutionNote ?? r.resolutionNote,
              updatedAt: stamp(r.date),
            }
          : r
      ),
    }));
    return { ok: true, message: `Status laporan diubah menjadi "${status}" (mode demo).` };
  };

  const checkIn = async (assignmentId: string, staffId: string, checkInPhotoId: string) => {
    const now = getRealWibNow();
    const [hh, mm] = now.timeHHMM.split(':').map(Number);
    const minutes = hh * 60 + mm;
    setState((prev) => {
      const exists = prev.attendance.some(
        (a) => a.assignmentId === assignmentId && a.staffId === staffId
      );
      const record: AttendanceRecord = {
        id: `att-demo-${assignmentId}-${staffId}`,
        assignmentId,
        date: now.date,
        shift: prev.assignments.find((a) => a.id === assignmentId)?.shift ?? 'opening',
        staffId,
        staffEmail: prev.users.find((u) => u.id === staffId)?.email ?? '',
        checkInTime: now.timeHHMM,
        checkInMinutes: minutes,
        checkOutTime: null,
        checkOutMinutes: null,
        lateMinutes: 0,
        durationMinutes: null,
        checkInPhotoId: checkInPhotoId || null,
        checkOutPhotoId: null,
        supervisorStatus: null,
        updatedAt: `${now.date} ${now.timeHHMM} WIB`,
      };
      return {
        ...prev,
        attendance: exists
          ? prev.attendance.map((a) =>
              a.assignmentId === assignmentId && a.staffId === staffId
                ? { ...a, checkInTime: now.timeHHMM, checkInMinutes: minutes, checkInPhotoId: checkInPhotoId || null }
                : a
            )
          : [...prev.attendance, record],
      };
    });
    return { ok: true, message: 'Absen masuk tercatat (mode demo, hanya di memori).' };
  };

  const checkOut = async (assignmentId: string, staffId: string, checkOutPhotoId: string) => {
    const now = getRealWibNow();
    const [hh, mm] = now.timeHHMM.split(':').map(Number);
    const minutes = hh * 60 + mm;
    setState((prev) => ({
      ...prev,
      attendance: prev.attendance.map((a) => {
        if (a.assignmentId !== assignmentId || a.staffId !== staffId) return a;
        return {
          ...a,
          checkOutTime: now.timeHHMM,
          checkOutMinutes: minutes,
          durationMinutes: a.checkInMinutes != null ? minutes - a.checkInMinutes : null,
          checkOutPhotoId: checkOutPhotoId || null,
          updatedAt: `${now.date} ${now.timeHHMM} WIB`,
        };
      }),
    }));
    return { ok: true, message: 'Absen keluar tercatat (mode demo, hanya di memori).' };
  };

  const confirmAbsenceStatus = async (
    assignmentId: string,
    staffId: string,
    status: SupervisorAbsenceStatus,
    note?: string
  ) => {
    setState((prev) => {
      const exists = prev.attendance.some(
        (a) => a.assignmentId === assignmentId && a.staffId === staffId
      );
      if (!exists) {
        const now = getRealWibNow();
        const record: AttendanceRecord = {
          id: `att-demo-${assignmentId}-${staffId}`,
          assignmentId,
          date: now.date,
          shift: prev.assignments.find((a) => a.id === assignmentId)?.shift ?? 'opening',
          staffId,
          staffEmail: prev.users.find((u) => u.id === staffId)?.email ?? '',
          checkInTime: null,
          checkInMinutes: null,
          checkOutTime: null,
          checkOutMinutes: null,
          lateMinutes: 0,
          durationMinutes: null,
          supervisorStatus: status,
          supervisorNote: note,
          updatedAt: `${now.date} ${now.timeHHMM} WIB`,
        };
        return { ...prev, attendance: [...prev.attendance, record] };
      }
      return {
        ...prev,
        attendance: prev.attendance.map((a) =>
          a.assignmentId === assignmentId && a.staffId === staffId
            ? { ...a, supervisorStatus: status, supervisorNote: note }
            : a
        ),
      };
    });
    return { ok: true, message: `Status kehadiran diubah menjadi "${status}" (mode demo).` };
  };

  const upsertSchedule = async (
    date: string,
    shift: ShiftType,
    staffIds: string[],
    picId: string
  ) => {
    setState((prev) => {
      const existing = prev.assignments.find((a) => a.date === date && a.shift === shift);
      if (existing) {
        return {
          ...prev,
          assignments: prev.assignments.map((a) =>
            a.id === existing.id ? { ...a, staffIds, picId } : a
          ),
        };
      }
      return {
        ...prev,
        assignments: [
          ...prev.assignments,
          { id: `asg-${date}-${shift}`, date, shift, staffIds, picId },
        ],
      };
    });
    return { ok: true, message: 'Jadwal shift tersimpan (mode demo, hanya di memori).' };
  };

  const addStaffMember = async (payload: {
    name: string;
    email: string;
    role: UserAccount['role'];
    jobTitle: string;
  }) => {
    setState((prev) => ({
      ...prev,
      users: [
        ...prev.users,
        { id: `u-demo-${Date.now()}`, ...payload },
      ],
    }));
    return { ok: true, message: 'Anggota tim ditambahkan (mode demo, hanya di memori).' };
  };

  const updateStaffMember = async (
    staffId: string,
    payload: { name: string; email: string; role: UserAccount['role']; jobTitle: string }
  ) => {
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === staffId ? { ...u, ...payload } : u)),
    }));
    return { ok: true, message: 'Data anggota tim diperbarui (mode demo).' };
  };

  const removeStaffMember = async (staffId: string) => {
    setState((prev) => ({ ...prev, users: prev.users.filter((u) => u.id !== staffId) }));
    return { ok: true, message: 'Anggota tim dihapus (mode demo).' };
  };

  const updateKitchenName = async (kitchenName: string) => {
    setState((prev) => ({ ...prev, kitchenName }));
    return { ok: true, message: 'Nama dapur diperbarui (mode demo).' };
  };

  // Aksi yang tidak masuk akal di mode demo: ditolak dengan pesan jelas.
  const notInDemo = async (): Promise<{ ok: boolean; message: string }> => ({
    ok: false,
    message: 'Aksi ini tidak tersedia di mode demo. Jalankan mode Firebase untuk memakainya.',
  });

  const value: KitchenContextValue = {
    state,
    workspaces: DEMO_WORKSPACES,
    activeWorkspaceId,
    firebaseUser: {
      uid: DEMO_USER.id,
      email: DEMO_USER.email,
      displayName: DEMO_USER.name,
      photoURL: null,
      emailVerified: true,
    } satisfies AuthUserLike,
    authReady: true,
    workspaceLoading: false,
    workspaceAccessStatus,
    authError: null,
    currentUser: DEMO_USER,
    nowWib,
    toastMessage,
    canDeleteActiveWorkspace: false,
    showToast,
    signInWithGoogle: async () => {
      showToast('Mode demo: login tidak diperlukan.');
    },
    signInWithEmail: async () => {
      showToast('Mode demo: login tidak diperlukan.');
    },
    signUpWithEmail: async () => ({
      ok: false,
      message: 'Mode demo: pendaftaran tidak tersedia. Jalankan mode Firebase untuk mendaftar.',
    }),
    sendResetPassword: async () => ({
      ok: false,
      message: 'Mode demo: atur ulang password tidak tersedia.',
    }),
    signOutGoogle: async () => {
      showToast('Mode demo: keluar dinonaktifkan. Muat ulang halaman untuk mengatur ulang data.');
    },
    switchWorkspace: (workspaceId: string) => setActiveWorkspaceId(workspaceId),
    recheckWorkspaceAccess: async () => {},
    createOwnWorkspace: notInDemo,
    addKitchenWorkspace: notInDemo,
    deleteWorkspace: notInDemo,
    updateKitchenName,
    addStaffMember,
    updateStaffMember,
    removeStaffMember,
    checkIn,
    checkOut,
    confirmAbsenceStatus,
    upsertSchedule,
    submitCleanlinessReport,
    confirmOpeningAiSummary,
    createItemReport,
    updateItemReportStatus,
  };

  return <KitchenContext.Provider value={value}>{children}</KitchenContext.Provider>;
};
