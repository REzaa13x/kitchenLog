import { useEffect, useState } from 'react';
import { PhotoSource, StoredPhoto } from '../types/kitchen';

const DB_NAME = 'kitchenlog_photos_db';
const DB_VERSION = 1;
const STORE_NAME = 'photos';
const MAX_DIMENSION = 800;
const JPEG_QUALITY = 0.72;
const MAX_DATA_URL_LENGTH = 440000;

interface PhotoSyncContext {
  workspaceId: string;
  ownerId: string;
  memberEmails: string[];
  uploaderEmail: string;
}

let activePhotoSyncContext: PhotoSyncContext | null = null;
interface MysqlPhotoSyncContext { workspaceId: string; token: string }
let mysqlPhotoContext: MysqlPhotoSyncContext | null = null;
export function setActiveMysqlPhotoSyncContext(ctx: MysqlPhotoSyncContext | null): void {
  mysqlPhotoContext = ctx ? { ...ctx } : null;
  if (ctx) activePhotoSyncContext = null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('kitchenlog-photo-context'));
}
async function cacheId(id: string, ctx = mysqlPhotoContext): Promise<string> {
  if (!ctx) return id;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ctx.token));
  return `mysql:${ctx.workspaceId}:${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')}:${id}`;
}

/**
 * Firebase dimuat secara lazy HANYA saat ada konteks sinkronisasi foto.
 * Di mode demo konteks itu tidak pernah dipasang, sehingga modul Firebase
 * tidak pernah diunduh sama sekali.
 */
async function getFirestoreForPhotoSync() {
  const [{ doc, getDoc, setDoc }, { db }] = await Promise.all([
    import('firebase/firestore'),
    import('../firebase'),
  ]);
  return { doc, getDoc, setDoc, db };
}

export function setActivePhotoSyncContext(ctx: PhotoSyncContext | null): void {
  activePhotoSyncContext = ctx;
}

function openPhotoDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Gagal membuka IndexedDB foto.'));
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca data foto.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal mengonversi foto.'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = /data:(.*?);base64/.exec(header || '');
  const mime = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

async function compressPhoto(inputBlob: Blob): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(inputBlob);
    const img = new Image();
    img.onload = async () => {
      try {
        let width = img.naturalWidth || 720;
        let height = img.naturalHeight || 720;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
        }

        let quality = JPEG_QUALITY;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > MAX_DATA_URL_LENGTH && quality > 0.35) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        const compressedBlob = dataUrlToBlob(dataUrl);
        resolve({ blob: compressedBlob, dataUrl });
      } catch {
        const fallbackUrl = await blobToDataUrl(inputBlob);
        resolve({ blob: inputBlob, dataUrl: fallbackUrl });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = async () => {
      URL.revokeObjectURL(objectUrl);
      const fallbackUrl = await blobToDataUrl(inputBlob);
      resolve({ blob: inputBlob, dataUrl: fallbackUrl });
    };
    img.src = objectUrl;
  });
}

async function putPhotoInIndexedDB(record: StoredPhoto): Promise<void> {
  const database = await openPhotoDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => {
      window.dispatchEvent(new CustomEvent('kitchenlog-photo-updated', { detail: { id: record.id } }));
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error('Gagal menyimpan foto ke IndexedDB.'));
  });
}

