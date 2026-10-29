import { Response, NextFunction } from "express";
import { db } from "./db";
import { decodeToken, type AuthedRequest } from "./auth";
import { getUserRole } from "./permissions";

export function recordActivity(entry: {
  username: string;
  fullName: string;
  role: string;
  method: string;
  path: string;
  module: string | null;
  statusCode: number;
}) {
  // The master account is excluded from the audit log entirely, by design — it's an
  // operator/setup identity, not a tracked staff account.
  if (entry.role === "master") return;

  db.prepare(
    `INSERT INTO activity_log (username, full_name, role, method, path, module, status_code)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(entry.username, entry.fullName, entry.role, entry.method, entry.path, entry.module, entry.statusCode);
}

function deriveModule(path: string): string | null {
  const match = path.match(/^\/api\/([^/]+)/);
  return match ? match[1] : null;
}

// Requests logged here explicitly instead (they either have no token yet, or are noisy
// enough - heartbeat - that logging every one of them would drown out real actions).
const EXCLUDED_PATHS = new Set(["/api/auth/login", "/api/auth/logout", "/api/presence/heartbeat"]);

// Logs every authenticated write request (POST/PUT/PATCH/DELETE) automatically, so the
// Control page's activity log stays complete without hand-instrumenting every route.
export function activityLogger(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.method === "GET" || !req.path.startsWith("/api/") || EXCLUDED_PATHS.has(req.path)) {
    return next();
  }

  // Captured now, not inside the finish callback below: once `next()` hands the request to a
  // nested router (e.g. app.use("/api/users", usersRouter)), Express strips the mount prefix
  // from req.path/req.url for the duration of that router's handling and only restores it via
  // the `next` chain — which a route handler that ends the response directly (the normal
  // case) never calls. Reading req.path later would see the router-relative "/" instead.
  const { method, path } = req;
  const module = deriveModule(path);

  res.on("finish", () => {
    const decoded = decodeToken(req);
    if (!decoded) return;
    const role = decoded.role ?? getUserRole(decoded.id) ?? "unknown";
    recordActivity({
      username: decoded.username,
      fullName: decoded.full_name,
      role,
      method,
      path,
      module,
      statusCode: res.statusCode,
    });
  });

  next();
}
