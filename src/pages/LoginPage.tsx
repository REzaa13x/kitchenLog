import React, { useState } from 'react';
import { ChefHat, Eye, EyeOff } from 'lucide-react';
import { useKitchen } from '../storage/kitchenContext';

const inputClass = 'w-full min-h-[48px] rounded-xl border border-[#D4CEC0] bg-white px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]';
export const LoginPage: React.FC = () => {
  const { firebaseUser, workspaceAccessStatus, authError, signInWithEmail, signOutGoogle, recheckWorkspaceAccess } = useKitchen();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const uninvited = Boolean(firebaseUser && workspaceAccessStatus === 'uninvited');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!username.trim() || !password) { setError('Username dan password wajib diisi.'); return; }
    setBusy(true);
    try { await signInWithEmail(username.trim(), password); }
    catch (err) { setError(err instanceof Error ? err.message : 'Gagal masuk. Coba kembali.'); }
    finally { setBusy(false); }
  };
  const recheck = async () => {
    setBusy(true);
    try { await recheckWorkspaceAccess(); }
    catch { setError('Gagal memeriksa akses. Coba kembali.'); }
    finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-[#FAF7F0] flex items-center justify-center px-4 py-10 text-[#1A211D]">
    <section className="w-full max-w-md rounded-2xl border border-[#E5DFD0] bg-white p-6 sm:p-8 space-y-6 shadow-sm">
      <div className="flex items-center gap-3 font-bold text-[#1B4332]"><ChefHat aria-hidden="true" className="h-8 w-8"/><span>DapurOps · Ngolab</span></div>
      <div className="space-y-2"><h1 className="text-2xl font-bold">{uninvited ? 'Akses dapur belum tersedia' : 'Masuk ke Operasional Dapur'}</h1>
        <p className="text-sm leading-relaxed text-[#55625A]">{uninvited ? 'Hubungi Admin untuk mendapatkan akses dapur yang sesuai.' : 'Gunakan email dan password Geasteats. Akun lama DapurOps masih dapat digunakan.'}</p></div>
      {(error || authError) && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error || authError}</p>}
      {uninvited ? <div className="flex gap-3">
        <button type="button" disabled={busy} onClick={recheck} className="min-h-[48px] rounded-xl bg-[#1B4332] px-4 text-white disabled:opacity-60">Periksa Akses</button>
        <button type="button" onClick={() => void signOutGoogle()} className="min-h-[48px] rounded-xl border px-4">Keluar</button>
      </div> : <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5"><label htmlFor="login-username" className="text-sm font-semibold">Username</label>
          <input id="login-username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={200} required value={username} onChange={e => setUsername(e.target.value)} placeholder="Username staf atau email supervisor" className={inputClass}/></div>
        <div className="space-y-1.5"><label htmlFor="login-password" className="text-sm font-semibold">Password</label>
          <div className="relative"><input id="login-password" type={visible ? 'text' : 'password'} autoComplete="current-password" maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} className={inputClass + ' pr-14'}/>
            <button type="button" aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'} aria-pressed={visible} onClick={() => setVisible(!visible)} className="absolute right-1 top-0 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl focus:ring-2 focus:ring-[#1B4332]">{visible ? <EyeOff aria-hidden="true" size={20}/> : <Eye aria-hidden="true" size={20}/>}</button></div></div>
        <button type="submit" disabled={busy} className="w-full min-h-[48px] rounded-xl bg-[#1B4332] text-white font-semibold hover:bg-[#255A43] disabled:opacity-60">{busy ? 'Memproses…' : 'Masuk'}</button>
      </form>}
      <p className="text-xs leading-relaxed text-[#55625A] rounded-xl bg-[#FAF7F0] p-3">Akun hanya dibuat oleh Admin melalui menu Tim &amp; Hak Akses. Lupa password? Hubungi Admin untuk mengatur ulang.</p>
    </section>
  </main>;
};
