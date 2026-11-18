import { Router } from "express";
import { db } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";
import { getStageScope, stageOfLevel, OUT_OF_SCOPE_ERROR } from "../permissions";
import { syncEmployeesOnDepartmentRename } from "../hrEmployeeTitle";
import { currentAcademicYearId } from "../academicYears";

export const classesRouter = Router();

// A stage's levels are sent as one flat list in tree (depth-first) order, each with its
// parent_id, depth, path (names below the stage, e.g. "الصف الثاني الثانوي / البكالوريا المصرية")
// and is_leaf; only leaves can be a student's Position. Code that just loops over stage.levels
// keeps working, and the tree UI rebuilds the nesting from parent_id.
type LevelRow = {
  id: number;
  stage_id: number;
  name: string;
  sort_order: number;
  parent_id: number | null;
  is_branch?: number;
};

export const PATH_SEPARATOR = " / ";

function orderedLevels(levels: LevelRow[]) {
  const out: (LevelRow & { depth: number; path: string; is_leaf: boolean })[] = [];
  const walk = (parentId: number | null, depth: number, prefix: string) => {
    for (const level of levels.filter((l) => l.parent_id === parentId)) {
      const path = prefix ? `${prefix}${PATH_SEPARATOR}${level.name}` : level.name;
      const is_leaf = !levels.some((l) => l.parent_id === level.id);
      out.push({ ...level, depth, path, is_leaf });
      walk(level.id, depth + 1, path);
    }
  };
  walk(null, 0, "");
  return out;
}

// students.division / section hold the text of the student's Position (stage name / level path).
export function syncStudentPositionText() {
  const stages = db.prepare("SELECT id, name FROM stages").all() as { id: number; name: string }[];
  const levels = db.prepare("SELECT * FROM levels ORDER BY sort_order").all() as LevelRow[];
  const update = db.prepare("UPDATE students SET division = ?, section = ? WHERE level_id = ?");
  for (const stage of stages) {
    for (const level of orderedLevels(levels.filter((l) => l.stage_id === stage.id))) {
      update.run(stage.name, level.path, level.id);
    }
  }
}

// The level and everything nested under it.
function descendantLevelIds(levelId: number): number[] {
  const rows = db
    .prepare(
      `WITH RECURSIVE sub(id) AS (SELECT ? UNION ALL SELECT levels.id FROM levels JOIN sub ON levels.parent_id = sub.id)
       SELECT id FROM sub`
    )
    .all(levelId) as { id: number }[];
  return rows.map((r) => r.id);
}

// A user limited to some stages only sees (and edits) those stages of the tree.
function buildTreeResponse(req: AuthedRequest) {
  const scope = getStageScope(req.user);
  const stages = (db.prepare("SELECT * FROM stages ORDER BY sort_order").all() as any[]).filter(
    (stage) => !scope || scope.includes(stage.id)
  );
  const levels = db.prepare("SELECT * FROM levels ORDER BY sort_order").all() as LevelRow[];
  const classes = db.prepare("SELECT * FROM classes ORDER BY sort_order").all() as any[];

  const tree = stages.map((stage) => ({
    id: stage.id,
    stage: stage.name,
    levels: orderedLevels(levels.filter((l) => l.stage_id === stage.id)).map((level) => ({
      id: level.id,
      level: level.name,
      parent_id: level.parent_id,
      depth: level.depth,
      path: level.path,
      is_leaf: level.is_leaf,
      is_branch: Boolean(level.is_branch),
      classes: classes.filter((c) => c.level_id === level.id).map((c) => ({ id: c.id, className: c.class_name })),
    })),
  }));

  return { tree, flat: classes };
}

function stageAllowed(req: AuthedRequest, stageId: number | null): boolean {
  const scope = getStageScope(req.user);
  return !scope || (stageId !== null && scope.includes(stageId));
}

function levelAllowed(req: AuthedRequest, levelId: number | null): boolean {
  return stageAllowed(req, levelId === null ? null : stageOfLevel(levelId));
}

function classAllowed(req: AuthedRequest, classId: number): boolean {
  const row = db.prepare("SELECT level_id FROM classes WHERE id = ?").get(classId) as { level_id: number | null } | undefined;
  return levelAllowed(req, row?.level_id ?? null);
}

classesRouter.get("/", requireAuth, (req, res) => {
  res.json(buildTreeResponse(req));
});

