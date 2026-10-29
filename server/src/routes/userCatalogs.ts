import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";

// Users > مدينة (cities: postal code, name, comment) and Users > إدارة تعليمية (education
// administrations: code, name, comment). Same shape, so one generic CRUD per table; the first
// column is the only thing that differs.
// Reading is also open to the students module, for the school form's dropdowns.
export const userCatalogsRouter = Router();
const canEdit = requireModule("control");

const CATALOGS = {
  cities: { table: "cities", codeColumn: "postal_code", label: "City" },
  "education-admins": { table: "education_admins", codeColumn: "code", label: "Education administration" },
} as const;

for (const [path, { table, codeColumn, label }] of Object.entries(CATALOGS)) {
  const list = () => db.prepare(`SELECT id, ${codeColumn} AS code, name, comment FROM ${table} ORDER BY name ASC`).all();

  userCatalogsRouter.get(`/${path}`, requireAuth, requireModule("control", "students"), (_req, res) => {
    res.json({ items: list() });
  });

  userCatalogsRouter.post(`/${path}`, requireAuth, canEdit, (req, res) => {
    const b = req.body ?? {};
    const code = String(b.code ?? "").trim();
    const name = String(b.name ?? "").trim();
    if (!code || !name) return res.status(400).json({ error: "Code and name are required" });
    db.prepare(`INSERT INTO ${table} (${codeColumn}, name, comment) VALUES (?, ?, ?)`).run(
      code,
      name,
      String(b.comment ?? "").trim() || null
    );
    res.status(201).json({ items: list() });
  });

  userCatalogsRouter.put(`/${path}/:id`, requireAuth, canEdit, (req, res) => {
    const id = Number(req.params.id);
    const b = req.body ?? {};
    const code = String(b.code ?? "").trim();
    const name = String(b.name ?? "").trim();
    if (!code || !name) return res.status(400).json({ error: "Code and name are required" });
    const info = db
      .prepare(`UPDATE ${table} SET ${codeColumn} = ?, name = ?, comment = ? WHERE id = ?`)
      .run(code, name, String(b.comment ?? "").trim() || null, id);
    if (info.changes === 0) return res.status(404).json({ error: `${label} not found` });
    res.json({ items: list() });
  });

  userCatalogsRouter.delete(`/${path}/:id`, requireAuth, canEdit, (req, res) => {
    const id = Number(req.params.id);
    const fk = table === "cities" ? "city_id" : "education_admin_id";
    if (db.prepare(`SELECT 1 FROM users WHERE ${fk} = ?`).get(id)) {
      return res.status(400).json({ error: `${label} is assigned to a user and can't be deleted` });
    }
    if (db.prepare(`SELECT 1 FROM schools WHERE ${fk} = ?`).get(id)) {
      return res.status(400).json({ error: `${label} is assigned to a school and can't be deleted` });
    }
    const info = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    if (info.changes === 0) return res.status(404).json({ error: `${label} not found` });
    res.json({ items: list() });
  });
}
