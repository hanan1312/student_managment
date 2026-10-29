import { Router } from "express";
import { db } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";
import { requireModule, getStageScope, levelIdsInStages, OUT_OF_SCOPE_ERROR } from "../permissions";

export const subjectsRouter = Router();
// Managed from Time Table > Subjects and from Students > Subjects (where كبرى/صغرى are set).
subjectsRouter.use(requireModule("timetable", "students"));

// A Teacher-division employee's hr_employees.section is a plain-text mirror of their assigned
// subject's name (copied at pick time — see EmployeeFormModal.tsx's setTeacherSubject); Title no
// longer embeds it (see hrEmployeeTitle.ts's deriveEmployeeTitle — Title is Division+Department
// now), so renaming a subject only needs to keep that text mirror in sync, not recompute Title.
// `subjects` has no school_id, so every employee referencing this subject_id is in scope
// regardless of school.
function syncEmployeesOnSubjectRename(subjectId: number, newName: string) {
  db.prepare("UPDATE hr_employees SET section = ? WHERE subject_id = ?").run(newName, subjectId);
}

function withLevelIds(subject: any) {
  const levelMarks = db
    .prepare("SELECT level_id, max_degree, min_degree, outside_total, elective_group FROM subject_levels WHERE subject_id = ?")
    .all(subject.id) as {
    level_id: number;
    max_degree: number | null;
    min_degree: number | null;
    outside_total: number;
    elective_group: string | null;
  }[];
  // max_degree/min_degree on the subject row are superseded by level_marks (see db.ts).
  const { max_degree: _max, min_degree: _min, ...rest } = subject;
  return { ...rest, level_ids: levelMarks.map((r) => r.level_id), level_marks: levelMarks };
}

// For a user limited to some stages: the levels they may manage (null = all). Subjects are
// shared across stages, so such a user sees and edits only their own sections of a subject, and
// can't rename or delete one that other stages also use.
function allowedLevels(req: AuthedRequest): Set<number> | null {
  const scope = getStageScope(req.user);
  return scope ? levelIdsInStages(scope) : null;
}

function linkedLevelIds(subjectId: number): number[] {
  return (db.prepare("SELECT level_id FROM subject_levels WHERE subject_id = ?").all(subjectId) as { level_id: number }[]).map(
    (r) => r.level_id
  );
}

function scopedSubject(subject: any, allowed: Set<number> | null) {
  if (!allowed) return subject;
  return {
    ...subject,
    level_ids: subject.level_ids.filter((id: number) => allowed.has(id)),
    level_marks: subject.level_marks.filter((m: { level_id: number }) => allowed.has(m.level_id)),
  };
}

subjectsRouter.get("/", requireAuth, (req, res) => {
  const { levelId } = req.query as { levelId?: string };

  let subjects: any[];
  if (levelId) {
    subjects = db
      .prepare(
        `SELECT subjects.* FROM subjects
         JOIN subject_levels ON subject_levels.subject_id = subjects.id
         WHERE subject_levels.level_id = ?
         ORDER BY subjects.name ASC`
      )
      .all(Number(levelId));
  } else {
    subjects = db.prepare("SELECT * FROM subjects ORDER BY name ASC").all();
  }

  const allowed = allowedLevels(req);
  const list = subjects
    .map(withLevelIds)
    // Hide subjects used only by other stages.
    .filter((sub) => !allowed || sub.level_ids.length === 0 || sub.level_ids.some((id: number) => allowed.has(id)))
    .map((sub) => scopedSubject(sub, allowed));
  res.json({ subjects: list });
});

// كبرى/صغرى (full marks / pass mark); blank clears them.
function degreeOrNull(v: unknown): number | null {
  return v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
}

function invalidLevelMarks(levelMarks: unknown): string | null {
  if (!Array.isArray(levelMarks)) return null;
  for (const m of levelMarks as any[]) {
    const max = degreeOrNull(m?.maxDegree);
    const min = degreeOrNull(m?.minDegree);
    if ((max !== null && max < 0) || (min !== null && min < 0)) return "Marks can't be negative";
    if (max !== null && min !== null && min > max) return "صغرى can't be more than كبرى";
  }
  return null;
}

