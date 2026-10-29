import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";

export const staffRouter = Router();
staffRouter.use(requireModule("management"));

staffRouter.get("/", requireAuth, (req, res) => {
  const { q } = req.query as { q?: string };
  let sql = "SELECT * FROM staff WHERE 1=1";
  const params: any[] = [];
  if (q) {
    sql += " AND (name LIKE ? OR position LIKE ? OR department LIKE ? OR phone LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  sql += " ORDER BY name ASC";

  const rows = db.prepare(sql).all(...params);
  res.json({ staff: rows, count: rows.length });
});

staffRouter.post("/", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.name) return res.status(400).json({ error: "Name is required" });

  const info = db
    .prepare(
      `INSERT INTO staff (name, position, department, phone, email, national_id, hire_date, address, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      b.name,
      b.position ?? null,
      b.department ?? null,
      b.phone ?? null,
      b.email ?? null,
      b.nationalId ?? null,
      b.hireDate ?? null,
      b.address ?? null,
      b.notes ?? null
    );

  const member = db.prepare("SELECT * FROM staff WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ staff: member });
});

staffRouter.put("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM staff WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Staff member not found" });

  const b = req.body ?? {};
  db.prepare(
    `UPDATE staff SET
      name = ?, position = ?, department = ?, phone = ?, email = ?, national_id = ?, hire_date = ?, address = ?, notes = ?
     WHERE id = ?`
  ).run(
    b.name ?? existing.name,
    b.position ?? existing.position,
    b.department ?? existing.department,
    b.phone ?? existing.phone,
    b.email ?? existing.email,
    b.nationalId ?? existing.national_id,
    b.hireDate ?? existing.hire_date,
    b.address ?? existing.address,
    b.notes ?? existing.notes,
    id
  );

  const member = db.prepare("SELECT * FROM staff WHERE id = ?").get(id);
  res.json({ staff: member });
});

staffRouter.delete("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM staff WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Staff member not found" });
  res.status(204).send();
});
