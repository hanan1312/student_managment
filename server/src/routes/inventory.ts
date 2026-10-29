import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";

export const inventoryRouter = Router();
inventoryRouter.use(requireModule("inventory"));

inventoryRouter.get("/", requireAuth, (req, res) => {
  const { q } = req.query as { q?: string };
  let sql = "SELECT * FROM inventory_items WHERE 1=1";
  const params: any[] = [];
  if (q) {
    sql += " AND (name LIKE ? OR category LIKE ? OR location LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += " ORDER BY name ASC";

  const rows = db.prepare(sql).all(...params);
  res.json({ items: rows, count: rows.length });
});

inventoryRouter.post("/", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.name) return res.status(400).json({ error: "Name is required" });

  const info = db
    .prepare(
      `INSERT INTO inventory_items (name, category, quantity, unit, location, condition, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      b.name,
      b.category ?? null,
      b.quantity ?? 0,
      b.unit ?? null,
      b.location ?? null,
      b.condition ?? null,
      b.notes ?? null
    );

  const item = db.prepare("SELECT * FROM inventory_items WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ item });
});

inventoryRouter.put("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM inventory_items WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Item not found" });

  const b = req.body ?? {};
  db.prepare(
    `UPDATE inventory_items SET
      name = ?, category = ?, quantity = ?, unit = ?, location = ?, condition = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    b.name ?? existing.name,
    b.category ?? existing.category,
    b.quantity ?? existing.quantity,
    b.unit ?? existing.unit,
    b.location ?? existing.location,
    b.condition ?? existing.condition,
    b.notes ?? existing.notes,
    id
  );

  const item = db.prepare("SELECT * FROM inventory_items WHERE id = ?").get(id);
  res.json({ item });
});

inventoryRouter.delete("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM inventory_items WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Item not found" });
  res.status(204).send();
});
