import { db } from "./db";

// Client heartbeats at this interval while logged in (see AuthContext.tsx); this file only
// needs to know it to size the offline threshold below with a comfortable margin.
const HEARTBEAT_INTERVAL_MS = 20_000;
const OFFLINE_THRESHOLD_MS = HEARTBEAT_INTERVAL_MS * 4;

type PresenceRow = {
  username: string;
  full_name: string;
  role: string;
  status: "online" | "idle" | "offline";
  login_at: string;
  last_heartbeat_at: string;
  last_active_at: string;
  idle_since: string | null;
  total_idle_seconds: number;
  offline_at: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

export function touchPresenceOnLogin(identity: { username: string; fullName: string; role: string }) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO user_presence
       (username, full_name, role, status, login_at, last_heartbeat_at, last_active_at, idle_since, total_idle_seconds, offline_at)
     VALUES (?, ?, ?, 'online', ?, ?, ?, NULL, 0, NULL)
     ON CONFLICT(username) DO UPDATE SET
       full_name = excluded.full_name,
       role = excluded.role,
       status = 'online',
       login_at = excluded.login_at,
       last_heartbeat_at = excluded.last_heartbeat_at,
       last_active_at = excluded.last_active_at,
       idle_since = NULL,
       total_idle_seconds = 0,
       offline_at = NULL`
  ).run(identity.username, identity.fullName, identity.role, now, now, now);
}

export function recordHeartbeat(username: string, idle: boolean) {
  const row = db.prepare("SELECT * FROM user_presence WHERE username = ?").get(username) as
    | PresenceRow
    | undefined;
  if (!row) return;

  // 'offline' is terminal until the next real login (touchPresenceOnLogin) — a heartbeat
  // arriving afterwards (a reconnecting tab, a lingering tab in another window after
  // logout elsewhere) must not quietly resurrect the session on its own.
  if (row.status === "offline") return;

  const now = nowIso();

  if (idle) {
    db.prepare(
      "UPDATE user_presence SET status = 'idle', last_heartbeat_at = ?, idle_since = COALESCE(idle_since, ?) WHERE username = ?"
    ).run(now, now, username);
    return;
  }

  const addedIdle = row.idle_since ? Math.round((Date.parse(now) - Date.parse(row.idle_since)) / 1000) : 0;
  db.prepare(
    `UPDATE user_presence
     SET status = 'online', last_heartbeat_at = ?, last_active_at = ?, idle_since = NULL,
         total_idle_seconds = total_idle_seconds + ?
     WHERE username = ?`
  ).run(now, now, addedIdle, username);
}

export function recordLogout(username: string) {
  const row = db.prepare("SELECT * FROM user_presence WHERE username = ?").get(username) as
    | PresenceRow
    | undefined;
  if (!row) return;
  const now = nowIso();
  const addedIdle = row.idle_since ? Math.round((Date.parse(now) - Date.parse(row.idle_since)) / 1000) : 0;
  db.prepare(
    `UPDATE user_presence
     SET status = 'offline', last_heartbeat_at = ?, idle_since = NULL,
         total_idle_seconds = total_idle_seconds + ?, offline_at = ?
     WHERE username = ?`
  ).run(now, addedIdle, now, username);
}

// A closed tab or lost connection stops heartbeats without ever calling /logout. Rather than
// run a background sweep/cron for that, lazily finalize anyone whose last heartbeat has gone
// stale into 'offline' right when the presence list is read — cheap, and the Control page is
// the only consumer of this data anyway.
function reconcileStale() {
  const now = Date.now();
  const candidates = db.prepare("SELECT * FROM user_presence WHERE status != 'offline'").all() as PresenceRow[];

  for (const row of candidates) {
    if (now - Date.parse(row.last_heartbeat_at) <= OFFLINE_THRESHOLD_MS) continue;
    const addedIdle = row.idle_since
      ? Math.round((Date.parse(row.last_heartbeat_at) - Date.parse(row.idle_since)) / 1000)
      : 0;
    db.prepare(
      `UPDATE user_presence
       SET status = 'offline', idle_since = NULL, total_idle_seconds = total_idle_seconds + ?, offline_at = ?
       WHERE username = ?`
    ).run(addedIdle, row.last_heartbeat_at, row.username);
  }
}

export type PresenceEntry = {
  username: string;
  fullName: string;
  role: string;
  status: "online" | "idle" | "offline";
  loginAt: string;
  offlineAt: string | null;
  sessionSeconds: number;
  idleSeconds: number;
};

export function listPresence(): PresenceEntry[] {
  reconcileStale();
  const rows = db
    .prepare(
      `SELECT * FROM user_presence
       ORDER BY CASE status WHEN 'online' THEN 0 WHEN 'idle' THEN 1 ELSE 2 END, login_at DESC`
    )
    .all() as PresenceRow[];
  const now = Date.now();

  return rows.map((row) => {
    const liveIdleSeconds =
      row.total_idle_seconds + (row.idle_since ? Math.round((now - Date.parse(row.idle_since)) / 1000) : 0);
    const sessionEndMs = row.status === "offline" && row.offline_at ? Date.parse(row.offline_at) : now;
    return {
      username: row.username,
      fullName: row.full_name,
      role: row.role,
      status: row.status,
      loginAt: row.login_at,
      offlineAt: row.offline_at,
      sessionSeconds: Math.max(0, Math.round((sessionEndMs - Date.parse(row.login_at)) / 1000)),
      idleSeconds: liveIdleSeconds,
    };
  });
}
