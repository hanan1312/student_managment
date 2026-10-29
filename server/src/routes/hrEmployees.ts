import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";
import { masterAccount } from "../masterAccount";

export const hrEmployeesRouter = Router();
hrEmployeesRouter.use(requireModule("hrEmployees"));

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = ALLOWED_MIME[file.mimetype] ?? path.extname(file.originalname) ?? "";
      cb(null, `hr-employee-${req.params.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) {
      cb(new Error("Unsupported image type. Use PNG, JPEG or WEBP."));
      return;
    }
    cb(null, true);
  },
});

function deleteLocalUpload(url: string | null | undefined) {
  if (!url || !url.startsWith("/uploads/")) return;
  const filePath = path.join(UPLOADS_DIR, path.basename(url));
  fs.unlink(filePath, () => {});
}

const COLUMNS = [
  "school_id",
  "name_ar",
  "name_en",
  "address",
  "country",
  "area",
  "tel1",
  "tel2",
  "registration_date",
  "birthday",
  "gender",
  "religion",
  "nationality",
  "reg_code",
  "marital_status",
  "email",
  "handicap",
  "division",
  "section",
  "subject_id",
  "department",
  "job",
  "status",
  "shift",
  "contract_type",
  "contract_from",
  "contract_to",
  "education",
  "university",
  "id_number",
  "salary_method",
  "medical_check",
  "bank1_name",
  "bank1_account",
  "bank2_name",
  "bank2_account",
  "union_name",
  "union_date",
  "insurance_number",
  "insured",
  "form1_date",
  "insured_with_another",
  "fellowship_box",
  "insured_pension",
  "periods_share",
  "staff_role",
  "title",
] as const;

function fromBody(b: Record<string, unknown>) {
  return {
    school_id: Number(b.schoolId),
    name_ar: b.nameAr ?? null,
    name_en: b.nameEn ?? null,
    address: b.address ?? null,
    country: b.country ?? null,
    area: b.area ?? null,
    tel1: b.tel1 ?? null,
    tel2: b.tel2 ?? null,
    registration_date: b.registrationDate ?? null,
    birthday: b.birthday ?? null,
    gender: b.gender ?? "M",
    religion: b.religion ?? null,
    nationality: b.nationality ?? null,
    reg_code: b.regCode ?? null,
    marital_status: b.maritalStatus ?? null,
    email: b.email ?? null,
    handicap: b.handicap ? 1 : 0,
    division: b.division ?? null,
    section: b.section ?? null,
    subject_id: b.subjectId ?? null,
    department: b.department ?? null,
    job: b.job ?? null,
    status: b.status ?? null,
    shift: b.shift ?? null,
    contract_type: b.contractType ?? null,
    contract_from: b.contractFrom ?? null,
    contract_to: b.contractTo ?? null,
    education: b.education ?? null,
    university: b.university ?? null,
    id_number: b.idNumber ?? null,
    salary_method: b.salaryMethod ?? "cash",
    medical_check: b.medicalCheck ?? null,
    bank1_name: b.bank1Name ?? null,
    bank1_account: b.bank1Account ?? null,
    bank2_name: b.bank2Name ?? null,
    bank2_account: b.bank2Account ?? null,
    union_name: b.unionName ?? null,
    union_date: b.unionDate ?? null,
    insurance_number: b.insuranceNumber ?? null,
    insured: b.insured ? 1 : 0,
    form1_date: b.form1Date ?? null,
    insured_with_another: b.insuredWithAnother ? 1 : 0,
    fellowship_box: b.fellowshipBox ? 1 : 0,
    insured_pension: b.insuredPension ? 1 : 0,
    periods_share: b.periodsShare != null && b.periodsShare !== "" ? Number(b.periodsShare) : null,
    staff_role: b.staffRole ?? null,
    title: b.title ?? null,
  };
}

hrEmployeesRouter.get("/", requireAuth, (req, res) => {
  const { schoolId, q } = req.query as { schoolId?: string; q?: string };

  let sql = "SELECT * FROM hr_employees WHERE 1=1";
  const params: any[] = [];
  if (schoolId) {
    sql += " AND school_id = ?";
    params.push(Number(schoolId));
  }
  if (q) {
    sql += " AND (name_ar LIKE ? OR name_en LIKE ? OR id_number LIKE ? OR job LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  sql += " ORDER BY name_ar ASC";

  const rows = db.prepare(sql).all(...params);
  res.json({ employees: rows, count: rows.length });
});

hrEmployeesRouter.post("/", requireAuth, (req, res) => {
  const b = req.body ?? {};
  if (!b.nameAr) return res.status(400).json({ error: "Name (Ar) is required" });
  if (!b.schoolId) return res.status(400).json({ error: "School is required" });

  const values = fromBody(b);
  const info = db
    .prepare(
      `INSERT INTO hr_employees (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(", ")})`
    )
    .run(...COLUMNS.map((c) => (values as any)[c]));

  const employee = db.prepare("SELECT * FROM hr_employees WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ employee });
});

hrEmployeesRouter.put("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM hr_employees WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Employee not found" });

  const b = req.body ?? {};
  const incoming = fromBody(b);
  const merged: Record<string, unknown> = {};
  for (const c of COLUMNS) merged[c] = b[toCamel(c)] !== undefined ? (incoming as any)[c] : existing[c];

  db.prepare(`UPDATE hr_employees SET ${COLUMNS.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(
    ...COLUMNS.map((c) => merged[c]),
    id
  );

  const employee = db.prepare("SELECT * FROM hr_employees WHERE id = ?").get(id);
  res.json({ employee });
});

