// Credentials are global: never claim an existing account through its email.
export function registerStaffAccounts(router, { getPool, loadWorkspace, uid, hashPassword, isEmail }) {
  const list = value => String(value || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const fail = (status, message) => Object.assign(new Error(message), { status });
  async function mutate(req, res, mode) {
    const b = req.body ?? {};
    const workspaceId = mode === 'delete' ? req.query.workspaceId : b.workspaceId;
    let c;
    try {
      if (typeof workspaceId !== 'string' || !workspaceId || workspaceId.length > 64) throw fail(400, 'workspaceId tidak valid.');
      const access = await loadWorkspace(req.user.id, req.user.email, workspaceId);
      if (access.error) throw fail(access.status, access.error);
      if (!access.isSupervisor) throw fail(403, 'Hanya Admin yang dapat mengelola anggota tim.');
      const hasUsername = Object.hasOwn(b, 'username');
      const hasPassword = Object.hasOwn(b, 'password');
      const username = typeof b.username === 'string' ? b.username.trim().toLowerCase() : null;
      if (mode !== 'delete') {
        if ((mode === 'create' || hasUsername) && (!username || !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))) throw fail(400, 'Username harus 3–32 karakter (huruf, angka, titik, garis bawah, tanda hubung).');
        if ((mode === 'create' || hasPassword) && (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 128)) throw fail(400, 'Password harus 8–128 karakter.');
        if (typeof b.name !== 'string' || b.name.trim().length < 2 || b.name.trim().length > 100) throw fail(400, 'Nama harus 2–100 karakter.');
        if (b.role === 'supervisor') throw fail(403, 'Admin tidak dapat dibuat melalui pengelolaan staf.');
        if (b.role !== undefined && b.role !== 'staff') throw fail(400, 'Peran tidak valid.');
        if (b.jobTitle !== undefined && (typeof b.jobTitle !== 'string' || b.jobTitle.length > 120)) throw fail(400, 'Jabatan tidak valid.');
        if (b.email !== undefined && b.email !== '' && (typeof b.email !== 'string' || b.email.length > 200 || !isEmail(b.email))) throw fail(400, 'Email tidak valid.');
      }
      c = await getPool().getConnection();
      await c.beginTransaction();
      const [[ws]] = await c.query('SELECT * FROM workspaces WHERE id = ? FOR UPDATE', [workspaceId]);
      if (!ws) throw fail(404, 'Ruang kerja tidak ditemukan.');
      // Recheck authorization under lock, including exact CSV entries.
      if (req.user.id !== 'u_supervisor_75d4f29fee493805' || req.user.email.toLowerCase() !== 'admin@gmail.com' || !(ws.owner_id === req.user.id || list(ws.member_emails).includes(req.user.email.toLowerCase()))) throw fail(403, 'Akses ditolak.');
      let staff, user;
      if (mode !== 'create') {
        const [[row]] = await c.query('SELECT * FROM staff WHERE id = ? AND workspace_id = ? FOR UPDATE', [req.params.id, workspaceId]);
        staff = row;
        if (!staff) throw fail(404, 'Anggota tidak ditemukan.');
        if (staff.email.toLowerCase() === 'admin@gmail.com') throw fail(403, 'Akun Admin tidak dapat diubah di sini.');
        const [[account]] = await c.query('SELECT * FROM users WHERE email = ? FOR UPDATE', [staff.email]);
        user = account;
        if (user?.geasteats_staff_id) throw fail(403, 'Profil dan akun Geasteats dikelola di Geasteats.');
      }
      let email = staff?.email;
      let id = staff?.id;
      if (mode !== 'delete') {
        const role = 'staff';
        const job = b.jobTitle ?? staff?.job_title ?? (role === 'supervisor' ? 'Admin Operasional' : 'Staf Dapur');
        const name = b.name.trim();
        if (mode === 'create') {
          id = uid('u');
          email = b.email ? b.email.trim().toLowerCase() : `${id}@accounts.dapurops.invalid`;
          await c.query('INSERT INTO users (id, email, username, password_hash, name, role, job_title) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, email, username, hashPassword(b.password), name, role, job]);
          await c.query('INSERT INTO staff (id, workspace_id, name, email, role, job_title) VALUES (?, ?, ?, ?, ?, ?)', [id, workspaceId, name, email, role, job]);
        } else {
          // Email is the existing membership key. Changing it would transfer identity.
          if (b.email && b.email.trim().toLowerCase() !== email.toLowerCase()) throw fail(400, 'Email akun tidak dapat diganti di sini.');
          if (hasUsername || hasPassword) {
            // A workspace supervisor cannot reset credentials belonging to another workspace.
            const [others] = await c.query('SELECT id FROM workspaces WHERE id <> ? AND (owner_id = ? OR FIND_IN_SET(?, REPLACE(member_emails, " ", "")) > 0) LIMIT 1 FOR UPDATE', [workspaceId, user?.id || '', email]);
            const [otherStaff] = await c.query('SELECT id FROM staff WHERE workspace_id <> ? AND email = ? LIMIT 1 FOR UPDATE', [workspaceId, email]);
            if (others.length || otherStaff.length) throw fail(403, 'Akun bersama ruang kerja lain tidak dapat diatur ulang.');
            if (!user && !(hasUsername && hasPassword)) throw fail(400, 'Akun baru memerlukan username dan password.');
            if (!user) {
              await c.query('INSERT INTO users (id, email, username, password_hash, name, role, job_title) VALUES (?, ?, ?, ?, ?, ?, ?)', [uid('u'), email, username, hashPassword(b.password), name, role, job]);
            } else {
              if (hasUsername) await c.query('UPDATE users SET username = ? WHERE id = ?', [username, user.id]);
              if (hasPassword) {
                await c.query('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [hashPassword(b.password), user.id]);
                await c.query('DELETE FROM sessions WHERE user_id = ?', [user.id]);
              }
            }
          }
          await c.query('UPDATE staff SET name = ?, role = ?, job_title = ? WHERE id = ? AND workspace_id = ?', [name, role, job, id, workspaceId]);
        }
        const members = [...new Set([...list(ws.member_emails), email.toLowerCase()])];
        const sups = list(ws.supervisor_emails).filter(x => x !== email.toLowerCase());
        if (role === 'supervisor') sups.push(email.toLowerCase());
        await c.query('UPDATE workspaces SET member_emails = ?, supervisor_emails = ? WHERE id = ?', [members.join(','), sups.join(','), workspaceId]);
      } else {
        await c.query('DELETE FROM staff WHERE id = ? AND workspace_id = ?', [id, workspaceId]);
        const [remaining] = await c.query('SELECT id FROM staff WHERE workspace_id = ? AND email = ?', [workspaceId, email]);
        if (!remaining.length) await c.query('UPDATE workspaces SET member_emails = ?, supervisor_emails = ? WHERE id = ?', [list(ws.member_emails).filter(x => x !== email.toLowerCase()).join(','), list(ws.supervisor_emails).filter(x => x !== email.toLowerCase()).join(','), workspaceId]);
        // Membership removal never deletes a global user or resets their credentials.
      }
      await c.commit();
      res.status(mode === 'create' ? 201 : 200).json({ ok: true, id });
    } catch (err) {
      if (c) await c.rollback();
      res.status(err.status || (err.code === 'ER_DUP_ENTRY' ? 409 : 500)).json({ error: err.status ? err.message : err.code === 'ER_DUP_ENTRY' ? 'Username atau email sudah digunakan.' : 'Gagal menyimpan anggota tim.' });
    } finally { c?.release(); }
  }
  router.post('/staff', (req, res) => mutate(req, res, 'create'));
  router.patch('/staff/:id', (req, res) => mutate(req, res, 'edit'));
  router.delete('/staff/:id', (req, res) => mutate(req, res, 'delete'));
}
