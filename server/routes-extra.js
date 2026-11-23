// Endpoint tambahan (staff, jadwal, konfirmasi absensi, workspace).
// Diimpor oleh server/index.js sebelum penanganan 404.
import { Router } from 'express';
import { registerStaffAccounts } from './staff-accounts.js';


export function registerExtraRoutes(app, ctx) {
  const { getPool, requireAuth, loadWorkspace, uid, wibNow, isEmail } = ctx;

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
      if (!managed.length) return res.status(403).json({ error: 'Hanya Supervisor yang dapat membuat dapur.' });
      const wsId = uid('dapur').slice(0, 64);
      await p.query(
        `INSERT INTO workspaces (id, kitchen_name, owner_id, owner_email, member_emails, supervisor_emails)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [wsId, cleanName, req.user.id, req.user.email, req.user.email, req.user.email]
      );
      await p.query(
        `INSERT INTO staff (id, workspace_id, name, email, role, job_title)
         VALUES (?, ?, ?, ?, 'supervisor', 'Supervisor Operasional')`,
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
      if (!access.isSupervisor) return res.status(403).json({ error: 'Hanya Supervisor yang dapat mengubah nama dapur.' });
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return res.status(400).json({ error: 'Tanggal tidak valid.' });
    if (!['opening', 'closing'].includes(shift)) return res.status(400).json({ error: 'Shift tidak valid.' });
    if (!Array.isArray(staffIds) || staffIds.length === 0) return res.status(400).json({ error: 'Pilih minimal satu staf.' });
    if (!picId) return res.status(400).json({ error: 'PIC shift wajib dipilih.' });
    try {
      const access = await loadWorkspace(req.user.id, req.user.email, String(workspaceId || ''));
      if (access.error) return res.status(access.status).json({ error: access.error });
      if (!access.isSupervisor) return res.status(403).json({ error: 'Hanya Supervisor yang dapat mengatur jadwal.' });
      const id = uid('asg').slice(0, 128);
      await getPool().query(
        `INSERT INTO assignments (id, workspace_id, shift_date, shift, staff_ids, pic_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE staff_ids = VALUES(staff_ids), pic_id = VALUES(pic_id)`,
        [id, workspaceId, date, shift, staffIds.join(','), picId]
      );
      res.status(201).json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: 'Gagal menyimpan jadwal.', detail: String(err?.message || err) });
    }
  });

  // ---------- Konfirmasi ketidakhadiran (Izin/Sakit/Alpa) ----------
  router.post('/attendance/absence', async (req, res) => {
    const { workspaceId, assignmentId, staffId, status, note } = req.body ?? {};
    if (!['Izin', 'Sakit', 'Alpa'].includes(status)) return res.status(400).json({ error: 'Status tidak valid.' });
    try {
      const access = await loadWorkspace(req.user.id, req.user.email, String(workspaceId || ''));
      if (access.error) return res.status(access.status).json({ error: access.error });
      if (!access.isSupervisor) return res.status(403).json({ error: 'Hanya Supervisor yang dapat mengonfirmasi ketidakhadiran.' });

      const p = getPool();
      const [asg] = await p.query('SELECT shift, shift_date FROM assignments WHERE id = ? AND workspace_id = ? LIMIT 1', [assignmentId, workspaceId]);
      if (asg.length === 0) return res.status(404).json({ error: 'Jadwal shift tidak ditemukan.' });

      const [staf] = await p.query('SELECT email FROM staff WHERE id = ? LIMIT 1', [staffId]);
      const staffEmail = staf.length > 0 ? staf[0].email : '';

      await p.query(
        `INSERT INTO attendance (id, workspace_id, assignment_id, att_date, shift, staff_id, staff_email,
           supervisor_status, supervisor_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE supervisor_status = VALUES(supervisor_status),
           supervisor_note = VALUES(supervisor_note)`,
        [uid('att'), workspaceId, assignmentId, String(asg[0].shift_date).slice(0, 10), asg[0].shift,
          staffId, staffEmail, status, note || null]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Gagal mengonfirmasi ketidakhadiran.', detail: String(err?.message || err) });
    }
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
