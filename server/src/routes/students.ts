import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";
import { requireModule, getStageScope, stageOfLevel, OUT_OF_SCOPE_ERROR } from "../permissions";
import { syncStudentPositionText } from "./classes";

export const studentsRouter = Router();
studentsRouter.use(requireModule("students"));

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = ALLOWED_MIME[file.mimetype] ?? path.extname(file.originalname) ?? "";
      cb(null, `student-${req.params.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) {
      cb(new Error("Unsupported image type. Use PNG, JPEG or WEBP."));
      return;
    }
    cb(null, true);
  },
});

// A user limited to some stages (المراحل) only reaches students placed in those stages; students
// with no placement are outside every limited user's scope.
function inScope(req: AuthedRequest, levelId: unknown): boolean {
  const scope = getStageScope(req.user);
  if (!scope) return true;
  if (levelId === null || levelId === undefined) return false;
  const stage = stageOfLevel(Number(levelId));
  return stage !== null && scope.includes(stage);
}

function scopeSql(req: AuthedRequest): { sql: string; params: number[] } {
  const scope = getStageScope(req.user);
  if (!scope) return { sql: "", params: [] };
  if (scope.length === 0) return { sql: " AND 0=1", params: [] };
  return {
    sql: ` AND level_id IN (SELECT id FROM levels WHERE stage_id IN (${scope.map(() => "?").join(",")}))`,
    params: scope,
  };
}

function studentLevel(id: number): { level_id: number | null } | undefined {
  return db.prepare("SELECT level_id FROM students WHERE id = ?").get(id) as { level_id: number | null } | undefined;
}

function deleteLocalUpload(url: string | null | undefined) {
  if (!url || !url.startsWith("/uploads/")) return;
  const filePath = path.join(UPLOADS_DIR, path.basename(url));
  fs.unlink(filePath, () => {});
}

studentsRouter.get("/", requireAuth, (req, res) => {
  const { classId, classIds, levelIds, q } = req.query as {
    classId?: string;
    classIds?: string;
    levelIds?: string;
    q?: string;
  };

  let sql = "SELECT students.* FROM students WHERE 1=1";
  const params: any[] = [];

  if (levelIds) {
    const ids = levelIds
      .split(",")
      .map((v) => Number(v))
      .filter((n) => !Number.isNaN(n));
    sql += ids.length > 0 ? ` AND level_id IN (${ids.map(() => "?").join(",")})` : " AND 0=1";
    params.push(...ids);
  } else if (classIds) {
    const ids = classIds
      .split(",")
      .map((v) => Number(v))
      .filter((n) => !Number.isNaN(n));
    sql += ids.length > 0 ? ` AND class_id IN (${ids.map(() => "?").join(",")})` : " AND 0=1";
    params.push(...ids);
  } else if (classId) {
    sql += " AND class_id = ?";
    params.push(Number(classId));
  }
  const scoped = scopeSql(req);
  sql += scoped.sql;
  params.push(...scoped.params);
  if (q) {
    sql += " AND (name LIKE ? OR name_en LIKE ? OR tel1 LIKE ? OR national_id LIKE ? OR moe_code LIKE ? OR student_no LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  sql += " ORDER BY seq_no ASC";

  // total_degrees (مجموع الدرجات) and percentage (النسبة المئوية), by the same rule as the
  // client's degreeTotals; both null before any degree is entered.
  const rows = (db.prepare(sql).all(...params) as any[]).map((row) => ({
    ...row,
    ...degreeSummary(studentGrades(row.id, row.level_id)),
  }));
  res.json({ students: rows, count: rows.length });
});

function boolToInt(v: unknown) {
  return v ? 1 : 0;
}

// A Position must be a leaf of the Hierarchy (e.g. a track, not the grade that holds tracks).
function invalidPosition(levelId: unknown): string | null {
  if (levelId === null || levelId === undefined) return null;
  if (!db.prepare("SELECT 1 FROM levels WHERE id = ?").get(Number(levelId))) return "Position not found";
  if (db.prepare("SELECT 1 FROM levels WHERE parent_id = ?").get(Number(levelId))) {
    return "Choose the most specific Position (this level has sub-levels)";
  }
  return null;
}

function levelOfClass(classId: unknown): number | null {
  if (!classId) return null;
  const row = db.prepare("SELECT level_id FROM classes WHERE id = ?").get(Number(classId)) as
    | { level_id: number | null }
    | undefined;
  return row?.level_id ?? null;
}

studentsRouter.post("/", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.name || !b.gender) {
    return res.status(400).json({ error: "Name and gender are required" });
  }
  const positionError = invalidPosition(b.levelId);
  if (positionError) return res.status(400).json({ error: positionError });
  if (!inScope(req, b.levelId)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });

  const maxSeq = (db.prepare("SELECT MAX(seq_no) as m FROM students").get() as { m: number | null }).m ?? 0;

  const info = db
    .prepare(
      `INSERT INTO students
        (seq_no, gender, name, name_en, tel1, tel2, national_id, moe_code, address, birthday, division, section,
         category, class_id, country, area, district, admission_date, student_no, religion, nationality, count_value,
         status, status_date, father_name, father_national_id, father_mobile, father_job, father_education,
         father_company, father_email, mother_name, mother_national_id, mother_mobile, mother_job, mother_education,
         mother_company, mother_email, notes, medical_condition, education_authority, special_case, integrated,
         uses_bus, emergency_name, emergency_tel, transferred_from, transferred_in, school, level_id, enrollment_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      maxSeq + 1,
      b.gender,
      b.name,
      b.nameEn ?? null,
      b.tel1 ?? null,
      b.tel2 ?? null,
      b.nationalId ?? null,
      b.moeCode ?? null,
      b.address ?? null,
      b.birthday ?? null,
      b.division ?? null,
      b.section ?? null,
      b.category ?? null,
      b.classId ?? null,
      b.country ?? null,
      b.area ?? null,
      b.district ?? null,
      b.admissionDate ?? null,
      b.studentNo ?? null,
      b.religion ?? null,
      b.nationality ?? null,
      b.countValue ?? null,
      b.status ?? null,
      b.statusDate ?? null,
      b.fatherName ?? null,
      b.fatherNationalId ?? null,
      b.fatherMobile ?? null,
      b.fatherJob ?? null,
      b.fatherEducation ?? null,
      b.fatherCompany ?? null,
      b.fatherEmail ?? null,
      b.motherName ?? null,
      b.motherNationalId ?? null,
      b.motherMobile ?? null,
      b.motherJob ?? null,
      b.motherEducation ?? null,
      b.motherCompany ?? null,
      b.motherEmail ?? null,
      b.notes ?? null,
      b.medicalCondition ?? null,
      b.educationAuthority ?? null,
      boolToInt(b.specialCase),
      boolToInt(b.integrated),
      boolToInt(b.usesBus),
      b.emergencyName ?? null,
      b.emergencyTel ?? null,
      b.transferredFrom ?? null,
      b.transferredIn ?? null,
      b.school ?? null,
      b.levelId ?? levelOfClass(b.classId),
      b.enrollmentType ?? null
    );

  syncStudentPositionText();
  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ student });
});

