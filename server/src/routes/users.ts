import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";
import { requireModule, isAdminOrMaster } from "../permissions";
import { masterAccount } from "../masterAccount";
import { isStrongPassword } from "../passwords";

export const usersRouter = Router();
usersRouter.use(requireModule("control"));

const SAFE_COLUMNS = `users.id, users.username, users.full_name, users.role, users.code, users.city_id,
  users.education_admin_id, users.must_change_password, cities.name AS city_name,
  education_admins.name AS education_admin_name`;
const FROM_USERS = `users LEFT JOIN cities ON cities.id = users.city_id
  LEFT JOIN education_admins ON education_admins.id = users.education_admin_id`;

function selectUser(id: number | bigint) {
  return db.prepare(`SELECT ${SAFE_COLUMNS} FROM ${FROM_USERS} WHERE users.id = ?`).get(id);
}

function isCodeTaken(code: string) {
  return Boolean(db.prepare("SELECT 1 FROM users WHERE code = ?").get(code));
}

// A random 5-digit code no user has yet.
function generateUniqueCode(): string {
  for (let i = 0; i < 1000; i++) {
    const code = String(crypto.randomInt(10000, 100000));
    if (!isCodeTaken(code)) return code;
  }
  throw new Error("Could not generate a unique user code");
}

usersRouter.get("/", requireAuth, (_req, res) => {
  const rows = db.prepare(`SELECT ${SAFE_COLUMNS} FROM ${FROM_USERS} ORDER BY users.username ASC`).all();
  res.json({ users: rows });
});

// The New User form shows this code (and the username/password derived from it) before
// saving; POST re-checks it's still free.
usersRouter.get("/new-code", requireAuth, (_req, res) => {
  res.json({ code: generateUniqueCode() });
});

