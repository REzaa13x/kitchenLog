export async function apiRequest<T>(url: string, options: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('Koneksi terputus atau waktu tunggu habis. Periksa riwayat sebelum mencoba lagi; isian tetap dipertahankan.'); }
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new Error('Respons server bukan JSON. Periksa riwayat sebelum mencoba lagi.'); }
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data ? String(data.error) : `Permintaan gagal (HTTP ${response.status}).`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  return data as T;
}
