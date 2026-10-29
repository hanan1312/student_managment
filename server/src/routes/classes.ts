import { Router } from "express";
import { db } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";
import { getStageScope, stageOfLevel, OUT_OF_SCOPE_ERROR } from "../permissions";
import { syncEmployeesOnDepartmentRename } from "../hrEmployeeTitle";

export const classesRouter = Router();

// A stage's levels are sent as one flat list in tree (depth-first) order, each with its
// parent_id, depth, path (names below the stage, e.g. "الصف الثاني الثانوي / البكالوريا المصرية")
// and is_leaf; only leaves can be a student's Position. Code that just loops over stage.levels
// keeps working, and the tree UI rebuilds the nesting from parent_id.
type LevelRow = { id: number; stage_id: number; name: string; sort_order: number; parent_id: number | null };

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
