import { Router } from "express";
import { db, seedHrOrgTree } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";

export const schoolsRouter = Router();

// Schools are shared by HR and Students > إضافة مدرسة. City and education administration link to
// the Users catalogs; governorate/directorate keep a text copy of their names for the HR screens.
const SELECT_SCHOOLS = `SELECT schools.*, cities.name AS city_name, education_admins.name AS education_admin_name
  FROM schools
  LEFT JOIN cities ON cities.id = schools.city_id
  LEFT JOIN education_admins ON education_admins.id = schools.education_admin_id`;

function selectSchool(id: number | bigint) {
  return db.prepare(`${SELECT_SCHOOLS} WHERE schools.id = ?`).get(id);
}

function catalogName(table: "cities" | "education_admins", id: number | null): string | null {
  if (!id) return null;
  return (db.prepare(`SELECT name FROM ${table} WHERE id = ?`).get(id) as { name: string } | undefined)?.name ?? null;
}

// undefined: not sent (keep); null/"" : cleared.
function idField(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  return value ? Number(value) : null;
}

schoolsRouter.get("/", requireAuth, requireModule("hrEmployees", "students"), (_req, res) => {
  const schools = db.prepare(`${SELECT_SCHOOLS} ORDER BY schools.name ASC`).all();
  res.json({ schools });
});

schoolsRouter.post("/", requireAuth, requireModule("hrConfiguration", "students"), (req, res) => {
  const b = req.body ?? {};
  const name = String(b.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Name is required" });

  const cityId = idField(b.cityId) ?? null;
  const educationAdminId = idField(b.educationAdminId) ?? null;
  const info = db
    .prepare(
      `INSERT INTO schools (name, address, phone, governorate, directorate, logo_url, city_id, education_admin_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      b.address ?? null,
      b.phone ?? null,
      catalogName("cities", cityId) ?? b.governorate ?? null,
      catalogName("education_admins", educationAdminId) ?? b.directorate ?? null,
      b.logoUrl ?? null,
      cityId,
      educationAdminId
    );

  seedHrOrgTree(Number(info.lastInsertRowid));

  res.status(201).json({ school: selectSchool(info.lastInsertRowid) });
});

schoolsRouter.put("/:id", requireAuth, requireModule("hrConfiguration", "students"), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM schools WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "School not found" });

  const b = req.body ?? {};
  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim() : existing.name;
  const cityId = idField(b.cityId);
  const educationAdminId = idField(b.educationAdminId);

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE schools SET
        name = ?, address = ?, phone = ?, governorate = ?, directorate = ?, logo_url = ?,
        city_id = ?, education_admin_id = ?
       WHERE id = ?`
    ).run(
      name,
      b.address ?? existing.address,
      b.phone ?? existing.phone,
      cityId !== undefined ? catalogName("cities", cityId) : b.governorate ?? existing.governorate,
      educationAdminId !== undefined ? catalogName("education_admins", educationAdminId) : b.directorate ?? existing.directorate,
      b.logoUrl ?? existing.logo_url,
      cityId !== undefined ? cityId : existing.city_id,
      educationAdminId !== undefined ? educationAdminId : existing.education_admin_id,
      id
    );
    // Students hold the school's name (البيانات الأساسية → المدرسة), so a rename carries over to them.
    if (name !== existing.name) {
      db.prepare("UPDATE students SET school = ? WHERE TRIM(school) = ?").run(name, String(existing.name).trim());
    }
  });
  tx();

  res.json({ school: selectSchool(id) });
});

schoolsRouter.delete("/:id", requireAuth, requireModule("hrConfiguration", "students"), (req, res) => {
  const id = Number(req.params.id);
  const total = (db.prepare("SELECT COUNT(*) as c FROM schools").get() as { c: number }).c;
  if (total <= 1) return res.status(400).json({ error: "At least one school is required" });

  const school = db.prepare("SELECT name FROM schools WHERE id = ?").get(id) as { name: string } | undefined;
  if (!school) return res.status(404).json({ error: "School not found" });
  if (db.prepare("SELECT 1 FROM students WHERE TRIM(school) = ?").get(school.name.trim())) {
    return res.status(400).json({ error: "يوجد طلاب في هذه المدرسة؛ انقلهم إلى مدرسة أخرى قبل حذفها" });
  }

  db.prepare("DELETE FROM schools WHERE id = ?").run(id);
  res.status(204).send();
});
