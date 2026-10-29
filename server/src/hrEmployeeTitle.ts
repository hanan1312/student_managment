// Server-side mirror of client/src/lib/hrEmployeeTitle.ts — kept in sync manually since the two
// run in separate builds. Used by hrOrg.ts to recompute an employee's derived Title when a
// Division rename changes what that formula would produce, so renaming in the org tree doesn't
// leave stale Titles behind until someone happens to re-open and re-save each employee.

const TEACHER_DIVISION_NAMES = new Set(["المدرسين", "teachers"]);
export function isTeacherDivisionName(division: string): boolean {
  return TEACHER_DIVISION_NAMES.has(division.trim().toLowerCase());
}

const HEADMASTER_DIVISION_NAMES = new Set(["مدير المدرسة", "headmaster"]);
export function isHeadmasterDivisionName(division: string): boolean {
  return HEADMASTER_DIVISION_NAMES.has(division.trim().toLowerCase());
}

// Mirrors client/src/lib/hrEmployeeTitle.ts's PRINCIPAL_DIVISION_NAMES — only needed server-side
// for the one-time hr_org_divisions.kind backfill in db.ts (see migrateHrOrgDivisionColumns);
// day-to-day Principal-division detection lives client-side via HrOrgDivision.kind.
const PRINCIPAL_DIVISION_NAMES = new Set([
  "الوكلاء",
  "principals",
  "prencipal",
  "prencipals",
  "deputies",
  "vice principal",
  "vice principals",
]);
export function isPrincipalDivisionName(division: string): boolean {
  return PRINCIPAL_DIVISION_NAMES.has(division.trim().toLowerCase());
}

// Headmaster: fixed label. Every other division (Teachers, Staff, Principals/deputies, or
// anything a school renames the tree to): "<division> <department>" — Teachers' Subject picker
// intentionally plays no part in Title; it only feeds subject_id.
export function deriveEmployeeTitle(division: string, department: string): string {
  const trimmedDivision = division.trim();
  if (!trimmedDivision) return "";
  if (isHeadmasterDivisionName(trimmedDivision)) return "Headmaster";
  return [trimmedDivision, (department ?? "").trim()].filter(Boolean).join(" ");
}

// A Department (Stage-sourced or hr_lookup_items "department"-category-sourced) is copied as
// plain text onto hr_employees.department (and folded into the derived Title), same as
// Division/Section/Job/Subject — so a rename here needs the same cascade those already get.
// Not school-scoped: Stages are single-school-wide and the "department" lookup category can be
// global, matching how EmployeeFormModal already sources Department options from both.
export function syncEmployeesOnDepartmentRename(db: import("better-sqlite3").Database, oldName: string, newName: string) {
  const affected = db
    .prepare("SELECT id, division FROM hr_employees WHERE TRIM(department) = TRIM(?)")
    .all(oldName) as { id: number; division: string | null }[];
  if (affected.length === 0) return;

  const update = db.prepare("UPDATE hr_employees SET department = ?, title = ? WHERE id = ?");
  for (const emp of affected) {
    const title = deriveEmployeeTitle(emp.division ?? "", newName) || null;
    update.run(newName, title, emp.id);
  }
}
