import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";

export const timetableRouter = Router();
timetableRouter.use(requireModule("timetable"));

const DAY_COUNT = 5; // Sunday..Thursday, matching TimeTablePage's DAYS constant

function isClassPosted(classId: number): boolean {
  const row = db.prepare("SELECT posted FROM class_timetable_status WHERE class_id = ?").get(classId) as
    | { posted: number }
    | undefined;
  return Boolean(row?.posted);
}

function resolveSubjectName(subjectId: number | null | undefined): string | null {
  if (!subjectId) return null;
  const row = db.prepare("SELECT name FROM subjects WHERE id = ?").get(subjectId) as { name: string } | undefined;
  return row?.name ?? null;
}

function resolveTeacherName(teacherId: number | null | undefined): string | null {
  if (!teacherId) return null;
  const row = db.prepare("SELECT name_ar FROM hr_employees WHERE id = ?").get(teacherId) as
    | { name_ar: string }
    | undefined;
  return row?.name_ar ?? null;
}

timetableRouter.get("/", requireAuth, (req, res) => {
  const { classId } = req.query as { classId?: string };
  if (!classId) return res.status(400).json({ error: "classId is required" });

  const rows = db
    .prepare("SELECT * FROM timetable_entries WHERE class_id = ? ORDER BY day_of_week ASC, period_no ASC")
    .all(Number(classId));
  res.json({ entries: rows });
});

