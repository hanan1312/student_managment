import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";
import { syncEmployeesOnDepartmentRename } from "../hrEmployeeTitle";

export const hrConfigurationRouter = Router();
hrConfigurationRouter.use(requireModule("hrConfiguration"));

// "division"/"section"/"position" (Job) are managed via the real hr_org_* hierarchy
// (server/src/routes/hrOrg.ts) instead of a flat catalog — see the Employees sidebar tree.
const LOOKUP_CATEGORIES = [
  "country",
  "area",
  "bank",
  "university",
  "education",
  "department",
  "outside_employee",
  "message",
] as const;

const VALUED_CATEGORIES = [
  "allowance",
  "overtime",
  "reward",
  "misconduct",
  "benefit",
  "tax",
  "deduction",
  "leave_type",
  // Payroll-ribbon-only catalogs (no Configuration tile, per the reference app) — quick-pick
  // sources for hr_employee_salary_items assignments, managed inline from that modal.
  "incentive",
  "teachers_club",
  "increase",
] as const;

function isLookupCategory(value: string): value is (typeof LOOKUP_CATEGORIES)[number] {
  return (LOOKUP_CATEGORIES as readonly string[]).includes(value);
}

function isValuedCategory(value: string): value is (typeof VALUED_CATEGORIES)[number] {
  return (VALUED_CATEGORIES as readonly string[]).includes(value);
}

// GET always returns the category's global (school_id IS NULL) rows plus, when schoolId is
// passed, that school's own rows — a per-school category (outside_employee, message) is just
// one that never gets a global row, and a global category one whose rows never carry a
// school_id.
hrConfigurationRouter.get("/lookup/:category", requireAuth, (req, res) => {
  const { category } = req.params;
  if (typeof category !== "string" || !isLookupCategory(category)) {
    return res.status(400).json({ error: "Unknown category" });
  }
  const { schoolId } = req.query as { schoolId?: string };

  const rows = db
    .prepare("SELECT * FROM hr_lookup_items WHERE category = ? AND (school_id IS NULL OR school_id = ?) ORDER BY name ASC")
    .all(category, schoolId ? Number(schoolId) : null);
  res.json({ items: rows });
});

hrConfigurationRouter.post("/lookup", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!isLookupCategory(b.category)) return res.status(400).json({ error: "Unknown category" });
  if (!b.name) return res.status(400).json({ error: "Name is required" });

  const info = db
    .prepare("INSERT INTO hr_lookup_items (category, school_id, name, note) VALUES (?, ?, ?, ?)")
    .run(b.category, b.schoolId ?? null, b.name, b.note ?? null);

  const item = db.prepare("SELECT * FROM hr_lookup_items WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ item });
});

hrConfigurationRouter.put("/lookup/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM hr_lookup_items WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Item not found" });

  const b = req.body ?? {};
  const newName = b.name ?? existing.name;
  const tx = db.transaction(() => {
    db.prepare("UPDATE hr_lookup_items SET name = ?, note = ? WHERE id = ?").run(newName, b.note ?? existing.note, id);
    if (existing.category === "department" && existing.name.trim() !== String(newName).trim()) {
      syncEmployeesOnDepartmentRename(db, existing.name, newName);
    }
  });
  tx();

  const item = db.prepare("SELECT * FROM hr_lookup_items WHERE id = ?").get(id);
  res.json({ item });
});

hrConfigurationRouter.delete("/lookup/:id", requireAuth, (req, res) => {
  const info = db.prepare("DELETE FROM hr_lookup_items WHERE id = ?").run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: "Item not found" });
  res.status(204).send();
});

hrConfigurationRouter.get("/valued/:category", requireAuth, (req, res) => {
  const { category } = req.params;
  if (typeof category !== "string" || !isValuedCategory(category)) {
    return res.status(400).json({ error: "Unknown category" });
  }
  const { schoolId } = req.query as { schoolId?: string };

  const rows = db
    .prepare("SELECT * FROM hr_valued_items WHERE category = ? AND (school_id IS NULL OR school_id = ?) ORDER BY name ASC")
    .all(category, schoolId ? Number(schoolId) : null);
  res.json({ items: rows });
});