studentsRouter.put("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM students WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Student not found" });
  if (!inScope(req, existing.level_id)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });

  const b = req.body ?? {};
  const positionError = invalidPosition(b.levelId);
  if (positionError) return res.status(400).json({ error: positionError });
  // A new Position (level) wins; a class that doesn't belong to it is dropped rather than
  // left pointing at the old section.
  let levelId = existing.level_id;
  let classId = b.classId ?? existing.class_id;
  if (b.levelId !== undefined) {
    levelId = b.levelId;
    if (classId && levelOfClass(classId) !== levelId) classId = null;
  } else if (b.classId !== undefined) {
    levelId = levelOfClass(b.classId);
  }
  if (!inScope(req, levelId)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  db.prepare(
    `UPDATE students SET
      gender = ?, name = ?, name_en = ?, tel1 = ?, tel2 = ?, national_id = ?, moe_code = ?,
      address = ?, birthday = ?, division = ?, section = ?, category = ?, class_id = ?,
      country = ?, area = ?, district = ?, admission_date = ?, student_no = ?, religion = ?,
      nationality = ?, count_value = ?, status = ?, status_date = ?, father_name = ?,
      father_national_id = ?, father_mobile = ?, father_job = ?, father_education = ?,
      father_company = ?, father_email = ?, mother_name = ?, mother_national_id = ?,
      mother_mobile = ?, mother_job = ?, mother_education = ?, mother_company = ?, mother_email = ?,
      notes = ?, medical_condition = ?, education_authority = ?, special_case = ?, integrated = ?,
      uses_bus = ?, emergency_name = ?, emergency_tel = ?, transferred_from = ?, transferred_in = ?,
      school = ?, level_id = ?, enrollment_type = ?
     WHERE id = ?`
  ).run(
    b.gender ?? existing.gender,
    b.name ?? existing.name,
    b.nameEn ?? existing.name_en,
    b.tel1 ?? existing.tel1,
    b.tel2 ?? existing.tel2,
    b.nationalId ?? existing.national_id,
    b.moeCode ?? existing.moe_code,
    b.address ?? existing.address,
    b.birthday ?? existing.birthday,
    b.division ?? existing.division,
    b.section ?? existing.section,
    b.category ?? existing.category,
    classId,
    b.country ?? existing.country,
    b.area ?? existing.area,
    b.district ?? existing.district,
    b.admissionDate ?? existing.admission_date,
    b.studentNo ?? existing.student_no,
    b.religion ?? existing.religion,
    b.nationality ?? existing.nationality,
    b.countValue ?? existing.count_value,
    b.status ?? existing.status,
    b.statusDate ?? existing.status_date,
    b.fatherName ?? existing.father_name,
    b.fatherNationalId ?? existing.father_national_id,
    b.fatherMobile ?? existing.father_mobile,
    b.fatherJob ?? existing.father_job,
    b.fatherEducation ?? existing.father_education,
    b.fatherCompany ?? existing.father_company,
    b.fatherEmail ?? existing.father_email,
    b.motherName ?? existing.mother_name,
    b.motherNationalId ?? existing.mother_national_id,
    b.motherMobile ?? existing.mother_mobile,
    b.motherJob ?? existing.mother_job,
    b.motherEducation ?? existing.mother_education,
    b.motherCompany ?? existing.mother_company,
    b.motherEmail ?? existing.mother_email,
    b.notes ?? existing.notes,
    b.medicalCondition ?? existing.medical_condition,
    b.educationAuthority ?? existing.education_authority,
    b.specialCase === undefined ? existing.special_case : boolToInt(b.specialCase),
    b.integrated === undefined ? existing.integrated : boolToInt(b.integrated),
    b.usesBus === undefined ? existing.uses_bus : boolToInt(b.usesBus),
    b.emergencyName ?? existing.emergency_name,
    b.emergencyTel ?? existing.emergency_tel,
    b.transferredFrom ?? existing.transferred_from,
    b.transferredIn ?? existing.transferred_in,
    b.school ?? existing.school,
    levelId,
    b.enrollmentType ?? existing.enrollment_type,
    id
  );

  syncStudentPositionText();
  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(id);
  res.json({ student });
});

