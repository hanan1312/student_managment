import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";

export const busesRouter = Router();
busesRouter.use(requireModule("buses"));

const BUS_SELECT = `
  SELECT buses.*, (SELECT COUNT(*) FROM bus_assignments WHERE bus_assignments.bus_id = buses.id) as rider_count
  FROM buses
`;

busesRouter.get("/", requireAuth, (_req, res) => {
  const rows = db.prepare(`${BUS_SELECT} ORDER BY buses.route_name ASC`).all();
  res.json({ buses: rows });
});

busesRouter.post("/", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.routeName) return res.status(400).json({ error: "routeName is required" });

  const info = db
    .prepare(
      `INSERT INTO buses (route_name, plate_number, driver_name, driver_phone, capacity, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(b.routeName, b.plateNumber ?? null, b.driverName ?? null, b.driverPhone ?? null, b.capacity ?? null, b.notes ?? null);

  const bus = db.prepare(`${BUS_SELECT} WHERE buses.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ bus });
});

busesRouter.put("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM buses WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Bus not found" });

  const b = req.body ?? {};
  db.prepare(
    `UPDATE buses SET
      route_name = ?, plate_number = ?, driver_name = ?, driver_phone = ?, capacity = ?, notes = ?
     WHERE id = ?`
  ).run(
    b.routeName ?? existing.route_name,
    b.plateNumber ?? existing.plate_number,
    b.driverName ?? existing.driver_name,
    b.driverPhone ?? existing.driver_phone,
    b.capacity ?? existing.capacity,
    b.notes ?? existing.notes,
    id
  );

  const bus = db.prepare(`${BUS_SELECT} WHERE buses.id = ?`).get(id);
  res.json({ bus });
});

busesRouter.delete("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare("DELETE FROM bus_assignments WHERE bus_id = ?").run(id);
  const info = db.prepare("DELETE FROM buses WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Bus not found" });
  res.status(204).send();
});

busesRouter.get("/:id/students", requireAuth, (req, res) => {
  const busId = Number(req.params.id);
  const rows = db
    .prepare(
      `SELECT bus_assignments.id as assignment_id, bus_assignments.pickup_point, students.*
       FROM bus_assignments
       JOIN students ON students.id = bus_assignments.student_id
       WHERE bus_assignments.bus_id = ?
       ORDER BY students.name ASC`
    )
    .all(busId);
  res.json({ students: rows });
});

busesRouter.post("/:id/students", requireAuth, (req, res) => {
  const busId = Number(req.params.id);
  const b = req.body ?? {};
  if (!b.studentId) return res.status(400).json({ error: "studentId is required" });

  const existing = db
    .prepare("SELECT id FROM bus_assignments WHERE bus_id = ? AND student_id = ?")
    .get(busId, b.studentId);
  if (existing) return res.status(409).json({ error: "Student already assigned to this bus" });

  db.prepare("INSERT INTO bus_assignments (bus_id, student_id, pickup_point) VALUES (?, ?, ?)").run(
    busId,
    b.studentId,
    b.pickupPoint ?? null
  );
  res.status(201).json({ ok: true });
});

busesRouter.delete("/:id/students/:studentId", requireAuth, (req, res) => {
  const busId = Number(req.params.id);
  const studentId = Number(req.params.studentId);
  const info = db.prepare("DELETE FROM bus_assignments WHERE bus_id = ? AND student_id = ?").run(busId, studentId);
  if (info.changes === 0) return res.status(404).json({ error: "Assignment not found" });
  res.status(204).send();
});
