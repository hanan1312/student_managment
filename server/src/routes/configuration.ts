import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";

export const configurationRouter = Router();
configurationRouter.use(requireModule("configurationPanel"));

// Single-school catalogs for the Student's Affair "Configuration" ribbon — unlike HR &
// Staff's hr_lookup_items, Students/Finance/etc. stay single-school (see docs/claude.md §3),
// so there's no school_id scoping here.
const LOOKUP_CATEGORIES = [
  "country",
  "nationality",
  "warning",
  "course",
  "area",
  "second_lang",
  "district",
  "education",
  "student_category",
  "expense_level",
  "revenue_level",
  "ministry",
] as const;

function isLookupCategory(value: string): value is (typeof LOOKUP_CATEGORIES)[number] {
  return (LOOKUP_CATEGORIES as readonly string[]).includes(value);
}

configurationRouter.get("/lookup/:category", requireAuth, (req, res) => {
  const category = String(req.params.category);
  if (!isLookupCategory(category)) return res.status(400).json({ error: "Unknown category" });

  const rows = db.prepare("SELECT * FROM config_lookup_items WHERE category = ? ORDER BY name ASC").all(category);
  res.json({ items: rows });
});

configurationRouter.post("/lookup", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!isLookupCategory(b.category)) return res.status(400).json({ error: "Unknown category" });
  if (!b.name) return res.status(400).json({ error: "Name is required" });

  const info = db
    .prepare("INSERT INTO config_lookup_items (category, name, note) VALUES (?, ?, ?)")
    .run(b.category, b.name, b.note ?? null);

  const item = db.prepare("SELECT * FROM config_lookup_items WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ item });
});

configurationRouter.put("/lookup/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM config_lookup_items WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Item not found" });

  const b = req.body ?? {};
  db.prepare("UPDATE config_lookup_items SET name = ?, note = ? WHERE id = ?").run(
    b.name ?? existing.name,
    b.note ?? existing.note,
    id
  );

  const item = db.prepare("SELECT * FROM config_lookup_items WHERE id = ?").get(id);
  res.json({ item });
});

configurationRouter.delete("/lookup/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM config_lookup_items WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Item not found" });
  res.status(204).send();
});
