import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";
import { deriveEmployeeTitle } from "../hrEmployeeTitle";

export const hrOrgRouter = Router();
hrOrgRouter.use(requireModule("hrEmployees"));

// Division/Section/Job names are copied as plain text onto hr_employees (division/section/job)
// rather than referenced live by id, so a rename here would otherwise leave every employee
// already using the old name — and, for Division, their derived Title (see hrEmployeeTitle.ts)
// — stale until someone happened to re-open and re-save that employee. These helpers cascade a
// rename into the matching employee rows in the same transaction as the rename itself.
function syncEmployeesOnDivisionRename(schoolId: number, oldName: string, newName: string) {
  const affected = db
    .prepare("SELECT id, department FROM hr_employees WHERE school_id = ? AND TRIM(division) = TRIM(?)")
    .all(schoolId, oldName) as { id: number; department: string | null }[];
  if (affected.length === 0) return;

  const update = db.prepare("UPDATE hr_employees SET division = ?, title = ? WHERE id = ?");
  for (const emp of affected) {
    const title = deriveEmployeeTitle(newName, emp.department ?? "") || null;
    update.run(newName, title, emp.id);
  }
}

function syncEmployeesOnSectionRename(schoolId: number, divisionName: string, oldName: string, newName: string) {
  db.prepare(
    "UPDATE hr_employees SET section = ? WHERE school_id = ? AND TRIM(division) = TRIM(?) AND TRIM(section) = TRIM(?)"
  ).run(newName, schoolId, divisionName, oldName);
}

// One-time reconciliation for a division just switched to kind "teachers": employees already in
// it typically have Section text (set via the old plain hr_org_sections picker) that happens to
// match a real Time Table Subjects name — link those up by subject_id immediately instead of
// requiring every employee to be individually reopened and resaved through the new Subject picker.
function backfillSubjectIdsForDivision(schoolId: number, divisionName: string) {
  db.prepare(
    `UPDATE hr_employees
     SET subject_id = (SELECT id FROM subjects WHERE TRIM(subjects.name) = TRIM(hr_employees.section))
     WHERE school_id = ? AND TRIM(division) = TRIM(?) AND subject_id IS NULL
       AND section IS NOT NULL AND TRIM(section) != ''
       AND EXISTS (SELECT 1 FROM subjects WHERE TRIM(subjects.name) = TRIM(hr_employees.section))`
  ).run(schoolId, divisionName);
}

function syncEmployeesOnJobRename(
  schoolId: number,
  divisionName: string,
  sectionName: string,
  oldName: string,
  newName: string
) {
  db.prepare(
    `UPDATE hr_employees SET job = ?
     WHERE school_id = ? AND TRIM(division) = TRIM(?) AND TRIM(section) = TRIM(?) AND TRIM(job) = TRIM(?)`
  ).run(newName, schoolId, divisionName, sectionName, oldName);
}

function buildTreeResponse(schoolId: number) {
  const divisions = db
    .prepare("SELECT * FROM hr_org_divisions WHERE school_id = ? ORDER BY sort_order")
    .all(schoolId) as any[];
  const sections = db
    .prepare(
      `SELECT hr_org_sections.* FROM hr_org_sections
       JOIN hr_org_divisions ON hr_org_divisions.id = hr_org_sections.division_id
       WHERE hr_org_divisions.school_id = ?
       ORDER BY hr_org_sections.sort_order`
    )
    .all(schoolId) as any[];
  const jobs = db
    .prepare(
      `SELECT hr_org_jobs.* FROM hr_org_jobs
       JOIN hr_org_sections ON hr_org_sections.id = hr_org_jobs.section_id
       JOIN hr_org_divisions ON hr_org_divisions.id = hr_org_sections.division_id
       WHERE hr_org_divisions.school_id = ?
       ORDER BY hr_org_jobs.sort_order`
    )
    .all(schoolId) as any[];

  const tree = divisions.map((division) => ({
    id: division.id,
    division: division.name,
    kind: division.kind ?? "generic",
    sections: sections
      .filter((s) => s.division_id === division.id)
      .map((section) => ({
        id: section.id,
        section: section.name,
        jobs: jobs.filter((j) => j.section_id === section.id).map((j) => ({ id: j.id, job: j.name })),
      })),
  }));

  return { tree };
}