// Degrees profile: the subjects taught at the student's level / Position (all subjects when the
// student has no Position yet, or the level has none linked), each with its كبرى/صغرى (full marks /
// pass mark) and the student's saved score. Marks are per section (subject_levels); a saved
// degree shows the marks frozen when it was saved, an unsaved one the section's current marks.
type GradeRow = {
  subject_id: number;
  subject_name: string;
  max_degree: number | null;
  min_degree: number | null;
  score: number | null;
  score_min: number | null;
  outside_total: number;
  elective_group: string | null;
};

function studentGrades(studentId: number, levelId: number | null): GradeRow[] {
  const select = (byLevel: boolean) =>
    db
      .prepare(
        `SELECT subjects.id AS subject_id, subjects.name AS subject_name,
                ${
                  byLevel
                    ? `CASE WHEN student_grades.max_degree IS NOT NULL OR student_grades.min_degree IS NOT NULL
                         THEN student_grades.max_degree ELSE subject_levels.max_degree END AS max_degree,
                       CASE WHEN student_grades.max_degree IS NOT NULL OR student_grades.min_degree IS NOT NULL
                         THEN student_grades.min_degree ELSE subject_levels.min_degree END AS min_degree,`
                    : "student_grades.max_degree, student_grades.min_degree,"
                }
                student_grades.score, student_grades.score_min,
                ${byLevel ? "subject_levels.outside_total, subject_levels.elective_group" : "0 AS outside_total, NULL AS elective_group"}
         FROM subjects
         ${byLevel ? "JOIN subject_levels ON subject_levels.subject_id = subjects.id AND subject_levels.level_id = ?" : ""}
         LEFT JOIN student_grades ON student_grades.subject_id = subjects.id AND student_grades.student_id = ?
         ORDER BY subjects.name ASC`
      )
      .all(...(byLevel ? [levelId, studentId] : [studentId])) as GradeRow[];

  const rows = levelId ? select(true) : [];
  return rows.length > 0 ? rows : select(false);
}

