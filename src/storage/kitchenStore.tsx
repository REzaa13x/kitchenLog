import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
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
import {
  calculateLateMinutes,
  formatDateIndo,
  formatTimeDotWib,
  getRealWibNow,
  hasShiftEnded,
  SHIFT_META,
} from '../utils/wibTime';
import { setActivePhotoSyncContext } from './photoDb';
import { mapAuthError } from '../utils/authValidation';
import {
  KitchenContext,
  useKitchen,
} from './kitchenContext';
import type {
  ActionResult,
  KitchenContextValue,
  WorkspaceAccessStatus,
  WorkspaceSummary,
} from './kitchenContext';

export { KitchenContext, useKitchen };
export type { ActionResult, KitchenContextValue, WorkspaceAccessStatus, WorkspaceSummary };


const BOOTSTRAP_ADMIN_EMAIL = 'bagusazhareko@gmail.com';
const ACTIVE_WORKSPACE_KEY = 'kitchenlog_active_workspace_v1';
/** Nomor telepon sementara selama proses pendaftaran (dipakai sekali saat profil dibuat). */
const PENDING_PHONE_KEY = 'kitchenlog_pending_phone_v1';
const DEFAULT_KITCHENS: Array<{ id: string; name: string }> = [
  { id: 'dapur-coworking', name: 'Dapur Coworking' },
  { id: 'dapur-container', name: 'Dapur Container' },
];


interface WorkspaceMeta {
  id: string;
  ownerId: string;
  ownerEmail: string;
  kitchenName: string;
  memberEmails: string[];
  supervisorEmails: string[];
}

function emptyState(): KitchenLogState {
  return {
    kitchenName: 'KitchenLog',
    users: [],
    assignments: [],
    attendance: [],
    cleanlinessReports: [],
    itemReports: [],
  };
}

function stripInternalFields<T extends { ownerId?: string; memberEmails?: string[]; workspaceId?: string }>(
  docData: T
): Omit<T, 'ownerId' | 'memberEmails' | 'workspaceId'> {
  const { ownerId: _o, memberEmails: _m, workspaceId: _w, ...rest } = docData;
  return rest;
}

async function bootstrapWorkspaceInFirestore(
  workspaceId: string,
  user: FirebaseUser,
  kitchenName: string
): Promise<WorkspaceMeta> {
  const email = (user.email || '').trim().toLowerCase();
  const displayName = (user.displayName || email.split('@')[0] || 'Supervisor Dapur').slice(0, 100);
  const memberEmails = [email];
  const supervisorEmails = [email];
  const cleanKitchenName = kitchenName.trim().slice(0, 120) || 'Dapur Utama KitchenLog';

  const workspaceRef = doc(db, 'workspaces', workspaceId);
  const existingWs = await getDoc(workspaceRef);
  if (!existingWs.exists()) {
    await setDoc(workspaceRef, {
      ownerId: user.uid,
      ownerEmail: email,
      kitchenName: cleanKitchenName,
      memberEmails,
      supervisorEmails,
      updatedAt: serverTimestamp(),
    });
  }

  const staffId = `sup-${user.uid}`.slice(0, 128);
  const staffRef = doc(db, 'workspaces', workspaceId, 'staff', staffId);
  const existingStaff = await getDoc(staffRef);
  if (!existingStaff.exists()) {
    await setDoc(staffRef, {
      id: staffId,
      ownerId: user.uid,
      workspaceId,
      memberEmails,
      name: displayName,
      email,
      role: 'supervisor',
      jobTitle: 'Supervisor Operasional',
    });
  }

  return {
    id: workspaceId,
    ownerId: user.uid,
    ownerEmail: email,
    kitchenName: cleanKitchenName,
    memberEmails,
    supervisorEmails,
  };
}

async function syncMemberEmailsAcrossWorkspace(
  workspaceId: string,
  userEmail: string,
  nextMemberEmails: string[]
): Promise<void> {
  const subcollections = [
    'staff',
    'assignments',
    'attendance',
    'cleanlinessReports',
    'itemReports',
    'photos',
  ];

  const docRefs: Array<ReturnType<typeof doc>> = [];
  for (const sub of subcollections) {
    const snap = await getDocs(
      query(
        collection(db, `workspaces/${workspaceId}/${sub}`),
        where('memberEmails', 'array-contains', userEmail)
      )
    );
    snap.docs.forEach((d) => docRefs.push(d.ref));
  }

  const CHUNK_SIZE = 400;
  for (let i = 0; i < docRefs.length; i += CHUNK_SIZE) {
    const chunk = docRefs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((ref) => {
      batch.update(ref, { memberEmails: nextMemberEmails });
    });
    await batch.commit();
  }
}