// levelMarks ([{ levelId, maxDegree, minDegree, outsideTotal? }]) sets each section's كبرى/صغرى and
// خارج المجموع. Callers that only send levelIds (e.g. a rename elsewhere) keep what the sections
// that stay linked already had; elective_group (choose-one) is always kept.
function setLevels(subjectId: number, levelIds: unknown, levelMarks: unknown) {
  const previous = new Map(
    (
      db
        .prepare("SELECT level_id, max_degree, min_degree, outside_total, elective_group FROM subject_levels WHERE subject_id = ?")
        .all(subjectId) as {
        level_id: number;
        max_degree: number | null;
        min_degree: number | null;
        outside_total: number;
        elective_group: string | null;
      }[]
    ).map((r) => [r.level_id, r])
  );
  const given = new Map<number, { max: number | null; min: number | null; outside?: boolean }>();
  if (Array.isArray(levelMarks)) {
    for (const m of levelMarks as any[]) {
      const levelId = Number(m?.levelId);
      if (Number.isInteger(levelId)) {
        given.set(levelId, {
          max: degreeOrNull(m.maxDegree),
          min: degreeOrNull(m.minDegree),
          outside: m.outsideTotal === undefined ? undefined : Boolean(m.outsideTotal),
        });
      }
    }
  }

  db.prepare("DELETE FROM subject_levels WHERE subject_id = ?").run(subjectId);
  if (!Array.isArray(levelIds)) return;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO subject_levels (subject_id, level_id, max_degree, min_degree, outside_total, elective_group)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const raw of levelIds) {
    const levelId = Number(raw);
    if (!Number.isInteger(levelId)) continue;
    const marks = given.get(levelId) ?? {
      max: previous.get(levelId)?.max_degree ?? null,
      min: previous.get(levelId)?.min_degree ?? null,
    };
    const prev = previous.get(levelId);
    const outside = given.get(levelId)?.outside ?? Boolean(prev?.outside_total);
    insert.run(subjectId, levelId, marks.max, marks.min, outside ? 1 : 0, prev?.elective_group ?? null);
  }
}

subjectsRouter.post("/", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.name) return res.status(400).json({ error: "Name is required" });
  const marksError = invalidLevelMarks(b.levelMarks);
  if (marksError) return res.status(400).json({ error: marksError });

  const info = db
    .prepare(
      `INSERT INTO subjects (name, color, ig_subject, weekly_periods, price, category)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(b.name, b.color ?? null, b.igSubject ? 1 : 0, b.weeklyPeriods ?? 0, b.price ?? 0, b.category ?? null);

  const subjectId = Number(info.lastInsertRowid);
  const allowed = allowedLevels(req);
  const levelIds = allowed && Array.isArray(b.levelIds) ? b.levelIds.filter((id: unknown) => allowed.has(Number(id))) : b.levelIds;
  setLevels(subjectId, levelIds, b.levelMarks);

  const subject = db.prepare("SELECT * FROM subjects WHERE id = ?").get(subjectId);
  res.status(201).json({ subject: scopedSubject(withLevelIds(subject), allowed) });
});

subjectsRouter.put("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM subjects WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Subject not found" });

  const b = req.body ?? {};
  const newName = b.name ?? existing.name;
  const marksError = invalidLevelMarks(b.levelMarks);
  if (marksError) return res.status(400).json({ error: marksError });

  // A limited user's links replace only their own sections; other stages' links are kept.
  const allowed = allowedLevels(req);
  let levelIds = b.levelIds;
  if (allowed) {
    const others = linkedLevelIds(id).filter((lid) => !allowed.has(lid));
    if (others.length > 0 && existing.name.trim() !== String(newName).trim()) {
      return res.status(403).json({ error: "لا يمكن تغيير اسم مادة تستخدمها مراحل أخرى" });
    }
    if (Array.isArray(b.levelIds)) {
      levelIds = [...b.levelIds.filter((lid: unknown) => allowed.has(Number(lid))), ...others];
    }
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE subjects SET name = ?, color = ?, ig_subject = ?, weekly_periods = ?, price = ?, category = ?
       WHERE id = ?`
    ).run(
      newName,
      b.color ?? existing.color,
      b.igSubject === undefined ? existing.ig_subject : b.igSubject ? 1 : 0,
      b.weeklyPeriods ?? existing.weekly_periods,
      b.price ?? existing.price,
      b.category ?? existing.category,
      id
    );

    if (existing.name.trim() !== newName.trim()) {
      syncEmployeesOnSubjectRename(id, newName);
    }

    if (levelIds !== undefined) setLevels(id, levelIds, b.levelMarks);
  });
  tx();

  const subject = db.prepare("SELECT * FROM subjects WHERE id = ?").get(id);
  res.json({ subject: scopedSubject(withLevelIds(subject), allowed) });
});

subjectsRouter.delete("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const allowed = allowedLevels(req);
  if (allowed && linkedLevelIds(id).some((lid) => !allowed.has(lid))) {
    return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  }
  const info = db.prepare("DELETE FROM subjects WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Subject not found" });
  res.status(204).send();
});