// مجموع الدرجات = the student's degrees; النسبة المئوية = مجموع الدرجات ÷ مجموع النهايات الكبرى × 100.
// Subjects خارج المجموع are left out; in a choose-one group only the graded member's marks count
// (or one member's, before any is graded). Mirrors client/src/lib/degrees.ts degreeTotals.
function degreeSummary(grades: GradeRow[]): { total_degrees: number | null; percentage: number | null } {
  const counted = grades.filter((g) => !g.outside_total);
  const groups = new Map<string, GradeRow[]>();
  for (const g of counted) if (g.elective_group) groups.set(g.elective_group, [...(groups.get(g.elective_group) ?? []), g]);
  const marksRows = counted.filter((g) => {
    if (!g.elective_group) return true;
    const members = groups.get(g.elective_group)!;
    return members.some((m) => m.score !== null) ? g.score !== null : members[0] === g;
  });
  if (!counted.some((g) => g.score !== null)) return { total_degrees: null, percentage: null };
  const score = counted.reduce((t, g) => t + (g.score ?? 0), 0);
  const max = marksRows.reduce((t, g) => t + (g.max_degree ?? 0), 0);
  return { total_degrees: score, percentage: max > 0 ? Math.round((1000 * score) / max) / 10 : null };
}

// Students ribbon > Degrees Profile: every student's grades in one grid. (No GET "/:id" route
// exists, so "degrees-overview" can't be mistaken for a student id.) Each subject carries its
// per-section marks so the grid can show them once a section is picked.
studentsRouter.get("/degrees-overview", requireAuth, (req, res) => {
  const marks = db
    .prepare("SELECT subject_id, level_id, max_degree, min_degree, outside_total, elective_group FROM subject_levels")
    .all() as {
    subject_id: number;
    level_id: number;
    max_degree: number | null;
    min_degree: number | null;
    outside_total: number;
    elective_group: string | null;
  }[];
  const subjects = (db.prepare("SELECT id, name FROM subjects ORDER BY name ASC").all() as { id: number; name: string }[]).map(
    (s) => ({
      ...s,
      level_marks: marks
        .filter((m) => m.subject_id === s.id)
        .map(({ subject_id: _s, ...m }) => m),
    })
  );
  const students = (
    db
      .prepare(
        `SELECT id, seq_no, name, national_id, moe_code, division, section, school, level_id FROM students
         WHERE 1=1${scopeSql(req).sql} ORDER BY seq_no ASC`
      )
      .all(...scopeSql(req).params) as any[]
  ).map((s) => ({ ...s, grades: studentGrades(s.id, s.level_id) }));
  res.json({ subjects, students });
});

studentsRouter.get("/:id/grades", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const student = studentLevel(id);
  if (!student) return res.status(404).json({ error: "Student not found" });
  if (!inScope(req, student.level_id)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  res.json({ grades: studentGrades(id, student.level_id) });
});

