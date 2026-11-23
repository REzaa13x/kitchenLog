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
    const res = await fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg = data?.error || `Permintaan gagal (HTTP ${res.status}).`;
      const err = new Error(msg) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return data as T;
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
  const loadWorkspaceData = async (wsId: string, tkn: string) => {
    setWorkspaceLoading(true);
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
        itemReports: data.itemReports ?? [],
      });
      setAccessStatus('ready');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Gagal memuat data dapur.');
      setAccessStatus('uninvited');
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
      if (token && activeWorkspaceId) await loadWorkspaceData(activeWorkspaceId, token);
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
    checkInPhotoId: string
  ): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(
      async () => {
        await call('/attendance/check-in', {
          method: 'POST',
          body: { workspaceId: ctx.wsId, assignmentId, staffId, photoId: checkInPhotoId || null },
        });
      },
      'Absen masuk tercatat.'
    );
  };

  const checkOut = async (
    assignmentId: string,
    staffId: string,
    checkOutPhotoId: string
  ): Promise<ActionResult> => {
    const ctx = requireReady();
    if (!ctx) return { ok: false, message: 'Silakan masuk terlebih dahulu.' };
    return wrap(
      async () => {
        await call('/attendance/check-out', {
          method: 'POST',
          body: { workspaceId: ctx.wsId, assignmentId, staffId, photoId: checkOutPhotoId || null },
        });
      },
      'Absen keluar tercatat.'
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

  const value: KitchenContextValue = {
    state,
    workspaces,
    activeWorkspaceId,
    firebaseUser: toAuthUser(apiUser),
    authReady,
    workspaceLoading,
    workspaceAccessStatus: accessStatus,
    authError,
    currentUser: toAccount(apiUser),
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
