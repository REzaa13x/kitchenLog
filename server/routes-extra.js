// Endpoint tambahan (staff, jadwal, konfirmasi absensi, workspace).
// Diimpor oleh server/index.js sebelum penanganan 404.
import { Router } from 'express';
import { registerStaffAccounts } from './staff-accounts.js';


export function registerExtraRoutes(app, ctx) {
  const { getPool, requireAuth, loadWorkspace, uid, wibNow, isEmail } = ctx;

  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 128 && !/[\s,]/.test(id);
  async function workspaceIdentities(connection, workspaceId) {
    const [rows] = await connection.query(`SELECT u.id, u.email, s.id AS staff_id FROM users u
      JOIN workspaces w ON w.id = ? AND FIND_IN_SET(u.email, REPLACE(w.member_emails, ' ', '')) > 0
      LEFT JOIN staff s ON s.workspace_id = w.id AND s.email = u.email
      UNION ALL SELECT s.id, s.email, s.id AS staff_id FROM staff s
      WHERE s.workspace_id = ? AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = s.email)`, [workspaceId, workspaceId]);
    const identities = new Map();
    for (const row of rows) { identities.set(row.id, row); if (row.staff_id) identities.set(row.staff_id, row); }
    return identities;
  }
  const router = Router();
  router.use(requireAuth);

  // ---------- Workspace ----------
  router.post('/workspaces', async (req, res) => {
    if (req.user.role !== 'supervisor') return res.status(403).json({ error: 'Hanya Admin yang dapat membuat dapur.' });

    const { kitchenName } = req.body ?? {};
    const cleanName = String(kitchenName || '').trim().slice(0, 120);
    if (!cleanName) return res.status(400).json({ error: 'Nama dapur wajib diisi.' });
    try {
      const p = getPool();
      const [managed] = await p.query("SELECT id FROM workspaces WHERE owner_id = ? OR (FIND_IN_SET(?, REPLACE(member_emails, ' ', '')) > 0 AND FIND_IN_SET(?, REPLACE(supervisor_emails, ' ', '')) > 0) LIMIT 1", [req.user.id, req.user.email, req.user.email]);
      if (!managed.length) return res.status(403).json({ error: 'Hanya Admin yang dapat membuat dapur.' });
      const wsId = uid('dapur').slice(0, 64);
      await p.query(
        `INSERT INTO workspaces (id, kitchen_name, owner_id, owner_email, member_emails, supervisor_emails)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [wsId, cleanName, req.user.id, req.user.email, req.user.email, req.user.email]
      );
      await p.query(
        `INSERT INTO staff (id, workspace_id, name, email, role, job_title)
         VALUES (?, ?, ?, ?, 'supervisor', 'Admin Operasional')`,
        [`sup-${req.user.id}-${Date.now().toString(36)}`.slice(0, 128), wsId, req.user.name, req.user.email]
      );
      res.status(201).json({ ok: true, workspace: { id: wsId, kitchenName: cleanName } });
    } catch (err) {
      res.status(500).json({ error: 'Gagal membuat ruang kerja.', detail: String(err?.message || err) });
    }
  });

  router.patch('/workspaces/:id', async (req, res) => {
    const { kitchenName } = req.body ?? {};
    const cleanName = String(kitchenName || '').trim().slice(0, 120);
    if (!cleanName) return res.status(400).json({ error: 'Nama dapur wajib diisi.' });
    try {
      const access = await loadWorkspace(req.user.id, req.user.email, req.params.id);
      if (access.error) return res.status(access.status).json({ error: access.error });
      if (!access.isSupervisor) return res.status(403).json({ error: 'Hanya Admin yang dapat mengubah nama dapur.' });
      await getPool().query('UPDATE workspaces SET kitchen_name = ? WHERE id = ?', [cleanName, req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Gagal memperbarui nama dapur.', detail: String(err?.message || err) });
    }
  });

  router.delete('/workspaces/:id', async (req, res) => {
    try {
      const access = await loadWorkspace(req.user.id, req.user.email, req.params.id);
      if (access.error) return res.status(access.status).json({ error: access.error });
      if (!access.isSupervisor) {
        return res.status(403).json({ error: 'Hanya pemilik ruang kerja yang dapat menghapusnya.' });
      }
      await getPool().query('DELETE FROM workspaces WHERE id = ?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Gagal menghapus ruang kerja.', detail: String(err?.message || err) });
    }
  });

  registerStaffAccounts(router, ctx);

  // ---------- Jadwal shift ----------
  router.post('/assignments', async (req, res) => {
    const { workspaceId, date, shift, staffIds, picId } = req.body ?? {};
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1000-01-01' || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return res.status(400).json({ error: 'Tanggal tidak valid.' });
    if (!['opening', 'closing'].includes(shift)) return res.status(400).json({ error: 'Shift tidak valid.' });
    if (!Array.isArray(staffIds) || staffIds.length === 0 || staffIds.length > 100 || !staffIds.every(validId) || new Set(staffIds).size !== staffIds.length || !validId(picId)) return res.status(400).json({ error: 'Pilih 1–100 staf unik dan PIC yang valid.' });
    let connection;
    try {
      const access = await loadWorkspace(req.user.id, req.user.email, String(workspaceId || ''));
      if (access.error) return res.status(access.status).json({ error: access.error });
      if (!access.isSupervisor) return res.status(403).json({ error: 'Hanya Admin yang dapat mengatur jadwal.' });
      connection = await getPool().getConnection();
      await connection.beginTransaction();
      // Serialize creation too: a nonexistent assignment cannot yet be row-locked.
      await connection.query('SELECT id FROM workspaces WHERE id = ? FOR UPDATE', [workspaceId]);
      const identities = await workspaceIdentities(connection, workspaceId);
      const ids = staffIds.map(id => identities.get(id)?.id);
      const pic = identities.get(picId)?.id;
      if (ids.some(id => !id) || new Set(ids).size !== ids.length || !pic || !ids.includes(pic)) fail(400, 'Staf dan PIC harus anggota dapur; PIC harus masuk jadwal.');
      const [[existing]] = await connection.query('SELECT * FROM assignments WHERE workspace_id = ? AND shift_date = ? AND shift = ? FOR UPDATE', [workspaceId, date, shift]);
      const id = existing?.id || uid('asg').slice(0, 128);
      if (existing) {
        const oldIds = existing.staff_ids.split(',').map(id => identities.get(id)?.id || id).sort();
        const unchanged = JSON.stringify(oldIds) === JSON.stringify([...ids].sort()) && (identities.get(existing.pic_id)?.id || existing.pic_id) === pic;
        if (!unchanged) {
          const [attendance] = await connection.query('SELECT id FROM attendance WHERE workspace_id = ? AND assignment_id = ? LIMIT 1 FOR UPDATE', [workspaceId, id]);
          if (attendance.length) fail(409, 'Jadwal dengan riwayat absensi tidak dapat diubah.');
          await connection.query('UPDATE assignments SET staff_ids = ?, pic_id = ? WHERE id = ? AND workspace_id = ?', [ids.join(','), pic, id, workspaceId]);
        }
      } else await connection.query('INSERT INTO assignments (id, workspace_id, shift_date, shift, staff_ids, pic_id) VALUES (?, ?, ?, ?, ?, ?)', [id, workspaceId, date, shift, ids.join(','), pic]);
      await connection.commit();
      res.status(201).json({ ok: true, id });
    } catch (err) {
      if (connection) await connection.rollback();
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Gagal menyimpan jadwal.' });
    } finally { connection?.release(); }
  });

  // ---------- Konfirmasi ketidakhadiran (Izin/Sakit/Alpa) ----------
  router.post('/attendance/absence', async (req, res) => {
    const { workspaceId, assignmentId, staffId, status, note } = req.body ?? {};
    if (!['Izin', 'Sakit', 'Alpa'].includes(status)) return res.status(400).json({ error: 'Status tidak valid.' });
    if (!validId(staffId) || !validId(assignmentId) || typeof note !== 'string' || !note.trim() || note.length > 1000) return res.status(400).json({ error: 'Staf, jadwal, dan alasan 1–1000 karakter wajib diisi.' });
    let connection;
    try {
      const access = await loadWorkspace(req.user.id, req.user.email, String(workspaceId || ''));
      if (access.error) return res.status(access.status).json({ error: access.error });
      if (!access.isSupervisor) return res.status(403).json({ error: 'Hanya Admin yang dapat mengonfirmasi ketidakhadiran.' });

      connection = await getPool().getConnection();
      await connection.beginTransaction();
      const [[asg]] = await connection.query('SELECT * FROM assignments WHERE id = ? AND workspace_id = ? FOR UPDATE', [assignmentId, workspaceId]);
      if (!asg) fail(404, 'Jadwal shift tidak ditemukan.');
      const identities = await workspaceIdentities(connection, workspaceId);
      const target = identities.get(staffId);
      if (!target) fail(400, 'Staf bukan anggota dapur.');
      if (!asg.staff_ids.split(',').some(id => (identities.get(id)?.id || id) === target.id)) fail(403, 'Staf tidak ditugaskan pada jadwal ini.');
      const [existing] = await connection.query('SELECT * FROM attendance WHERE workspace_id = ? AND assignment_id = ? AND (staff_id = ? OR staff_id = ? OR staff_email = ?) FOR UPDATE', [workspaceId, assignmentId, target.id, target.staff_id || target.id, target.email]);
      if (existing.some(row => row.check_in_time != null || row.check_in_minutes != null || row.check_out_time != null || row.check_out_minutes != null || row.check_in_photo_id != null || row.check_out_photo_id != null)) fail(409, 'Absensi hadir tidak dapat diubah menjadi ketidakhadiran.');
      if (existing.length > 1) fail(409, 'Riwayat absensi ganda memerlukan koreksi Admin.');
      const id = existing[0]?.id || uid('att');
      if (existing.length) await connection.query('UPDATE attendance SET supervisor_status = ?, supervisor_note = ? WHERE id = ? AND workspace_id = ?', [status, note.trim(), id, workspaceId]);
      else await connection.query('INSERT INTO attendance (id, workspace_id, assignment_id, att_date, shift, staff_id, staff_email, supervisor_status, supervisor_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, workspaceId, assignmentId, asg.shift_date instanceof Date ? asg.shift_date.toISOString().slice(0, 10) : String(asg.shift_date).slice(0, 10), asg.shift, target.id, target.email, status, note.trim()]);
      await connection.commit();
      res.json({ ok: true });
    } catch (err) {
      if (connection) await connection.rollback();
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Gagal mengonfirmasi ketidakhadiran.' });
    } finally { connection?.release(); }
  });

  // ---------- Ringkasan serah terima (konfirmasi) ----------
  router.post('/cleanliness/:id/confirm-summary', async (req, res) => {
    const { workspaceId, summary, handoverNote } = req.body ?? {};
    const cleanSummary = String(summary || '').trim().slice(0, 1500);
    if (!cleanSummary) return res.status(400).json({ error: 'Ringkasan tidak boleh kosong.' });
    try {
      const access = await loadWorkspace(req.user.id, req.user.email, String(workspaceId || ''));
      if (access.error) return res.status(access.status).json({ error: access.error });
      const now = wibNow();
      await getPool().query(
        `UPDATE cleanliness_reports
            SET confirmed_summary = ?, summary_confirmed_at = ?, summary_confirmed_by = ?,
                handover_note = COALESCE(?, handover_note)
          WHERE id = ? AND workspace_id = ?`,
        [cleanSummary, `${now.date} ${now.time} WIB`, req.user.name,
          handoverNote == null ? null : String(handoverNote), req.params.id, workspaceId]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Gagal mengonfirmasi ringkasan.', detail: String(err?.message || err) });
    }
  });

  app.use('/api', router);
}