hrOrgRouter.get("/", requireAuth, (req, res) => {
  const { schoolId } = req.query as { schoolId?: string };
  if (!schoolId) return res.status(400).json({ error: "schoolId is required" });
  res.json(buildTreeResponse(Number(schoolId)));
});

hrOrgRouter.post("/divisions", requireAuth, (req, res) => {
  const { schoolId, name: rawName } = req.body ?? {};
  const name = (rawName ?? "").trim();
  if (!schoolId || !name) return res.status(400).json({ error: "schoolId and name are required" });

  const maxOrder = (
    db.prepare("SELECT MAX(sort_order) as m FROM hr_org_divisions WHERE school_id = ?").get(schoolId) as {
      m: number | null;
    }
  ).m ?? -1;
  db.prepare("INSERT INTO hr_org_divisions (school_id, name, sort_order) VALUES (?, ?, ?)").run(
    schoolId,
    name,
    maxOrder + 1
  );

  res.status(201).json(buildTreeResponse(Number(schoolId)));
});

const VALID_DIVISION_KINDS = new Set(["generic", "teachers", "principals"]);

hrOrgRouter.put("/divisions/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const division = db.prepare("SELECT * FROM hr_org_divisions WHERE id = ?").get(id) as any;
  if (!division) return res.status(404).json({ error: "Division not found" });

  const body = req.body ?? {};
  const hasName = typeof body.name === "string";
  const name = hasName ? body.name.trim() : division.name;
  if (hasName && !name) return res.status(400).json({ error: "Division name is required" });

  const hasKind = typeof body.kind === "string";
  if (hasKind && !VALID_DIVISION_KINDS.has(body.kind)) {
    return res.status(400).json({ error: "Invalid division kind" });
  }
  const kind = hasKind ? body.kind : division.kind;

  const tx = db.transaction(() => {
    db.prepare("UPDATE hr_org_divisions SET name = ?, kind = ? WHERE id = ?").run(name, kind, id);
    if (division.name.trim() !== name.trim()) {
      syncEmployeesOnDivisionRename(division.school_id, division.name, name);
    }
    if (hasKind && division.kind !== "teachers" && kind === "teachers") {
      backfillSubjectIdsForDivision(division.school_id, name);
    }
  });
  tx();

  res.json(buildTreeResponse(division.school_id));
});

hrOrgRouter.delete("/divisions/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const division = db.prepare("SELECT * FROM hr_org_divisions WHERE id = ?").get(id) as any;
  if (!division) return res.status(404).json({ error: "Division not found" });

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM hr_org_jobs WHERE section_id IN (SELECT id FROM hr_org_sections WHERE division_id = ?)").run(id);
    db.prepare("DELETE FROM hr_org_sections WHERE division_id = ?").run(id);
    db.prepare("DELETE FROM hr_org_divisions WHERE id = ?").run(id);
  });
  tx();

  res.json(buildTreeResponse(division.school_id));
});

hrOrgRouter.post("/divisions/:divisionId/sections", requireAuth, (req, res) => {
  const divisionId = Number(req.params.divisionId);
  const name = (req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Section name is required" });

  const division = db.prepare("SELECT * FROM hr_org_divisions WHERE id = ?").get(divisionId) as any;
  if (!division) return res.status(404).json({ error: "Division not found" });

  const maxOrder = (
    db.prepare("SELECT MAX(sort_order) as m FROM hr_org_sections WHERE division_id = ?").get(divisionId) as {
      m: number | null;
    }
  ).m ?? -1;
  db.prepare("INSERT INTO hr_org_sections (division_id, name, sort_order) VALUES (?, ?, ?)").run(
    divisionId,
    name,
    maxOrder + 1
  );

  res.status(201).json(buildTreeResponse(division.school_id));
});

hrOrgRouter.put("/sections/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const name = (req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Section name is required" });

  const section = db
    .prepare(
      `SELECT hr_org_sections.*, hr_org_divisions.school_id as school_id, hr_org_divisions.name as division_name
       FROM hr_org_sections JOIN hr_org_divisions ON hr_org_divisions.id = hr_org_sections.division_id
       WHERE hr_org_sections.id = ?`
    )
    .get(id) as any;
  if (!section) return res.status(404).json({ error: "Section not found" });

  const tx = db.transaction(() => {
    db.prepare("UPDATE hr_org_sections SET name = ? WHERE id = ?").run(name, id);
    if (section.name.trim() !== name.trim()) {
      syncEmployeesOnSectionRename(section.school_id, section.division_name, section.name, name);
    }
  });
  tx();

  res.json(buildTreeResponse(section.school_id));
});

