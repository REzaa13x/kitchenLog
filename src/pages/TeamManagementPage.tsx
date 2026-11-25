import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  Info,
  Mail,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useKitchen } from '../storage/kitchenContext';
import { UserAccount, UserRole } from '../types/kitchen';
import { resolveKitchenTheme } from '../utils/kitchenTheme';

const POSITION_PRESETS = ['Kasir', 'Koki', 'Support'];

export const TeamManagementPage: React.FC = () => {
  const {
    state,
    workspaces,
    activeWorkspaceId,
    currentUser,
    canDeleteActiveWorkspace,
    switchWorkspace,
    updateKitchenName,
    addKitchenWorkspace,
    deleteWorkspace,
    addStaffMember,
    syncGeasteatsStaff,
    updateStaffMember,
    removeStaffMember,
  } = useKitchen();

  const [kitchenNameInput, setKitchenNameInput] = useState(state.kitchenName);
  const [savingKitchenName, setSavingKitchenName] = useState(false);

  const [showAddKitchen, setShowAddKitchen] = useState(false);
  const [newKitchenInput, setNewKitchenInput] = useState('');
  const [addingKitchen, setAddingKitchen] = useState(false);
  const [kitchenActionError, setKitchenActionError] = useState('');

  const [confirmDeleteKitchen, setConfirmDeleteKitchen] = useState(false);
  const [deletingKitchen, setDeletingKitchen] = useState(false);

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savedCredentials, setSavedCredentials] = useState<{ username: string; password: string } | null>(null);
  const [jobTitle, setJobTitle] = useState('Koki');
  const [role, setRole] = useState<UserRole>('staff');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const activeTheme = resolveKitchenTheme(activeWorkspaceId, state.kitchenName);

  useEffect(() => {
    setKitchenNameInput(state.kitchenName);
    setConfirmDeleteKitchen(false);
    setKitchenActionError('');
  }, [state.kitchenName, activeWorkspaceId]);
  useEffect(() => { setSavedCredentials(null); setPassword(''); setShowPassword(false); }, [activeWorkspaceId]);

  const resetForm = () => {
    setEditingMemberId(null);
    setName('');
    setEmail('');
    setUsername('');
    setPassword('');
    setJobTitle('Koki');
    setRole('staff');
    setFormError('');
  };

  const startEdit = (member: UserAccount) => {
    setEditingMemberId(member.staffId || member.id);
    setName(member.name);
    setEmail(member.email);
    setUsername(member.username || '');
    setPassword('');
    setJobTitle(member.jobTitle);
    setRole('staff');
    setFormError('');
  };

  const handleSaveKitchenName = async (e: React.FormEvent) => {
    e.preventDefault();
    setKitchenActionError('');
    setSavingKitchenName(true);
    try {
      const res = await updateKitchenName(kitchenNameInput);
      if (!res.ok) setKitchenActionError(res.message);
    } finally {
      setSavingKitchenName(false);
    }
  };

  const handleAddKitchen = async (e: React.FormEvent) => {
    e.preventDefault();
    setKitchenActionError('');
    setAddingKitchen(true);
    try {
      const res = await addKitchenWorkspace(newKitchenInput);
      if (!res.ok) {
        setKitchenActionError(res.message);
        return;
      }
      setNewKitchenInput('');
      setShowAddKitchen(false);
    } finally {
      setAddingKitchen(false);
    }
  };

  const handleDeleteCurrentKitchen = async () => {
    if (!activeWorkspaceId) return;
    setKitchenActionError('');
    setDeletingKitchen(true);
    try {
      const res = await deleteWorkspace(activeWorkspaceId);
      if (!res.ok) {
        setKitchenActionError(res.message);
        return;
      }
      setConfirmDeleteKitchen(false);
    } finally {
      setDeletingKitchen(false);
    }
  };

  const handleSubmitMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const res = editingMemberId
        ? await updateStaffMember(editingMemberId, { name, email, role, jobTitle, ...(username.trim() ? { username: username.trim() } : {}), ...(password ? { password } : {}) })
        : await addStaffMember({ name, email, role, jobTitle, username: username.trim(), password });
      if (!res.ok) {
        setFormError(res.message);
        return;
      }
      setSavedCredentials(password ? { username: username.trim().toLowerCase() || email, password } : null);
      setShowPassword(false);
      resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (member: UserAccount) => {
    const res = await removeStaffMember(member.staffId || member.id);
    if (!res.ok) {
      setFormError(res.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-[var(--kl-tint-border)] bg-[var(--kl-tint)] text-xs font-bold text-[var(--kl-accent-deep)]">
              <span
                className="w-2 h-2 rounded-full bg-[var(--kl-accent)] shrink-0"
                aria-hidden="true"
              />
              <span>{state.kitchenName}</span>
            </span>
            <span className="text-xs font-medium text-[var(--kl-ink-muted)]">
              {activeTheme.label}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--kl-ink)]">
            Tim &amp; Hak Akses
          </h1>
          <p className="text-sm text-[var(--kl-ink-muted)]">
            Atur jabatan operasional (Kasir, Koki, Support) serta peran akses per lokasi dapur.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {currentUser?.role === 'supervisor' && syncGeasteatsStaff && <button type="button" disabled={syncing} onClick={async () => {
            setSyncing(true);
            try { const result = await syncGeasteatsStaff(); setSyncMessage(result.message); }
            finally { setSyncing(false); }
          }} className="min-h-[40px] px-3 rounded-xl border text-xs font-semibold disabled:opacity-50">{syncing ? 'Menyinkronkan…' : 'Sinkronkan Staf Geasteats'}</button>}
          <span role="status" className="text-xs">{syncMessage}</span>
          {workspaces.length > 1 && (
            <div className="relative min-w-[200px]">
              <Building2
                className="w-3.5 h-3.5 text-[var(--kl-accent)] pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <select
                aria-label="Pilih lokasi dapur yang dikelola"
                value={activeWorkspaceId ?? ''}
                onChange={(e) => switchWorkspace(e.target.value)}
                className="w-full min-h-[40px] pl-8 pr-8 py-1.5 rounded-xl border border-[var(--kl-border-strong)] bg-white text-xs font-semibold text-[var(--kl-ink)] appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--kl-accent)]"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.kitchenName}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="w-4 h-4 text-[var(--kl-ink-muted)] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setShowAddKitchen((v) => !v);
              setKitchenActionError('');
            }}
            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[var(--kl-border-strong)] bg-white text-xs font-semibold text-[var(--kl-accent)] hover:bg-[var(--kl-tint)] inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Tambah Dapur</span>
          </button>
        </div>
      </div>

      {/* Penjelasan Hak Akses vs Jabatan Operasional */}
      <div className="rounded-2xl border border-[var(--kl-tint-border)] bg-[var(--kl-tint)] p-4 flex items-start gap-3 text-xs sm:text-sm text-[var(--kl-ink)]">
        <Info className="w-4 h-4 text-[var(--kl-accent)] shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold text-[var(--kl-accent-deep)]">
            Pengaturan Peran Akses &amp; Posisi Dapur Dikelola oleh Admin
          </p>
          <p className="text-xs text-[var(--kl-ink-sub)] leading-relaxed">
            Staf operasional (<strong>Kasir</strong>, <strong>Koki</strong>, dan{' '}
            <strong>Support</strong>) login dengan username dan password yang Admin buat di sini.
            Mereka otomatis masuk sesuai posisi dan dapur yang ditentukan—tidak dapat mengubah peran
            menjadi Admin, dan hanya melihat fitur kebersihan jika ditunjuk sebagai{' '}
            <strong>PIC Shift</strong>.
          </p>
        </div>
      </div>

      {/* Tambah Lokasi Dapur Baru (Opsional) */}
      {showAddKitchen && (
        <form
          onSubmit={handleAddKitchen}
          className="rounded-2xl border border-[var(--kl-tint-border)] bg-white p-5 flex flex-col sm:flex-row sm:items-end gap-3"
        >
          <div className="flex-1 space-y-1.5">
            <label
              htmlFor="new-kitchen-workspace"
              className="text-xs font-semibold text-[var(--kl-accent-deep)] inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--kl-accent)]" aria-hidden="true" />
              <span>Nama Lokasi Dapur Baru</span>
            </label>
            <input
              id="new-kitchen-workspace"
              type="text"
              value={newKitchenInput}
              onChange={(e) => setNewKitchenInput(e.target.value)}
              placeholder="Contoh: Dapur Container atau Dapur Pusat"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-[var(--kl-bg)] text-sm font-medium text-[var(--kl-ink)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--kl-accent)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddKitchen(false)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-xs font-semibold text-[var(--kl-ink-sub)] hover:bg-[var(--kl-soft)]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={addingKitchen}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold hover:bg-[var(--kl-accent-hover)] disabled:opacity-60 whitespace-nowrap"
            >
              {addingKitchen ? 'Menambahkan…' : 'Buat Lokasi Dapur'}
            </button>
          </div>
        </form>
      )}

      {/* Pengaturan Nama & Hapus Lokasi Dapur */}
      <div className="rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-4">
        <form
          onSubmit={handleSaveKitchenName}
          className="flex flex-col sm:flex-row sm:items-end gap-3"
        >
          <div className="flex-1 space-y-1.5">
            <label
              htmlFor="kitchen-name-input"
              className="text-xs font-semibold text-[var(--kl-ink-muted)] inline-flex items-center gap-1.5"
            >
              <Building2 className="w-3.5 h-3.5 text-[var(--kl-accent)]" aria-hidden="true" />
              <span>Nama Dapur Aktif</span>
            </label>
            <input
              id="kitchen-name-input"
              type="text"
              value={kitchenNameInput}
              onChange={(e) => setKitchenNameInput(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-[var(--kl-bg)] text-sm font-medium text-[var(--kl-ink)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--kl-accent)]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={savingKitchenName}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--kl-accent)] bg-white text-sm font-semibold text-[var(--kl-accent)] hover:bg-[var(--kl-tint)] whitespace-nowrap"
            >
              {savingKitchenName ? 'Menyimpan…' : 'Simpan Nama Dapur'}
            </button>

            {canDeleteActiveWorkspace && !confirmDeleteKitchen && (
              <button
                type="button"
                onClick={() => setConfirmDeleteKitchen(true)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] text-sm font-semibold text-[#991B1B] hover:bg-[#FEE2E2] inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span>Hapus Dapur Ini</span>
              </button>
            )}
          </div>
        </form>

        {confirmDeleteKitchen && canDeleteActiveWorkspace && (
          <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-[#B91C1C] shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1 text-xs text-[#7F1D1D]">
                <p className="font-bold text-sm text-[#991B1B]">
                  Hapus lokasi &ldquo;{state.kitchenName}&rdquo;?
                </p>
                <p className="leading-relaxed">
                  Tindakan ini akan menghapus daftar staf, jadwal shift, absensi, laporan
                  kebersihan, dan laporan barang khusus di <strong>{state.kitchenName}</strong>.
                  Lokasi dapur lain tetap aman dan tersimpan.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={deletingKitchen}
                onClick={() => setConfirmDeleteKitchen(false)}
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-[var(--kl-border-strong)] bg-white text-xs font-semibold text-[var(--kl-ink-sub)] hover:bg-[var(--kl-soft)]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deletingKitchen}
                onClick={handleDeleteCurrentKitchen}
                className="min-h-[40px] px-4 py-1.5 rounded-lg bg-[#B91C1C] text-white text-xs font-semibold hover:bg-[#991B1B] disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{deletingKitchen ? 'Menghapus…' : `Ya, Hapus ${state.kitchenName}`}</span>
              </button>
            </div>
          </div>
        )}

        {kitchenActionError && (
          <p className="text-xs font-medium text-[#B91C1C]" role="alert">
            {kitchenActionError}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form Tambah / Ubah Anggota */}
        <form
          onSubmit={handleSubmitMember}
          className="lg:col-span-5 rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[var(--kl-ink)] flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[var(--kl-accent)]" aria-hidden="true" />
              <span>{editingMemberId ? 'Ubah Data Staf' : 'Daftarkan Staf'}</span>
            </h2>
            {editingMemberId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-semibold text-[var(--kl-ink-muted)] hover:text-[var(--kl-ink)]"
              >
                Batal Edit
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="member-name" className="block text-sm font-medium text-[var(--kl-ink)]">
              Nama Lengkap
            </label>
            <input
              id="member-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Budi Santoso"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm text-[var(--kl-ink)]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="member-email" className="block text-sm font-medium text-[var(--kl-ink)]">
              Email (opsional)
            </label>
            <input
              id="member-email"
              type="email"
              readOnly={Boolean(editingMemberId)}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@gmail.com"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm text-[var(--kl-ink)]"
            />
            <p className="text-xs text-[var(--kl-ink-muted)]">
              Email tidak diperlukan untuk login staf. Berikan username dan password kepada staf secara pribadi.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="member-username" className="block text-sm font-medium text-[var(--kl-ink)]">Username</label>
            <input id="member-username" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} required={!editingMemberId} minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,31}" value={username} onChange={e => setUsername(e.target.value)} placeholder="Contoh: budi.koki" className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kl-border-strong)]"/>
            <p className="text-xs text-[var(--kl-ink-muted)]">3–32 karakter: huruf, angka, titik, garis bawah, tanda hubung.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="member-password" className="block text-sm font-medium text-[var(--kl-ink)]">{editingMemberId ? 'Password baru (opsional)' : 'Password'}</label>
            <input id="member-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required={!editingMemberId} minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kl-border-strong)]"/>
            <button type="button" aria-controls="member-password" aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)} className="min-h-[44px] text-sm font-semibold text-[var(--kl-accent)]">{showPassword ? 'Sembunyikan password' : 'Tampilkan password'}</button>
            <p className="text-xs text-[var(--kl-ink-muted)]">Password lama tidak dapat dilihat. {editingMemberId ? 'Isi password baru untuk reset; sesi akun akan berakhir.' : 'Minimal 8 karakter. Login ditampilkan setelah pendaftaran berhasil.'}</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="member-job" className="block text-sm font-medium text-[var(--kl-ink)]">
              Jabatan / Posisi Operasional
            </label>
            <div className="flex flex-wrap gap-1.5">
              {POSITION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setJobTitle(preset);
                    setRole('staff');
                  }}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                    jobTitle === preset
                      ? 'border-[var(--kl-accent)] bg-[var(--kl-tint)] text-[var(--kl-accent-deep)]'
                      : 'border-[var(--kl-border)] bg-[var(--kl-bg)] text-[var(--kl-ink-sub)] hover:bg-[var(--kl-soft)]'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              id="member-job"
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Atau ketik posisi lain, misal: Koki Senior"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kl-border-strong)] bg-white text-sm text-[var(--kl-ink)]"
            />
          </div>

          <p className="text-xs text-[var(--kl-ink-muted)]">Semua anggota baru memiliki akses Staf. Hanya admin@gmail.com memiliki akses Admin.</p>

          {formError && (
            <p className="text-xs font-medium text-[#B91C1C]" role="alert">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="min-h-[48px] w-full px-5 py-3 rounded-xl bg-[var(--kl-accent)] text-white text-sm font-semibold hover:bg-[var(--kl-accent-hover)] disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>
              {submitting
                ? 'Menyimpan…'
                : editingMemberId
                ? 'Simpan Perubahan'
                : `Tambahkan ke ${state.kitchenName}`}
            </span>
          </button>
        </form>

        {/* Daftar Anggota Terdaftar */}
        <section className="lg:col-span-7 rounded-2xl border border-[var(--kl-border)] bg-white p-5 space-y-4">
          {savedCredentials && <div role="status" className="rounded-xl border border-[var(--kl-tint-border)] bg-[var(--kl-tint)] p-4 space-y-2">
            <h3 className="font-semibold">Login staf berhasil disimpan</h3>
            <p>Username: <code>{savedCredentials.username}</code></p>
            <p>Password: <code className="break-all select-all">{savedCredentials.password}</code></p>
            <p className="text-xs">Berikan secara pribadi. Password hanya ditampilkan pada sesi halaman ini; tidak disimpan sebagai teks di server.</p>
            <button type="button" onClick={() => setSavedCredentials(null)} className="min-h-[44px] text-sm font-semibold text-[var(--kl-accent)]">Tutup informasi login</button>
          </div>}
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[var(--kl-ink)] flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--kl-accent)]" aria-hidden="true" />
              <span>
                Anggota {state.kitchenName} ({state.users.length}/25)
              </span>
            </h2>
          </div>

          <div className="divide-y divide-[var(--kl-border)]">
            {state.users.map((member) => {
              const isSelf = currentUser?.email.toLowerCase() === member.email.toLowerCase();
              return (
                <div
                  key={member.id}
                  className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[var(--kl-ink)]">{member.name}</span>
                      <span
                        className={`text-xs font-semibold ${
                          member.role === 'supervisor'
                            ? 'text-[var(--kl-accent)]'
                            : 'text-[var(--kl-ink-muted)]'
                        } inline-flex items-center gap-1`}
                      >
                        {member.role === 'supervisor' && (
                          <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        {member.role === 'supervisor' ? 'Admin' : 'Staf'}
                      </span>
                      {isSelf && (
                        <span className="text-xs font-medium text-[var(--kl-accent)]">
                          · Akun Anda
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-[var(--kl-ink-sub)]">
                      Posisi: {member.jobTitle}
                    </p>
                    <p className="text-xs text-[var(--kl-ink-muted)] inline-flex items-center gap-1.5 truncate">
                      <Mail
                        className="w-3.5 h-3.5 text-[var(--kl-ink-muted)] shrink-0"
                        aria-hidden="true"
                      />
                      <span className="truncate">{member.username ? `Username: ${member.username}` : member.email}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(member)}
                      disabled={Boolean(member.geasteatsStaffId)}
                      title={member.geasteatsStaffId ? 'Dikelola di Geasteats' : undefined}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--kl-border-strong)] bg-[var(--kl-bg)] text-xs font-semibold text-[var(--kl-ink)] hover:bg-[var(--kl-soft)] inline-flex items-center gap-1.5"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Ubah</span>
                    </button>

                    {!isSelf && !member.geasteatsStaffId && (
                      <button
                        type="button"
                        onClick={() => handleRemove(member)}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] text-xs font-semibold text-[#991B1B] hover:bg-[#FEE2E2] inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
