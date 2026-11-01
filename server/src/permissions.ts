import { Response, NextFunction } from "express";
import { db } from "./db";
import { decodeToken, type AuthedRequest } from "./auth";

export const MODULE_KEYS = [
  "students",
  "finance",
  "control",
  "controlPanel",
  "academicYears",
  "inventory",
  "timetable",
  "buses",
  "management",
  "configuration",
  "configurationPanel",
  "hrEmployees",
  "hrPayroll",
  "hrConfiguration",
  "hrThemes",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

export function getUserRole(userId: number): string | null {
  const row = db.prepare("SELECT role FROM users WHERE id = ?").get(userId) as { role: string } | undefined;
  return row?.role ?? null;
}

export function getUserModules(userId: number, role?: string | null): ModuleKey[] {
  const actualRole = role ?? getUserRole(userId);
  if (actualRole === "admin" || actualRole === "master") return [...MODULE_KEYS];

  const rows = db.prepare("SELECT module FROM user_permissions WHERE user_id = ?").all(userId) as {
    module: string;
  }[];
  return rows.map((r) => r.module).filter(isModuleKey);
}

// The master account (see masterAccount.ts) isn't a row in the users table, so its
// privilege travels in the JWT payload itself (role: "master") rather than a DB lookup —
// every admin-equivalence check below looks there first before falling back to the DB.
export function isAdminOrMaster(req: AuthedRequest): boolean {
  if (req.user?.role === "master") return true;
  return req.user ? getUserRole(req.user.id) === "admin" : false;
}

export function requireModule(...moduleKeys: [ModuleKey, ...ModuleKey[]]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const decoded = decodeToken(req);
    if (!decoded) return res.status(401).json({ error: "Invalid or expired token" });
    req.user = decoded;

    if (decoded.role === "master") return next();

    const role = getUserRole(decoded.id);
    if (!role) return res.status(401).json({ error: "User not found" });
    if (role === "admin") return next();

    // Any one of the listed modules is enough.
    const granted = db
      .prepare(
        `SELECT 1 FROM user_permissions WHERE user_id = ? AND module IN (${moduleKeys.map(() => "?").join(",")})`
      )
      .get(decoded.id, ...moduleKeys);
    if (!granted) return res.status(403).json({ error: "You don't have access to this module" });
    next();
  };
}

// The stages (المراحل) a user may manage: null means every stage. Admins and the master account
// are never restricted. A restricted user whose stages were all deleted gets an empty list (sees
// nothing), not every stage — that's why the restriction is its own flag on the user.
export function getStageScope(user: { id: number; role?: string } | undefined): number[] | null {
  if (!user || user.role === "master") return null;
  const row = db.prepare("SELECT role, stages_restricted FROM users WHERE id = ?").get(user.id) as
    | { role: string; stages_restricted: number }
    | undefined;
  if (!row || row.role === "admin" || !row.stages_restricted) return null;
  return (db.prepare("SELECT stage_id FROM user_stages WHERE user_id = ?").all(user.id) as { stage_id: number }[]).map(
    (r) => r.stage_id
  );
}

// Levels (at any depth) that belong to the given stages.
export function levelIdsInStages(stageIds: number[]): Set<number> {
  if (stageIds.length === 0) return new Set();
  const rows = db
    .prepare(`SELECT id FROM levels WHERE stage_id IN (${stageIds.map(() => "?").join(",")})`)
    .all(...stageIds) as { id: number }[];
  return new Set(rows.map((r) => r.id));
}

export function stageOfLevel(levelId: number): number | null {
  const row = db.prepare("SELECT stage_id FROM levels WHERE id = ?").get(levelId) as { stage_id: number } | undefined;
  return row?.stage_id ?? null;
}

export const OUT_OF_SCOPE_ERROR = "هذه المرحلة خارج صلاحياتك";

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const decoded = decodeToken(req);
  if (!decoded) return res.status(401).json({ error: "Invalid or expired token" });
  req.user = decoded;

  if (decoded.role === "master") return next();

  const role = getUserRole(decoded.id);
  if (role !== "admin") return res.status(403).json({ error: "Only an admin can do this" });
  next();
}
