import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  ChefHat,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useKitchen } from '../storage/kitchenContext';
import { formatDateIndo, formatTimeDotWib } from '../utils/wibTime';
import {
  checkPassword,
  isValidEmail,
  MIN_PASSWORD_LENGTH,
  normalizePhone,
  validateLogin,
  validateSignup,
  type SignupErrors,
} from '../utils/authValidation';

type Mode = 'login' | 'signup' | 'reset';

const inputClass =
  'w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[#D4CEC0] bg-white text-sm text-[#1A211D] placeholder:text-[#8B978F] focus:outline-none focus:ring-2 focus:ring-[#1B4332] focus:border-transparent';

const labelClass = 'block text-xs font-semibold text-[#1A211D] mb-1.5';

const fieldErrorClass = 'mt-1 text-xs font-medium text-[#B91C1C]';

export const LoginPage: React.FC = () => {
  const {
    firebaseUser,
    workspaceAccessStatus,
    authError,
    nowWib,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendResetPassword,
    signOutGoogle,
    recheckWorkspaceAccess,
    createOwnWorkspace,
  } = useKitchen();

  const [mode, setMode] = useState<Mode>('login');

  // Kolom formulir
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status
  const [busy, setBusy] = useState(false);
  const [signingInGoogle, setSigningInGoogle] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);
  const [errors, setErrors] = useState<SignupErrors>({});

  // Alur "belum terdaftar di dapur"
  const [checking, setChecking] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKitchenName, setNewKitchenName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const resetMessages = () => {
    setFormError(null);
    setFormInfo(null);
    setErrors({});
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    resetMessages();
    setPassword('');
    setConfirm('');
  };

  const handleGoogleSignIn = async () => {
    resetMessages();
    setSigningInGoogle(true);
    try {
      await signInWithGoogle();
    } finally {
      setSigningInGoogle(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    const v = validateLogin({ email, password });
    if (v.email || v.password) {
      setErrors(v);
      return;
    }
    setBusy(true);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      // Pesan sudah diterjemahkan oleh mapAuthError di dalam store? Tidak —
      // di sini kita terjemahkan lagi untuk tampilan.
      const { mapAuthError } = await import('../utils/authValidation');
      setFormError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    const v = validateSignup({ name, email, phone, password, confirm });
    if (Object.keys(v).length > 0) {
      setErrors(v);
      return;
    }
    setBusy(true);
    try {
      const res = await signUpWithEmail({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: normalizePhone(phone),
        password,
      });
      if (!res.ok) setFormError(res.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (!isValidEmail(email)) {
      setErrors({ email: 'Format email tidak valid.' });
      return;
    }
    setBusy(true);
    try {
      const res = await sendResetPassword(email);
      if (res.ok) setFormInfo(res.message);
      else setFormError(res.message);
    } finally {
      setBusy(false);
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
      if (!res.ok) setCreateError(res.message);
    } finally {
      setCreating(false);
    }
  };

  // ---- Layar: sudah masuk tapi belum tergabung di dapur mana pun ----------
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
              <span>Keluar</span>
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
                <div>
                  <label htmlFor="new-kitchen-name" className={labelClass}>
                    Nama Dapur / Outlet Baru
                  </label>
                  <input
                    id="new-kitchen-name"
                    type="text"
                    value={newKitchenName}
                    onChange={(e) => setNewKitchenName(e.target.value)}
                    placeholder="Contoh: Dapur Pusat Kemang"
                    className={inputClass}
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

  const pwCheck = checkPassword(password);

  return (
    <div className="min-h-screen bg-[#FAF7F0] flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="max-w-lg mx-auto w-full rounded-2xl border border-[#E5DFD0] bg-white p-6 sm:p-8 space-y-5">
        {/* Kepala */}
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

        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1A211D]">
            {mode === 'login' ? 'Masuk ke Operasional Dapur' : mode === 'signup' ? 'Buat Akun Baru' : 'Atur Ulang Password'}
          </h1>
          <p className="text-sm text-[#55625A] leading-relaxed">
            {mode === 'login'
              ? 'Catat kehadiran shift, laporan kebersihan harian, dan serah terima Opening ke Closing.'
              : mode === 'signup'
                ? 'Daftar dengan email dan nomor telepon. Nomor telepon hanya untuk data profil, bukan verifikasi SMS.'
                : 'Masukkan email akun Anda. Kami kirim tautan untuk membuat password baru.'}
          </p>
        </div>

        {/* Tab Masuk / Daftar */}
        {mode !== 'reset' && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F3EFE4]" role="tablist" aria-label="Pilih mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => switchMode('login')}
              className={`min-h-[40px] rounded-lg text-sm font-semibold transition-colors ${
                mode === 'login'
                  ? 'bg-white text-[#1B4332] shadow-sm'
                  : 'text-[#55625A] hover:text-[#1A211D]'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              onClick={() => switchMode('signup')}
              className={`min-h-[40px] rounded-lg text-sm font-semibold transition-colors ${
                mode === 'signup'
                  ? 'bg-white text-[#1B4332] shadow-sm'
                  : 'text-[#55625A] hover:text-[#1A211D]'
              }`}
            >
              Daftar
            </button>
          </div>
        )}

        {/* Pesan */}
        {formError && (
          <p
            className="text-xs font-medium text-[#991B1B] bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-3.5 py-2.5"
            role="alert"
          >
            {formError}
          </p>
        )}
        {formInfo && (
          <p
            className="text-xs font-medium text-[#1B4332] bg-[#E7F0EA] border border-[#C6DCCE] rounded-xl px-3.5 py-2.5"
            role="status"
          >
            {formInfo}
          </p>
        )}

        {/* Formulir MASUK */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-3.5" noValidate>
            <div>
              <label htmlFor="login-email" className={labelClass}>
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#8B978F] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@dapur.com"
                  className={`${inputClass} pl-10`}
                  aria-invalid={Boolean(errors.email)}
                />
              </div>
              {errors.email && <p className={fieldErrorClass}>{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="login-password" className={labelClass}>
                Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-[#8B978F] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password Anda"
                  className={`${inputClass} pl-10 pr-11`}
                  aria-invalid={Boolean(errors.password)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#55625A] hover:bg-[#F3EFE4]"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className={fieldErrorClass}>{errors.password}</p>}
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="text-xs font-semibold text-[#1B4332] hover:underline"
                >
                  Lupa password?
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="min-h-[48px] w-full px-5 py-3 rounded-xl bg-[#1B4332] text-white text-sm font-semibold hover:bg-[#255A43] disabled:opacity-60 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2"
            >
              <span>{busy ? 'Memproses…' : 'Masuk'}</span>
              {!busy && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
            </button>
          </form>
        )}

        {/* Formulir DAFTAR */}
        {mode === 'signup' && (
          <form onSubmit={handleSignup} className="space-y-3.5" noValidate>
            <div>
              <label htmlFor="signup-name" className={labelClass}>
                Nama Lengkap
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#8B978F] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="signup-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className={`${inputClass} pl-10`}
                  aria-invalid={Boolean(errors.name)}
                />
              </div>
              {errors.name && <p className={fieldErrorClass}>{errors.name}</p>}
            </div>

            <div>
              <label htmlFor="signup-email" className={labelClass}>
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#8B978F] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@dapur.com"
                  className={`${inputClass} pl-10`}
                  aria-invalid={Boolean(errors.email)}
                />
              </div>
              {errors.email && <p className={fieldErrorClass}>{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="signup-phone" className={labelClass}>
                Nomor Telepon
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-[#8B978F] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="signup-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08123456789"
                  className={`${inputClass} pl-10`}
                  aria-invalid={Boolean(errors.phone)}
                />
              </div>
              {errors.phone ? (
                <p className={fieldErrorClass}>{errors.phone}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="signup-password" className={labelClass}>
                Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-[#8B978F] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`Minimal ${MIN_PASSWORD_LENGTH} karakter`}
                  className={`${inputClass} pl-10 pr-11`}
                  aria-invalid={Boolean(errors.password)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#55625A] hover:bg-[#F3EFE4]"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className={fieldErrorClass}>{errors.password}</p>}

              {/* Indikator kekuatan password */}
              {password.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  <li className={pwCheck.length ? 'text-[#1B4332]' : 'text-[#8B978F]'}>
                    {pwCheck.length ? '✓' : '•'} Minimal {MIN_PASSWORD_LENGTH} karakter
                  </li>
                  <li className={pwCheck.hasLetter ? 'text-[#1B4332]' : 'text-[#8B978F]'}>
                    {pwCheck.hasLetter ? '✓' : '•'} Mengandung huruf
                  </li>
                  <li className={pwCheck.hasNumber ? 'text-[#1B4332]' : 'text-[#8B978F]'}>
                    {pwCheck.hasNumber ? '✓' : '•'} Mengandung angka
                  </li>
                  {!pwCheck.notCommon && (
                    <li className="text-[#B91C1C]">Password terlalu umum — pilih yang lain.</li>
                  )}
                </ul>
              )}
            </div>

            <div>
              <label htmlFor="signup-confirm" className={labelClass}>
                Ulangi Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-[#8B978F] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="signup-confirm"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Ketik ulang password"
                  className={`${inputClass} pl-10`}
                  aria-invalid={Boolean(errors.confirm)}
                />
              </div>
              {errors.confirm && <p className={fieldErrorClass}>{errors.confirm}</p>}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="min-h-[48px] w-full px-5 py-3 rounded-xl bg-[#1B4332] text-white text-sm font-semibold hover:bg-[#255A43] disabled:opacity-60 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2"
            >
              <span>{busy ? 'Membuat akun…' : 'Daftar Sekarang'}</span>
              {!busy && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
            </button>
          </form>
        )}

        {/* Formulir LUPA PASSWORD */}
        {mode === 'reset' && (
          <form onSubmit={handleReset} className="space-y-3.5" noValidate>
            <div>
              <label htmlFor="reset-email" className={labelClass}>
                Email akun Anda
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#8B978F] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@dapur.com"
                  className={`${inputClass} pl-10`}
                  aria-invalid={Boolean(errors.email)}
                />
              </div>
              {errors.email && <p className={fieldErrorClass}>{errors.email}</p>}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="min-h-[48px] w-full px-5 py-3 rounded-xl bg-[#1B4332] text-white text-sm font-semibold hover:bg-[#255A43] disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <span>{busy ? 'Mengirim…' : 'Kirim Tautan Atur Ulang'}</span>
            </button>

            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full text-xs font-semibold text-[#1B4332] hover:underline"
            >
              Kembali ke halaman masuk
            </button>
          </form>
        )}

        {/* Pemisah + Google */}
        {mode !== 'reset' && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[#E5DFD0]" />
              <span className="text-xs text-[#8B978F]">atau</span>
              <div className="flex-1 h-px bg-[#E5DFD0]" />
            </div>

            <button
              type="button"
              disabled={signingInGoogle}
              onClick={handleGoogleSignIn}
              className="min-h-[48px] w-full px-5 py-3 rounded-xl border border-[#D4CEC0] bg-white text-sm font-semibold text-[#1A211D] hover:bg-[#F3EFE4] disabled:opacity-60 inline-flex items-center justify-center gap-2.5"
            >
              <span>{signingInGoogle ? 'Membuka Login Google…' : 'Masuk dengan Google'}</span>
            </button>
          </>
        )}

        <div className="rounded-xl bg-[#FAF7F0] border border-[#E5DFD0] p-3.5">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#1B4332] shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-[#36413B] leading-relaxed">
              Akun baru mendapat ruang kerja pribadi dan tidak dapat melihat data dapur lain.
              Untuk bergabung ke dapur tim, minta Supervisor menambahkan email Anda di menu{' '}
              <span className="font-semibold">Tim &amp; Akses</span>.
            </p>
          </div>
        </div>

        <p className="text-xs text-[#55625A] text-center font-mono tabular-nums">
          {formatDateIndo(nowWib.date)} · Zona Waktu Asia/Jakarta (WIB)
        </p>
      </div>
    </div>
  );
};
