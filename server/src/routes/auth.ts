import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { signToken, requireAuth, AuthedRequest } from "../auth";
import { getUserModules, getUserRole, MODULE_KEYS } from "../permissions";
import { masterAccount } from "../masterAccount";
import { touchPresenceOnLogin, recordLogout } from "../presence";
import { recordActivity } from "../activityLog";
import { isStrongPassword } from "../passwords";

export const authRouter = Router();

// The master account is a fixed, ID-0 identity: it isn't a users-table row, so its login
// check runs before touching the DB, and its full-access modules list is hardcoded rather
// than looked up.
const MASTER_ID = 0;

// Brute-force lockout: MAX_FAILED_ATTEMPTS wrong passwords in a row for one username locks it
// for LOCKOUT_MS. While locked, every attempt is refused before the password is even checked,
// so the correct password doesn't get you in early either.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60_000;

function lockedForSeconds(username: string): number {
  const row = db.prepare("SELECT locked_until FROM login_attempts WHERE username = ?").get(username) as
    | { locked_until: number | null }
    | undefined;
  const remaining = (row?.locked_until ?? 0) - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

// Returns how many attempts are left before a lockout (0 means it just locked).
function recordFailedAttempt(username: string): number {
  // Never called while locked; locking resets failed_count to 0, so an expired lock starts fresh.
  const row = db.prepare("SELECT failed_count FROM login_attempts WHERE username = ?").get(username) as
    | { failed_count: number }
    | undefined;
  const count = (row?.failed_count ?? 0) + 1;
  if (count >= MAX_FAILED_ATTEMPTS) {
    db.prepare(
      `INSERT INTO login_attempts (username, failed_count, locked_until) VALUES (?, 0, ?)
       ON CONFLICT(username) DO UPDATE SET failed_count = 0, locked_until = excluded.locked_until`
    ).run(username, Date.now() + LOCKOUT_MS);
    return 0;
  }
  db.prepare(
    `INSERT INTO login_attempts (username, failed_count, locked_until) VALUES (?, ?, NULL)
     ON CONFLICT(username) DO UPDATE SET failed_count = excluded.failed_count, locked_until = NULL`
  ).run(username, count);
  return MAX_FAILED_ATTEMPTS - count;
}

function clearFailedAttempts(username: string) {
  db.prepare("DELETE FROM login_attempts WHERE username = ?").run(username);
}

function lockedResponse(res: import("express").Response, seconds: number) {
  return res.status(423).json({
    error: `Too many failed attempts. Try again in ${Math.ceil(seconds / 60)} minute(s).`,
    lockedForSeconds: seconds,
  });
}

function failedResponse(res: import("express").Response, username: string, message: string) {
  const attemptsLeft = recordFailedAttempt(username);
  if (attemptsLeft === 0) return lockedResponse(res, LOCKOUT_MS / 1000);
  return res.status(401).json({ error: message, attemptsLeft });
}

authRouter.post("/login", (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const lockSeconds = lockedForSeconds(String(username));
  if (lockSeconds > 0) return lockedResponse(res, lockSeconds);

  if (username === masterAccount.username && password === masterAccount.password) {
    clearFailedAttempts(username);
    const token = signToken({
      id: MASTER_ID,
      username: masterAccount.username,
      full_name: masterAccount.fullName,
      role: "master",
    });
    touchPresenceOnLogin({ username: masterAccount.username, fullName: masterAccount.fullName, role: "master" });
    recordActivity({
      username: masterAccount.username,
      fullName: masterAccount.fullName,
      role: "master",
      method: "POST",
      path: "/api/auth/login",
      module: "auth",
      statusCode: 200,
    });
    return res.json({
      token,
      user: {
        id: MASTER_ID,
        username: masterAccount.username,
        full_name: masterAccount.fullName,
        role: "master",
        modules: [...MODULE_KEYS],
      },
    });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as
    | {
        id: number;
        username: string;
        password_hash: string;
        full_name: string;
        role: string;
        must_change_password: number;
      }
    | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    // Attempted username is logged as-typed (unverified) — useful for spotting brute-force
    // attempts, but it never matches a real account here so there's no presence to touch.
    // A wrong-password attempt against "master" itself is still excluded, same as every
    // other master-related entry (see recordActivity's own guard for successful attempts).
    if (username !== masterAccount.username) {
      recordActivity({
        username: String(username),
        fullName: "",
        role: "unknown",
        method: "POST",
        path: "/api/auth/login",
        module: "auth",
        statusCode: 401,
      });
    }
    return failedResponse(res, String(username), "Invalid username or password");
  }

  clearFailedAttempts(user.username);

  // A new account (or one an admin just reset) gets no session until its owner picks their
  // own password — the client then calls /reset-password with this temporary one.
  if (user.must_change_password) {
    return res.status(403).json({
      error: "You must choose a new password before signing in for the first time.",
      mustChangePassword: true,
    });
  }

  const token = signToken({ id: user.id, username: user.username, full_name: user.full_name });
  touchPresenceOnLogin({ username: user.username, fullName: user.full_name, role: user.role });
  recordActivity({
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    method: "POST",
    path: "/api/auth/login",
    module: "auth",
    statusCode: 200,
  });
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      modules: getUserModules(user.id, user.role),
    },
  });
});