hrOrgRouter.delete("/sections/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const section = db
    .prepare(
      `SELECT hr_org_sections.*, hr_org_divisions.school_id as school_id
       FROM hr_org_sections JOIN hr_org_divisions ON hr_org_divisions.id = hr_org_sections.division_id
       WHERE hr_org_sections.id = ?`
    )
    .get(id) as any;
  if (!section) return res.status(404).json({ error: "Section not found" });

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM hr_org_jobs WHERE section_id = ?").run(id);
    db.prepare("DELETE FROM hr_org_sections WHERE id = ?").run(id);
  });
  tx();

  res.json(buildTreeResponse(section.school_id));
});

hrOrgRouter.post("/sections/:sectionId/jobs", requireAuth, (req, res) => {
  const sectionId = Number(req.params.sectionId);
  const name = (req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Job name is required" });

  const section = db
    .prepare(
      `SELECT hr_org_sections.*, hr_org_divisions.school_id as school_id
       FROM hr_org_sections JOIN hr_org_divisions ON hr_org_divisions.id = hr_org_sections.division_id
       WHERE hr_org_sections.id = ?`
    )
    .get(sectionId) as any;
  if (!section) return res.status(404).json({ error: "Section not found" });

  const maxOrder = (
    db.prepare("SELECT MAX(sort_order) as m FROM hr_org_jobs WHERE section_id = ?").get(sectionId) as {
      m: number | null;
    }
  ).m ?? -1;
  db.prepare("INSERT INTO hr_org_jobs (section_id, name, sort_order) VALUES (?, ?, ?)").run(
    sectionId,
    name,
    maxOrder + 1
  );

  res.status(201).json(buildTreeResponse(section.school_id));
});

hrOrgRouter.put("/jobs/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const name = (req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Job name is required" });

  const job = db
    .prepare(
      `SELECT hr_org_jobs.*, hr_org_divisions.school_id as school_id,
              hr_org_divisions.name as division_name, hr_org_sections.name as section_name
       FROM hr_org_jobs
       JOIN hr_org_sections ON hr_org_sections.id = hr_org_jobs.section_id
       JOIN hr_org_divisions ON hr_org_divisions.id = hr_org_sections.division_id
       WHERE hr_org_jobs.id = ?`
    )
    .get(id) as any;
  if (!job) return res.status(404).json({ error: "Job not found" });

  const tx = db.transaction(() => {
    db.prepare("UPDATE hr_org_jobs SET name = ? WHERE id = ?").run(name, id);
    if (job.name.trim() !== name.trim()) {
      syncEmployeesOnJobRename(job.school_id, job.division_name, job.section_name, job.name, name);
    }
  });
  tx();

  res.json(buildTreeResponse(job.school_id));
});

hrOrgRouter.delete("/jobs/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const job = db
    .prepare(
      `SELECT hr_org_jobs.*, hr_org_divisions.school_id as school_id
       FROM hr_org_jobs
       JOIN hr_org_sections ON hr_org_sections.id = hr_org_jobs.section_id
       JOIN hr_org_divisions ON hr_org_divisions.id = hr_org_sections.division_id
       WHERE hr_org_jobs.id = ?`
    )
    .get(id) as any;
  if (!job) return res.status(404).json({ error: "Job not found" });

  db.prepare("DELETE FROM hr_org_jobs WHERE id = ?").run(id);
  res.json(buildTreeResponse(job.school_id));
});
