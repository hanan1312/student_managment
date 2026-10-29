import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";

export const financeRouter = Router();
financeRouter.use(requireModule("finance"));

financeRouter.get("/fee-types", requireAuth, (_req, res) => {
  const feeTypes = db.prepare("SELECT * FROM fee_types ORDER BY name ASC").all();
  res.json({ feeTypes });
});

financeRouter.post("/fee-types", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.name) return res.status(400).json({ error: "Name is required" });

  const info = db
    .prepare("INSERT INTO fee_types (name, default_amount) VALUES (?, ?)")
    .run(b.name, b.defaultAmount ?? 0);
  const feeType = db.prepare("SELECT * FROM fee_types WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ feeType });
});

financeRouter.put("/fee-types/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM fee_types WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Fee type not found" });

  const b = req.body ?? {};
  db.prepare("UPDATE fee_types SET name = ?, default_amount = ? WHERE id = ?").run(
    b.name ?? existing.name,
    b.defaultAmount ?? existing.default_amount,
    id
  );

  const feeType = db.prepare("SELECT * FROM fee_types WHERE id = ?").get(id);
  res.json({ feeType });
});

financeRouter.get("/students/:studentId/fee-items", requireAuth, (req, res) => {
  const studentId = Number(req.params.studentId);
  const rows = db.prepare("SELECT fee_type_id FROM student_fee_items WHERE student_id = ?").all(studentId) as {
    fee_type_id: number;
  }[];
  res.json({ feeTypeIds: rows.map((r) => r.fee_type_id) });
});

financeRouter.put("/students/:studentId/fee-items", requireAuth, (req, res) => {
  const studentId = Number(req.params.studentId);
  const feeTypeIds = Array.isArray(req.body?.feeTypeIds)
    ? (req.body.feeTypeIds as unknown[]).map((v) => Number(v)).filter((n) => Number.isInteger(n))
    : [];

  const replace = db.transaction((ids: number[]) => {
    db.prepare("DELETE FROM student_fee_items WHERE student_id = ?").run(studentId);
    const insert = db.prepare("INSERT INTO student_fee_items (student_id, fee_type_id) VALUES (?, ?)");
    for (const feeTypeId of ids) insert.run(studentId, feeTypeId);
  });
  replace(feeTypeIds);

  res.json({ feeTypeIds });
});

financeRouter.delete("/fee-types/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM fee_types WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Fee type not found" });
  res.status(204).send();
});

const PAYMENT_SELECT = `
  SELECT payments.*, students.name as student_name, students.class_id as class_id,
         fee_types.name as fee_type_name
  FROM payments
  JOIN students ON students.id = payments.student_id
  LEFT JOIN fee_types ON fee_types.id = payments.fee_type_id
`;

financeRouter.get("/payments", requireAuth, (req, res) => {
  const { classId, studentId, q } = req.query as { classId?: string; studentId?: string; q?: string };

  let sql = `${PAYMENT_SELECT} WHERE 1=1`;
  const params: any[] = [];

  if (classId) {
    sql += " AND students.class_id = ?";
    params.push(Number(classId));
  }
  if (studentId) {
    sql += " AND payments.student_id = ?";
    params.push(Number(studentId));
  }
  if (q) {
    sql += " AND (students.name LIKE ? OR payments.note LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like);
  }
  sql += " ORDER BY payments.paid_on DESC, payments.id DESC";

  const rows = db.prepare(sql).all(...params) as any[];
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  res.json({ payments: rows, count: rows.length, total });
});

financeRouter.post("/payments", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.studentId || !b.amount || !b.paidOn) {
    return res.status(400).json({ error: "studentId, amount and paidOn are required" });
  }

  const info = db
    .prepare(
      `INSERT INTO payments (student_id, fee_type_id, amount, method, paid_on, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(b.studentId, b.feeTypeId ?? null, b.amount, b.method ?? "cash", b.paidOn, b.note ?? null);

  const payment = db.prepare(`${PAYMENT_SELECT} WHERE payments.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ payment });
});

financeRouter.put("/payments/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM payments WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Payment not found" });

  const b = req.body ?? {};
  db.prepare(
    `UPDATE payments SET
      student_id = ?, fee_type_id = ?, amount = ?, method = ?, paid_on = ?, note = ?
     WHERE id = ?`
  ).run(
    b.studentId ?? existing.student_id,
    b.feeTypeId ?? existing.fee_type_id,
    b.amount ?? existing.amount,
    b.method ?? existing.method,
    b.paidOn ?? existing.paid_on,
    b.note ?? existing.note,
    id
  );

  const payment = db.prepare(`${PAYMENT_SELECT} WHERE payments.id = ?`).get(id);
  res.json({ payment });
});

financeRouter.delete("/payments/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM payments WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Payment not found" });
  res.status(204).send();
});