timetableRouter.post("/", requireAuth, (req, res) => {
  const b = req.body ?? {};
  const subjectName = b.subject ?? resolveSubjectName(b.subjectId);
  if (!b.classId || b.dayOfWeek == null || !b.periodNo || !subjectName) {
    return res.status(400).json({ error: "classId, dayOfWeek, periodNo and subject are required" });
  }
  if (isClassPosted(Number(b.classId))) {
    return res.status(409).json({ error: "This class's timetable has been posted and can no longer be edited" });
  }

  const existing = db
    .prepare("SELECT id FROM timetable_entries WHERE class_id = ? AND day_of_week = ? AND period_no = ?")
    .get(b.classId, b.dayOfWeek, b.periodNo);
  if (existing) {
    return res.status(409).json({ error: "This period is already scheduled for that day" });
  }

  const teacherName = b.teacherName ?? resolveTeacherName(b.teacherId);
  const info = db
    .prepare(
      `INSERT INTO timetable_entries
        (class_id, day_of_week, period_no, start_time, end_time, subject, teacher_name, subject_id, teacher_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      b.classId,
      b.dayOfWeek,
      b.periodNo,
      b.startTime ?? null,
      b.endTime ?? null,
      subjectName,
      teacherName ?? null,
      b.subjectId ?? null,
      b.teacherId ?? null
    );

  const entry = db.prepare("SELECT * FROM timetable_entries WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ entry });
});

timetableRouter.put("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM timetable_entries WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Entry not found" });
  if (isClassPosted(existing.class_id)) {
    return res.status(409).json({ error: "This class's timetable has been posted and can no longer be edited" });
  }

  const b = req.body ?? {};
  const subjectId = b.subjectId === undefined ? existing.subject_id : b.subjectId;
  const teacherId = b.teacherId === undefined ? existing.teacher_id : b.teacherId;
  db.prepare(
    `UPDATE timetable_entries SET
      day_of_week = ?, period_no = ?, start_time = ?, end_time = ?, subject = ?, teacher_name = ?,
      subject_id = ?, teacher_id = ?
     WHERE id = ?`
  ).run(
    b.dayOfWeek ?? existing.day_of_week,
    b.periodNo ?? existing.period_no,
    b.startTime ?? existing.start_time,
    b.endTime ?? existing.end_time,
    b.subject ?? resolveSubjectName(subjectId) ?? existing.subject,
    b.teacherName ?? resolveTeacherName(teacherId) ?? existing.teacher_name,
    subjectId ?? null,
    teacherId ?? null,
    id
  );

  const entry = db.prepare("SELECT * FROM timetable_entries WHERE id = ?").get(id);
  res.json({ entry });
});

timetableRouter.delete("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT class_id FROM timetable_entries WHERE id = ?").get(id) as
    | { class_id: number }
    | undefined;
  if (!existing) return res.status(404).json({ error: "Entry not found" });
  if (isClassPosted(existing.class_id)) {
    return res.status(409).json({ error: "This class's timetable has been posted and can no longer be edited" });
  }

  db.prepare("DELETE FROM timetable_entries WHERE id = ?").run(id);
  res.status(204).send();
});

// --- Daily Period (the modal's period-of-day column headers) ---

timetableRouter.get("/daily-periods", requireAuth, (_req, res) => {
  const rows = db.prepare("SELECT * FROM daily_periods ORDER BY period_no ASC").all();
  res.json({ periods: rows });
});

timetableRouter.post("/daily-periods", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.startTime || !b.endTime) return res.status(400).json({ error: "Start and end time are required" });

  const maxNo = (db.prepare("SELECT MAX(period_no) as m FROM daily_periods").get() as { m: number | null }).m ?? 0;
  const info = db
    .prepare("INSERT INTO daily_periods (period_no, start_time, end_time) VALUES (?, ?, ?)")
    .run(maxNo + 1, b.startTime, b.endTime);

  const period = db.prepare("SELECT * FROM daily_periods WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ period });
});

timetableRouter.put("/daily-periods/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM daily_periods WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Period not found" });

  const b = req.body ?? {};
  db.prepare("UPDATE daily_periods SET start_time = ?, end_time = ? WHERE id = ?").run(
    b.startTime ?? existing.start_time,
    b.endTime ?? existing.end_time,
    id
  );

  const period = db.prepare("SELECT * FROM daily_periods WHERE id = ?").get(id);
  res.json({ period });
});

timetableRouter.delete("/daily-periods/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM daily_periods WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Period not found" });
  res.status(204).send();
});

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Re-derives period_no from time order after a break is inserted or removed — a two-phase
// renumber (push everything past the UNIQUE(period_no) range first) avoids transient
// collisions while numbers shuffle.
function renumberDailyPeriods() {
  const rows = db.prepare("SELECT id FROM daily_periods ORDER BY start_time ASC, id ASC").all() as { id: number }[];
  const OFFSET = 100000;
  rows.forEach((r, i) => db.prepare("UPDATE daily_periods SET period_no = ? WHERE id = ?").run(OFFSET + i + 1, r.id));
  rows.forEach((r, i) => db.prepare("UPDATE daily_periods SET period_no = ? WHERE id = ?").run(i + 1, r.id));
}

// Sets (or replaces) the single school-wide break: picking a start time + duration drops it
// into the period sequence at the right time-ordered slot and renumbers around it. Only one
// break is modeled at a time — calling this again moves it rather than stacking a second one.
timetableRouter.post("/daily-periods/break", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.startTime || !b.durationMinutes) {
    return res.status(400).json({ error: "startTime and durationMinutes are required" });
  }
  const duration = Number(b.durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    return res.status(400).json({ error: "durationMinutes must be a positive number" });
  }
  const endTime = toHHMM(toMinutes(b.startTime) + duration);

  db.prepare("DELETE FROM daily_periods WHERE is_break = 1").run();
  const maxNo = (db.prepare("SELECT MAX(period_no) as m FROM daily_periods").get() as { m: number | null }).m ?? 0;
  db.prepare("INSERT INTO daily_periods (period_no, start_time, end_time, is_break) VALUES (?, ?, ?, 1)").run(
    maxNo + 1,
    b.startTime,
    endTime
  );
  renumberDailyPeriods();

  const periods = db.prepare("SELECT * FROM daily_periods ORDER BY period_no ASC").all();
  res.json({ periods });
});

// Re-lays-out every period's start/end time from the first period's (unchanged) start time,
// walking period_no order and giving each regular period the same duration while a break row
// keeps whatever duration it was given when set (its own end minus start).
timetableRouter.post("/daily-periods/apply-duration", requireAuth, (req, res) => {
  const b = req.body ?? {};
  const duration = Number(b.periodDurationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    return res.status(400).json({ error: "periodDurationMinutes must be a positive number" });
  }

  const rows = db.prepare("SELECT * FROM daily_periods ORDER BY period_no ASC").all() as {
    id: number;
    start_time: string;
    end_time: string;
    is_break: number;
  }[];

  let cursor = rows.length > 0 ? toMinutes(rows[0].start_time) : 0;
  for (const row of rows) {
    const ownDuration = row.is_break ? toMinutes(row.end_time) - toMinutes(row.start_time) : duration;
    const start = cursor;
    const end = start + ownDuration;
    db.prepare("UPDATE daily_periods SET start_time = ?, end_time = ? WHERE id = ?").run(toHHMM(start), toHHMM(end), row.id);
    cursor = end;
  }

  const periods = db.prepare("SELECT * FROM daily_periods ORDER BY period_no ASC").all();
  res.json({ periods });
});

// --- Teachers (Time Table > Teachers, synced read-only from HR & Staff's Teachers division) ---

// The seeded org tree names this division "المدرسين", but it's a fully editable tree — a
// school may rename it (e.g. to "Teachers") without losing this sync, so both the seed name
// and its English translation are recognized, case-insensitively for the Latin one.
const TEACHER_DIVISION_NAMES = ["المدرسين", "teachers"];

timetableRouter.get("/teachers", requireAuth, (req, res) => {
  const { q } = req.query as { q?: string };

  let sql = `
    SELECT hr_employees.id as employee_id, hr_employees.name_ar as name, hr_employees.status as employee_status,
           hr_employees.section as section, hr_employees.subject_id as subject_id,
           hr_employees.periods_share as periods_share,
           COALESCE(timetable_teacher_overrides.active, 1) as active
    FROM hr_employees
    LEFT JOIN timetable_teacher_overrides ON timetable_teacher_overrides.employee_id = hr_employees.id
    WHERE LOWER(hr_employees.division) IN (${TEACHER_DIVISION_NAMES.map(() => "?").join(", ")})`;
  const params: any[] = [...TEACHER_DIVISION_NAMES];
  if (q) {
    sql += " AND hr_employees.name_ar LIKE ?";
    params.push(`%${q}%`);
  }
  sql += " ORDER BY hr_employees.name_ar ASC";

  const rows = db.prepare(sql).all(...params);
  res.json({ teachers: rows });
});

timetableRouter.put("/teachers/:employeeId/active", requireAuth, (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const active = req.body?.active ? 1 : 0;
  db.prepare(
    `INSERT INTO timetable_teacher_overrides (employee_id, active) VALUES (?, ?)
     ON CONFLICT(employee_id) DO UPDATE SET active = excluded.active`
  ).run(employeeId, active);
  res.json({ ok: true });
});

timetableRouter.delete("/teachers/:employeeId/active", requireAuth, (req, res) => {
  const employeeId = Number(req.params.employeeId);
  db.prepare("DELETE FROM timetable_teacher_overrides WHERE employee_id = ?").run(employeeId);
  res.json({ ok: true });
});

// Per-teacher load summary — every class they're assigned to (with session counts) across
// the whole school, against their HR & Staff "Periods Share" target, plus the overage price
// (their subject's per-period price × periods over target) when they're over-assigned.
timetableRouter.get("/teachers/:employeeId/summary", requireAuth, (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const employee = db.prepare("SELECT id, name_ar, periods_share, subject_id FROM hr_employees WHERE id = ?").get(
    employeeId
  ) as { id: number; name_ar: string; periods_share: number | null; subject_id: number | null } | undefined;
  if (!employee) return res.status(404).json({ error: "Teacher not found" });

  const subject = employee.subject_id
    ? (db.prepare("SELECT id, name, price FROM subjects WHERE id = ?").get(employee.subject_id) as
        | { id: number; name: string; price: number }
        | undefined) ?? null
    : null;

  const classes = db
    .prepare(
      `SELECT classes.id as class_id, classes.class_name as class_name, COUNT(timetable_entries.id) as sessions
       FROM timetable_entries
       JOIN classes ON classes.id = timetable_entries.class_id
       WHERE timetable_entries.teacher_id = ?
       GROUP BY classes.id
       ORDER BY classes.class_name ASC`
    )
    .all(employeeId) as { class_id: number; class_name: string; sessions: number }[];

  const totalActual = classes.reduce((sum, c) => sum + c.sessions, 0);
  const periodsShare = employee.periods_share ?? 0;
  const remaining = periodsShare - totalActual;
  const price = remaining < 0 ? Math.abs(remaining) * (subject?.price ?? 0) : 0;

  res.json({
    employee: { id: employee.id, name: employee.name_ar, periodsShare },
    subject,
    classes,
    totalActual,
    remaining,
    price,
  });
});

// --- Overview (the Time Table icon's class cards — one row per class, no N+1 calls) ---

timetableRouter.get("/overview", requireAuth, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT classes.id as class_id,
              COUNT(timetable_entries.id) as entry_count,
              COALESCE(class_timetable_status.posted, 0) as posted
       FROM classes
       LEFT JOIN timetable_entries ON timetable_entries.class_id = classes.id
       LEFT JOIN class_timetable_status ON class_timetable_status.class_id = classes.id
       GROUP BY classes.id`
    )
    .all() as { class_id: number; entry_count: number; posted: number }[];
  res.json({
    overview: rows.map((r) => ({ classId: r.class_id, entryCount: r.entry_count, posted: Boolean(r.posted) })),
  });
});

