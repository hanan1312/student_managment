import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";

export const attendanceRouter = Router();
attendanceRouter.use(requireModule("students"));

attendanceRouter.get("/", requireAuth, (req, res) => {
  const { classId, date } = req.query as { classId?: string; date?: string };
  if (!date) return res.status(400).json({ error: "date is required" });

  let sql = "SELECT * FROM attendance WHERE date = ?";
  const params: any[] = [date];
  if (classId) {
    sql += " AND class_id = ?";
    params.push(Number(classId));
  }

  const rows = db.prepare(sql).all(...params);
  res.json({ records: rows });
});

attendanceRouter.post("/bulk", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.date || !Array.isArray(b.entries)) {
    return res.status(400).json({ error: "date and entries[] are required" });
  }

  const upsert = db.prepare(`
    INSERT INTO attendance (student_id, class_id, date, status, note)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status, note = excluded.note, class_id = excluded.class_id
  `);
  const tx = db.transaction((entries: any[]) => {
    for (const e of entries) {
      upsert.run(e.studentId, e.classId ?? null, b.date, e.status ?? "present", e.note ?? null);
    }
  });
  tx(b.entries);

  res.status(200).json({ ok: true, count: b.entries.length });
});

attendanceRouter.get("/no-show", requireAuth, (req, res) => {
  const { classId, date } = req.query as { classId?: string; date?: string };
  if (!date) return res.status(400).json({ error: "date is required" });

  let sql = `
    SELECT students.* FROM students
    WHERE students.id NOT IN (SELECT student_id FROM attendance WHERE date = ?)
  `;
  const params: any[] = [date];
  if (classId) {
    sql += " AND students.class_id = ?";
    params.push(Number(classId));
  }
  sql += " ORDER BY students.seq_no ASC";

  const rows = db.prepare(sql).all(...params);
  res.json({ students: rows, count: rows.length });
});

attendanceRouter.get("/analysis", requireAuth, (req, res) => {
  const { classId, from, to } = req.query as { classId?: string; from?: string; to?: string };
  if (!from || !to) return res.status(400).json({ error: "from and to are required" });

  let sql = `
    SELECT
      students.id as student_id,
      students.name as student_name,
      students.seq_no,
      SUM(CASE WHEN attendance.status = 'present' THEN 1 ELSE 0 END) as present_count,
      SUM(CASE WHEN attendance.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
      SUM(CASE WHEN attendance.status = 'late' THEN 1 ELSE 0 END) as late_count,
      COUNT(attendance.id) as marked_count
    FROM students
    LEFT JOIN attendance ON attendance.student_id = students.id AND attendance.date BETWEEN ? AND ?
    WHERE 1=1
  `;
  const params: any[] = [from, to];
  if (classId) {
    sql += " AND students.class_id = ?";
    params.push(Number(classId));
  }
  sql += " GROUP BY students.id ORDER BY students.seq_no ASC";

  const rows = db.prepare(sql).all(...params) as any[];
  const withRate = rows.map((r) => ({
    ...r,
    attendance_rate: r.marked_count > 0 ? Math.round((r.present_count / r.marked_count) * 100) : null,
  }));
  res.json({ rows: withRate });
});
