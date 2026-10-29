// The seeded org tree's "Teachers" division (see server/src/db.ts's HR_ORG_TREE) — its
// sections are named "مادة <subject>", one per subject-teaching group. The tree is fully
// editable, so a school may rename this division (e.g. to "Teachers"); both the seed name and
// its English translation are recognized here, matching server/src/routes/timetable.ts's
// GET /teachers query so the two stay in sync.
const TEACHER_DIVISION_NAMES = new Set(["المدرسين", "teachers"]);
export function isTeacherDivisionName(division: string): boolean {
  return TEACHER_DIVISION_NAMES.has(division.trim().toLowerCase());
}

// The seeded org tree's Headmaster division (see server/src/db.ts's HR_ORG_TREE, "مدير
// المدرسة") — there's only ever one job under it, so unlike Teachers/Staff/other divisions
// its derived Title is a fixed label rather than built from Section/Department.
const HEADMASTER_DIVISION_NAMES = new Set(["مدير المدرسة", "headmaster"]);
export function isHeadmasterDivisionName(division: string): boolean {
  return HEADMASTER_DIVISION_NAMES.has(division.trim().toLowerCase());
}

// The seeded org tree's "الوكلاء" (deputies/vice-principals) division — its Section options
// (one per stage, e.g. "وكيل المرحلة الابتدائى") aren't used by anything once Title exists
// (Title is built from Division + Department instead, same as any other non-Teacher division),
// so the Position tab skips rendering a Section picker for it entirely. Deliberately does NOT
// include bare "principal" (singular) — that's reserved for Headmaster above; this school's own
// data names this division "Prencipal"/"Prencipals" (a typo of "principal(s)"), which is why
// both the misspelled and correctly-spelled singular/plural forms are listed here.
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

// Derives the read-only "Title" shown in the Position tab and stored on the employee, so the
// HR sidebar tree and the employee table can group/display it without recomputing this logic.
// Headmaster: fixed label. Every other division (Teachers, Staff, Principals/deputies, or
// anything a school renames the tree to): "<division> <department>" — Teachers' Subject picker
// (still labeled "Section" in some places) intentionally plays no part in Title; it only feeds
// subject_id, used independently by Time Table's teacher-matching.
export function deriveEmployeeTitle(division: string, department: string): string {
  const trimmedDivision = division.trim();
  if (!trimmedDivision) return "";
  if (isHeadmasterDivisionName(trimmedDivision)) return "Headmaster";
  return [trimmedDivision, department.trim()].filter(Boolean).join(" ");
}
