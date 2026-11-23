import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  ChefHat,
  Clock,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useKitchen } from '../storage/kitchenStore';
import { formatDateIndo, formatTimeDotWib } from '../utils/wibTime';

export const LoginPage: React.FC = () => {
  const {
    firebaseUser,
    workspaceAccessStatus,
    authError,
    nowWib,
    signInWithGoogle,
    signOutGoogle,
    recheckWorkspaceAccess,
    createOwnWorkspace,
  } = useKitchen();

  const [signingIn, setSigningIn] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKitchenName, setNewKitchenName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setSigningIn(false);
    }
  };

  const handleRecheck = async () => {
    setChecking(true);
    try {
      await recheckWorkspaceAccess();
    } finally {
      setChecking(false);
    }
  };

  const handleCreateKitchen = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const res = await createOwnWorkspace(newKitchenName);
      if (!res.ok) {
        setCreateError(res.message);
      }
    } finally {
      setCreating(false);
    }
  };

  if (firebaseUser && workspaceAccessStatus === 'uninvited') {
    return (
      <div className="min-h-screen bg-[#FAF7F0] flex flex-col justify-center py-10 px-4 sm:px-6">
        <div className="max-w-lg mx-auto w-full rounded-2xl border border-[#E5DFD0] bg-white p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#1B4332]">
              <ChefHat className="w-4 h-4" aria-hidden="true" />
              <span>KitchenLog · Verifikasi Akses Tim</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1A211D]">
              Akun Belum Terdaftar di Dapur
            </h1>
            <p className="text-sm text-[#55625A] leading-relaxed">
              Anda masuk sebagai{' '}
              <span className="font-semibold text-[#1A211D]">{firebaseUser.email}</span>, namun
              email ini belum didaftarkan oleh Supervisor di ruang kerja dapur mana pun.
            </p>
          </div>

          <div className="rounded-xl border border-[#E5DFD0] bg-[#FAF7F0] p-4 space-y-2 text-xs text-[#36413B]">
            <p className="font-semibold text-[#1A211D]">Cara mendapatkan akses staf:</p>
            <p>
              Minta Supervisor dapur Anda menambahkan email{' '}
              <span className="font-mono font-medium text-[#1A211D]">{firebaseUser.email}</span>{' '}
              melalui menu <span className="font-semibold">Tim &amp; Akses</span>, lalu tekan tombol{' '}
              <span className="font-semibold">Periksa Akses</span> di bawah ini.
            </p>
          </div>

          {authError && (
            <p
              className="text-xs font-medium text-[#991B1B] bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-3.5 py-2.5"
              role="alert"
            >
              {authError}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              disabled={checking}
              onClick={handleRecheck}
              className="min-h-[46px] flex-1 px-4 py-2.5 rounded-xl bg-[#1B4332] text-white text-sm font-semibold hover:bg-[#255A43] disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{checking ? 'Memeriksa…' : 'Periksa Akses'}</span>
            </button>

            <button
              type="button"
              onClick={signOutGoogle}
              className="min-h-[46px] px-4 py-2.5 rounded-xl border border-[#D4CEC0] bg-white text-sm font-semibold text-[#36413B] hover:bg-[#F3EFE4] inline-flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>Keluar Google</span>
            </button>
          </div>

          <div className="border-t border-[#E5DFD0] pt-4 space-y-3">
            {!showCreateForm ? (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="text-xs font-semibold text-[#1B4332] hover:underline inline-flex items-center gap-1.5"
              >
                <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Anda pengelola dapur baru? Buat ruang kerja dapur tersendiri</span>
              </button>
            ) : (
              <form onSubmit={handleCreateKitchen} className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="new-kitchen-name" className="block text-xs font-semibold text-[#1A211D]">
                    Nama Dapur / Outlet Baru
                  </label>
                  <input
                    id="new-kitchen-name"
                    type="text"
                    value={newKitchenName}
                    onChange={(e) => setNewKitchenName(e.target.value)}
                    placeholder="Contoh: Dapur Pusat Kemang"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4CEC0] bg-white text-sm text-[#1A211D]"
                  />
                </div>
                {createError && (
                  <p className="text-xs font-medium text-[#B91C1C]" role="alert">
                    {createError}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[#D4CEC0] bg-white text-xs font-medium text-[#36413B]"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="min-h-[40px] px-4 py-1.5 rounded-lg bg-[#1A211D] text-white text-xs font-semibold hover:bg-[#36413B] disabled:opacity-60"
                  >
                    {creating ? 'Membuat…' : 'Buat Dapur Sebagai Supervisor'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F0] flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="max-w-lg mx-auto w-full rounded-2xl border border-[#E5DFD0] bg-white p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#1B4332]">
            <div className="w-8 h-8 rounded-lg bg-[#1B4332] text-white flex items-center justify-center shrink-0">
              <ChefHat className="w-4 h-4" aria-hidden="true" />
            </div>
            <span>KitchenLog</span>
          </div>

          <span className="text-xs text-[#55625A] inline-flex items-center gap-1.5 font-mono tabular-nums">
            <Clock className="w-3.5 h-3.5 text-[#1B4332]" aria-hidden="true" />
            <span>{formatTimeDotWib(nowWib.timeHHMM)}</span>
          </span>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1A211D]">
            Masuk ke Operasional Dapur
          </h1>
          <p className="text-sm text-[#55625A] leading-relaxed">
            Catat kehadiran shift dengan verifikasi wajah, laporan kebersihan harian, serah terima Opening ke Closing, dan tindak lanjut barang rusak atau hilang dalam satu sistem terintegrasi.
          </p>
        </div>

        <div className="rounded-xl bg-[#FAF7F0] border border-[#E5DFD0] p-4 space-y-2 text-xs text-[#36413B]">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#1B4332] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold text-[#1A211D]">Akses Terikat Akun Google</p>
              <p>
                Peran Anda (Supervisor, PIC Shift, atau Staf) ditentukan otomatis berdasarkan akun Google terverifikasi yang terdaftar di ruang kerja dapur.
              </p>
            </div>
          </div>
        </div>

        {authError && (
          <p
            className="text-xs font-medium text-[#991B1B] bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-3.5 py-2.5"
            role="alert"
          >
            {authError}
          </p>
        )}

        <button
          type="button"
          disabled={signingIn}
          onClick={handleGoogleSignIn}
          className="min-h-[48px] w-full px-5 py-3 rounded-xl bg-[#1B4332] text-white text-sm font-semibold hover:bg-[#255A43] disabled:opacity-60 active:scale-[0.99] transition-all flex items-center justify-center gap-2.5"
        >
          <span>{signingIn ? 'Membuka Login Google…' : 'Masuk dengan Google'}</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>

        <p className="text-xs text-[#55625A] text-center font-mono tabular-nums">
          {formatDateIndo(nowWib.date)} · Zona Waktu Asia/Jakarta (WIB)
        </p>
      </div>
    </div>
  );
};