studentsRouter.put("/:id/grades", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const placed = studentLevel(id);
  if (!placed) return res.status(404).json({ error: "Student not found" });
  if (!inScope(req, placed.level_id)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  const rows = Array.isArray((req.body ?? {}).grades) ? (req.body.grades as any[]) : [];

  // كبرى/صغرى marks come from the subject's section (Subjects is the only place they're edited)
  // and are frozen onto each degree as it's saved, so a later change to the section's marks
  // doesn't rewrite results already given: a degree that's saved again unchanged keeps the marks
  // it had, a changed one takes the section's current marks.
  const student = db.prepare("SELECT level_id FROM students WHERE id = ?").get(id) as { level_id: number | null };
  const sectionMarks = new Map(
    (
      db.prepare("SELECT subject_id, max_degree, min_degree FROM subject_levels WHERE level_id = ?").all(student.level_id) as {
        subject_id: number;
        max_degree: number | null;
        min_degree: number | null;
      }[]
    ).map((m) => [m.subject_id, m])
  );
  const existing = new Map(
    (
      db
        .prepare("SELECT subject_id, score, score_min, max_degree, min_degree FROM student_grades WHERE student_id = ?")
        .all(id) as {
        subject_id: number;
        score: number | null;
        score_min: number | null;
        max_degree: number | null;
        min_degree: number | null;
      }[]
    ).map((g) => [g.subject_id, g])
  );
  const toNum = (v: unknown) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

  type Planned = { subjectId: number; score: number | null; scoreMin: number | null; max: number | null; min: number | null };
  const planned: Planned[] = [];
  for (const row of rows) {
    const subjectId = Number(row.subjectId);
    if (!Number.isInteger(subjectId)) continue;
    const score = toNum(row.score);
    const scoreMin = toNum(row.scoreMin);
    const prev = existing.get(subjectId);
    // The degree is one value (score); score_min is no longer entered and is only kept if sent.
    const unchanged = prev && prev.score === score;
    const frozen = unchanged && (prev.max_degree !== null || prev.min_degree !== null);
    const max = frozen ? prev.max_degree : sectionMarks.get(subjectId)?.max_degree ?? null;
    const min = frozen ? prev.min_degree : sectionMarks.get(subjectId)?.min_degree ?? null;
    if ((score !== null && score < 0) || (scoreMin !== null && scoreMin < 0)) {
      return res.status(400).json({ error: "Degrees can't be negative" });
    }
    if (score !== null && max !== null && score > max) {
      return res.status(400).json({ error: "A كبرى degree can't be more than the subject's كبرى" });
    }
    if (scoreMin !== null && min !== null && scoreMin > min) {
      return res.status(400).json({ error: "A صغرى degree can't be more than the subject's صغرى" });
    }
    planned.push({ subjectId, score, scoreMin, max, min });
  }

  const upsert = db.prepare(
    `INSERT INTO student_grades (student_id, subject_id, score, score_min, max_degree, min_degree) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id, subject_id) DO UPDATE SET
       score = excluded.score, score_min = excluded.score_min,
       max_degree = excluded.max_degree, min_degree = excluded.min_degree`
  );
  const remove = db.prepare("DELETE FROM student_grades WHERE student_id = ? AND subject_id = ?");
  db.transaction(() => {
    for (const p of planned) {
      if (p.score === null && p.scoreMin === null) remove.run(id, p.subjectId);
      else upsert.run(id, p.subjectId, p.score, p.scoreMin, p.max, p.min);
    }
  })();
  res.json({ ok: true });
});

studentsRouter.delete("/", requireAuth, (req, res) => {
  const ids = Array.isArray((req.body ?? {}).ids)
    ? (req.body.ids as unknown[]).map((v) => Number(v)).filter((n) => Number.isInteger(n))
    : [];
  if (ids.length === 0) return res.status(400).json({ error: "No student ids provided" });

  const placeholders = ids.map(() => "?").join(",");
  const existing = db.prepare(`SELECT photo_url, level_id FROM students WHERE id IN (${placeholders})`).all(...ids) as {
    photo_url: string | null;
    level_id: number | null;
  }[];
  if (existing.some((row) => !inScope(req, row.level_id))) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  const info = db.prepare(`DELETE FROM students WHERE id IN (${placeholders})`).run(...ids);
  existing.forEach((row) => deleteLocalUpload(row.photo_url));
  res.json({ ok: true, deleted: info.changes });
});

studentsRouter.delete("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT photo_url, level_id FROM students WHERE id = ?").get(id) as
    | { photo_url: string | null; level_id: number | null }
    | undefined;
  if (existing && !inScope(req, existing.level_id)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  const info = db.prepare("DELETE FROM students WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Student not found" });
  deleteLocalUpload(existing?.photo_url);
  res.status(204).send();
});

studentsRouter.post("/:id/photo", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM students WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Student not found" });
  if (!inScope(req, existing.level_id)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });

  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message ?? "Upload failed" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    deleteLocalUpload(existing.photo_url);
    const url = `/uploads/${req.file.filename}`;
    db.prepare("UPDATE students SET photo_url = ? WHERE id = ?").run(url, id);

    const student = db.prepare("SELECT * FROM students WHERE id = ?").get(id);
    res.status(201).json({ student });
  });
});

studentsRouter.delete("/:id/photo", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM students WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Student not found" });
  if (!inScope(req, existing.level_id)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });

  deleteLocalUpload(existing.photo_url);
  db.prepare("UPDATE students SET photo_url = NULL WHERE id = ?").run(id);

  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(id);
  res.json({ student });
});