export async function savePhotoToIndexedDB(
  blob: Blob,
  source: PhotoSource,
  customId?: string
): Promise<string> {
  const context = mysqlPhotoContext;
  const id = customId ?? `photo-${crypto.randomUUID()}`;
  const { blob: compressedBlob, dataUrl } = await compressPhoto(blob);
  const createdAt = new Date().toISOString();

  const record: StoredPhoto = {
    id,
    blob: compressedBlob,
    source,
    mimeType: compressedBlob.type || 'image/jpeg',
    createdAt,
  };

  await putPhotoInIndexedDB({ ...record, id: await cacheId(id, context) });
  if (context) {
    const response = await fetch('/api/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.token}` },
      body: JSON.stringify({ workspaceId: context.workspaceId, id, dataUrl, source }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      // Bytes sudah aman di IndexedDB; tandai agar pemanggil bisa mencoba unggah ulang.
      throw Object.assign(new Error(error.error || 'Gagal menyinkronkan foto. Foto lokal tetap tersimpan.'), {
        uploadFailed: true,
        photoId: id,
      });
    }
    return id;
  }

  if (activePhotoSyncContext && dataUrl.length <= MAX_DATA_URL_LENGTH) {
    try {
      const { doc, setDoc, db } = await getFirestoreForPhotoSync();
      await setDoc(doc(db, 'workspaces', activePhotoSyncContext.workspaceId, 'photos', id), {
        id,
        ownerId: activePhotoSyncContext.ownerId,
        memberEmails: activePhotoSyncContext.memberEmails,
        uploaderEmail: activePhotoSyncContext.uploaderEmail,
        source,
        dataUrl,
        createdAt,
      });
    } catch (err) {
      console.error('Gagal menyinkronkan foto ke Firestore:', err);
    }
  }

  return id;
}

export async function getPhotoFromIndexedDB(id: string): Promise<StoredPhoto | null> {
  if (!id) return null;
  const context = mysqlPhotoContext;
  try {
    const key = await cacheId(id, context);
    const database = await openPhotoDatabase();
    const local = await new Promise<StoredPhoto | null>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve((req.result as StoredPhoto | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    if (local) return { ...local, id };
  } catch { /* Remote read still works when local storage is unavailable. */ }
  if (context) {
    try {
      const response = await fetch(`/api/photos/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(context.workspaceId)}`, {
        headers: { Authorization: `Bearer ${context.token}` }, cache: 'no-store',
      });
      if (!response.ok || mysqlPhotoContext !== context) return null;
      const data = await response.json();
      const blob = dataUrlToBlob(data.dataUrl);
      const record: StoredPhoto = { id, blob, source: data.source, mimeType: blob.type, createdAt: data.createdAt };
      try { await putPhotoInIndexedDB({ ...record, id: await cacheId(id, context) }); } catch { /* Preview need not depend on cache writes. */ }
      return mysqlPhotoContext === context ? record : null;
    } catch { return null; }
  }
  return null;
}

export function getPhotoSourceLabel(source: PhotoSource | null | undefined): string {
  if (source === 'camera') return 'Foto Kamera';
  if (source === 'upload') return 'Foto Unggahan';
  return 'Foto Tersimpan';
}

export function useStoredPhoto(photoId: string | null | undefined): {
  url: string | null;
  source: PhotoSource | null;
  loading: boolean;
} {
  const [contextVersion, setContextVersion] = useState(0);
  useEffect(() => {
    const changed = () => setContextVersion(v => v + 1);
    window.addEventListener('kitchenlog-photo-context', changed);
    return () => window.removeEventListener('kitchenlog-photo-context', changed);
  }, []);
  const [url, setUrl] = useState<string | null>(null);
  const [source, setSource] = useState<PhotoSource | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(photoId));

  useEffect(() => {
    let active = true;
    let createdObjectUrl: string | null = null;

    async function load() {
      if (!photoId) {
        setUrl(null);
        setSource(null);
        setLoading(false);
        return;
      }
      setLoading(true);

      const localRecord = await getPhotoFromIndexedDB(photoId);
      if (!active) return;

      if (localRecord && localRecord.blob) {
        createdObjectUrl = URL.createObjectURL(localRecord.blob);
        setUrl(createdObjectUrl);
        setSource(localRecord.source);
        setLoading(false);
        return;
      }

      if (activePhotoSyncContext) {
        try {
          const { doc, getDoc, db } = await getFirestoreForPhotoSync();
          const snap = await getDoc(
            doc(db, 'workspaces', activePhotoSyncContext.workspaceId, 'photos', photoId)
          );
          if (!active) return;
          if (snap.exists()) {
            const data = snap.data() as {
              dataUrl?: string;
              source?: PhotoSource;
              createdAt?: string;
            };
            if (data.dataUrl) {
              const decodedBlob = dataUrlToBlob(data.dataUrl);
              const src: PhotoSource = data.source === 'upload' ? 'upload' : 'camera';
              await putPhotoInIndexedDB({
                id: photoId,
                blob: decodedBlob,
                source: src,
                mimeType: decodedBlob.type || 'image/jpeg',
                createdAt: data.createdAt || new Date().toISOString(),
              });
              if (!active) return;
              createdObjectUrl = URL.createObjectURL(decodedBlob);
              setUrl(createdObjectUrl);
              setSource(src);
              setLoading(false);
              return;
            }
          }
        } catch {
          // Fall through to unavailable preview
        }
      }

      setUrl(null);
      setSource(null);
      setLoading(false);
    }

    load();

    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (detail?.id === photoId) {
        load();
      }
    };
    window.addEventListener('kitchenlog-photo-updated', handleUpdate);

    return () => {
      active = false;
      window.removeEventListener('kitchenlog-photo-updated', handleUpdate);
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [photoId, contextVersion]);

  return { url, source, loading };
}