export const KitchenProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceAccessStatus, setWorkspaceAccessStatus] =
    useState<WorkspaceAccessStatus>('loading');
  const [authError, setAuthError] = useState<string | null>(null);

  const [workspaceRecords, setWorkspaceRecords] = useState<WorkspaceMeta[]>([]);
  const [workspaceMeta, setWorkspaceMeta] = useState<WorkspaceMeta | null>(null);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [cleanlinessReports, setCleanlinessReports] = useState<CleanlinessReport[]>([]);
  const [itemReports, setItemReports] = useState<ItemReport[]>([]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((t) => t + 1), 15000);
    return () => window.clearInterval(interval);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const resolveWorkspaceForUser = async (user: FirebaseUser) => {
    setWorkspaceLoading(true);
    setAuthError(null);
    const userEmail = (user.email || '').trim().toLowerCase();

    try {
      // 1. Ensure PII User Profile exists
      const userRef = doc(db, 'users', user.uid);
      let userSnap;
      try {
        userSnap = await getDoc(userRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      }

      const isAdminEmail = userEmail === BOOTSTRAP_ADMIN_EMAIL;
      if (!userSnap.exists()) {
        try {
          // Nomor telepon opsional: diambil dari metadata pendaftaran bila ada.
          const pendingPhone = localStorage.getItem(PENDING_PHONE_KEY);
          const profile: Record<string, unknown> = {
            uid: user.uid,
            email: (userEmail || 'user@kitchenlog.app').slice(0, 200),
            displayName: (user.displayName || 'Pengguna KitchenLog').slice(0, 120),
            photoURL: (user.photoURL || '').slice(0, 500),
            role: isAdminEmail ? 'supervisor' : 'staff',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (pendingPhone && /^0\d{8,15}$/.test(pendingPhone)) {
            profile.phone = pendingPhone;
          }
          await setDoc(userRef, profile);
          if (pendingPhone) localStorage.removeItem(PENDING_PHONE_KEY);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
        }
      }

      // 2. Find all workspaces where user's verified email is listed in memberEmails
      const fetchUserWorkspaces = async (): Promise<WorkspaceMeta[]> => {
        const wsSnap = await getDocs(
          query(collection(db, 'workspaces'), where('memberEmails', 'array-contains', userEmail))
        );
        return wsSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: String(data.ownerId),
            ownerEmail: String(data.ownerEmail),
            kitchenName: String(data.kitchenName || d.id),
            memberEmails: Array.isArray(data.memberEmails) ? data.memberEmails : [userEmail],
            supervisorEmails: Array.isArray(data.supervisorEmails) ? data.supervisorEmails : [],
          };
        });
      };

      let foundList: WorkspaceMeta[] = [];
      try {
        foundList = await fetchUserWorkspaces();
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'workspaces');
      }

      // 2b. Pendaftar mandiri (email/password) yang belum tergabung di dapur mana pun
      //     mendapat ruang kerja pribadi agar tetap bisa memakai aplikasi tanpa
      //     melihat data dapur lain. Isinya hanya miliknya sendiri.
      if (!isAdminEmail && foundList.length === 0) {
        const personalId = `ws-${user.uid}`.slice(0, 128);
        const personalName =
          (user.displayName || userEmail.split('@')[0] || 'Dapur').slice(0, 100) + ' (Pribadi)';
        try {
          await bootstrapWorkspaceInFirestore(personalId, user, personalName);
          foundList = await fetchUserWorkspaces();
        } catch (err) {
          // Jika gagal (mis. aturan menolak), biarkan alur lanjut ke status 'uninvited'.
          console.warn('Gagal menyiapkan ruang kerja pribadi:', err);
        }
      }

      // 3. Ensure Dapur Coworking & Dapur Container exist only on first-time setup
      if (isAdminEmail) {
        let createdOrCleaned = false;

        // Clean up empty legacy 'kitchen-utama' doc if it has no operational data
        const legacyWs = foundList.find((w) => w.id === 'kitchen-utama');
        if (legacyWs && legacyWs.ownerId === user.uid) {
          try {
            const [asgSnap, attSnap, cleanSnap, itemSnap, staffSnap] = await Promise.all([
              getDocs(query(collection(db, 'workspaces/kitchen-utama/assignments'), where('memberEmails', 'array-contains', userEmail))),
              getDocs(query(collection(db, 'workspaces/kitchen-utama/attendance'), where('memberEmails', 'array-contains', userEmail))),
              getDocs(query(collection(db, 'workspaces/kitchen-utama/cleanlinessReports'), where('memberEmails', 'array-contains', userEmail))),
              getDocs(query(collection(db, 'workspaces/kitchen-utama/itemReports'), where('memberEmails', 'array-contains', userEmail))),
              getDocs(query(collection(db, 'workspaces/kitchen-utama/staff'), where('memberEmails', 'array-contains', userEmail))),
            ]);
            const isEmptyLegacy =
              asgSnap.empty &&
              attSnap.empty &&
              cleanSnap.empty &&
              itemSnap.empty &&
              staffSnap.size <= 1;
            if (isEmptyLegacy) {
              for (const sDoc of staffSnap.docs) {
                await deleteDoc(sDoc.ref);
              }
              await deleteDoc(doc(db, 'workspaces', 'kitchen-utama'));
              foundList = foundList.filter((w) => w.id !== 'kitchen-utama');
              createdOrCleaned = true;
            }
          } catch {
            // Keep legacy workspace if check fails
          }
        }

        if (foundList.length === 0) {
          for (const k of DEFAULT_KITCHENS) {
            try {
              await bootstrapWorkspaceInFirestore(k.id, user, k.name);
              createdOrCleaned = true;
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, `workspaces/${k.id}`);
            }
          }
        }

        if (createdOrCleaned) {
          foundList = await fetchUserWorkspaces();
        }
      }

      if (foundList.length > 0) {
        const ordered = [...foundList].sort((a, b) => {
          const order = (id: string) =>
            id === 'dapur-coworking' ? 0 : id === 'dapur-container' ? 1 : 2;
          const diff = order(a.id) - order(b.id);
          return diff !== 0 ? diff : a.kitchenName.localeCompare(b.kitchenName);
        });
        setWorkspaceRecords(ordered);
        const savedId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
        const chosen = ordered.find((w) => w.id === savedId) ?? ordered[0];
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, chosen.id);
        setWorkspaceMeta(chosen);
        setWorkspaceAccessStatus('ready');
        return;
      }

      setWorkspaceRecords([]);
      setWorkspaceMeta(null);
      setWorkspaceAccessStatus('uninvited');
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Gagal memuat ruang kerja KitchenLog.'
      );
      setWorkspaceAccessStatus('uninvited');
    } finally {
      setWorkspaceLoading(false);
      setAuthReady(true);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthError(null);
      if (!user) {
        setFirebaseUser(null);
        setWorkspaceRecords([]);
        setWorkspaceMeta(null);
        setActivePhotoSyncContext(null);
        setUsers([]);
        setAssignments([]);
        setAttendance([]);
        setCleanlinessReports([]);
        setItemReports([]);
        setWorkspaceAccessStatus('signed_out');
        setWorkspaceLoading(false);
        setAuthReady(true);
        return;
      }

      setFirebaseUser(user);
      await resolveWorkspaceForUser(user);
    });

    return () => unsub();
  }, []);

  // Keep photo sync context updated for cross-device uploads & downloads
  useEffect(() => {
    if (!firebaseUser || !workspaceMeta) {
      setActivePhotoSyncContext(null);
      return;
    }
    const userEmail = (firebaseUser.email || '').trim().toLowerCase();
    setActivePhotoSyncContext({
      workspaceId: workspaceMeta.id,
      ownerId: workspaceMeta.ownerId,
      memberEmails: workspaceMeta.memberEmails,
      uploaderEmail: userEmail,
    });
  }, [firebaseUser, workspaceMeta]);

  // Attach real-time Firestore listeners ONLY when authenticated & workspace ready
  useEffect(() => {
    if (!authReady || !firebaseUser || !workspaceMeta || workspaceLoading) return;
    const wsId = workspaceMeta.id;
    const userEmail = (firebaseUser.email || '').trim().toLowerCase();

    const unsubWorkspace = onSnapshot(
      doc(db, 'workspaces', wsId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const updatedMeta: WorkspaceMeta = {
            id: snap.id,
            ownerId: String(data.ownerId),
            ownerEmail: String(data.ownerEmail),
            kitchenName: String(data.kitchenName || 'KitchenLog'),
            memberEmails: Array.isArray(data.memberEmails) ? data.memberEmails : [userEmail],
            supervisorEmails: Array.isArray(data.supervisorEmails) ? data.supervisorEmails : [],
          };
          setWorkspaceMeta(updatedMeta);
          setWorkspaceRecords((prev) =>
            prev.map((w) => (w.id === updatedMeta.id ? updatedMeta : w))
          );
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}`)
    );

    const staffPath = `workspaces/${wsId}/staff`;
    const unsubStaff = onSnapshot(
      query(collection(db, staffPath), where('memberEmails', 'array-contains', userEmail)),
      (snap) => {
        const list = snap.docs.map((d) =>
          stripInternalFields(
            d.data() as UserAccount & {
              ownerId: string;
              memberEmails: string[];
              workspaceId: string;
            }
          )
        );
        setUsers(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, staffPath)
    );

    const asgPath = `workspaces/${wsId}/assignments`;
    const unsubAssignments = onSnapshot(
      query(collection(db, asgPath), where('memberEmails', 'array-contains', userEmail)),
      (snap) => {
        const list = snap.docs.map((d) =>
          stripInternalFields(d.data() as ShiftAssignment & { ownerId: string; memberEmails: string[] })
        );
        setAssignments(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, asgPath)
    );

    const attPath = `workspaces/${wsId}/attendance`;
    const unsubAttendance = onSnapshot(
      query(collection(db, attPath), where('memberEmails', 'array-contains', userEmail)),
      (snap) => {
        const list = snap.docs.map((d) =>
          stripInternalFields(
            d.data() as AttendanceRecord & { ownerId: string; memberEmails: string[] }
          )
        );
        setAttendance(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, attPath)
    );

    const cleanPath = `workspaces/${wsId}/cleanlinessReports`;
    const unsubCleanliness = onSnapshot(
      query(collection(db, cleanPath), where('memberEmails', 'array-contains', userEmail)),
      (snap) => {
        const list = snap.docs.map((d) =>
          stripInternalFields(
            d.data() as CleanlinessReport & { ownerId: string; memberEmails: string[] }
          )
        );
        setCleanlinessReports(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, cleanPath)
    );

    const itemPath = `workspaces/${wsId}/itemReports`;
    const unsubItems = onSnapshot(
      query(collection(db, itemPath), where('memberEmails', 'array-contains', userEmail)),
      (snap) => {
        const list = snap.docs
          .map((d) =>
            stripInternalFields(d.data() as ItemReport & { ownerId: string; memberEmails: string[] })
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setItemReports(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, itemPath)
    );

    return () => {
      unsubWorkspace();
      unsubStaff();
      unsubAssignments();
      unsubAttendance();
      unsubCleanliness();
      unsubItems();
    };
  }, [authReady, firebaseUser, workspaceMeta?.id, workspaceLoading]);

  const activeUserEmail = (firebaseUser?.email || '').trim().toLowerCase();

  const currentUser: UserAccount | null = useMemo(() => {
    if (!firebaseUser || !workspaceMeta) return null;
    const matched = users.find((u) => u.email.toLowerCase() === activeUserEmail);
    if (matched) return matched;
    if (
      workspaceMeta.ownerEmail === activeUserEmail ||
      workspaceMeta.supervisorEmails.includes(activeUserEmail)
    ) {
      return {
        id: `sup-${firebaseUser.uid}`,
        name: firebaseUser.displayName || activeUserEmail.split('@')[0] || 'Supervisor',
        email: activeUserEmail,
        role: 'supervisor',
        jobTitle: 'Supervisor Operasional',
      };
    }
    return null;
  }, [firebaseUser, workspaceMeta, users, activeUserEmail]);

  const state: KitchenLogState = useMemo(() => {
    if (!firebaseUser || !workspaceMeta) return emptyState();
    return {
      kitchenName: workspaceMeta.kitchenName,
      users,
      assignments,
      attendance,
      cleanlinessReports,
      itemReports,
    };
  }, [firebaseUser, workspaceMeta, users, assignments, attendance, cleanlinessReports, itemReports]);

  const nowWib = useMemo(() => {
    void tick;
    return getRealWibNow();
  }, [tick]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Berhasil masuk dengan akun Google.');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Gagal masuk dengan Google. Pastikan pop-up diizinkan.';
      setAuthError(msg);
    }
  };

  /**
   * Masuk dengan email + password.
   * Melempar error agar formulir bisa menampilkan pesan spesifik per kolom.
   */
  const signInWithEmail = async (email: string, password: string) => {
    setAuthError(null);
    await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    showToast('Berhasil masuk.');
  };

  /**
   * Daftar akun baru dengan email + password + nomor telepon.
   *
   * Nomor telepon hanya disimpan sebagai data profil (bukan untuk verifikasi SMS).
   * Pendaftar tanpa undangan akan mendapat ruang kerja pribadi sehingga tidak
   * dapat melihat data dapur lain (lihat resolveWorkspaceForUser langkah 2b).
   */
  const signUpWithEmail = async (payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }): Promise<ActionResult> => {
    setAuthError(null);
    const email = payload.email.trim().toLowerCase();
    const name = payload.name.trim().slice(0, 100);

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, payload.password);
      await updateProfile(cred.user, { displayName: name });

      // Nomor telepon dipakai sekali saat profil Firestore dibuat.
      localStorage.setItem(PENDING_PHONE_KEY, payload.phone);

      // Segarkan agar displayName ikut terbaca oleh onAuthStateChanged.
      await cred.user.reload();

      showToast('Akun berhasil dibuat. Selamat datang di KitchenLog!');
      return { ok: true, message: 'Akun berhasil dibuat.' };
    } catch (err) {
      localStorage.removeItem(PENDING_PHONE_KEY);
      return { ok: false, message: mapAuthError(err) };
    }
  };

  /** Kirim email atur ulang password. */
  const sendResetPassword = async (email: string): Promise<ActionResult> => {
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      // Firebase sengaja membalas sukses untuk email apa pun (anti-enumerasi),
      // jadi pesan dibuat netral: tidak memastikan email itu terdaftar.
      return {
        ok: true,
        message:
          'Permintaan diterima. Jika email tersebut terdaftar, tautan atur ulang sudah dikirim — periksa kotak masuk dan folder spam.',
      };
    } catch (err) {
      return { ok: false, message: mapAuthError(err) };
    }
  };

  const workspaces: WorkspaceSummary[] = useMemo(
    () =>
      workspaceRecords.map((w) => ({
        id: w.id,
        kitchenName: w.kitchenName,
      })),
    [workspaceRecords]
  );

  const switchWorkspace = (workspaceId: string) => {
    const target = workspaceRecords.find((w) => w.id === workspaceId);
    if (!target || target.id === workspaceMeta?.id) return;
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, target.id);
    setUsers([]);
    setAssignments([]);
    setAttendance([]);
    setCleanlinessReports([]);
    setItemReports([]);
    setWorkspaceMeta(target);
    showToast(`Beralih ke ${target.kitchenName}.`);
  };

  const signOutGoogle = async () => {
    await signOut(auth);
    showToast('Anda telah keluar dari akun Google.');
  };

  const recheckWorkspaceAccess = async () => {
    if (!firebaseUser) return;
    await resolveWorkspaceForUser(firebaseUser);
  };

  const createOwnWorkspace = async (kitchenName: string): Promise<ActionResult> => {
    if (!firebaseUser) {
      return { ok: false, message: 'Silakan masuk dengan Google terlebih dahulu.' };
    }
    const cleanName = kitchenName.trim().slice(0, 120);
    if (!cleanName) {
      return { ok: false, message: 'Nama dapur wajib diisi.' };
    }
    const wsId = `ws-${firebaseUser.uid}`.slice(0, 128);
    try {
      setWorkspaceLoading(true);
      const meta = await bootstrapWorkspaceInFirestore(wsId, firebaseUser, cleanName);
      setWorkspaceRecords((prev) => [...prev.filter((w) => w.id !== meta.id), meta]);
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, meta.id);
      setWorkspaceMeta(meta);
      setWorkspaceAccessStatus('ready');
      showToast(`Ruang kerja "${cleanName}" berhasil dibuat.`);
      return { ok: true, message: 'Ruang kerja berhasil dibuat.' };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `workspaces/${wsId}`);
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const addKitchenWorkspace = async (kitchenName: string): Promise<ActionResult> => {
    if (!firebaseUser || currentUser?.role !== 'supervisor') {
      return { ok: false, message: 'Hanya Supervisor yang dapat menambah lokasi dapur.' };
    }
    const cleanName = kitchenName.trim().slice(0, 120);
    if (!cleanName) {
      return { ok: false, message: 'Nama lokasi dapur wajib diisi.' };
    }
    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    const wsId = `dapur-${slug || 'baru'}-${Date.now().toString(36)}`.slice(0, 128);

    try {
      const meta = await bootstrapWorkspaceInFirestore(wsId, firebaseUser, cleanName);
      setWorkspaceRecords((prev) => [...prev.filter((w) => w.id !== meta.id), meta]);
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, meta.id);
      setUsers([]);
      setAssignments([]);
      setAttendance([]);
      setCleanlinessReports([]);
      setItemReports([]);
      setWorkspaceMeta(meta);
      showToast(`Lokasi dapur "${cleanName}" berhasil ditambahkan.`);
      return { ok: true, message: 'Lokasi dapur ditambahkan.' };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `workspaces/${wsId}`);
    }
  };

  const deleteWorkspace = async (workspaceId: string): Promise<ActionResult> => {
    if (!firebaseUser || !workspaceMeta || currentUser?.role !== 'supervisor') {
      return { ok: false, message: 'Hanya Supervisor yang dapat menghapus lokasi dapur.' };
    }
    const target = workspaceRecords.find((w) => w.id === workspaceId);
    if (!target) {
      return { ok: false, message: 'Lokasi dapur tidak ditemukan.' };
    }
    if (target.ownerId !== firebaseUser.uid) {
      return {
        ok: false,
        message: 'Hanya pemilik utama dapur yang dapat menghapus lokasi dapur ini.',
      };
    }
    if (workspaceRecords.length <= 1) {
      return {
        ok: false,
        message: 'Minimal satu lokasi dapur harus tetap tersedia agar sistem dapat digunakan.',
      };
    }

    const nextTarget = workspaceRecords.find((w) => w.id !== workspaceId)!;

    // Pindahkan workspace aktif & lepas listener onSnapshot lebih dulu sebelum menghapus dokumen Firestore
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, nextTarget.id);
    setUsers([]);
    setAssignments([]);
    setAttendance([]);
    setCleanlinessReports([]);
    setItemReports([]);
    setWorkspaceRecords((prev) => prev.filter((w) => w.id !== workspaceId));
    setWorkspaceMeta(nextTarget);

    await new Promise((resolve) => window.setTimeout(resolve, 120));

    const subcollections = [
      'assignments',
      'attendance',
      'cleanlinessReports',
      'itemReports',
      'photos',
      'staff',
    ];

    try {
      const docRefs: Array<ReturnType<typeof doc>> = [];
      for (const sub of subcollections) {
        const snap = await getDocs(
          query(
            collection(db, `workspaces/${workspaceId}/${sub}`),
            where('memberEmails', 'array-contains', activeUserEmail)
          )
        );
        snap.docs.forEach((d) => docRefs.push(d.ref));
      }

      const CHUNK_SIZE = 400;
      for (let i = 0; i < docRefs.length; i += CHUNK_SIZE) {
        const chunk = docRefs.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((ref) => batch.delete(ref));
        await batch.commit();
      }

      await deleteDoc(doc(db, 'workspaces', workspaceId));
      showToast(`Lokasi dapur "${target.kitchenName}" berhasil dihapus.`);
      return { ok: true, message: 'Lokasi dapur berhasil dihapus.' };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `workspaces/${workspaceId}`);
    }
  };

  const updateKitchenName = async (kitchenName: string): Promise<ActionResult> => {
    if (!firebaseUser || !workspaceMeta || currentUser?.role !== 'supervisor') {
      return { ok: false, message: 'Hanya Supervisor yang dapat mengubah nama dapur.' };
    }
    const cleanName = kitchenName.trim().slice(0, 120);
    if (!cleanName) {
      return { ok: false, message: 'Nama dapur tidak boleh kosong.' };
    }
    try {
      await updateDoc(doc(db, 'workspaces', workspaceMeta.id), {
        kitchenName: cleanName,
        updatedAt: serverTimestamp(),
      });
      showToast('Nama dapur berhasil diperbarui.');
      return { ok: true, message: 'Nama dapur diperbarui.' };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `workspaces/${workspaceMeta.id}`);
    }
  };

  const addStaffMember = async (payload: {
    name: string;
    email: string;
    role: UserRole;
    jobTitle: string;
  }): Promise<ActionResult> => {
    if (!firebaseUser || !workspaceMeta || currentUser?.role !== 'supervisor') {
      return { ok: false, message: 'Hanya Supervisor yang dapat menambah anggota tim.' };
    }
    const name = payload.name.trim().slice(0, 100);
    const email = payload.email.trim().toLowerCase().slice(0, 200);
    const jobTitle = payload.jobTitle.trim().slice(0, 120);

    if (!name) return { ok: false, message: 'Nama anggota wajib diisi.' };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, message: 'Masukkan alamat email Google yang valid.' };
    }
    if (!jobTitle) return { ok: false, message: 'Jabatan wajib diisi.' };
    if (users.some((u) => u.email.toLowerCase() === email)) {
      return { ok: false, message: `Email ${email} sudah terdaftar di tim ini.` };
    }
    if (workspaceMeta.memberEmails.length >= 25) {
      return { ok: false, message: 'Batas maksimal 25 anggota aktif per dapur telah tercapai.' };
    }

    const nextMemberEmails = Array.from(new Set([...workspaceMeta.memberEmails, email])).slice(0, 25);
    const nextSupervisorEmails =
      payload.role === 'supervisor'
        ? Array.from(new Set([...workspaceMeta.supervisorEmails, email])).slice(0, 10)
        : workspaceMeta.supervisorEmails;

    const staffId = `staff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const staffPath = `workspaces/${workspaceMeta.id}/staff/${staffId}`;

    try {
      await updateDoc(doc(db, 'workspaces', workspaceMeta.id), {
        memberEmails: nextMemberEmails,
        supervisorEmails: nextSupervisorEmails,
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'workspaces', workspaceMeta.id, 'staff', staffId), {
        id: staffId,
        ownerId: workspaceMeta.ownerId,
        workspaceId: workspaceMeta.id,
        memberEmails: nextMemberEmails,
        name,
        email,
        role: payload.role,
        jobTitle,
      });

      await syncMemberEmailsAcrossWorkspace(workspaceMeta.id, activeUserEmail, nextMemberEmails);
      showToast(`${name} (${email}) ditambahkan ke tim dapur.`);
      return { ok: true, message: 'Anggota berhasil ditambahkan.' };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, staffPath);
    }
  };

  const updateStaffMember = async (
    staffId: string,
    payload: {
      name: string;
      email: string;
      role: UserRole;
      jobTitle: string;
    }
  ): Promise<ActionResult> => {
    if (!firebaseUser || !workspaceMeta || currentUser?.role !== 'supervisor') {
      return { ok: false, message: 'Hanya Supervisor yang dapat memperbarui anggota tim.' };
    }
    const existingStaff = users.find((u) => u.id === staffId);
    if (!existingStaff) {
      return { ok: false, message: 'Data anggota tidak ditemukan.' };
    }

    const name = payload.name.trim().slice(0, 100);
    const email = payload.email.trim().toLowerCase().slice(0, 200);
    const jobTitle = payload.jobTitle.trim().slice(0, 120);
    const isWorkspaceOwner = existingStaff.email.toLowerCase() === workspaceMeta.ownerEmail;

    if (!name) return { ok: false, message: 'Nama anggota wajib diisi.' };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, message: 'Masukkan alamat email Google yang valid.' };
    }
    if (!jobTitle) return { ok: false, message: 'Jabatan wajib diisi.' };
    if (isWorkspaceOwner && (email !== workspaceMeta.ownerEmail || payload.role !== 'supervisor')) {
      return {
        ok: false,
        message: 'Email dan peran Supervisor pemilik utama ruang kerja tidak dapat diubah.',
      };
    }
    if (users.some((u) => u.id !== staffId && u.email.toLowerCase() === email)) {
      return { ok: false, message: `Email ${email} sudah digunakan anggota lain.` };
    }

    const updatedRoster = users.map((u) =>
      u.id === staffId ? { ...u, name, email, role: payload.role, jobTitle } : u
    );
    const nextMemberEmails = Array.from(
      new Set([workspaceMeta.ownerEmail, ...updatedRoster.map((u) => u.email.toLowerCase())])
    ).slice(0, 25);
    const nextSupervisorEmails = Array.from(
      new Set([
        workspaceMeta.ownerEmail,
        ...updatedRoster.filter((u) => u.role === 'supervisor').map((u) => u.email.toLowerCase()),
      ])
    ).slice(0, 10);

    const emailsChanged =
      existingStaff.email.toLowerCase() !== email || existingStaff.role !== payload.role;

    try {
      if (emailsChanged) {
        await updateDoc(doc(db, 'workspaces', workspaceMeta.id), {
          memberEmails: nextMemberEmails,
          supervisorEmails: nextSupervisorEmails,
          updatedAt: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, 'workspaces', workspaceMeta.id, 'staff', staffId), {
        name,
        email,
        role: payload.role,
        jobTitle,
        memberEmails: nextMemberEmails,
      });

      if (existingStaff.email.toLowerCase() !== email) {
        await syncMemberEmailsAcrossWorkspace(workspaceMeta.id, activeUserEmail, nextMemberEmails);
      }

      showToast(`Data anggota ${name} berhasil diperbarui.`);
      return { ok: true, message: 'Data anggota diperbarui.' };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `workspaces/${workspaceMeta.id}/staff/${staffId}`);
    }
  };

  const removeStaffMember = async (staffId: string): Promise<ActionResult> => {
    if (!firebaseUser || !workspaceMeta || currentUser?.role !== 'supervisor') {
      return { ok: false, message: 'Hanya Supervisor yang dapat menghapus anggota tim.' };
    }
    const target = users.find((u) => u.id === staffId);
    if (!target) return { ok: false, message: 'Anggota tidak ditemukan.' };
    if (target.email.toLowerCase() === workspaceMeta.ownerEmail) {
      return { ok: false, message: 'Pemilik utama ruang kerja tidak dapat dihapus.' };
    }

    const remaining = users.filter((u) => u.id !== staffId);
    const nextMemberEmails = Array.from(
      new Set([workspaceMeta.ownerEmail, ...remaining.map((u) => u.email.toLowerCase())])
    ).slice(0, 25);
    const nextSupervisorEmails = Array.from(
      new Set([
        workspaceMeta.ownerEmail,
        ...remaining.filter((u) => u.role === 'supervisor').map((u) => u.email.toLowerCase()),
      ])
    ).slice(0, 10);

    try {
      await deleteDoc(doc(db, 'workspaces', workspaceMeta.id, 'staff', staffId));
      await updateDoc(doc(db, 'workspaces', workspaceMeta.id), {
        memberEmails: nextMemberEmails,
        supervisorEmails: nextSupervisorEmails,
        updatedAt: serverTimestamp(),
      });
      await syncMemberEmailsAcrossWorkspace(workspaceMeta.id, activeUserEmail, nextMemberEmails);
      showToast(`${target.name} dihapus dari daftar tim.`);
      return { ok: true, message: 'Anggota dihapus.' };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `workspaces/${workspaceMeta.id}/staff/${staffId}`);
    }
  };

  const checkIn = async (
    assignmentId: string,
    staffId: string,
    checkInPhotoId: string,
    _cleanliness?: import('../types/kitchen').AttendanceCleanliness,
    _clientRef?: string,
    kitchenPhotoId?: string
  ): Promise<ActionResult> => {
    if (!firebaseUser || !workspaceMeta) {
      return { ok: false, message: 'Silakan masuk dengan Google terlebih dahulu.' };
    }
    if (!checkInPhotoId) return { ok: false, message: 'Foto wajah wajib diambil saat check-in.' };

    const staffMember = users.find((u) => u.id === staffId);
    if (!staffMember) return { ok: false, message: 'Data staf tidak ditemukan.' };
    if (currentUser?.role !== 'supervisor' && staffMember.email.toLowerCase() !== activeUserEmail) {
      return { ok: false, message: 'Anda hanya dapat melakukan check-in untuk akun Anda sendiri.' };
    }

    const assignment = assignments.find((a) => a.id === assignmentId);
    if (!assignment) return { ok: false, message: 'Penugasan shift tidak ditemukan.' };
    if (!assignment.staffIds.includes(staffId)) {
      return { ok: false, message: 'Anda tidak terjadwal pada shift ini.' };
    }

    const existing = attendance.find(
      (rec) => rec.assignmentId === assignmentId && rec.staffId === staffId
    );
    if (existing && existing.checkInTime) {
      return { ok: false, message: 'Check-in sudah tercatat untuk shift ini.' };
    }
    if (existing && existing.supervisorStatus) {
      return {
        ok: false,
        message: `Status kehadiran sudah dikonfirmasi supervisor sebagai ${existing.supervisorStatus}.`,
      };
    }

    const effectiveNow = getRealWibNow();
    const lateMinutes = calculateLateMinutes(effectiveNow.minutes, assignment.shift);
    const docId = existing?.id ?? `att-${assignment.id}-${staffId}`;
    const path = `workspaces/${workspaceMeta.id}/attendance/${docId}`;

    try {
      await setDoc(doc(db, 'workspaces', workspaceMeta.id, 'attendance', docId), {
        id: docId,
        ownerId: workspaceMeta.ownerId,
        memberEmails: workspaceMeta.memberEmails,
        assignmentId: assignment.id,
        date: assignment.date,
        shift: assignment.shift,
        staffId,
        staffEmail: staffMember.email.toLowerCase(),
        checkInTime: effectiveNow.timeHHMM,
        checkInMinutes: effectiveNow.minutes,
        checkOutTime: null,
        checkOutMinutes: null,
        lateMinutes,
        durationMinutes: null,
        checkInKitchenPhotoId: kitchenPhotoId ?? null,
        checkInPhotoId,
        checkOutPhotoId: null,
        supervisorStatus: null,
        supervisorNote: null,
        updatedAt: `${effectiveNow.date} ${effectiveNow.timeHHMM}`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }

    const statusMsg =
      lateMinutes > 0
        ? `Check-in ${SHIFT_META[assignment.shift].label} tercatat (${formatTimeDotWib(effectiveNow.timeHHMM)} · Terlambat ${lateMinutes} menit).`
        : `Check-in ${SHIFT_META[assignment.shift].label} tercatat (${formatTimeDotWib(effectiveNow.timeHHMM)} · Tepat Waktu).`;
    showToast(statusMsg);
    return { ok: true, message: statusMsg };
  };

  const checkOut = async (
    assignmentId: string,
    staffId: string,
    checkOutPhotoId: string,
    _cleanliness?: import('../types/kitchen').AttendanceCleanliness,
    _clientRef?: string,
    kitchenPhotoId?: string
  ): Promise<ActionResult> => {
    if (!firebaseUser || !workspaceMeta) {
      return { ok: false, message: 'Silakan masuk dengan Google terlebih dahulu.' };
    }
    if (!checkOutPhotoId) return { ok: false, message: 'Foto wajah wajib diambil saat check-out.' };

    const assignment = assignments.find((a) => a.id === assignmentId);
    if (!assignment) return { ok: false, message: 'Penugasan shift tidak ditemukan.' };

    const existing = attendance.find(
      (rec) => rec.assignmentId === assignmentId && rec.staffId === staffId
    );
    if (!existing || !existing.checkInTime || existing.checkInMinutes === null) {
      return { ok: false, message: 'Harus melakukan check-in terlebih dahulu sebelum check-out.' };
    }
    if (existing.checkOutTime) {
      return { ok: false, message: 'Check-out sudah tercatat untuk shift ini.' };
    }

    const effectiveNow = getRealWibNow();
    if (effectiveNow.minutes < existing.checkInMinutes) {
      return {
        ok: false,
        message: 'Jam check-out tidak boleh lebih awal dari jam check-in.',
      };
    }

    const durationMinutes = effectiveNow.minutes - existing.checkInMinutes;
    const path = `workspaces/${workspaceMeta.id}/attendance/${existing.id}`;

    try {
      await updateDoc(doc(db, 'workspaces', workspaceMeta.id, 'attendance', existing.id), {
        checkOutTime: effectiveNow.timeHHMM,
        checkOutMinutes: effectiveNow.minutes,
        durationMinutes,
        checkOutKitchenPhotoId: kitchenPhotoId ?? null,
        checkOutPhotoId,
        updatedAt: `${effectiveNow.date} ${effectiveNow.timeHHMM}`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }

    const msg = `Check-out ${SHIFT_META[assignment.shift].label} tersimpan (${formatTimeDotWib(effectiveNow.timeHHMM)}).`;
    showToast(msg);
    return { ok: true, message: msg };
  };

  const confirmAbsenceStatus = async (
    assignmentId: string,
    staffId: string,
    status: SupervisorAbsenceStatus,
    note?: string
  ): Promise<ActionResult> => {
    if (!firebaseUser || !workspaceMeta || currentUser?.role !== 'supervisor') {
      return { ok: false, message: 'Hanya Supervisor yang dapat mengonfirmasi status kehadiran.' };
    }

    const assignment = assignments.find((a) => a.id === assignmentId);
    if (!assignment) return { ok: false, message: 'Jadwal shift tidak ditemukan.' };

    const staffMember = users.find((u) => u.id === staffId);
    if (!staffMember) return { ok: false, message: 'Data staf tidak ditemukan.' };

    const effectiveNow = getRealWibNow();
    if (!hasShiftEnded(assignment.date, assignment.shift, effectiveNow)) {
      return {
        ok: false,
        message: `Konfirmasi Izin/Sakit/Alpa hanya dapat dilakukan setelah shift ${SHIFT_META[assignment.shift].label} berakhir (${SHIFT_META[assignment.shift].endHHMM.replace(':', '.')} WIB).`,
      };
    }

    const existing = attendance.find(
      (rec) => rec.assignmentId === assignmentId && rec.staffId === staffId
    );
    if (existing && existing.checkInTime) {
      return { ok: false, message: 'Staf ini sudah melakukan check-in.' };
    }

    const docId = existing?.id ?? `att-${assignment.id}-${staffId}`;
    const path = `workspaces/${workspaceMeta.id}/attendance/${docId}`;
    const trimmedNote = note?.trim().slice(0, 500) || null;

    try {
      if (existing) {
        await updateDoc(doc(db, 'workspaces', workspaceMeta.id, 'attendance', docId), {
          supervisorStatus: status,
          supervisorNote: trimmedNote,
          updatedAt: `${effectiveNow.date} ${effectiveNow.timeHHMM}`,
        });
      } else {
        await setDoc(doc(db, 'workspaces', workspaceMeta.id, 'attendance', docId), {
          id: docId,
          ownerId: workspaceMeta.ownerId,
          memberEmails: workspaceMeta.memberEmails,
          assignmentId: assignment.id,
          date: assignment.date,
          shift: assignment.shift,
          staffId,
          staffEmail: staffMember.email.toLowerCase(),
          checkInTime: null,
          checkInMinutes: null,
          checkOutTime: null,
          checkOutMinutes: null,
          lateMinutes: 0,
          durationMinutes: null,
          checkInPhotoId: null,
          checkOutPhotoId: null,
          supervisorStatus: status,
          supervisorNote: trimmedNote,
          updatedAt: `${effectiveNow.date} ${effectiveNow.timeHHMM}`,
        });
      }
    } catch (err) {
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, path);
    }

    const msg = `Status ${staffMember.name} pada shift ${SHIFT_META[assignment.shift].label} dikonfirmasi: ${status}.`;
    showToast(msg);
    return { ok: true, message: msg };
  };

  const upsertSchedule = async (
    date: string,
    shift: ShiftType,
    staffIds: string[],
    picId: string
  ): Promise<ActionResult> => {
    if (!firebaseUser || !workspaceMeta || currentUser?.role !== 'supervisor') {
      return { ok: false, message: 'Hanya Supervisor yang dapat mengatur jadwal shift.' };
    }

    if (!date) return { ok: false, message: 'Tanggal operasional wajib dipilih.' };
    if (staffIds.length === 0) {
      return { ok: false, message: 'Pilih minimal satu staf untuk shift ini.' };
    }
    if (!picId || !staffIds.includes(picId)) {
      return { ok: false, message: 'Pilih satu PIC Shift dari daftar staf yang dijadwalkan.' };
    }

    const existing = assignments.find((a) => a.date === date && a.shift === shift);
    const docId = existing?.id ?? `asg-${date}-${shift}`;
    const path = `workspaces/${workspaceMeta.id}/assignments/${docId}`;
    const effectiveNow = getRealWibNow();
    const uniqueStaff = Array.from(new Set(staffIds)).slice(0, 25);

    try {
      if (existing) {
        await updateDoc(doc(db, 'workspaces', workspaceMeta.id, 'assignments', docId), {
          staffIds: uniqueStaff,
          picId,
          memberEmails: workspaceMeta.memberEmails,
          updatedAt: `${effectiveNow.date} ${effectiveNow.timeHHMM}`,
        });
      } else {
        await setDoc(doc(db, 'workspaces', workspaceMeta.id, 'assignments', docId), {
          id: docId,
          ownerId: workspaceMeta.ownerId,
          memberEmails: workspaceMeta.memberEmails,
          date,
          shift,
          staffIds: uniqueStaff,
          picId,
          updatedAt: `${effectiveNow.date} ${effectiveNow.timeHHMM}`,
        });
      }
    } catch (err) {
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, path);
    }

    const msg = `Jadwal ${SHIFT_META[shift].label} (${formatDateIndo(date, false)}) berhasil disimpan.`;
    showToast(msg);
    return { ok: true, message: msg };
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
    if (!firebaseUser || !workspaceMeta) {
      return { ok: false, message: 'Silakan masuk dengan Google terlebih dahulu.' };
    }

    const duplicate = cleanlinessReports.find(
      (r) => r.date === payload.date && r.shift === payload.shift
    );
    if (duplicate) {
      return {
        ok: false,
        message: `Laporan kebersihan untuk ${SHIFT_META[payload.shift].label} tanggal ${formatDateIndo(payload.date, false)} sudah pernah dikirim.`,
      };
    }

    const picUser = users.find((u) => u.id === payload.picId);
    const picEmail = (picUser?.email || activeUserEmail).toLowerCase();

    const effectiveNow = getRealWibNow();
    const dateLabel = formatDateIndo(payload.date, false);
    const docId = `clean-${payload.date}-${payload.shift}`;
    const path = `workspaces/${workspaceMeta.id}/cleanlinessReports/${docId}`;

    try {
      await setDoc(doc(db, 'workspaces', workspaceMeta.id, 'cleanlinessReports', docId), {
        id: docId,
        ownerId: workspaceMeta.ownerId,
        memberEmails: workspaceMeta.memberEmails,
        date: payload.date,
        shift: payload.shift,
        picId: payload.picId,
        picEmail,
        picName: payload.picName.slice(0, 120),
        submittedAt: `${dateLabel}, ${effectiveNow.timeHHMM.replace(':', '.')} WIB`.slice(0, 80),
        submittedTimeHHMM: effectiveNow.timeHHMM,
        areas: payload.areas,
        generalPhotoId: payload.generalPhotoId,
        handoverNote:
          payload.shift === 'opening' ? payload.handoverNote.trim().slice(0, 1500) : '',
        confirmedAiSummary: payload.confirmedAiSummary
          ? payload.confirmedAiSummary.trim().slice(0, 1500)
          : null,
        aiSummaryConfirmedAt: payload.aiSummaryConfirmedAt ?? null,
        aiSummaryConfirmedBy: payload.aiSummaryConfirmedBy ?? null,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }

    const msg = `Laporan kebersihan ${SHIFT_META[payload.shift].label} berhasil dikirim.`;
    showToast(msg);
    return { ok: true, message: msg };
  };

  const confirmOpeningAiSummary = async (
    reportId: string,
    confirmedAiSummary: string,
    handoverNote?: string
  ): Promise<ActionResult> => {
    if (!firebaseUser || !workspaceMeta) {
      return { ok: false, message: 'Silakan masuk dengan Google terlebih dahulu.' };
    }

    const target = cleanlinessReports.find((r) => r.id === reportId);
    if (!target) {
      return { ok: false, message: 'Laporan kebersihan Opening tidak ditemukan.' };
    }
    const cleanedSummary = confirmedAiSummary.trim().slice(0, 1500);
    if (!cleanedSummary) {
      return { ok: false, message: 'Isi ringkasan tidak boleh kosong sebelum dikonfirmasi.' };
    }

    const effectiveNow = getRealWibNow();
    const dateLabel = formatDateIndo(effectiveNow.date, false);
    const confirmedAt = `${dateLabel}, ${effectiveNow.timeHHMM.replace(':', '.')} WIB`.slice(0, 80);
    const confirmedBy = (currentUser?.name ?? target.picName).slice(0, 120);
    const path = `workspaces/${workspaceMeta.id}/cleanlinessReports/${reportId}`;

    try {
      await updateDoc(doc(db, 'workspaces', workspaceMeta.id, 'cleanlinessReports', reportId), {
        confirmedAiSummary: cleanedSummary,
        aiSummaryConfirmedAt: confirmedAt,
        aiSummaryConfirmedBy: confirmedBy,
        handoverNote:
          handoverNote !== undefined
            ? handoverNote.trim().slice(0, 1500)
            : target.handoverNote,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }

    const msg = 'Ringkasan serah terima berhasil dikonfirmasi untuk tim Closing.';
    showToast(msg);
    return { ok: true, message: msg };
  };

  const createItemReport = async (payload: {
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
  }): Promise<ActionResult> => {
    if (!firebaseUser || !workspaceMeta) {
      return { ok: false, message: 'Silakan masuk dengan Google terlebih dahulu.' };
    }

    const effectiveNow = getRealWibNow();
    const docId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const path = `workspaces/${workspaceMeta.id}/itemReports/${docId}`;

    try {
      await setDoc(doc(db, 'workspaces', workspaceMeta.id, 'itemReports', docId), {
        id: docId,
        ownerId: workspaceMeta.ownerId,
        memberEmails: workspaceMeta.memberEmails,
        type: payload.type,
        itemName: payload.itemName.trim().slice(0, 150),
        quantity: Math.max(1, Math.min(1000, Math.floor(payload.quantity))),
        location: payload.location.trim().slice(0, 200),
        lastKnownLocation: payload.lastKnownLocation.trim().slice(0, 500),
        discoveredAt: payload.discoveredAt.trim().slice(0, 80),
        notes: payload.notes.trim().slice(0, 1000),
        photoId: payload.photoId ?? null,
        reporterId: payload.reporterId,
        reporterEmail: activeUserEmail,
        reporterName: payload.reporterName.slice(0, 120),
        shift: payload.shift,
        date: payload.date,
        status: 'Dilaporkan',
        resolutionNote: '',
        createdAt: `${effectiveNow.date} ${effectiveNow.timeHHMM}`,
        updatedAt: `${effectiveNow.date} ${effectiveNow.timeHHMM}`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }

    const msg = `Laporan ${payload.type.toLowerCase()} "${payload.itemName.trim()}" berhasil dikirim.`;
    showToast(msg);
    return { ok: true, message: msg };
  };

  const updateItemReportStatus = async (
    reportId: string,
    status: ItemReportStatus,
    resolutionNote?: string
  ): Promise<ActionResult> => {
    if (!firebaseUser || !workspaceMeta || currentUser?.role !== 'supervisor') {
      return { ok: false, message: 'Hanya Supervisor yang dapat memperbarui status laporan barang.' };
    }

    const target = itemReports.find((r) => r.id === reportId);
    if (!target) return { ok: false, message: 'Laporan barang tidak ditemukan.' };

    const cleanedNote = (resolutionNote ?? target.resolutionNote ?? '').trim().slice(0, 1000);
    if (status === 'Selesai' && !cleanedNote) {
      return {
        ok: false,
        message: 'Catatan hasil penanganan wajib diisi sebelum status diubah menjadi Selesai.',
      };
    }

    const effectiveNow = getRealWibNow();
    const path = `workspaces/${workspaceMeta.id}/itemReports/${reportId}`;

    try {
      await updateDoc(doc(db, 'workspaces', workspaceMeta.id, 'itemReports', reportId), {
        status,
        resolutionNote: cleanedNote,
        updatedAt: `${effectiveNow.date} ${effectiveNow.timeHHMM}`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }

    const msg = `Status laporan "${target.itemName}" diperbarui menjadi ${status}.`;
    showToast(msg);
    return { ok: true, message: msg };
  };

  const canDeleteActiveWorkspace = Boolean(
    firebaseUser &&
      workspaceMeta &&
      currentUser?.role === 'supervisor' &&
      workspaceMeta.ownerId === firebaseUser.uid &&
      workspaceRecords.length > 1
  );

  return (
    <KitchenContext.Provider
      value={{
        state,
        workspaces,
        activeWorkspaceId: workspaceMeta?.id ?? null,
        firebaseUser,
        authReady,
        workspaceLoading,
        workspaceAccessStatus,
        authError,
        currentUser,
        nowWib,
        toastMessage,
        canDeleteActiveWorkspace,
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
      }}
    >
      {children}
    </KitchenContext.Provider>
  );
};