// Clears the stored Title for exactly the given employee ids — used by the HR sidebar tree's
// "remove this Title group from the panel" action. ID-based rather than a division+title text
// match: Title has no Subject dependency, so a text match could clear employees under a
// *different* Subject who simply happen to share the same derived Title. Clearing (not deleting
// the employee, and not touching division/section/department) leaves EmployeeFormModal's
// existing "blank title tracks the live formula" behavior to regenerate and re-sync it the next
// time that employee is opened and saved.
hrEmployeesRouter.post("/clear-titles", requireAuth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((n: number) => Number.isInteger(n)) : [];
  if (ids.length === 0) return res.status(400).json({ error: "ids is required" });

  const update = db.prepare("UPDATE hr_employees SET title = '' WHERE id = ?");
  const tx = db.transaction((employeeIds: number[]) => {
    for (const id of employeeIds) update.run(id);
  });
  tx(ids);

  res.json({ updated: ids.length });
});

function toCamel(snake: string): string {
  return snake.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

hrEmployeesRouter.delete("/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT photo_url FROM hr_employees WHERE id = ?").get(id) as
    | { photo_url: string | null }
    | undefined;
  if (!existing) return res.status(404).json({ error: "Employee not found" });

  deleteLocalUpload(existing.photo_url);
  db.prepare("DELETE FROM hr_employees WHERE id = ?").run(id);
  res.status(204).send();
});

hrEmployeesRouter.post("/:id/photo", requireAuth, upload.single("file"), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT photo_url FROM hr_employees WHERE id = ?").get(id) as
    | { photo_url: string | null }
    | undefined;
  if (!existing) return res.status(404).json({ error: "Employee not found" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  deleteLocalUpload(existing.photo_url);
  const url = `/uploads/${req.file.filename}`;
  db.prepare("UPDATE hr_employees SET photo_url = ? WHERE id = ?").run(url, id);

  const employee = db.prepare("SELECT * FROM hr_employees WHERE id = ?").get(id);
  res.json({ employee });
});

hrEmployeesRouter.delete("/:id/photo", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT photo_url FROM hr_employees WHERE id = ?").get(id) as
    | { photo_url: string | null }
    | undefined;
  if (!existing) return res.status(404).json({ error: "Employee not found" });

  deleteLocalUpload(existing.photo_url);
  db.prepare("UPDATE hr_employees SET photo_url = NULL WHERE id = ?").run(id);

  const employee = db.prepare("SELECT * FROM hr_employees WHERE id = ?").get(id);
  res.json({ employee });
});

const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

// Always includes at least one letter and one digit, satisfying the same "8 chars, letters
// and numbers" strength bar enforced on manually-typed passwords in routes/users.ts.
function generateStrongPassword(length = 8): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  const chars = [pick(letters), pick(digits)];
  while (chars.length < length) chars.push(pick(PASSWORD_CHARS));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function slugifyNamePart(part: string): string {
  return part.trim().replace(/\s+/g, "");
}

// "Employee first name"_"employee last name"@"last 4 numbers of ID" — falls back to the
// Arabic name when no Latin (name_en) name was entered, since name_ar is the only name
// field that's actually required on the employee record.
function usernameFor(employee: { name_ar: string; name_en: string | null; id_number: string | null }): string | null {
  const digitsOnly = (employee.id_number ?? "").replace(/\D/g, "");
  if (digitsOnly.length < 4) return null;
  const last4 = digitsOnly.slice(-4);

  const fullName = (employee.name_en?.trim() || employee.name_ar.trim()).split(/\s+/).filter(Boolean);
  if (fullName.length === 0) return null;
  const first = slugifyNamePart(fullName[0]);
  const last = slugifyNamePart(fullName[fullName.length - 1] || fullName[0]);
  return `${first}_${last}@${last4}`;
}

hrEmployeesRouter.post("/:id/configure-staff-user", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const employee = db.prepare("SELECT * FROM hr_employees WHERE id = ?").get(id) as
    | (Record<string, unknown> & {
        name_ar: string;
        name_en: string | null;
        id_number: string | null;
        staff_role: string | null;
        linked_user_id: number | null;
      })
    | undefined;
  if (!employee) return res.status(404).json({ error: "Employee not found" });
  if (!employee.staff_role) return res.status(400).json({ error: "Pick a Staff Role before configuring a user." });

  const password = generateStrongPassword();

  // Already configured once — regenerate a password for that same account rather than
  // creating a second, orphaned one (username stays stable).
  if (employee.linked_user_id) {
    const linkedUser = db.prepare("SELECT id, username FROM users WHERE id = ?").get(employee.linked_user_id) as
      | { id: number; username: string }
      | undefined;
    if (linkedUser) {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(password, 10), linkedUser.id);
      return res.json({ username: linkedUser.username, password, employee });
    }
  }

  const username = usernameFor(employee);
  if (!username) {
    return res
      .status(400)
      .json({ error: "Employee needs a name and an ID Number (at least 4 digits) before configuring a user." });
  }
  if (username === masterAccount.username) {
    return res.status(409).json({ error: "That username is reserved for the master account" });
  }

  let finalUsername = username;
  if (db.prepare("SELECT id FROM users WHERE username = ?").get(finalUsername)) {
    finalUsername = `${username}-${employee.id}`;
  }

  const tx = db.transaction(() => {
    const info = db
      .prepare("INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, 'staff')")
      .run(finalUsername, bcrypt.hashSync(password, 10), employee.name_en || employee.name_ar);
    db.prepare("UPDATE hr_employees SET linked_user_id = ? WHERE id = ?").run(info.lastInsertRowid, id);
    return info.lastInsertRowid;
  });
  tx();

  const updated = db.prepare("SELECT * FROM hr_employees WHERE id = ?").get(id);
  res.json({ username: finalUsername, password, employee: updated });
});
