import React, { useEffect, useMemo, useState } from 'react';
import {
  KitchenContext,
  type ActionResult,
  type AuthUserLike,
  type KitchenContextValue,
  type WorkspaceAccessStatus,
  type WorkspaceSummary,
} from './kitchenContext';
import { getRealWibNow } from '../utils/wibTime';
import type {
  AttendanceRecord,
  CleanlinessAreaEntry,
  CleanlinessReport,
  ItemReport,
  KitchenLogState,
  ShiftAssignment,
  ShiftType,
  SupervisorAbsenceStatus,
  UserAccount,
} from '../types/kitchen';

/**
 * KitchenProvider berbasis MySQL (API sendiri).
 *
 * Pengganti kitchenStore.tsx yang memakai Firebase. Semua data operasional
 * disimpan di MySQL melalui API (`server/index.js`), dan autentikasi memakai
 * email + password dengan token sesi yang disimpan di localStorage.
 *
 * Keunggulan dibanding versi Firebase:
 * - Tidak butuh Firebase Console (authorized domains, provider, rules).
 * - Login langsung berfungsi di domain mana pun.
 * - Data milik sendiri, bisa dibuka di phpMyAdmin.
 */

import { apiRequest } from '../lib/apiRequest';
import { setActiveMysqlPhotoSyncContext } from './photoDb';

const TOKEN_KEY = 'kitchenlog_token_v1';
const WS_KEY = 'kitchenlog_ws_v1';
const API_BASE = '/api';

interface ApiUser {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: 'staff' | 'supervisor';
  jobTitle: string;
  emailVerified?: boolean;
  username?: string;
}

function toAuthUser(u: ApiUser | null): AuthUserLike | null {
  if (!u) return null;
  return {
    uid: u.id,
    email: u.email,
    displayName: u.name,
    photoURL: null,
    emailVerified: Boolean(u.emailVerified),
  };
}

function toAccount(u: ApiUser | null): UserAccount | null {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    jobTitle: u.jobTitle,
    phone: u.phone ?? undefined,
    username: u.username,
  };
}

const EMPTY_STATE: KitchenLogState = {
  kitchenName: 'KitchenLog',
  users: [],
  assignments: [],
  attendance: [],
  cleanlinessReports: [],
  itemReports: [],
};

