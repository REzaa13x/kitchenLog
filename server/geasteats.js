import crypto from 'node:crypto';

// Server-only client. No upstream payload/error is forwarded to browsers.
export function createGeasteats({ getPool, hashPassword }) {
  const fail = (status, message) => Object.assign(new Error(message), { status });
  const enabled = () => Boolean(process.env.DAPUROPS_INTEGRATION_KEY);
  const workspaceId = () => process.env.GEASTEATS_WORKSPACE_ID || 'ws-u_mwsxhkk6b2fea13f';
  let cached = null;
  function staff(value) {
    if (!value || typeof value.id !== 'string' || !value.id.trim() || value.id.length > 128 || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100 || typeof value.email !== 'string' || value.email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim()) || typeof value.status !== 'string' || (value.phone != null && (typeof value.phone !== 'string' || value.phone.length > 50))) throw fail(503, 'Data Geasteats tidak valid.');
    return { id: value.id, name: value.name.trim(), email: value.email.trim().toLowerCase(), phone: value.phone || null, status: value.status };
  }
  async function call(path, body) {
    if (!enabled()) throw fail(503, 'Integrasi Geasteats belum dikonfigurasi.');
    try {
      const origin = new URL(process.env.GEASTEATS_URL || 'https://geasteats.ngolab.online');
      if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname))) throw Error('HTTPS required');
      const response = await fetch(new URL('/api/integrations/dapurops/' + path, origin), { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(5000), headers: { 'x-api-key': process.env.DAPUROPS_INTEGRATION_KEY, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (body && [401, 404].includes(response.status)) return null;
      if (!response.ok) throw Error('Upstream unavailable');
      return await response.json();
    } catch { throw fail(503, 'Geasteats tidak dapat dihubungi.'); }
  }
  async function roster(fresh = false) {
    if (!fresh && cached && cached.until > Date.now()) return cached.rows;
    const data = await call('staff');
    if (!Array.isArray(data?.staff)) throw fail(503, 'Data Geasteats tidak valid.');
    const rows = data.staff.map(staff);
    if (new Set(rows.map(s => s.id)).size !== rows.length || new Set(rows.map(s => s.email)).size !== rows.length) throw fail(503, 'Data Geasteats tidak valid.');
    // ponytail: one process cache, maximum 30s revocation latency; shared cache only for scale.
    cached = { rows, until: Date.now() + 30000 };
    return rows;
  }
  async function save(s, authenticated) {
    const c = await getPool().getConnection();
    try {
      await c.beginTransaction();
      const [[ws]] = await c.query('SELECT * FROM workspaces WHERE id = ? FOR UPDATE', [workspaceId()]);
      if (!ws) throw fail(503, 'Workspace Geasteats tidak ditemukan.');
      let [[user]] = await c.query('SELECT * FROM users WHERE geasteats_staff_id = ? FOR UPDATE', [s.id]);
      const [[emailUser]] = await c.query('SELECT * FROM users WHERE email = ? FOR UPDATE', [s.email]);
      if (!user && emailUser) {
        if (!authenticated || emailUser.geasteats_staff_id) { await c.rollback(); return null; }
        user = emailUser;
        await c.query('DELETE FROM sessions WHERE user_id=?', [user.id]);
      }
      if (user && emailUser && emailUser.id !== user.id) throw fail(409, 'Email Geasteats sudah digunakan akun lain.');
      if (!user) {
        const id = 'u_' + crypto.randomBytes(16).toString('hex');
        await c.query('INSERT INTO users (id,email,password_hash,name,phone,role,geasteats_staff_id) VALUES (?,?,?,?,?,\'staff\',?)', [id,s.email,hashPassword(crypto.randomBytes(48).toString('hex')),s.name,s.phone,s.id]);
        user = { id, email: s.email };
      }
      await c.query('UPDATE users SET geasteats_staff_id=?,name=?,email=?,phone=? WHERE id=?', [s.id,s.name,s.email,s.phone,user.id]);
      // Preserve membership IDs and operational references when an upstream email changes.
      await c.query('UPDATE staff SET name=?,email=? WHERE email=?', [s.name,s.email,user.email]);
      const [memberships] = await c.query('SELECT id,member_emails,supervisor_emails FROM workspaces FOR UPDATE');
      for (const w of memberships) {
        const replace = value => [...new Set(String(value || '').split(',').filter(Boolean).map(e => e.trim().toLowerCase() === user.email.toLowerCase() ? s.email : e.trim().toLowerCase()))];
        const members = replace(w.member_emails);
        if (w.id === ws.id && !members.includes(s.email)) members.push(s.email);
        await c.query('UPDATE workspaces SET member_emails=?,supervisor_emails=? WHERE id=?', [members.join(','),replace(w.supervisor_emails).join(','),w.id]);
      }
      const [[membership]] = await c.query('SELECT id FROM staff WHERE workspace_id=? AND email=? LIMIT 1', [ws.id,s.email]);
      if (!membership) await c.query('INSERT INTO staff (id,workspace_id,name,email,role,job_title) VALUES (?,?,?,?,\'staff\',\'Staf Dapur\')', ['s_'+crypto.randomBytes(16).toString('hex'),ws.id,s.name,s.email]);
      const [[saved]] = await c.query('SELECT * FROM users WHERE id=?', [user.id]);
      await c.commit();
      return saved;
    } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
  }
  return {
    enabled,
    async login(email, password) {
      const data = await call('login', { email, password });
      if (!data) return null;
      const s = staff(data.staff);
      if (s.status !== 'active') throw fail(401, 'Akun Geasteats tidak aktif.');
      const user = await save(s, true);
      if (!user) throw fail(409, 'Identitas Geasteats tidak cocok.');
      return user;
    },
    async active(id) { return (await roster()).some(s => s.id === id && s.status === 'active'); },
    async sync() {
      const rows = await roster(true);
      let synced = 0, skipped = 0;
      for (const s of rows) {
        if (s.status !== 'active') continue;
        if (await save(s, false)) synced++; else skipped++;
      }
      const [linked] = await getPool().query('SELECT id,geasteats_staff_id FROM users WHERE geasteats_staff_id IS NOT NULL');
      for (const u of linked) if (!rows.some(s => s.id === u.geasteats_staff_id && s.status === 'active')) await getPool().query('DELETE FROM sessions WHERE user_id=?', [u.id]);
      return { synced, skipped };
    },
  };
}
