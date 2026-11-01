import { db } from "./db";

// Academic years (العام الدراسي tab). Students belong to one year; everything else (subjects,
// schools, the Hierarchy, users, settings) is shared by every year. The year the app is working in
// is the "current" one, kept in the settings table; its name is also kept in `academic_year`, which
// the age rule and the print headers read.
export const CURRENT_YEAR_KEY = "current_academic_year_id";

export type AcademicYear = { id: number; name: string; archived: number; sort_order: number; created_at: string };

export function currentAcademicYearId(): number {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(CURRENT_YEAR_KEY) as { value: string } | undefined;
  const id = Number(row?.value);
  if (id && db.prepare("SELECT 1 FROM academic_years WHERE id = ?").get(id)) return id;
  // The setting is missing or points at a deleted year: fall back to the newest open year.
  const fallback = db
    .prepare("SELECT id FROM academic_years ORDER BY archived ASC, sort_order DESC, id DESC LIMIT 1")
    .get() as { id: number } | undefined;
  if (!fallback) throw new Error("No academic year exists");
  setCurrentAcademicYear(fallback.id);
  return fallback.id;
}

export function setCurrentAcademicYear(id: number) {
  const year = db.prepare("SELECT name FROM academic_years WHERE id = ?").get(id) as { name: string } | undefined;
  if (!year) return;
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  upsert.run(CURRENT_YEAR_KEY, String(id));
  upsert.run("academic_year", year.name);
}
