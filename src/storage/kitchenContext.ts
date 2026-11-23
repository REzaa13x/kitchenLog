import { createContext, useContext } from 'react';
import type {
  AttendanceRecord,
  CleanlinessAreaEntry,
  CleanlinessReport,
  ItemReport,
  ItemReportStatus,
  ItemReportType,
  KitchenLogState,
  ShiftAssignment,
  ShiftType,
  SupervisorAbsenceStatus,
  UserAccount,
  UserRole,
} from '../types/kitchen';

/**
 * Definisi konteks KitchenLog.
 *
 * File ini sengaja TIDAK mengimpor apa pun dari Firebase, supaya mode demo
 * (src/storage/demoStore.tsx) bisa memakai tipe & konteks yang sama tanpa
 * menarik modul Firebase ke dalam bundle.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

export type WorkspaceAccessStatus = 'loading' | 'signed_out' | 'uninvited' | 'ready';

export interface WorkspaceSummary {
  id: string;
  kitchenName: string;
}

/**
 * Bentuk minimal pengguna hasil autentikasi yang dibutuhkan aplikasi.
 * Di mode Firebase ini diisi objek User dari firebase/auth.
 */
export interface AuthUserLike {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

export interface KitchenContextValue {
  state: KitchenLogState;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  firebaseUser: AuthUserLike | null;
  authReady: boolean;
  workspaceLoading: boolean;
  workspaceAccessStatus: WorkspaceAccessStatus;
  authError: string | null;
  currentUser: UserAccount | null;
  nowWib: {
    date: string;
    timeHHMM: string;
    minutes: number;
  };
  toastMessage: string | null;
  canDeleteActiveWorkspace: boolean;
  showToast: (msg: string) => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }) => Promise<ActionResult>;
  sendResetPassword: (email: string) => Promise<ActionResult>;
  signOutGoogle: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => void;
  recheckWorkspaceAccess: () => Promise<void>;
  createOwnWorkspace: (kitchenName: string) => Promise<ActionResult>;
  addKitchenWorkspace: (kitchenName: string) => Promise<ActionResult>;
  deleteWorkspace: (workspaceId: string) => Promise<ActionResult>;
  updateKitchenName: (kitchenName: string) => Promise<ActionResult>;
  addStaffMember: (payload: {
    name: string;
    email: string;
    role: UserRole;
    jobTitle: string;
    username?: string;
    password?: string;
  }) => Promise<ActionResult>;
  updateStaffMember: (
    staffId: string,
    payload: {
      name: string;
      email: string;
      role: UserRole;
      jobTitle: string;
      username?: string;
      password?: string;
    }
  ) => Promise<ActionResult>;
  removeStaffMember: (staffId: string) => Promise<ActionResult>;
  checkIn: (assignmentId: string, staffId: string, checkInPhotoId: string, cleanliness: import('../types/kitchen').AttendanceCleanliness) => Promise<ActionResult>;
  checkOut: (assignmentId: string, staffId: string, checkOutPhotoId: string, cleanliness: import('../types/kitchen').AttendanceCleanliness) => Promise<ActionResult>;
  confirmAbsenceStatus: (
    assignmentId: string,
    staffId: string,
    status: SupervisorAbsenceStatus,
    note?: string
  ) => Promise<ActionResult>;
  upsertSchedule: (
    date: string,
    shift: ShiftType,
    staffIds: string[],
    picId: string
  ) => Promise<ActionResult>;
  submitCleanlinessReport: (payload: {
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
  }) => Promise<ActionResult>;
  confirmOpeningAiSummary: (
    reportId: string,
    confirmedAiSummary: string,
    handoverNote?: string
  ) => Promise<ActionResult>;
  createItemReport: (payload: {
    type: ItemReportType;
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
  }) => Promise<ActionResult>;
  updateItemReportStatus: (
    reportId: string,
    status: ItemReportStatus,
    resolutionNote?: string
  ) => Promise<ActionResult>;
}

export const KitchenContext = createContext<KitchenContextValue | null>(null);

export function useKitchen(): KitchenContextValue {
  const ctx = useContext(KitchenContext);
  if (!ctx) {
    throw new Error('useKitchen harus digunakan di dalam KitchenProvider');
  }
  return ctx;
}