// --- Time Table Post (lock a class's timetable against further edits) ---

timetableRouter.get("/status/:classId", requireAuth, (req, res) => {
  const classId = Number(req.params.classId);
  const row = db.prepare("SELECT posted, posted_at FROM class_timetable_status WHERE class_id = ?").get(classId) as
    | { posted: number; posted_at: string | null }
    | undefined;
  res.json({ posted: Boolean(row?.posted), postedAt: row?.posted_at ?? null });
});

timetableRouter.post("/status/:classId/toggle", requireAuth, (req, res) => {
  const classId = Number(req.params.classId);
  const current = isClassPosted(classId);
  const next = !current;
  db.prepare(
    `INSERT INTO class_timetable_status (class_id, posted, posted_at) VALUES (?, ?, ?)
     ON CONFLICT(class_id) DO UPDATE SET posted = excluded.posted, posted_at = excluded.posted_at`
  ).run(classId, next ? 1 : 0, next ? new Date().toISOString() : null);
  res.json({ posted: next });
});

// --- Random Table (best-effort auto-fill of empty cells for one class) ---

timetableRouter.post("/random/:classId", requireAuth, (req, res) => {
  const classId = Number(req.params.classId);
  if (isClassPosted(classId)) {
    return res.status(409).json({ error: "This class's timetable has been posted and can no longer be edited" });
  }

  const classRow = db.prepare("SELECT level_id FROM classes WHERE id = ?").get(classId) as
    | { level_id: number }
    | undefined;
  if (!classRow) return res.status(404).json({ error: "Class not found" });

  const subjects = db
    .prepare(
      `SELECT subjects.* FROM subjects
       JOIN subject_levels ON subject_levels.subject_id = subjects.id
       WHERE subject_levels.level_id = ? AND subjects.weekly_periods > 0
       ORDER BY subjects.name ASC`
    )
    .all(classRow.level_id) as { id: number; name: string; weekly_periods: number }[];

  const periods = db.prepare("SELECT period_no FROM daily_periods ORDER BY period_no ASC").all() as {
    period_no: number;
  }[];
  const existingEntries = db
    .prepare("SELECT day_of_week, period_no, subject_id FROM timetable_entries WHERE class_id = ?")
    .all(classId) as { day_of_week: number; period_no: number; subject_id: number | null }[];

  const filled = new Set(existingEntries.map((e) => `${e.day_of_week}:${e.period_no}`));
  const remaining = new Map(subjects.map((s) => [s.id, s.weekly_periods]));
  for (const e of existingEntries) {
    if (e.subject_id && remaining.has(e.subject_id)) {
      remaining.set(e.subject_id, Math.max(0, (remaining.get(e.subject_id) ?? 0) - 1));
    }
  }

  const insert = db.prepare(
    `INSERT INTO timetable_entries (class_id, day_of_week, period_no, subject, subject_id)
     VALUES (?, ?, ?, ?, ?)`
  );

  let created = 0;
  let subjectCursor = 0;
  for (let day = 0; day < DAY_COUNT && subjects.length > 0; day++) {
    const usedToday = new Set<number>();
    for (const period of periods) {
      const key = `${day}:${period.period_no}`;
      if (filled.has(key)) continue;

      let pick: (typeof subjects)[number] | null = null;
      for (let attempt = 0; attempt < subjects.length; attempt++) {
        const candidate = subjects[(subjectCursor + attempt) % subjects.length];
        if ((remaining.get(candidate.id) ?? 0) > 0 && !usedToday.has(candidate.id)) {
          pick = candidate;
          subjectCursor = (subjectCursor + attempt + 1) % subjects.length;
          break;
        }
      }
      if (!pick) continue;

      insert.run(classId, day, period.period_no, pick.name, pick.id);
      remaining.set(pick.id, (remaining.get(pick.id) ?? 0) - 1);
      usedToday.add(pick.id);
      filled.add(key);
      created++;
    }
  }

  res.json({ created });
});
