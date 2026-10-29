import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";

export const admissionsRouter = Router();
admissionsRouter.use(requireModule("students"));

admissionsRouter.get("/", requireAuth, (req, res) => {
  const { status } = req.query as { status?: string };
  let sql = "SELECT * FROM admissions WHERE 1=1";
  const params: any[] = [];
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  sql += " ORDER BY created_at DESC";

  const rows = db.prepare(sql).all(...params);
  res.json({ admissions: rows });
});

admissionsRouter.post("/", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.name || !b.gender) {
    return res.status(400).json({ error: "name and gender are required" });
  }

  const info = db
    .prepare(
      `INSERT INTO admissions (name, gender, guardian_name, guardian_phone, desired_class_id, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(b.name, b.gender, b.guardianName ?? null, b.guardianPhone ?? null, b.desiredClassId ?? null, b.notes ?? null);

  const admission = db.prepare("SELECT * FROM admissions WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ admission });
});

admissionsRouter.put("/:id/approve", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const admission = db.prepare("SELECT * FROM admissions WHERE id = ?").get(id) as any;
  if (!admission) return res.status(404).json({ error: "Admission not found" });
  if (admission.status !== "pending") {
    return res.status(400).json({ error: "Only pending admissions can be approved" });
  }

  const b = req.body ?? {};
  const classId = b.classId ?? admission.desired_class_id ?? null;
  let division: string | null = null;
  let section: string | null = null;
  if (classId) {
    const cls = db.prepare("SELECT * FROM classes WHERE id = ?").get(classId) as any;
    if (cls) {
      division = cls.stage_label;
      section = cls.level_label;
    }
  }

  const maxSeq = (db.prepare("SELECT MAX(seq_no) as m FROM students").get() as { m: number | null }).m ?? 999;

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO students (seq_no, gender, name, tel1, division, section, category, class_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(maxSeq + 1, admission.gender, admission.name, admission.guardian_phone, division, section, "خارجى", classId);
    db.prepare("UPDATE admissions SET status = 'approved' WHERE id = ?").run(id);
    return info.lastInsertRowid;
  });
  const studentId = tx();

  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(studentId);
  res.json({ student });
});

admissionsRouter.put("/:id/reject", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("UPDATE admissions SET status = 'rejected' WHERE id = ? AND status = 'pending'").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Pending admission not found" });
  const admission = db.prepare("SELECT * FROM admissions WHERE id = ?").get(id);
  res.json({ admission });
});

admissionsRouter.delete("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM admissions WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Admission not found" });
  res.status(204).send();
});