classesRouter.post("/stages", requireAuth, (req, res) => {
  const name = (req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Stage name is required" });
  if (getStageScope((req as AuthedRequest).user)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });

  const maxOrder = (db.prepare("SELECT MAX(sort_order) as m FROM stages").get() as { m: number | null }).m ?? -1;
  db.prepare("INSERT INTO stages (name, sort_order) VALUES (?, ?)").run(name, maxOrder + 1);

  res.status(201).json(buildTreeResponse(req));
});

classesRouter.post("/stages/:stageId/levels", requireAuth, (req, res) => {
  const stageId = Number(req.params.stageId);
  const name = (req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Level name is required" });
  if (!stageAllowed(req, stageId)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });

  const stage = db.prepare("SELECT id FROM stages WHERE id = ?").get(stageId);
  if (!stage) return res.status(404).json({ error: "Stage not found" });

  // parentId nests the new level under another level of the same stage.
  const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
  if (parentId !== null) {
    const parent = db.prepare("SELECT id FROM levels WHERE id = ? AND stage_id = ?").get(parentId, stageId);
    if (!parent) return res.status(404).json({ error: "Parent level not found" });
    if (db.prepare("SELECT 1 FROM students WHERE level_id = ?").get(parentId)) {
      return res
        .status(400)
        .json({ error: "Students are placed directly on this level; move them before adding sub-levels to it" });
    }
  }

  const maxOrder = (
    db.prepare("SELECT MAX(sort_order) as m FROM levels WHERE stage_id = ? AND parent_id IS ?").get(stageId, parentId) as {
      m: number | null;
    }
  ).m ?? -1;
  db.prepare("INSERT INTO levels (stage_id, name, sort_order, parent_id) VALUES (?, ?, ?, ?)").run(
    stageId,
    name,
    maxOrder + 1,
    parentId
  );

  res.status(201).json(buildTreeResponse(req));
});

classesRouter.post("/levels/:levelId/classes", requireAuth, (req, res) => {
  const levelId = Number(req.params.levelId);
  const name = (req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Class name is required" });
  if (!levelAllowed(req, levelId)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });

  const level = db
    .prepare(
      `SELECT levels.id as level_id, levels.name as level_name, stages.name as stage_name
       FROM levels JOIN stages ON stages.id = levels.stage_id
       WHERE levels.id = ?`
    )
    .get(levelId) as { level_id: number; level_name: string; stage_name: string } | undefined;
  if (!level) return res.status(404).json({ error: "Level not found" });

  const maxOrder = (
    db.prepare("SELECT MAX(sort_order) as m FROM classes WHERE level_id = ?").get(levelId) as { m: number | null }
  ).m ?? -1;
  db.prepare(
    "INSERT INTO classes (stage_label, level_label, class_name, sort_order, level_id) VALUES (?, ?, ?, ?, ?)"
  ).run(level.stage_name, level.level_name, name, maxOrder + 1, levelId);

  res.status(201).json(buildTreeResponse(req));
});

classesRouter.put("/stages/:stageId", requireAuth, (req, res) => {
  const stageId = Number(req.params.stageId);
  const name = (req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Stage name is required" });
  if (!stageAllowed(req, stageId)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });

  const stage = db.prepare("SELECT id, name FROM stages WHERE id = ?").get(stageId) as { id: number; name: string } | undefined;
  if (!stage) return res.status(404).json({ error: "Stage not found" });

  const tx = db.transaction(() => {
    db.prepare("UPDATE stages SET name = ? WHERE id = ?").run(name, stageId);
    db.prepare(
      "UPDATE classes SET stage_label = ? WHERE level_id IN (SELECT id FROM levels WHERE stage_id = ?)"
    ).run(name, stageId);
    syncStudentPositionText();
    if (stage.name.trim() !== name.trim()) {
      syncEmployeesOnDepartmentRename(db, stage.name, name);
    }
  });
  tx();

  res.json(buildTreeResponse(req));
});