usersRouter.post("/", requireAuth, (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  if (!b.fullName) return res.status(400).json({ error: "fullName is required" });

  const requestedRole = typeof b.role === "string" && b.role ? b.role : "staff";
  if (requestedRole === "admin" && !isAdminOrMaster(req)) {
    return res.status(403).json({ error: "Only an admin can grant the admin role" });
  }

  // New User form: city + education administration given, so the username is
  // "<city>_<education admin>_<code>" and the temporary password "<role>_<code>". That
  // password skips the strength rule — it only works once, since the user must replace it
  // on first sign-in. Without them (CSV import), username/password come from the request.
  let username: string;
  let password: string;
  let code: string | null = null;
  let cityId: number | null = null;
  let educationAdminId: number | null = null;
  if (b.cityId || b.educationAdminId) {
    const city = db.prepare("SELECT id, name FROM cities WHERE id = ?").get(Number(b.cityId)) as
      | { id: number; name: string }
      | undefined;
    const eduAdmin = db.prepare("SELECT id, name FROM education_admins WHERE id = ?").get(Number(b.educationAdminId)) as
      | { id: number; name: string }
      | undefined;
    if (!city || !eduAdmin) return res.status(400).json({ error: "Choose both a city and an education administration" });

    code = typeof b.code === "string" && /^\d{5}$/.test(b.code) && !isCodeTaken(b.code) ? b.code : generateUniqueCode();
    username = `${city.name.trim()}_${eduAdmin.name.trim()}_${code}`;
    password = `${requestedRole}_${code}`;
    cityId = city.id;
    educationAdminId = eduAdmin.id;
  } else {
    if (!b.username || !b.password) {
      return res.status(400).json({ error: "username and password are required" });
    }
    if (!isStrongPassword(b.password)) {
      return res.status(400).json({ error: "Password must be at least 8 characters and include both letters and numbers" });
    }
    username = b.username;
    password = b.password;
  }

  if (username === masterAccount.username) {
    return res.status(409).json({ error: "That username is reserved for the master account" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return res.status(409).json({ error: "Username already taken" });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, full_name, role, code, city_id, education_admin_id, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .run(username, hash, b.fullName, requestedRole, code, cityId, educationAdminId);

  res.status(201).json({ user: selectUser(info.lastInsertRowid), temporaryPassword: password });
});

usersRouter.put("/:id", requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "User not found" });

  const requesterIsPrivileged = isAdminOrMaster(req);
  if (existing.role === "admin" && !requesterIsPrivileged) {
    return res.status(403).json({ error: "Only an admin can edit an admin account" });
  }

  const b = req.body ?? {};
  const requestedRole = typeof b.role === "string" && b.role ? b.role : existing.role;
  if (requestedRole === "admin" && !requesterIsPrivileged) {
    return res.status(403).json({ error: "Only an admin can grant the admin role" });
  }

  // Same fields as New User: city + education administration + code rebuild the username,
  // and resetPassword puts the password back to the temporary "<role>_<code>".
  let username: string = existing.username;
  let code: string | null = existing.code;
  let cityId: number | null = existing.city_id;
  let educationAdminId: number | null = existing.education_admin_id;
  if (b.cityId !== undefined || b.educationAdminId !== undefined || b.code !== undefined) {
    const city = db.prepare("SELECT id, name FROM cities WHERE id = ?").get(Number(b.cityId ?? cityId)) as
      | { id: number; name: string }
      | undefined;
    const eduAdmin = db
      .prepare("SELECT id, name FROM education_admins WHERE id = ?")
      .get(Number(b.educationAdminId ?? educationAdminId)) as { id: number; name: string } | undefined;
    if (!city || !eduAdmin) return res.status(400).json({ error: "Choose both a city and an education administration" });

    const requestedCode = typeof b.code === "string" ? b.code : code;
    if (!requestedCode || !/^\d{5}$/.test(requestedCode)) return res.status(400).json({ error: "Code must be 5 digits" });
    if (requestedCode !== existing.code && isCodeTaken(requestedCode)) {
      return res.status(409).json({ error: "That code is already used by another user" });
    }
    code = requestedCode;
    cityId = city.id;
    educationAdminId = eduAdmin.id;
    username = `${city.name.trim()}_${eduAdmin.name.trim()}_${code}`;
    if (username === masterAccount.username) {
      return res.status(409).json({ error: "That username is reserved for the master account" });
    }
    if (db.prepare("SELECT 1 FROM users WHERE username = ? AND id != ?").get(username, id)) {
      return res.status(409).json({ error: "Username already taken" });
    }
  }

  let temporaryPassword: string | null = null;
  if (b.resetPassword) {
    if (!code) return res.status(400).json({ error: "Set a code before resetting to the temporary password" });
    temporaryPassword = `${requestedRole}_${code}`;
  } else if (b.password) {
    if (!isStrongPassword(b.password)) {
      return res.status(400).json({ error: "Password must be at least 8 characters and include both letters and numbers" });
    }
    temporaryPassword = b.password;
  }
  const hash = temporaryPassword ? bcrypt.hashSync(temporaryPassword, 10) : existing.password_hash;

  // Any admin-set password is temporary: the user must replace it on next sign-in.
  db.prepare(
    `UPDATE users SET username = ?, full_name = ?, role = ?, password_hash = ?, must_change_password = ?,
       code = ?, city_id = ?, education_admin_id = ?
     WHERE id = ?`
  ).run(
    username,
    b.fullName ?? existing.full_name,
    requestedRole,
    hash,
    temporaryPassword ? 1 : existing.must_change_password,
    code,
    cityId,
    educationAdminId,
    id
  );

  res.json({ user: selectUser(id), temporaryPassword });
});

usersRouter.delete("/:id", requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (id === req.user?.id) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }

  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
  if (!target) return res.status(404).json({ error: "User not found" });

  if (target.role === "admin" && !isAdminOrMaster(req)) {
    return res.status(403).json({ error: "Only an admin can delete an admin account" });
  }

  const adminCount = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get() as { c: number }
  ).c;
  if (target.role === "admin" && adminCount <= 1) {
    return res.status(400).json({ error: "Cannot delete the last remaining admin" });
  }

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM user_permissions WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM user_stages WHERE user_id = ?").run(id);
    // hr_employees.linked_user_id (Configure Staff User) has no ON DELETE clause — unlink
    // rather than leave the employee pointed at a deleted account.
    db.prepare("UPDATE hr_employees SET linked_user_id = NULL WHERE linked_user_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  });
  tx();
  res.status(204).send();
});
