import { Router } from "express";
import { db, seedHrOrgTree } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";

export const schoolsRouter = Router();

schoolsRouter.get("/", requireAuth, requireModule("hrEmployees"), (_req, res) => {
  const schools = db.prepare("SELECT * FROM schools ORDER BY name ASC").all();
  res.json({ schools });
});

schoolsRouter.post("/", requireAuth, requireModule("hrConfiguration"), (req, res) => {
  const b = req.body ?? {};
  if (!b.name) return res.status(400).json({ error: "Name is required" });

  const info = db
    .prepare(
      `INSERT INTO schools (name, address, phone, governorate, directorate, logo_url)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(b.name, b.address ?? null, b.phone ?? null, b.governorate ?? null, b.directorate ?? null, b.logoUrl ?? null);

  seedHrOrgTree(Number(info.lastInsertRowid));

  const school = db.prepare("SELECT * FROM schools WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ school });
});

schoolsRouter.put("/:id", requireAuth, requireModule("hrConfiguration"), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM schools WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "School not found" });

  const b = req.body ?? {};
  db.prepare(
    `UPDATE schools SET
      name = ?, address = ?, phone = ?, governorate = ?, directorate = ?, logo_url = ?
     WHERE id = ?`
  ).run(
    b.name ?? existing.name,
    b.address ?? existing.address,
    b.phone ?? existing.phone,
    b.governorate ?? existing.governorate,
    b.directorate ?? existing.directorate,
    b.logoUrl ?? existing.logo_url,
    id
  );

  const school = db.prepare("SELECT * FROM schools WHERE id = ?").get(id);
  res.json({ school });
});

schoolsRouter.delete("/:id", requireAuth, requireModule("hrConfiguration"), (req, res) => {
  const id = Number(req.params.id);
  const total = (db.prepare("SELECT COUNT(*) as c FROM schools").get() as { c: number }).c;
  if (total <= 1) return res.status(400).json({ error: "At least one school is required" });

  const info = db.prepare("DELETE FROM schools WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "School not found" });
  res.status(204).send();
});
