import { Router } from "express";
import { db } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";
import { requireModule } from "../permissions";

export const hrAttendanceRouter = Router();
hrAttendanceRouter.use(requireModule("hrEmployees"));

function isDayClosed(schoolId: number, date: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM hr_attendance_days_closed WHERE school_id = ? AND date = ?").get(schoolId, date)
  );
}

hrAttendanceRouter.get("/", requireAuth, (req, res) => {
  const { schoolId, date } = req.query as { schoolId?: string; date?: string };
  if (!schoolId || !date) return res.status(400).json({ error: "schoolId and date are required" });

  // hr_attendance.* is selected first so hr_employees.id can override its (possibly NULL,
  // when there's no attendance row yet for this date) employee_id column below — better-
  // sqlite3 keeps the last same-named column, so ordering here is load-bearing.
  const rows = db
    .prepare(
      `SELECT hr_attendance.*, hr_employees.id as employee_id, hr_employees.name_ar, hr_employees.job
       FROM hr_employees
       LEFT JOIN hr_attendance ON hr_attendance.employee_id = hr_employees.id AND hr_attendance.date = ?
       WHERE hr_employees.school_id = ?
       ORDER BY hr_employees.name_ar ASC`
    )
    .all(date, Number(schoolId));

  res.json({ records: rows, closed: isDayClosed(Number(schoolId), date) });
});

hrAttendanceRouter.post("/bulk", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.schoolId || !b.date || !Array.isArray(b.entries)) {
    return res.status(400).json({ error: "schoolId, date and entries[] are required" });
  }
  if (isDayClosed(Number(b.schoolId), b.date)) {
    return res.status(400).json({ error: "This day is closed and can no longer be edited" });
  }

  const upsert = db.prepare(`
    INSERT INTO hr_attendance (employee_id, school_id, date, status, check_in, check_out, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(employee_id, date) DO UPDATE SET
      status = excluded.status, check_in = excluded.check_in, check_out = excluded.check_out, note = excluded.note
  `);
  const tx = db.transaction((entries: any[]) => {
    for (const e of entries) {
      upsert.run(
        e.employeeId,
        b.schoolId,
        b.date,
        e.status ?? "present",
        e.checkIn ?? null,
        e.checkOut ?? null,
        e.note ?? null
      );
    }
  });
  tx(b.entries);

  res.status(200).json({ ok: true, count: b.entries.length });
});

hrAttendanceRouter.get("/overall", requireAuth, (req, res) => {
  const { schoolId, from, to } = req.query as { schoolId?: string; from?: string; to?: string };
  if (!schoolId || !from || !to) return res.status(400).json({ error: "schoolId, from and to are required" });

  const rows = db
    .prepare(
      `SELECT
        hr_employees.id as employee_id,
        hr_employees.name_ar as employee_name,
        SUM(CASE WHEN hr_attendance.status = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN hr_attendance.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
        SUM(CASE WHEN hr_attendance.status = 'late' THEN 1 ELSE 0 END) as late_count,
        COUNT(hr_attendance.id) as marked_count
      FROM hr_employees
      LEFT JOIN hr_attendance ON hr_attendance.employee_id = hr_employees.id AND hr_attendance.date BETWEEN ? AND ?
      WHERE hr_employees.school_id = ?
      GROUP BY hr_employees.id
      ORDER BY hr_employees.name_ar ASC`
    )
    .all(from, to, Number(schoolId)) as any[];

  const withRate = rows.map((r) => ({
    ...r,
    attendance_rate: r.marked_count > 0 ? Math.round((r.present_count / r.marked_count) * 100) : null,
  }));
  res.json({ rows: withRate });
});

hrAttendanceRouter.get("/days-closed", requireAuth, (req, res) => {
  const { schoolId } = req.query as { schoolId?: string };
  if (!schoolId) return res.status(400).json({ error: "schoolId is required" });

  const rows = db
    .prepare("SELECT * FROM hr_attendance_days_closed WHERE school_id = ? ORDER BY date DESC")
    .all(Number(schoolId));
  res.json({ daysClosed: rows });
});

hrAttendanceRouter.post("/days-closed", requireAuth, (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  if (!b.schoolId || !b.date) return res.status(400).json({ error: "schoolId and date are required" });

  db.prepare(
    `INSERT INTO hr_attendance_days_closed (school_id, date, closed_by)
     VALUES (?, ?, ?)
     ON CONFLICT(school_id, date) DO NOTHING`
  ).run(b.schoolId, b.date, req.user?.username ?? null);

  const rows = db
    .prepare("SELECT * FROM hr_attendance_days_closed WHERE school_id = ? ORDER BY date DESC")
    .all(Number(b.schoolId));
  res.status(201).json({ daysClosed: rows });
});

hrAttendanceRouter.delete("/days-closed/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM hr_attendance_days_closed WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});