classesRouter.delete("/stages/:stageId", requireAuth, (req, res) => {
  const stageId = Number(req.params.stageId);
  if (!stageAllowed(req, stageId)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  const stage = db.prepare("SELECT id FROM stages WHERE id = ?").get(stageId);
  if (!stage) return res.status(404).json({ error: "Stage not found" });

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE students SET class_id = NULL WHERE class_id IN (
         SELECT id FROM classes WHERE level_id IN (SELECT id FROM levels WHERE stage_id = ?)
       )`
    ).run(stageId);
    db.prepare("UPDATE students SET level_id = NULL WHERE level_id IN (SELECT id FROM levels WHERE stage_id = ?)").run(
      stageId
    );
    db.prepare("DELETE FROM classes WHERE level_id IN (SELECT id FROM levels WHERE stage_id = ?)").run(stageId);
    db.prepare("DELETE FROM levels WHERE stage_id = ?").run(stageId);
    db.prepare("DELETE FROM stages WHERE id = ?").run(stageId);
  });
  tx();

  res.json(buildTreeResponse(req));
});

classesRouter.put("/levels/:levelId", requireAuth, (req, res) => {
  const levelId = Number(req.params.levelId);
  const name = (req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Level name is required" });
  if (!levelAllowed(req, levelId)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });

  const level = db.prepare("SELECT id FROM levels WHERE id = ?").get(levelId);
  if (!level) return res.status(404).json({ error: "Level not found" });

  const tx = db.transaction(() => {
    db.prepare("UPDATE levels SET name = ? WHERE id = ?").run(name, levelId);
    db.prepare("UPDATE classes SET level_label = ? WHERE level_id = ?").run(name, levelId);
    // Renaming a level changes the path text of every student under it.
    syncStudentPositionText();
  });
  tx();

  res.json(buildTreeResponse(req));
});

classesRouter.delete("/levels/:levelId", requireAuth, (req, res) => {
  const levelId = Number(req.params.levelId);
  if (!levelAllowed(req, levelId)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  const level = db.prepare("SELECT id FROM levels WHERE id = ?").get(levelId);
  if (!level) return res.status(404).json({ error: "Level not found" });

  // Deleting a level removes everything nested under it too.
  const ids = descendantLevelIds(levelId);
  const marks = ids.map(() => "?").join(",");
  const tx = db.transaction(() => {
    db.prepare(`UPDATE students SET class_id = NULL WHERE class_id IN (SELECT id FROM classes WHERE level_id IN (${marks}))`).run(
      ...ids
    );
    db.prepare(`UPDATE students SET level_id = NULL WHERE level_id IN (${marks})`).run(...ids);
    db.prepare(`DELETE FROM classes WHERE level_id IN (${marks})`).run(...ids);
    db.prepare(`DELETE FROM levels WHERE id IN (${marks})`).run(...ids);
  });
  tx();

  res.json(buildTreeResponse(req));
});

// Drag-to-reorder in the tree: a stage is placed before beforeId (or last when beforeId is null).
classesRouter.put("/stages/:stageId/position", requireAuth, (req, res) => {
  const stageId = Number(req.params.stageId);
  const beforeId = req.body?.beforeId ? Number(req.body.beforeId) : null;
  // Stage order is shared by everyone, so only users who manage every stage can change it.
  if (getStageScope((req as AuthedRequest).user)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  if (!db.prepare("SELECT id FROM stages WHERE id = ?").get(stageId)) return res.status(404).json({ error: "Stage not found" });

  const ids = (db.prepare("SELECT id FROM stages WHERE id != ? ORDER BY sort_order").all(stageId) as { id: number }[]).map(
    (r) => r.id
  );
  const at = beforeId === null ? -1 : ids.indexOf(beforeId);
  ids.splice(at === -1 ? ids.length : at, 0, stageId);
  const update = db.prepare("UPDATE stages SET sort_order = ? WHERE id = ?");
  db.transaction(() => ids.forEach((id, i) => update.run(i, id)))();

  res.json(buildTreeResponse(req));
});

// Moves a level (with everything under it) to parentId in stageId (null: directly under the
// stage), before beforeId among its new siblings (or last when beforeId is null). Returns an
// error (status and message) when the move isn't allowed.
function moveLevelTo(
  req: AuthedRequest,
  levelId: number,
  stageId: number,
  parentId: number | null,
  beforeId: number | null
): { status: number; error: string } | null {
  if (!levelAllowed(req, levelId) || !stageAllowed(req, stageId)) return { status: 403, error: OUT_OF_SCOPE_ERROR };

  const level = db.prepare("SELECT id, stage_id FROM levels WHERE id = ?").get(levelId) as
    | { id: number; stage_id: number }
    | undefined;
  if (!level) return { status: 404, error: "Level not found" };
  if (!db.prepare("SELECT id FROM stages WHERE id = ?").get(stageId)) return { status: 404, error: "Stage not found" };

  const ids = descendantLevelIds(levelId);
  if (parentId !== null) {
    if (ids.includes(parentId)) return { status: 400, error: "لا يمكن نقل العنصر داخل نفسه" };
    const parent = db.prepare("SELECT id FROM levels WHERE id = ? AND stage_id = ?").get(parentId, stageId);
    if (!parent) return { status: 404, error: "Parent level not found" };
    if (db.prepare("SELECT 1 FROM students WHERE level_id = ?").get(parentId)) {
      return { status: 400, error: "يوجد طلاب مسكنون على هذا العنصر؛ انقلهم أولاً قبل إضافة فروع داخله" };
    }
  }

  const siblings = (
    db
      .prepare("SELECT id FROM levels WHERE stage_id = ? AND parent_id IS ? AND id != ? ORDER BY sort_order")
      .all(stageId, parentId, levelId) as { id: number }[]
  ).map((r) => r.id);
  const at = beforeId === null ? -1 : siblings.indexOf(beforeId);
  siblings.splice(at === -1 ? siblings.length : at, 0, levelId);

  const marks = ids.map(() => "?").join(",");
  const tx = db.transaction(() => {
    db.prepare("UPDATE levels SET parent_id = ? WHERE id = ?").run(parentId, levelId);
    const update = db.prepare("UPDATE levels SET sort_order = ? WHERE id = ?");
    siblings.forEach((id, i) => update.run(i, id));
    if (level.stage_id !== stageId) {
      db.prepare(`UPDATE levels SET stage_id = ? WHERE id IN (${marks})`).run(stageId, ...ids);
      db.prepare(
        `UPDATE classes SET stage_label = (SELECT name FROM stages WHERE id = ?) WHERE level_id IN (${marks})`
      ).run(stageId, ...ids);
    }
    // The moved branch's paths changed, so its students' المرحلة / الصف text did too.
    syncStudentPositionText();
  });
  tx();
  return null;
}

classesRouter.put("/levels/:levelId/position", requireAuth, (req, res) => {
  const failed = moveLevelTo(
    req,
    Number(req.params.levelId),
    Number(req.body?.stageId),
    req.body?.parentId ? Number(req.body.parentId) : null,
    req.body?.beforeId ? Number(req.body.beforeId) : null
  );
  if (failed) return res.status(failed.status).json({ error: failed.error });
  res.json(buildTreeResponse(req));
});

// Students > إضافة شعبة: the شعب (levels with is_branch) and where each one is (its stage and
// section). A شعبة is a level like any other, shown nested under its section (like البكالوريا
// المصرية under الصف الثاني الثانوي). Students are placed on it, or on its sub-items (e.g. its
// tracks) when it has some, and each has its own subjects in المواد.
type BranchItem = { id: number; name: string; parent_id: number; depth: number; path: string; students: number; subjects: number };

type BranchRow = {
  id: number;
  name: string;
  stage_id: number;
  stage: string;
  parent_id: number | null;
  section: string;
  path: string;
  students: number;
  subjects: number;
  // Everything under the شعبة, in tree order; depth 1 = directly under it.
  items: BranchItem[];
};

function listBranches(req: AuthedRequest): BranchRow[] {
  const scope = getStageScope(req.user);
  const stages = db.prepare("SELECT id, name FROM stages ORDER BY sort_order").all() as { id: number; name: string }[];
  const levels = db.prepare("SELECT * FROM levels ORDER BY sort_order").all() as LevelRow[];
  const students = new Map(
    (
      db
        .prepare(
          `SELECT level_id, COUNT(*) AS n FROM students
           WHERE level_id IS NOT NULL AND academic_year_id IS ? GROUP BY level_id`
        )
        .all(currentAcademicYearId()) as { level_id: number; n: number }[]
    ).map((r) => [r.level_id, r.n])
  );
  const subjects = new Map(
    (db.prepare("SELECT level_id, COUNT(*) AS n FROM subject_levels GROUP BY level_id").all() as { level_id: number; n: number }[]).map(
      (r) => [r.level_id, r.n]
    )
  );
  const out: BranchRow[] = [];
  for (const stage of stages) {
    if (scope && !scope.includes(stage.id)) continue;
    const ordered = orderedLevels(levels.filter((l) => l.stage_id === stage.id));
    for (const level of ordered) {
      if (!level.is_branch) continue;
      const parent = ordered.find((l) => l.id === level.parent_id);
      const items = ordered
        .filter((l) => l.path.startsWith(`${level.path}${PATH_SEPARATOR}`))
        .map((l) => ({
          id: l.id,
          name: l.name,
          parent_id: l.parent_id as number,
          depth: l.depth - level.depth,
          path: l.path.slice(level.path.length + PATH_SEPARATOR.length),
          students: students.get(l.id) ?? 0,
          subjects: subjects.get(l.id) ?? 0,
        }));
      out.push({
        id: level.id,
        name: level.name,
        stage_id: stage.id,
        stage: stage.name,
        parent_id: level.parent_id,
        section: parent?.path ?? "",
        path: level.path,
        students: students.get(level.id) ?? 0,
        subjects: subjects.get(level.id) ?? 0,
        items,
      });
    }
  }
  return out;
}

const branchResponse = (req: AuthedRequest) => ({ ...buildTreeResponse(req), branches: listBranches(req) });

// A شعبة's name must be new among its section's items (ا / أ / إ written either way).
const looseKey = (text: string) => text.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, "");

// A شعبة can't be anywhere inside another شعبة (its sub-items are tracks, not شعب).
function insideBranch(levelId: number): boolean {
  let id: number | null = levelId;
  while (id !== null) {
    const row = db.prepare("SELECT parent_id, is_branch FROM levels WHERE id = ?").get(id) as
      | { parent_id: number | null; is_branch: number }
      | undefined;
    if (!row) return false;
    if (row.is_branch) return true;
    id = row.parent_id;
  }
  return false;
}

// Copies a level's subjects and marks (المواد) to a new level under it.
function copySubjects(fromLevelId: number, toLevelId: number) {
  db.prepare(
    `INSERT OR IGNORE INTO subject_levels (subject_id, level_id, max_degree, min_degree, outside_total, elective_group)
     SELECT subject_id, ?, max_degree, min_degree, outside_total, elective_group FROM subject_levels WHERE level_id = ?`
  ).run(toLevelId, fromLevelId);
}

function nameTaken(stageId: number, parentId: number | null, name: string, exceptId: number | null): boolean {
  const rows = db
    .prepare("SELECT id, name FROM levels WHERE stage_id = ? AND parent_id IS ?")
    .all(stageId, parentId) as { id: number; name: string }[];
  return rows.some((r) => r.id !== exceptId && looseKey(r.name) === looseKey(name));
}

classesRouter.get("/branches", requireAuth, (req, res) => {
  res.json({ branches: listBranches(req) });
});

classesRouter.post("/branches", requireAuth, (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const stageId = Number(req.body?.stageId);
  const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
  if (!name) return res.status(400).json({ error: "اسم الشعبة مطلوب" });
  if (parentId === null) return res.status(400).json({ error: "اختر الصف الذي تتبعه الشعبة" });
  if (!stageAllowed(req, stageId)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });

  const parent = db.prepare("SELECT id FROM levels WHERE id = ? AND stage_id = ?").get(parentId, stageId);
  if (!parent) return res.status(404).json({ error: "الصف غير موجود في هذه المرحلة" });
  if (insideBranch(parentId)) return res.status(400).json({ error: "لا يمكن إضافة شعبة داخل شعبة" });
  if (db.prepare("SELECT 1 FROM students WHERE level_id = ?").get(parentId)) {
    return res.status(400).json({ error: "يوجد طلاب مسكنون على هذا الصف مباشرة؛ انقلهم أولاً قبل إضافة شعبة له" });
  }
  if (nameTaken(stageId, parentId, name, null)) return res.status(400).json({ error: "توجد شعبة أو فرع بنفس الاسم في هذا الصف" });

  const maxOrder =
    (db.prepare("SELECT MAX(sort_order) as m FROM levels WHERE stage_id = ? AND parent_id IS ?").get(stageId, parentId) as {
      m: number | null;
    }).m ?? -1;
  db.transaction(() => {
    const id = Number(
      db
        .prepare("INSERT INTO levels (stage_id, name, sort_order, parent_id, is_branch) VALUES (?, ?, ?, ?, 1)")
        .run(stageId, name, maxOrder + 1, parentId).lastInsertRowid
    );
    // The new شعبة starts with its section's subjects and marks (المواد), to be changed there.
    copySubjects(parentId, id);
  })();

  res.status(201).json(branchResponse(req));
});

// Adds a sub-item (e.g. a track) under a شعبة or under one of its sub-items (parentId). It starts
// with its parent's subjects and marks.
classesRouter.post("/branches/:id/items", requireAuth, (req, res) => {
  const branchId = Number(req.params.id);
  const name = String(req.body?.name ?? "").trim();
  const parentId = req.body?.parentId ? Number(req.body.parentId) : branchId;
  if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
  const branch = db.prepare("SELECT id, stage_id FROM levels WHERE id = ? AND is_branch = 1").get(branchId) as
    | { id: number; stage_id: number }
    | undefined;
  if (!branch) return res.status(404).json({ error: "الشعبة غير موجودة" });
  if (!levelAllowed(req, branchId)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  if (parentId !== branchId && !descendantLevelIds(branchId).includes(parentId)) {
    return res.status(400).json({ error: "العنصر ليس داخل هذه الشعبة" });
  }
  if (db.prepare("SELECT 1 FROM students WHERE level_id = ?").get(parentId)) {
    return res.status(400).json({ error: "يوجد طلاب مسكنون عليه مباشرة؛ انقلهم أولاً قبل إضافة فروع داخله" });
  }
  if (nameTaken(branch.stage_id, parentId, name, null)) return res.status(400).json({ error: "يوجد فرع بنفس الاسم هنا" });

  const maxOrder =
    (db.prepare("SELECT MAX(sort_order) as m FROM levels WHERE parent_id = ?").get(parentId) as { m: number | null }).m ?? -1;
  db.transaction(() => {
    const id = Number(
      db
        .prepare("INSERT INTO levels (stage_id, name, sort_order, parent_id) VALUES (?, ?, ?, ?)")
        .run(branch.stage_id, name, maxOrder + 1, parentId).lastInsertRowid
    );
    copySubjects(parentId, id);
  })();

  res.status(201).json(branchResponse(req));
});

// Renames a شعبة and/or moves it to another section (its subjects and students go with it).
classesRouter.put("/branches/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body?.name ?? "").trim();
  const stageId = Number(req.body?.stageId);
  const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
  if (!name) return res.status(400).json({ error: "اسم الشعبة مطلوب" });
  if (parentId === null) return res.status(400).json({ error: "اختر الصف الذي تتبعه الشعبة" });

  const branch = db.prepare("SELECT id, stage_id, parent_id FROM levels WHERE id = ? AND is_branch = 1").get(id) as
    | { id: number; stage_id: number; parent_id: number | null }
    | undefined;
  if (!branch) return res.status(404).json({ error: "الشعبة غير موجودة" });
  if (!levelAllowed(req, id) || !stageAllowed(req, stageId)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  const parent = db.prepare("SELECT id FROM levels WHERE id = ? AND stage_id = ?").get(parentId, stageId);
  if (!parent) return res.status(404).json({ error: "الصف غير موجود في هذه المرحلة" });
  if (insideBranch(parentId)) return res.status(400).json({ error: "لا يمكن وضع شعبة داخل شعبة" });
  if (nameTaken(stageId, parentId, name, id)) return res.status(400).json({ error: "توجد شعبة أو فرع بنفس الاسم في هذا الصف" });

  if (branch.stage_id !== stageId || branch.parent_id !== parentId) {
    const failed = moveLevelTo(req, id, stageId, parentId, null);
    if (failed) return res.status(failed.status).json({ error: failed.error });
  }
  db.transaction(() => {
    db.prepare("UPDATE levels SET name = ? WHERE id = ?").run(name, id);
    db.prepare("UPDATE classes SET level_label = ? WHERE level_id = ?").run(name, id);
    syncStudentPositionText();
  })();

  res.json(branchResponse(req));
});

classesRouter.put("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const name = (req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Class name is required" });
  if (!classAllowed(req, id)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });

  const cls = db.prepare("SELECT id FROM classes WHERE id = ?").get(id);
  if (!cls) return res.status(404).json({ error: "Class not found" });

  db.prepare("UPDATE classes SET class_name = ? WHERE id = ?").run(name, id);

  res.json(buildTreeResponse(req));
});

classesRouter.delete("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!classAllowed(req, id)) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  const cls = db.prepare("SELECT id FROM classes WHERE id = ?").get(id);
  if (!cls) return res.status(404).json({ error: "Class not found" });

  const tx = db.transaction(() => {
    db.prepare("UPDATE students SET class_id = NULL WHERE class_id = ?").run(id);
    db.prepare("DELETE FROM classes WHERE id = ?").run(id);
  });
  tx();

  res.json(buildTreeResponse(req));
});
