import { Router } from "express";
import path from "path";
import fs from "fs";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";
import { currentAcademicYearId, setCurrentAcademicYear, type AcademicYear } from "../academicYears";

// العام الدراسي tab: one card per year. Opening a year makes the app work in it (its students in
// شئون الطلاب); archiving a year locks it until it is opened again; deleting a year deletes its
// students and their degrees. Subjects, schools, users and settings are shared by every year.
export const academicYearsRouter = Router();

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

function allSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

function listResponse() {
  const currentId = currentAcademicYearId();
  const years = (
    db
      .prepare(
        `SELECT y.*, (SELECT COUNT(*) FROM students s WHERE s.academic_year_id = y.id) AS student_count
         FROM academic_years y ORDER BY y.sort_order ASC, y.id ASC`
      )
      .all() as (AcademicYear & { student_count: number })[]
  ).map((y) => ({ ...y, archived: Boolean(y.archived) }));
  return { years, currentId, settings: allSettings() };
}

function findYear(id: number): AcademicYear | undefined {
  return db.prepare("SELECT * FROM academic_years WHERE id = ?").get(id) as AcademicYear | undefined;
}

function nameTaken(name: string, exceptId?: number): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM academic_years WHERE TRIM(name) = ? AND id IS NOT ?").get(name.trim(), exceptId ?? null)
  );
}

// Every signed-in user can see the years and which one is open (the app header shows it).
academicYearsRouter.get("/", requireAuth, (_req, res) => {
  res.json(listResponse());
});

academicYearsRouter.post("/", requireAuth, requireModule("academicYears"), (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "اكتب اسم العام الدراسي" });
  if (nameTaken(name)) return res.status(409).json({ error: "هذا العام الدراسي موجود بالفعل" });
  const maxOrder = (db.prepare("SELECT MAX(sort_order) AS m FROM academic_years").get() as { m: number | null }).m ?? -1;
  db.prepare("INSERT INTO academic_years (name, sort_order) VALUES (?, ?)").run(name, maxOrder + 1);
  res.status(201).json(listResponse());
});

academicYearsRouter.put("/:id", requireAuth, requireModule("academicYears"), (req, res) => {
  const id = Number(req.params.id);
  const year = findYear(id);
  if (!year) return res.status(404).json({ error: "العام الدراسي غير موجود" });
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "اكتب اسم العام الدراسي" });
  if (nameTaken(name, id)) return res.status(409).json({ error: "هذا العام الدراسي موجود بالفعل" });
  db.prepare("UPDATE academic_years SET name = ? WHERE id = ?").run(name, id);
  if (currentAcademicYearId() === id) setCurrentAcademicYear(id);
  res.json(listResponse());
});

// عرض بيانات العام الدراسي: the app works in this year from now on. An archived year is taken out
// of the archive first (that is the only way back from ارشيف).
academicYearsRouter.post("/:id/open", requireAuth, requireModule("academicYears"), (req, res) => {
  const id = Number(req.params.id);
  if (!findYear(id)) return res.status(404).json({ error: "العام الدراسي غير موجود" });
  db.transaction(() => {
    db.prepare("UPDATE academic_years SET archived = 0 WHERE id = ?").run(id);
    setCurrentAcademicYear(id);
  })();
  res.json(listResponse());
});

// ارشيف: the year's data is kept but can't be opened until the year is opened again. The year
// the app is working in can't be archived; open another one first.
academicYearsRouter.post("/:id/archive", requireAuth, requireModule("academicYears"), (req, res) => {
  const id = Number(req.params.id);
  if (!findYear(id)) return res.status(404).json({ error: "العام الدراسي غير موجود" });
  if (currentAcademicYearId() === id) {
    return res.status(409).json({ error: "لا يمكن أرشفة العام المفتوح حاليًا. افتح عامًا آخر أولاً." });
  }
  db.prepare("UPDATE academic_years SET archived = 1 WHERE id = ?").run(id);
  res.json(listResponse());
});

// Deletes the chosen years with their students (and, through the foreign key, their degrees).
academicYearsRouter.delete("/", requireAuth, requireModule("academicYears"), (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? (req.body.ids as unknown[]).map((v) => Number(v)).filter((n) => Number.isInteger(n))
    : [];
  if (ids.length === 0) return res.status(400).json({ error: "اختر عامًا دراسيًا واحدًا على الأقل" });
  if (ids.includes(currentAcademicYearId())) {
    return res.status(409).json({ error: "لا يمكن حذف العام المفتوح حاليًا. افتح عامًا آخر أولاً." });
  }
  const marks = ids.map(() => "?").join(",");
  const photos = db
    .prepare(`SELECT photo_url FROM students WHERE academic_year_id IN (${marks}) AND photo_url IS NOT NULL`)
    .all(...ids) as { photo_url: string }[];
  db.transaction(() => {
    db.prepare(`DELETE FROM students WHERE academic_year_id IN (${marks})`).run(...ids);
    db.prepare(`DELETE FROM academic_years WHERE id IN (${marks})`).run(...ids);
  })();
  for (const { photo_url } of photos) {
    if (photo_url.startsWith("/uploads/")) fs.unlink(path.join(UPLOADS_DIR, path.basename(photo_url)), () => {});
  }
  res.json(listResponse());
});
