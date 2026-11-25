/**
 * Operasional lanjutan DapurOps:
 *  - koreksi absensi oleh Admin dengan jejak audit (data asli dipertahankan)
 *  - rekap operasional (filter tanggal/staf) + ekspor CSV
 *  - tindak lanjut temuan kebersihan (PIC, status, bukti penyelesaian)
 *
 * Semua rute memakai requireAuth + loadWorkspace; hanya Admin (isSupervisor)
 * yang boleh mengubah data orang lain.
 */
import crypto from 'node:crypto';
import {
  isShift,
  summarizeAttendance,
  isCheckoutOverdue,
  SHIFT_WINDOWS,
} from './attendance-rules.js';

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseTime(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !TIME_RE.test(value)) return undefined;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function validDate(value) {
  return typeof value === 'string' && DATE_RE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function safeJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const ABSENCE = new Set(['Izin', 'Sakit', 'Alpa']);

export function registerOperations(app, { getPool, requireAuth, loadWorkspace, assertPhotoOwned }) {
  const fail = (status, message) => Object.assign(new Error(message), { status });

  // ---------- Koreksi absensi + audit ----------

  app.post('/api/attendance/correction', requireAuth, async (req, res) => {
    const b = req.body ?? {};
    const workspaceId = String(b.workspaceId || '');
    let connection;
    try {
      const access = await loadWorkspace(req.user.id, req.user.email, workspaceId);
      if (access.error) throw fail(access.status, access.error);
      if (!access.isSupervisor) throw fail(403, 'Hanya Admin yang dapat mengoreksi absensi.');

      const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
      if (reason.length < 5 || reason.length > 1000) throw fail(400, 'Alasan koreksi wajib 5–1000 karakter.');

      const checkInMinutes = parseTime(b.checkInTime);
      const checkOutMinutes = parseTime(b.checkOutTime);
      if (checkInMinutes === undefined) throw fail(400, 'Jam masuk harus format HH:MM.');
      if (checkOutMinutes === undefined) throw fail(400, 'Jam pulang harus format HH:MM.');
      const clearCheckIn = b.clearCheckIn === true;
      const clearCheckOut = b.clearCheckOut === true;
      const supervisorStatus = b.supervisorStatus === undefined ? undefined : b.supervisorStatus;
      if (supervisorStatus !== undefined && supervisorStatus !== null && !ABSENCE.has(supervisorStatus)) throw fail(400, 'Status ketidakhadiran tidak valid.');
      const supervisorNote = b.supervisorNote === undefined ? undefined : String(b.supervisorNote ?? '').slice(0, 500);

      connection = await getPool().getConnection();
      await connection.beginTransaction();

      let row;
      if (b.attendanceId) {
        const [[found]] = await connection.query('SELECT * FROM attendance WHERE id = ? AND workspace_id = ? FOR UPDATE', [String(b.attendanceId), workspaceId]);
        if (!found) throw fail(404, 'Catatan absensi tidak ditemukan.');
        row = found;
      } else {
        // Koreksi untuk absensi yang belum pernah tercatat (lupa absen).
        const assignmentId = String(b.assignmentId || '');
        const staffId = String(b.staffId || '');
        if (!assignmentId || !staffId) throw fail(400, 'attendanceId atau pasangan assignmentId+staffId wajib diisi.');
        const [[asg]] = await connection.query('SELECT * FROM assignments WHERE id = ? AND workspace_id = ? FOR UPDATE', [assignmentId, workspaceId]);
        if (!asg) throw fail(404, 'Jadwal shift tidak ditemukan.');
        const [identities] = await connection.query(
          `SELECT u.id, u.email, s.id AS staff_id FROM users u
             LEFT JOIN staff s ON s.workspace_id = ? AND s.email = u.email
            WHERE u.email IN (SELECT email FROM staff WHERE workspace_id = ?)
           UNION ALL SELECT s.id, s.email, s.id FROM staff s WHERE s.workspace_id = ?`,
          [workspaceId, workspaceId, workspaceId]
        );
        const match = identities.find((i) => i.id === staffId || i.staff_id === staffId);
        if (!match) throw fail(400, 'Staf bukan anggota dapur.');
        const scheduled = String(asg.staff_ids || '').split(',').map((s) => s.trim()).filter(Boolean);
        const aliases = identities.filter((i) => i.email === match.email).flatMap((i) => [i.id, i.staff_id]);
        if (!scheduled.some((id) => aliases.includes(id))) throw fail(403, 'Staf tidak ditugaskan pada jadwal ini.');
        const [existing] = await connection.query(
          'SELECT * FROM attendance WHERE workspace_id = ? AND assignment_id = ? AND (staff_id IN (?) OR staff_email = ?) FOR UPDATE',
          [workspaceId, assignmentId, aliases, match.email]
        );
        if (existing.length > 1) throw fail(409, 'Riwayat absensi ganda; koreksi manual diperlukan.');
        row = existing[0] ?? {
          id: null,
          workspace_id: workspaceId,
          assignment_id: assignmentId,
          att_date: String(asg.shift_date).slice(0, 10),
          shift: asg.shift,
          staff_id: match.id,
          staff_email: match.email,
          check_in_time: null,
          check_in_minutes: null,
          check_out_time: null,
          check_out_minutes: null,
          late_minutes: 0,
          duration_minutes: null,
          supervisor_status: null,
          supervisor_note: null,
          early_leave_minutes: null,
          overnight: 0,
          client_ref: null,
        };
      }

      const nextCheckIn = clearCheckIn ? null : (checkInMinutes ?? row.check_in_minutes ?? null);
      const nextCheckOut = clearCheckOut ? null : (checkOutMinutes ?? row.check_out_minutes ?? null);
      if (nextCheckOut != null && nextCheckIn == null) throw fail(400, 'Jam pulang tidak dapat diisi tanpa jam masuk.');
      if (!isShift(row.shift)) throw fail(400, 'Shift pada catatan tidak valid.');

      const summary = summarizeAttendance({ shift: row.shift, checkInMinutes: nextCheckIn, checkOutMinutes: nextCheckOut });
      const nextStatus = supervisorStatus === undefined ? row.supervisor_status : supervisorStatus;
      const nextNote = supervisorNote === undefined ? row.supervisor_note : supervisorNote;
      if (nextStatus && nextCheckIn != null) throw fail(409, 'Absensi hadir tidak dapat ditandai Izin/Sakit/Alpa. Kosongkan jam masuk dulu.');

      const after = {
        checkInTime: nextCheckIn == null ? null : (row.check_in_time && checkInMinutes == null ? row.check_in_time : formatHHMM(nextCheckIn)),
        checkOutTime: nextCheckOut == null ? null : (row.check_out_time && checkOutMinutes == null ? row.check_out_time : formatHHMM(nextCheckOut)),
        checkInMinutes: nextCheckIn,
        checkOutMinutes: nextCheckOut,
        lateMinutes: summary.lateMinutes,
        earlyLeaveMinutes: nextCheckOut == null ? null : summary.earlyLeaveMinutes,
        durationMinutes: summary.durationMinutes,
        overnight: summary.overnight ? 1 : 0,
        supervisorStatus: nextStatus,
        supervisorNote: nextNote,
      };
      const before = {
        checkInTime: row.check_in_time ?? null,
        checkOutTime: row.check_out_time ?? null,
        checkInMinutes: row.check_in_minutes ?? null,
        checkOutMinutes: row.check_out_minutes ?? null,
        lateMinutes: row.late_minutes ?? 0,
        earlyLeaveMinutes: row.early_leave_minutes ?? null,
        durationMinutes: row.duration_minutes ?? null,
        overnight: Number(row.overnight || 0),
        supervisorStatus: row.supervisor_status ?? null,
        supervisorNote: row.supervisor_note ?? null,
      };

      const unchanged = JSON.stringify(before) === JSON.stringify(after);
      if (unchanged) throw fail(409, 'Tidak ada perubahan yang perlu dicatat.');

      const attendanceId = row.id ?? uid('att');
      if (row.id) {
        await connection.query(
          `UPDATE attendance SET check_in_time = ?, check_in_minutes = ?, check_out_time = ?, check_out_minutes = ?,
             late_minutes = ?, early_leave_minutes = ?, duration_minutes = ?, overnight = ?,
             supervisor_status = ?, supervisor_note = ?
           WHERE id = ? AND workspace_id = ?`,
          [after.checkInTime, after.checkInMinutes, after.checkOutTime, after.checkOutMinutes,
            after.lateMinutes, after.earlyLeaveMinutes, after.durationMinutes, after.overnight,
            after.supervisorStatus, after.supervisorNote, attendanceId, workspaceId]
        );
      } else {
        await connection.query(
          `INSERT INTO attendance (id, workspace_id, assignment_id, att_date, shift, staff_id, staff_email,
             check_in_time, check_in_minutes, check_out_time, check_out_minutes, late_minutes, early_leave_minutes,
             duration_minutes, overnight, supervisor_status, supervisor_note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [attendanceId, workspaceId, row.assignment_id, row.att_date, row.shift, row.staff_id, row.staff_email,
            after.checkInTime, after.checkInMinutes, after.checkOutTime, after.checkOutMinutes, after.lateMinutes,
            after.earlyLeaveMinutes, after.durationMinutes, after.overnight, after.supervisorStatus, after.supervisorNote]
        );
      }

      await connection.query(
        `INSERT INTO attendance_audit (id, workspace_id, attendance_id, action, actor_id, actor_email, actor_name, reason, before_json, after_json)
         VALUES (?, ?, ?, 'correction', ?, ?, ?, ?, ?, ?)`,
        [uid('aud'), workspaceId, attendanceId, req.user.id, req.user.email, req.user.name, reason, JSON.stringify(before), JSON.stringify(after)]
      );

      await connection.commit();
      res.json({ ok: true, attendanceId, before, after });
    } catch (err) {
      if (connection) await connection.rollback().catch(() => {});
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Gagal menyimpan koreksi absensi.' });
    } finally {
      connection?.release();
    }
  });

  app.get('/api/attendance/audit', requireAuth, async (req, res) => {
    try {
      const workspaceId = String(req.query.workspaceId || '');
      const access = await loadWorkspace(req.user.id, req.user.email, workspaceId);
      if (access.error) return res.status(access.status).json({ error: access.error });
      if (!access.isSupervisor) return res.status(403).json({ error: 'Hanya Admin yang dapat melihat jejak audit.' });
      const params = [workspaceId];
      let sql = `SELECT * FROM attendance_audit WHERE workspace_id = ?`;
      if (req.query.attendanceId) { sql += ' AND attendance_id = ?'; params.push(String(req.query.attendanceId)); }
      sql += ' ORDER BY created_at DESC LIMIT 500';
      const [rows] = await getPool().query(sql, params);
      res.json({
        audit: rows.map((r) => ({
          id: r.id,
          attendanceId: r.attendance_id,
          action: r.action,
          actorId: r.actor_id,
          actorEmail: r.actor_email,
          actorName: r.actor_name,
          reason: r.reason,
          before: safeJson(r.before_json, null),
          after: safeJson(r.after_json, null),
          createdAt: String(r.created_at),
        })),
      });
    } catch {
      res.status(500).json({ error: 'Gagal memuat jejak audit.' });
    }
  });

  // ---------- Tindak lanjut temuan kebersihan ----------

  app.get('/api/cleanliness/followups', requireAuth, async (req, res) => {
    try {
      const workspaceId = String(req.query.workspaceId || '');
      const access = await loadWorkspace(req.user.id, req.user.email, workspaceId);
      if (access.error) return res.status(access.status).json({ error: access.error });
      const params = [workspaceId];
      let sql = `SELECT f.*, r.report_date, r.shift, r.pic_name FROM cleanliness_followups f
                   LEFT JOIN cleanliness_reports r ON r.id = f.report_id AND r.workspace_id = f.workspace_id
                  WHERE f.workspace_id = ?`;
      if (req.query.status) { sql += ' AND f.status = ?'; params.push(String(req.query.status)); }
      if (req.query.reportId) { sql += ' AND f.report_id = ?'; params.push(String(req.query.reportId)); }
      sql += ' ORDER BY f.created_at DESC LIMIT 500';
      const [rows] = await getPool().query(sql, params);
      res.json({
        followups: rows.map((r) => ({
          id: r.id,
          reportId: r.report_id,
          date: r.report_date ? String(r.report_date).slice(0, 10) : null,
          shift: r.shift,
          reportPicName: r.pic_name,
          areaKey: r.area_key,
          areaLabel: r.area_label,
          note: r.note,
          status: r.status,
          picId: r.pic_id,
          picEmail: r.pic_email,
          picName: r.pic_name,
          resolutionNote: r.resolution_note || '',
          resolutionPhotoId: r.resolution_photo_id,
          resolvedById: r.resolved_by_id,
          resolvedByEmail: r.resolved_by_email,
          resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at),
        })),
      });
    } catch {
      res.status(500).json({ error: 'Gagal memuat tindak lanjut kebersihan.' });
    }
  });

  app.patch('/api/cleanliness/followups/:id', requireAuth, async (req, res) => {
    const b = req.body ?? {};
    const workspaceId = String(b.workspaceId || '');
    let connection;
    try {
      const access = await loadWorkspace(req.user.id, req.user.email, workspaceId);
      if (access.error) throw fail(access.status, access.error);
      const [[row]] = await getPool().query('SELECT * FROM cleanliness_followups WHERE id = ? AND workspace_id = ?', [String(req.params.id), workspaceId]);
      if (!row) throw fail(404, 'Tindak lanjut tidak ditemukan.');
      const isAssignee = [row.pic_id, row.pic_email].filter(Boolean).some((v) => String(v).toLowerCase() === String(req.user.id).toLowerCase() || String(v).toLowerCase() === String(req.user.email).toLowerCase());
      if (!access.isSupervisor && !isAssignee) throw fail(403, 'Hanya Admin atau penanggung jawab yang dapat memperbarui tindak lanjut.');

      const status = b.status === undefined ? row.status : b.status;
      if (!['Perlu Ditangani', 'Sedang Ditangani', 'Selesai'].includes(status)) throw fail(400, 'Status tindak lanjut tidak valid.');
      const resolutionNote = b.resolutionNote === undefined ? row.resolution_note : String(b.resolutionNote ?? '').trim().slice(0, 1000);
      const resolutionPhotoId = b.resolutionPhotoId === undefined ? row.resolution_photo_id : (b.resolutionPhotoId ? String(b.resolutionPhotoId) : null);

      let picId = row.pic_id, picEmail = row.pic_email, picName = row.pic_name;
      if (b.picId !== undefined) {
        if (!access.isSupervisor) throw fail(403, 'Hanya Admin yang dapat menetapkan penanggung jawab.');
        if (b.picId === null || b.picId === '') {
          picId = null; picEmail = null; picName = null;
        } else {
          const staffId = String(b.picId);
          const [members] = await getPool().query(
            `SELECT u.id, u.email, u.name, s.id AS staff_id FROM users u
               LEFT JOIN staff s ON s.workspace_id = ? AND s.email = u.email
              WHERE u.email IN (SELECT email FROM staff WHERE workspace_id = ?)
             UNION ALL SELECT s.id, s.email, s.name, s.id FROM staff s WHERE s.workspace_id = ?`,
            [workspaceId, workspaceId, workspaceId]
          );
          const match = members.find((m) => m.id === staffId || m.staff_id === staffId);
          if (!match) throw fail(400, 'Penanggung jawab bukan anggota dapur.');
          picId = match.id; picEmail = match.email; picName = match.name;
        }
      }

      if (status === 'Selesai') {
        if (!resolutionNote) throw fail(400, 'Catatan penyelesaian wajib diisi.');
        if (!resolutionPhotoId) throw fail(400, 'Bukti foto penyelesaian wajib diunggah.');
        // Hanya validasi foto saat transisi ke Selesai; perubahan PJ saja tidak perlu foto baru.
        if (row.status !== 'Selesai' && assertPhotoOwned) {
          await assertPhotoOwned(getPool(), workspaceId, req.user.id, resolutionPhotoId, 'Foto penyelesaian');
        }
      }

      connection = await getPool().getConnection();
      await connection.beginTransaction();
      await connection.query(
        `UPDATE cleanliness_followups
            SET status = ?, pic_id = ?, pic_email = ?, pic_name = ?, resolution_note = ?, resolution_photo_id = ?,
                resolved_by_id = ?, resolved_by_email = ?, resolved_at = ?
          WHERE id = ? AND workspace_id = ?`,
        [status, picId, picEmail, picName, resolutionNote || null, resolutionPhotoId,
          status === 'Selesai' ? req.user.id : null, status === 'Selesai' ? req.user.email : null,
          status === 'Selesai' ? new Date() : null, String(req.params.id), workspaceId]
      );
      await connection.commit();
      res.json({ ok: true });
    } catch (err) {
      if (connection) await connection.rollback().catch(() => {});
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Gagal memperbarui tindak lanjut.' });
    } finally {
      connection?.release();
    }
  });

  // ---------- Rekap operasional ----------

  async function buildReport({ workspaceId, from, to, staffId }) {
    const pool = getPool();
    const [asgRows] = await pool.query(
      'SELECT * FROM assignments WHERE workspace_id = ? AND shift_date BETWEEN ? AND ? ORDER BY shift_date, shift',
      [workspaceId, from, to]
    );
    const [attRows] = await pool.query(
      'SELECT * FROM attendance WHERE workspace_id = ? AND att_date BETWEEN ? AND ? ORDER BY att_date, shift',
      [workspaceId, from, to]
    );
    const [cleanRows] = await pool.query(
      'SELECT * FROM cleanliness_reports WHERE workspace_id = ? AND report_date BETWEEN ? AND ?',
      [workspaceId, from, to]
    );
    const [followRows] = await pool.query(
      'SELECT * FROM cleanliness_followups WHERE workspace_id = ?',
      [workspaceId]
    );
    const [staffRows] = await pool.query('SELECT * FROM staff WHERE workspace_id = ?', [workspaceId]);
    const [userRows] = await pool.query(
      'SELECT u.id, u.email, u.name FROM users u WHERE u.email IN (SELECT email FROM staff WHERE workspace_id = ?)',
      [workspaceId]
    );
    const userByEmail = new Map(userRows.map((u) => [String(u.email).toLowerCase(), u]));
    const staffByAnyId = new Map();
    for (const s of staffRows) {
      const account = userByEmail.get(String(s.email).toLowerCase());
      const id = account?.id || s.id;
      const entry = { id, staffId: s.id, name: s.name, email: s.email };
      staffByAnyId.set(id, entry);
      staffByAnyId.set(s.id, entry);
      if (account) staffByAnyId.set(account.id, entry);
    }
    const nameOf = (id, email) => staffByAnyId.get(String(id))?.name || userByEmail.get(String(email).toLowerCase())?.name || String(email || id || '—');

    const attendanceByKey = new Map();
    for (const a of attRows) {
      const key = `${a.assignment_id}|${staffByAnyId.get(a.staff_id)?.id || a.staff_id}`;
      if (!attendanceByKey.has(key)) attendanceByKey.set(key, a);
    }

    const rows = [];
    for (const asg of asgRows) {
      const shiftDate = String(asg.shift_date).slice(0, 10);
      for (const rawId of String(asg.staff_ids || '').split(',').map((s) => s.trim()).filter(Boolean)) {
        const identity = staffByAnyId.get(rawId);
        if (!identity) continue;
        if (staffId && identity.id !== staffId && identity.staffId !== staffId) continue;
        const att = attendanceByKey.get(`${asg.id}|${identity.id}`);
        const checkInMinutes = att?.check_in_minutes ?? null;
        const checkOutMinutes = att?.check_out_minutes ?? null;
        const summary = isShift(asg.shift)
          ? summarizeAttendance({ shift: asg.shift, checkInMinutes, checkOutMinutes })
          : { lateMinutes: 0, earlyLeaveMinutes: 0, durationMinutes: null, overnight: false, overtimeMinutes: 0 };
        const overdue = isCheckoutOverdue({
          shiftDate,
          shift: asg.shift,
          checkInMinutes,
          checkOutMinutes,
          now: { date: new Date().toISOString().slice(0, 10), minutes: 24 * 60 },
        });
        let status = 'Belum Absen';
        if (att?.supervisor_status) status = att.supervisor_status;
        else if (checkInMinutes != null && checkOutMinutes != null) status = summary.lateMinutes > 0 ? 'Hadir (Terlambat)' : 'Hadir';
        else if (checkInMinutes != null) status = 'Belum Check-out';
        rows.push({
          date: shiftDate,
          shift: asg.shift,
          assignmentId: asg.id,
          staffId: identity.id,
          staffName: identity.name,
          staffEmail: identity.email,
          isPic: [asg.pic_id].includes(identity.staffId) || [asg.pic_id].includes(identity.id),
          checkInTime: att?.check_in_time ?? null,
          checkOutTime: att?.check_out_time ?? null,
          lateMinutes: summary.lateMinutes,
          earlyLeaveMinutes: summary.earlyLeaveMinutes,
          durationMinutes: summary.durationMinutes,
          overtimeMinutes: summary.overtimeMinutes,
          overnight: summary.overnight,
          status,
          overdue,
          supervisorNote: att?.supervisor_note ?? '',
          attendanceId: att?.id ?? null,
        });
      }
    }

    const problemAreas = [];
    for (const report of cleanRows) {
      const areas = safeJson(report.areas_json, []);
      for (const area of Array.isArray(areas) ? areas : []) {
        if (area?.status !== 'Perlu Ditangani') continue;
        const follow = followRows.find((f) => f.report_id === report.id && f.area_key === area.key);
        problemAreas.push({
          date: String(report.report_date).slice(0, 10),
          shift: report.shift,
          reportId: report.id,
          areaKey: area.key,
          areaLabel: area.key,
          note: area.note || '',
          picName: report.pic_name,
          followupStatus: follow?.status ?? 'Perlu Ditangani',
          followupPic: follow?.pic_name ?? null,
          resolvedAt: follow?.resolved_at ? String(follow.resolved_at) : null,
        });
      }
    }
    if (staffId) {
      const keep = new Set(rows.map((r) => r.date));
      for (let i = problemAreas.length - 1; i >= 0; i -= 1) if (!keep.has(problemAreas[i].date)) problemAreas.splice(i, 1);
    }

    const count = (predicate) => rows.filter(predicate).length;
    const summary = {
      from,
      to,
      totalScheduled: rows.length,
      hadir: count((r) => r.status === 'Hadir' || r.status === 'Hadir (Terlambat)'),
      terlambat: count((r) => r.lateMinutes > 0 && r.checkInTime),
      pulangAwal: count((r) => r.earlyLeaveMinutes > 0 && r.checkOutTime),
      belumCheckout: count((r) => r.status === 'Belum Check-out'),
      belumAbsen: count((r) => r.status === 'Belum Absen'),
      izin: count((r) => r.status === 'Izin'),
      sakit: count((r) => r.status === 'Sakit'),
      alpa: count((r) => r.status === 'Alpa'),
      totalLateMinutes: rows.reduce((sum, r) => sum + r.lateMinutes, 0),
      totalOvertimeMinutes: rows.reduce((sum, r) => sum + r.overtimeMinutes, 0),
      avgDurationMinutes: (() => {
        const done = rows.filter((r) => Number.isFinite(r.durationMinutes));
        return done.length ? Math.round(done.reduce((s, r) => s + r.durationMinutes, 0) / done.length) : null;
      })(),
      checklistBermasalah: problemAreas.length,
      followupTerbuka: problemAreas.filter((p) => p.followupStatus !== 'Selesai').length,
    };

    const perStaff = new Map();
    for (const r of rows) {
      const key = r.staffId;
      const entry = perStaff.get(key) || {
        staffId: r.staffId, staffName: r.staffName, scheduled: 0, hadir: 0, terlambat: 0,
        pulangAwal: 0, belumCheckout: 0, izin: 0, sakit: 0, alpa: 0, belumAbsen: 0, lateMinutes: 0,
      };
      entry.scheduled += 1;
      if (r.status === 'Hadir' || r.status === 'Hadir (Terlambat)') entry.hadir += 1;
      if (r.lateMinutes > 0 && r.checkInTime) { entry.terlambat += 1; entry.lateMinutes += r.lateMinutes; }
      if (r.earlyLeaveMinutes > 0 && r.checkOutTime) entry.pulangAwal += 1;
      if (r.status === 'Belum Check-out') entry.belumCheckout += 1;
      if (r.status === 'Izin') entry.izin += 1;
      if (r.status === 'Sakit') entry.sakit += 1;
      if (r.status === 'Alpa') entry.alpa += 1;
      if (r.status === 'Belum Absen') entry.belumAbsen += 1;
      perStaff.set(key, entry);
    }

    return {
      summary,
      rows,
      perStaff: [...perStaff.values()].sort((a, b) => a.staffName.localeCompare(b.staffName)),
      problemAreas,
      shiftWindows: SHIFT_WINDOWS,
    };
  }

  function readRange(query) {
    const to = validDate(query.to) ? String(query.to) : new Date().toISOString().slice(0, 10);
    const from = validDate(query.from) ? String(query.from) : to;
    if (from > to) throw fail(400, 'Tanggal awal tidak boleh setelah tanggal akhir.');
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (days > 186) throw fail(400, 'Rentang rekap maksimal 186 hari.');
    return { from, to };
  }

  app.get('/api/reports/operational', requireAuth, async (req, res) => {
    try {
      const workspaceId = String(req.query.workspaceId || '');
      const access = await loadWorkspace(req.user.id, req.user.email, workspaceId);
      if (access.error) return res.status(access.status).json({ error: access.error });
      const { from, to } = readRange(req.query);
      const staffId = req.query.staffId ? String(req.query.staffId) : null;
      res.json(await buildReport({ workspaceId, from, to, staffId }));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Gagal menyusun rekap operasional.' });
    }
  });

  app.get('/api/reports/operational.csv', requireAuth, async (req, res) => {
    try {
      const workspaceId = String(req.query.workspaceId || '');
      const access = await loadWorkspace(req.user.id, req.user.email, workspaceId);
      if (access.error) return res.status(access.status).json({ error: access.error });
      if (!access.isSupervisor) return res.status(403).json({ error: 'Hanya Admin yang dapat mengekspor rekap.' });
      const { from, to } = readRange(req.query);
      const staffId = req.query.staffId ? String(req.query.staffId) : null;
      const report = await buildReport({ workspaceId, from, to, staffId });
      const header = ['Tanggal', 'Shift', 'Nama Staf', 'Email', 'PIC', 'Jam Masuk', 'Jam Pulang', 'Terlambat (menit)', 'Pulang Awal (menit)', 'Durasi (menit)', 'Lembur (menit)', 'Lintas Tengah Malam', 'Status', 'Catatan Admin'];
      const lines = [header.join(',')];
      for (const r of report.rows) {
        lines.push([
          r.date, r.shift, r.staffName, r.staffEmail, r.isPic ? 'Ya' : 'Tidak',
          r.checkInTime || '', r.checkOutTime || '', r.lateMinutes, r.earlyLeaveMinutes,
          r.durationMinutes ?? '', r.overtimeMinutes, r.overnight ? 'Ya' : 'Tidak', r.status, r.supervisorNote,
        ].map(csvCell).join(','));
      }
      lines.push('');
      lines.push(['Ringkasan', 'Nilai'].join(','));
      for (const [key, value] of Object.entries(report.summary)) lines.push([csvCell(key), csvCell(value)].join(','));
      lines.push('');
      lines.push(['Temuan Kebersihan', 'Shift', 'Area', 'Catatan', 'Status Tindak Lanjut', 'PJ'].join(','));
      for (const p of report.problemAreas) {
        lines.push([p.date, p.shift, p.areaLabel, p.note, p.followupStatus, p.followupPic || ''].map(csvCell).join(','));
      }
      const filename = `rekap-dapurops-${from}_${to}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      // BOM agar Excel membaca UTF-8 dengan benar.
      res.send('\uFEFF' + lines.join('\r\n'));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Gagal mengekspor rekap.' });
    }
  });
}

function formatHHMM(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