export const MysqlKitchenProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [apiUser, setApiUser] = useState<ApiUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    () => localStorage.getItem(WS_KEY)
  );
  const [state, setState] = useState<KitchenLogState>(EMPTY_STATE);
  const [authReady, setAuthReady] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [accessStatus, setAccessStatus] = useState<WorkspaceAccessStatus>('loading');
  const [authError, setAuthError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const nowWib = useMemo(() => {
    void tick;
    return getRealWibNow();
  }, [tick]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const id = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(id);
  }, [toastMessage]);

  const showToast = (msg: string) => setToastMessage(msg);

  /** Panggilan API dengan token; melempar Error berisi pesan server. */
  const call = async <T,>(
    path: string,
    opts: { method?: string; body?: unknown; tokenOverride?: string } = {}
  ): Promise<T> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const activeToken = opts.tokenOverride ?? token;
    if (activeToken) headers.Authorization = `Bearer ${activeToken}`;
    return apiRequest<T>(API_BASE + path, {
      method: opts.method || 'GET', headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });

  };

  const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(WS_KEY);
    setToken(null);
    setApiUser(null);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
    setState(EMPTY_STATE);
    setAccessStatus('signed_out');
  };

  /** Muat daftar workspace + data workspace aktif. */
  const loadWorkspaceData = async (wsId: string, tkn: string, background = false) => {
    if (!background) setWorkspaceLoading(true);
    try {
      const data = await call<KitchenLogState & { kitchenName: string }>(
        `/state?workspaceId=${encodeURIComponent(wsId)}`,
        { tokenOverride: tkn }
      );
      setState({
        kitchenName: data.kitchenName || 'KitchenLog',
        users: data.users ?? [],
        assignments: data.assignments ?? [],
        attendance: data.attendance ?? [],
        cleanlinessReports: data.cleanlinessReports ?? [],
        cleanlinessFollowups: data.cleanlinessFollowups ?? [],
        itemReports: data.itemReports ?? [],
      });
      setAccessStatus('ready');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Gagal memuat data dapur.');
      if (!background) setAccessStatus('uninvited');
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const bootstrap = async (tkn: string) => {
    try {
      const me = await call<{ user: ApiUser; workspaces: WorkspaceSummary[] }>('/auth/me', {
        tokenOverride: tkn,
      });
      setApiUser(me.user);
      const list = me.workspaces ?? [];
      setWorkspaces(list);

      if (list.length === 0) {
        setAccessStatus('uninvited');
        setAuthReady(true);
        return;
      }
      const saved = localStorage.getItem(WS_KEY);
      const chosen = list.find((w: WorkspaceSummary) => w.id === saved) ?? list[0];
      setActiveWorkspaceId(chosen.id);
      localStorage.setItem(WS_KEY, chosen.id);
      await loadWorkspaceData(chosen.id, tkn);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sesi berakhir.');
      clearSession();
    } finally {
      setAuthReady(true);
    }
  };

  useEffect(() => {
    if (!token) {
      setAuthReady(true);
      setAccessStatus('signed_out');
      return;
    }
    void bootstrap(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Bukti foto harus tersimpan di server agar Admin di perangkat lain bisa
  // membukanya dan bukti tidak hilang saat cache browser dibersihkan.
  useEffect(() => {
    if (token && activeWorkspaceId) {
      setActiveMysqlPhotoSyncContext({ workspaceId: activeWorkspaceId, token });
    } else {
      setActiveMysqlPhotoSyncContext(null);
    }
    return () => setActiveMysqlPhotoSyncContext(null);
  }, [token, activeWorkspaceId]);

  // ---------- Autentikasi ----------

  const signInWithEmail = async (email: string, password: string) => {
    setAuthError(null);
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: email.trim().toLowerCase(), password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Gagal masuk.');
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    showToast('Berhasil masuk.');
  };

  const signUpWithEmail = async (payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }): Promise<ActionResult> => {
    setAuthError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, message: data?.error || 'Gagal mendaftar.' };
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      showToast('Akun berhasil dibuat. Selamat datang!');
      return { ok: true, message: 'Akun berhasil dibuat.' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Gagal mendaftar.' };
    }
  };

  const sendResetPassword = async (email: string): Promise<ActionResult> => {
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, message: data?.error || 'Gagal memproses permintaan.' };
      return {
        ok: true,
        message:
          'Permintaan diterima. Jika email tersebut terdaftar, tautan atur ulang sudah dibuat.',
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Gagal memproses.' };
    }
  };

  const signInWithGoogle = async () => {
    setAuthError(
      'Login Google tidak tersedia pada mode MySQL. Gunakan email dan password.'
    );
  };

  const signOutGoogle = async () => {
    try {
      if (token) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // abaikan: sesi lokal tetap dibersihkan
    }
    clearSession();
    showToast('Anda telah keluar.');
  };

  const switchWorkspace = (workspaceId: string) => {
    if (!token) return;
    setActiveWorkspaceId(workspaceId);
    localStorage.setItem(WS_KEY, workspaceId);
    void loadWorkspaceData(workspaceId, token);
  };

  const recheckWorkspaceAccess = async () => {
    if (!token) return;
    await bootstrap(token);
  };

  // ---------- Aksi data ----------

  const requireReady = (): { wsId: string; tkn: string } | null => {
    if (!token || !activeWorkspaceId) {
      showToast('Silakan masuk terlebih dahulu.');
      return null;
    }
    return { wsId: activeWorkspaceId, tkn: token };
  };

  const wrap = async (fn: () => Promise<void>, successMsg: string): Promise<ActionResult> => {
    try {
      await fn();
      if (token && activeWorkspaceId) await loadWorkspaceData(activeWorkspaceId, token, true);
      showToast(successMsg);
      return { ok: true, message: successMsg };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan.';
      setAuthError(msg);
      return { ok: false, message: msg };
    }
  };

  const createOwnWorkspace = async (kitchenName: string): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(async () => {
      await call('/workspaces', { method: 'POST', body: { kitchenName } });
      await bootstrap(ctx.tkn);
    }, `Ruang kerja "${kitchenName}" dibuat.`);
  };

  const addKitchenWorkspace = createOwnWorkspace;

  const deleteWorkspace = async (workspaceId: string): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(async () => {
      await call(`/workspaces/${encodeURIComponent(workspaceId)}`, { method: 'DELETE' });
      await bootstrap(ctx.tkn);
    }, 'Ruang kerja dihapus.');
  };

  const updateKitchenName = async (kitchenName: string): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(async () => {
      await call(`/workspaces/${encodeURIComponent(ctx.wsId)}`, {
        method: 'PATCH',
        body: { kitchenName },
      });
    }, 'Nama dapur diperbarui.');
  };

  const syncGeasteatsStaff = async (): Promise<ActionResult> => {
    if (!requireReady()) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(async () => { await call('/integrations/geasteats/sync', { method: 'POST' }); }, 'Staf Geasteats disinkronkan.');
  };

  const addStaffMember = async (payload: {
    name: string;
    email: string;
    role: UserAccount['role'];
    jobTitle: string;
  }): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(
      async () => {
        await call('/staff', { method: 'POST', body: { workspaceId: ctx.wsId, ...payload } });
      },
      'Anggota tim ditambahkan.'
    );
  };

  const updateStaffMember = async (
    staffId: string,
    payload: { name: string; email: string; role: UserAccount['role']; jobTitle: string }
  ): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(
      async () => {
        await call(`/staff/${encodeURIComponent(staffId)}`, {
          method: 'PATCH',
          body: { workspaceId: ctx.wsId, ...payload },
        });
      },
      'Data anggota tim diperbarui.'
    );
  };

  const removeStaffMember = async (staffId: string): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(
      async () => {
        await call(`/staff/${encodeURIComponent(staffId)}?workspaceId=${encodeURIComponent(ctx.wsId)}`, {
          method: 'DELETE',
        });
      },
      'Anggota tim dihapus.'
    );
  };

  const checkIn = async (
    assignmentId: string,
    staffId: string,
    checkInPhotoId: string,
    cleanliness?: import('../types/kitchen').AttendanceCleanliness,
    clientRef?: string,
    kitchenPhotoId?: string
  ): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(
      async () => {
        await call('/attendance/check-in', {
          method: 'POST',
          body: { workspaceId: ctx.wsId, assignmentId, staffId, photoId: checkInPhotoId || null, ...(cleanliness ? { cleanliness } : {}), ...(clientRef ? { clientRef } : {}), ...(kitchenPhotoId ? { kitchenPhotoId } : {}) },
        });
      },
      'Absen masuk tercatat.'
    );
  };

  const checkOut = async (
    assignmentId: string,
    staffId: string,
    checkOutPhotoId: string,
    cleanliness?: import('../types/kitchen').AttendanceCleanliness,
    clientRef?: string,
    kitchenPhotoId?: string
  ): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(
      async () => {
        await call('/attendance/check-out', {
          method: 'POST',
          body: { workspaceId: ctx.wsId, assignmentId, staffId, photoId: checkOutPhotoId || null, ...(cleanliness ? { cleanliness } : {}), ...(clientRef ? { clientRef } : {}), ...(kitchenPhotoId ? { kitchenPhotoId } : {}) },
        });
      },
      'Absen keluar tercatat.'
    );
  };

  const correctAttendance = async (payload: {
    attendanceId?: string;
    assignmentId?: string;
    staffId?: string;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    clearCheckIn?: boolean;
    clearCheckOut?: boolean;
    supervisorStatus?: SupervisorAbsenceStatus | null;
    supervisorNote?: string;
    reason: string;
  }): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(
      async () => {
        await call('/attendance/correction', { method: 'POST', body: { workspaceId: ctx.wsId, ...payload } });
      },
      'Koreksi absensi tersimpan beserta jejak audit.'
    );
  };

  const fetchAttendanceAudit = async (attendanceId?: string): Promise<import('../types/kitchen').AttendanceAuditEntry[]> => {
    const ctx = requireReady();
    if (!ctx) return [];
    try {
      const query = `?workspaceId=${encodeURIComponent(ctx.wsId)}${attendanceId ? `&attendanceId=${encodeURIComponent(attendanceId)}` : ''}`;
      const data = await call<{ audit: import('../types/kitchen').AttendanceAuditEntry[] }>(`/attendance/audit${query}`);
      return data.audit ?? [];
    } catch {
      return [];
    }
  };

  const fetchOperationalReport = async (params: {
    from: string;
    to: string;
    staffId?: string;
  }): Promise<import('../types/kitchen').OperationalReport | null> => {
    const ctx = requireReady();
    if (!ctx) return null;
    const query = new URLSearchParams({ workspaceId: ctx.wsId, from: params.from, to: params.to });
    if (params.staffId) query.set('staffId', params.staffId);
    return call<import('../types/kitchen').OperationalReport>(`/reports/operational?${query.toString()}`);
  };

  const updateCleanlinessFollowup = async (payload: {
    id: string;
    status?: import('../types/kitchen').CleanlinessFollowupStatus;
    picId?: string | null;
    resolutionNote?: string;
    resolutionPhotoId?: string | null;
  }): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    const { id, ...rest } = payload;
    return wrap(
      async () => {
        await call(`/cleanliness/followups/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: { workspaceId: ctx.wsId, ...rest },
        });
      },
      'Tindak lanjut kebersihan diperbarui.'
    );
  };

  const confirmAbsenceStatus = async (
    assignmentId: string,
    staffId: string,
    status: SupervisorAbsenceStatus,
    note?: string
  ): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(
      async () => {
        await call('/attendance/absence', {
          method: 'POST',
          body: { workspaceId: ctx.wsId, assignmentId, staffId, status, note },
        });
      },
      `Status kehadiran diubah menjadi "${status}".`
    );
  };

  const upsertSchedule = async (
    date: string,
    shift: ShiftType,
    staffIds: string[],
    picId: string
  ): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(
      async () => {
        await call('/assignments', {
          method: 'POST',
          body: { workspaceId: ctx.wsId, date, shift, staffIds, picId },
        });
      },
      'Jadwal shift tersimpan.'
    );
  };

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
  }): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(
      async () => {
        await call('/cleanliness', { method: 'POST', body: { workspaceId: ctx.wsId, ...payload } });
      },
      'Laporan kebersihan terkirim.'
    );
  };

  const confirmOpeningAiSummary = async (
    reportId: string,
    confirmedAiSummary: string,
    handoverNote?: string
  ): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(
      async () => {
        await call(`/cleanliness/${encodeURIComponent(reportId)}/confirm-summary`, {
          method: 'POST',
          body: { workspaceId: ctx.wsId, summary: confirmedAiSummary, handoverNote },
        });
      },
      'Ringkasan serah terima berhasil dikonfirmasi untuk tim Closing.'
    );
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
  }): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(
      async () => {
        await call('/items', { method: 'POST', body: { workspaceId: ctx.wsId, ...payload } });
      },
      'Laporan barang tersimpan.'
    );
  };

  const updateItemReportStatus = async (
    reportId: string,
    status: ItemReport['status'],
    resolutionNote?: string
  ): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(
      async () => {
        await call(`/items/${encodeURIComponent(reportId)}/status`, {
          method: 'PATCH',
          body: { workspaceId: ctx.wsId, status, resolutionNote },
        });
      },
      `Status laporan diubah menjadi "${status}".`
    );
  };

  const submitMyCleanliness = async (payload: {
    date: string;
    shift: ShiftType;
    cleanliness: import('../types/kitchen').AttendanceCleanliness;
  }): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(
      async () => {
        await call('/cleanliness/my-checklist', {
          method: 'POST',
          body: { workspaceId: ctx.wsId, ...payload },
        });
      },
      'Checklist kebersihan Anda tersimpan.'
    );
  };

  const fetchShiftTasks = async (payload: { date: string; shift: ShiftType }) => {
    const ctx = requireReady();
    if (!ctx) return null;
    try {
      const query = `?workspaceId=${encodeURIComponent(ctx.wsId)}&date=${encodeURIComponent(payload.date)}&shift=${encodeURIComponent(payload.shift)}`;
      const data = await call<{
        tasks: { key: string; label: string; detail?: string }[];
        progress: { staffId: string; taskKey: string; done: boolean; note?: string }[];
      }>(`/shift-tasks${query}`);
      return { tasks: data?.tasks ?? [], progress: data?.progress ?? [] };
    } catch {
      return null;
    }
  };

  const toggleShiftTask = async (payload: { date: string; shift: ShiftType; taskKey: string; done: boolean; note?: string }): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    try {
      // Sengaja TIDAK memakai `wrap`: wrap memuat ulang seluruh /api/state
      // (semua user, absensi, laporan) setiap centang, sehingga terasa lemot.
      // Centang hanya mengubah satu baris, jadi cukup satu PATCH ringan.
      await call('/shift-tasks', { method: 'PATCH', body: { workspaceId: ctx.wsId, ...payload } });
      return { ok: true, message: payload.done ? 'Tugas ditandai selesai.' : 'Tanda selesai dibatalkan.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan centang.';
      return { ok: false, message: msg };
    }
  };

  const value: KitchenContextValue = {
    state,
    workspaces,
    activeWorkspaceId,
    firebaseUser: toAuthUser(apiUser),
    authReady,
    workspaceLoading,
    workspaceAccessStatus: accessStatus,
    authError,
    currentUser: apiUser ? { ...toAccount(apiUser)!, role: state.users.find(u => u.id === apiUser.id)?.role ?? 'staff' } : null,
    nowWib,
    toastMessage,
    canDeleteActiveWorkspace: workspaces.length > 1,
    showToast,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendResetPassword,
    signOutGoogle,
    switchWorkspace,
    recheckWorkspaceAccess,
    createOwnWorkspace,
    addKitchenWorkspace,
    deleteWorkspace,
    updateKitchenName,
    addStaffMember,
    syncGeasteatsStaff,
    updateStaffMember,
    removeStaffMember,
    checkIn,
    checkOut,
    correctAttendance,
    fetchAttendanceAudit,
    fetchOperationalReport,
    updateCleanlinessFollowup,
    submitMyCleanliness,
    fetchShiftTasks,
    toggleShiftTask,
    confirmAbsenceStatus,
    upsertSchedule,
    submitCleanlinessReport,
    confirmOpeningAiSummary,
    createItemReport,
    updateItemReportStatus,
  };

  return <KitchenContext.Provider value={value}>{children}</KitchenContext.Provider>;
};