hrConfigurationRouter.post("/valued", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!isValuedCategory(b.category)) return res.status(400).json({ error: "Unknown category" });
  if (!b.name) return res.status(400).json({ error: "Name is required" });

  const info = db
    .prepare("INSERT INTO hr_valued_items (category, school_id, name, amount, is_percentage) VALUES (?, ?, ?, ?, ?)")
    .run(b.category, b.schoolId ?? null, b.name, b.amount ?? 0, b.isPercentage ? 1 : 0);

  const item = db.prepare("SELECT * FROM hr_valued_items WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ item });
});

hrConfigurationRouter.put("/valued/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM hr_valued_items WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Item not found" });

  const b = req.body ?? {};
  db.prepare("UPDATE hr_valued_items SET name = ?, amount = ?, is_percentage = ? WHERE id = ?").run(
    b.name ?? existing.name,
    b.amount ?? existing.amount,
    b.isPercentage === undefined ? existing.is_percentage : b.isPercentage ? 1 : 0,
    id
  );

  const item = db.prepare("SELECT * FROM hr_valued_items WHERE id = ?").get(id);
  res.json({ item });
});

hrConfigurationRouter.delete("/valued/:id", requireAuth, (req, res) => {
  const info = db.prepare("DELETE FROM hr_valued_items WHERE id = ?").run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: "Item not found" });
  res.status(204).send();
});

hrConfigurationRouter.get("/shifts", requireAuth, (req, res) => {
  const { schoolId } = req.query as { schoolId?: string };
  if (!schoolId) return res.status(400).json({ error: "schoolId is required" });
  const rows = db.prepare("SELECT * FROM hr_shifts WHERE school_id = ? ORDER BY name ASC").all(Number(schoolId));
  res.json({ shifts: rows });
});

hrConfigurationRouter.post("/shifts", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.schoolId || !b.name) return res.status(400).json({ error: "schoolId and name are required" });

  const info = db
    .prepare("INSERT INTO hr_shifts (school_id, name, start_time, end_time) VALUES (?, ?, ?, ?)")
    .run(b.schoolId, b.name, b.startTime ?? null, b.endTime ?? null);

  const shift = db.prepare("SELECT * FROM hr_shifts WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ shift });
});

hrConfigurationRouter.put("/shifts/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM hr_shifts WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Shift not found" });

  const b = req.body ?? {};
  db.prepare("UPDATE hr_shifts SET name = ?, start_time = ?, end_time = ? WHERE id = ?").run(
    b.name ?? existing.name,
    b.startTime ?? existing.start_time,
    b.endTime ?? existing.end_time,
    id
  );

  const shift = db.prepare("SELECT * FROM hr_shifts WHERE id = ?").get(id);
  res.json({ shift });
});

hrConfigurationRouter.delete("/shifts/:id", requireAuth, (req, res) => {
  const info = db.prepare("DELETE FROM hr_shifts WHERE id = ?").run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: "Shift not found" });
  res.status(204).send();
});

hrConfigurationRouter.get("/holidays", requireAuth, (req, res) => {
  const { schoolId } = req.query as { schoolId?: string };
  if (!schoolId) return res.status(400).json({ error: "schoolId is required" });
  const rows = db.prepare("SELECT * FROM hr_official_holidays WHERE school_id = ? ORDER BY date ASC").all(Number(schoolId));
  res.json({ holidays: rows });
});

hrConfigurationRouter.post("/holidays", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.schoolId || !b.name || !b.date) return res.status(400).json({ error: "schoolId, name and date are required" });

  const info = db
    .prepare("INSERT INTO hr_official_holidays (school_id, name, date) VALUES (?, ?, ?)")
    .run(b.schoolId, b.name, b.date);

  const holiday = db.prepare("SELECT * FROM hr_official_holidays WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ holiday });
});

hrConfigurationRouter.put("/holidays/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM hr_official_holidays WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Holiday not found" });

  const b = req.body ?? {};
  db.prepare("UPDATE hr_official_holidays SET name = ?, date = ? WHERE id = ?").run(
    b.name ?? existing.name,
    b.date ?? existing.date,
    id
  );

  const holiday = db.prepare("SELECT * FROM hr_official_holidays WHERE id = ?").get(id);
  res.json({ holiday });
});

hrConfigurationRouter.delete("/holidays/:id", requireAuth, (req, res) => {
  const info = db.prepare("DELETE FROM hr_official_holidays WHERE id = ?").run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: "Holiday not found" });
  res.status(204).send();
});