authRouter.post("/logout", requireAuth, (req: AuthedRequest, res) => {
  recordLogout(req.user!.username);
  recordActivity({
    username: req.user!.username,
    fullName: req.user!.full_name,
    role: req.user!.role ?? getUserRole(req.user!.id) ?? "unknown",
    method: "POST",
    path: "/api/auth/logout",
    module: "auth",
    statusCode: 204,
  });
  res.status(204).send();
});

authRouter.get("/me", requireAuth, (req: AuthedRequest, res) => {
  if (req.user?.role === "master") {
    return res.json({
      user: {
        id: MASTER_ID,
        username: masterAccount.username,
        full_name: masterAccount.fullName,
        role: "master",
        modules: [...MODULE_KEYS],
      },
    });
  }

  const row = db.prepare("SELECT id, username, full_name, role FROM users WHERE id = ?").get(req.user!.id) as
    | { id: number; username: string; full_name: string; role: string }
    | undefined;
  if (!row) return res.status(401).json({ error: "User not found" });

  res.json({ user: { ...row, modules: getUserModules(row.id, row.role) } });
});

// Same self-service change as /change-password below, but reachable from the Login page
// before a session exists — verifies identity via username + current password (the same bar
// as logging in) instead of a bearer token, so it never needs requireAuth.
authRouter.post("/reset-password", (req, res) => {
  const { username, currentPassword, newPassword } = req.body ?? {};
  if (!username || !currentPassword || !newPassword) {
    return res.status(400).json({ error: "username, currentPassword and newPassword are required" });
  }
  if (username === masterAccount.username) {
    return res.status(400).json({ error: "The master account's password is changed via master-account.json, not here." });
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ error: "New password must be at least 8 characters and include both letters and numbers" });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ error: "The new password must be different from the current one" });
  }

  // Verifies a password just like /login does, so it shares the same lockout counter.
  const lockSeconds = lockedForSeconds(String(username));
  if (lockSeconds > 0) return lockedResponse(res, lockSeconds);

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as
    | { id: number; password_hash: string }
    | undefined;
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return failedResponse(res, String(username), "Username or current password is incorrect");
  }

  clearFailedAttempts(String(username));
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(
    bcrypt.hashSync(newPassword, 10),
    user.id
  );
  res.json({ ok: true });
});

// Self-service password change — any authenticated user, regardless of module access, since
// it only ever touches their own account. The master account isn't a users-table row (its
// credentials live in master-account.json), so it's explicitly excluded here.
authRouter.post("/change-password", requireAuth, (req: AuthedRequest, res) => {
  if (req.user?.role === "master") {
    return res.status(400).json({ error: "The master account's password is changed via master-account.json, not here." });
  }

  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "currentPassword and newPassword are required" });
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ error: "New password must be at least 8 characters and include both letters and numbers" });
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user!.id) as
    | { id: number; password_hash: string }
    | undefined;
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(newPassword, 10), user.id);
  res.json({ ok: true });
});
