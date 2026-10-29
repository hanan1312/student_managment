import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";

export const hrPayrollRouter = Router();
hrPayrollRouter.use(requireModule("hrPayroll"));

const ADDITION_CATEGORIES = ["allowance", "reward", "benefit", "incentive", "teachers_club", "increase"];
const DEDUCTION_CATEGORIES = ["misconduct", "deduction"];

hrPayrollRouter.get("/salary-items", requireAuth, (req, res) => {
  const { employeeId, category } = req.query as { employeeId?: string; category?: string };
  if (!employeeId) return res.status(400).json({ error: "employeeId is required" });

  let sql = "SELECT * FROM hr_employee_salary_items WHERE employee_id = ?";
  const params: any[] = [Number(employeeId)];
  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }
  sql += " ORDER BY created_at DESC";

  const rows = db.prepare(sql).all(...params);
  res.json({ items: rows });
});

hrPayrollRouter.post("/salary-items", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.employeeId || !b.schoolId || !b.category || !b.label) {
    return res.status(400).json({ error: "employeeId, schoolId, category and label are required" });
  }

  const info = db
    .prepare(
      `INSERT INTO hr_employee_salary_items
        (employee_id, school_id, category, label, amount, is_percentage, recurring, one_off_month)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      b.employeeId,
      b.schoolId,
      b.category,
      b.label,
      b.amount ?? 0,
      b.isPercentage ? 1 : 0,
      b.recurring === false ? 0 : 1,
      b.recurring === false ? b.oneOffMonth ?? null : null
    );

  const item = db.prepare("SELECT * FROM hr_employee_salary_items WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ item });
});

hrPayrollRouter.delete("/salary-items/:id", requireAuth, (req, res) => {
  const info = db.prepare("DELETE FROM hr_employee_salary_items WHERE id = ?").run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: "Item not found" });
  res.status(204).send();
});

hrPayrollRouter.put("/basic-salary/:employeeId", requireAuth, (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const b = req.body ?? {};
  if (typeof b.basicSalary !== "number") return res.status(400).json({ error: "basicSalary is required" });

  const info = db.prepare("UPDATE hr_employees SET basic_salary = ? WHERE id = ?").run(b.basicSalary, employeeId);
  if (info.changes === 0) return res.status(404).json({ error: "Employee not found" });

  const employee = db.prepare("SELECT * FROM hr_employees WHERE id = ?").get(employeeId);
  res.json({ employee });
});

// A leave day "belongs" to whichever month its leave_start falls in — a simplification
// (no true date-range overlap across month boundaries) that keeps this readable given
// leave requests in practice are short.
hrPayrollRouter.get("/leave-summary", requireAuth, (req, res) => {
  const { schoolId, month } = req.query as { schoolId?: string; month?: string };
  if (!schoolId || !month) return res.status(400).json({ error: "schoolId and month are required" });

  const rows = db
    .prepare(
      `SELECT hr_employees.id as employee_id, hr_employees.name_ar as employee_name,
              COALESCE(SUM(ABS(hr_leave_ledger.count)), 0) as leave_days
       FROM hr_employees
       LEFT JOIN hr_leave_ledger
         ON hr_leave_ledger.employee_id = hr_employees.id
         AND hr_leave_ledger.kind = 'leave'
         AND strftime('%Y-%m', hr_leave_ledger.leave_start) = ?
       WHERE hr_employees.school_id = ?
       GROUP BY hr_employees.id
       ORDER BY hr_employees.name_ar ASC`
    )
    .all(month, Number(schoolId));

  res.json({ rows });
});

hrPayrollRouter.get("/periods", requireAuth, (req, res) => {
  const { schoolId } = req.query as { schoolId?: string };
  if (!schoolId) return res.status(400).json({ error: "schoolId is required" });

  const rows = db.prepare("SELECT * FROM hr_payroll_periods WHERE school_id = ? ORDER BY month DESC").all(Number(schoolId));
  res.json({ periods: rows });
});

hrPayrollRouter.post("/periods", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.schoolId || !b.month) return res.status(400).json({ error: "schoolId and month are required" });

  db.prepare("INSERT INTO hr_payroll_periods (school_id, month) VALUES (?, ?) ON CONFLICT(school_id, month) DO NOTHING").run(
    b.schoolId,
    b.month
  );

  const period = db
    .prepare("SELECT * FROM hr_payroll_periods WHERE school_id = ? AND month = ?")
    .get(b.schoolId, b.month);
  res.status(201).json({ period });
});

hrPayrollRouter.post("/periods/:id/load", requireAuth, (req, res) => {
  const periodId = Number(req.params.id);
  const period = db.prepare("SELECT * FROM hr_payroll_periods WHERE id = ?").get(periodId) as
    | { id: number; school_id: number; month: string }
    | undefined;
  if (!period) return res.status(404).json({ error: "Period not found" });

  const employees = db.prepare("SELECT * FROM hr_employees WHERE school_id = ?").all(period.school_id) as any[];
  const items = db
    .prepare(
      `SELECT * FROM hr_employee_salary_items
       WHERE school_id = ? AND (recurring = 1 OR one_off_month = ?)`
    )
    .all(period.school_id, period.month) as any[];
  const leaveDays = db
    .prepare(
      `SELECT employee_id, COALESCE(SUM(ABS(count)), 0) as days
       FROM hr_leave_ledger
       WHERE school_id = ? AND kind = 'leave' AND strftime('%Y-%m', leave_start) = ?
       GROUP BY employee_id`
    )
    .all(period.school_id, period.month) as { employee_id: number; days: number }[];
  const leaveDaysByEmployee = new Map(leaveDays.map((r) => [r.employee_id, r.days]));

  const itemsByEmployee = new Map<number, any[]>();
  for (const item of items) {
    const list = itemsByEmployee.get(item.employee_id) ?? [];
    list.push(item);
    itemsByEmployee.set(item.employee_id, list);
  }

  const valueOf = (item: any, base: number) => (item.is_percentage ? base * (item.amount / 100) : item.amount);

  const upsert = db.prepare(`
    INSERT INTO hr_payroll_lines
      (period_id, employee_id, basic_salary, additions_total, deductions_total, leave_deduction, tax_total, net_salary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(period_id, employee_id) DO UPDATE SET
      basic_salary = excluded.basic_salary,
      additions_total = excluded.additions_total,
      deductions_total = excluded.deductions_total,
      leave_deduction = excluded.leave_deduction,
      tax_total = excluded.tax_total,
      net_salary = excluded.net_salary,
      generated_at = CURRENT_TIMESTAMP
  `);

  const tx = db.transaction(() => {
    for (const employee of employees) {
      const basic = employee.basic_salary ?? 0;
      const employeeItems = itemsByEmployee.get(employee.id) ?? [];

      // Allowance/reward/benefit/etc. and misconduct/deduction percentages are a share of
      // basic salary; tax is computed last, as a share of pay after those (a common — not
      // universal — convention, documented here since there's no spec to match exactly).
      const additionsTotal = employeeItems
        .filter((i) => ADDITION_CATEGORIES.includes(i.category))
        .reduce((sum, i) => sum + valueOf(i, basic), 0);
      const deductionsTotal = employeeItems
        .filter((i) => DEDUCTION_CATEGORIES.includes(i.category))
        .reduce((sum, i) => sum + valueOf(i, basic), 0);
      const leaveDeduction = (basic / 30) * (leaveDaysByEmployee.get(employee.id) ?? 0);
      const grossBeforeTax = basic + additionsTotal - deductionsTotal - leaveDeduction;
      const taxTotal = employeeItems
        .filter((i) => i.category === "tax")
        .reduce((sum, i) => sum + valueOf(i, grossBeforeTax), 0);
      const netSalary = grossBeforeTax - taxTotal;

      upsert.run(periodId, employee.id, basic, additionsTotal, deductionsTotal, leaveDeduction, taxTotal, netSalary);
    }
  });
  tx();

  const lines = db
    .prepare(
      `SELECT hr_payroll_lines.*, hr_employees.name_ar as employee_name
       FROM hr_payroll_lines
       JOIN hr_employees ON hr_employees.id = hr_payroll_lines.employee_id
       WHERE hr_payroll_lines.period_id = ?
       ORDER BY hr_employees.name_ar ASC`
    )
    .all(periodId);

  res.json({ lines });
});

hrPayrollRouter.get("/periods/:id/lines", requireAuth, (req, res) => {
  const periodId = Number(req.params.id);
  const lines = db
    .prepare(
      `SELECT hr_payroll_lines.*, hr_employees.name_ar as employee_name
       FROM hr_payroll_lines
       JOIN hr_employees ON hr_employees.id = hr_payroll_lines.employee_id
       WHERE hr_payroll_lines.period_id = ?
       ORDER BY hr_employees.name_ar ASC`
    )
    .all(periodId);
  res.json({ lines });
});
