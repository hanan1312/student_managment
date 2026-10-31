import { ageOn } from "./studentAge";
import { formatMoeCode, genderLabel } from "./studentColumns";
import type { DegreesOverviewStudent } from "./types";

// The student-data columns of ملف الدرجات and its print, in table order. The `extra` ones (the
// rest of البيانات الأساسية) stay hidden until ticked in الأعمدة. ageRef is 1 October of the
// age year (ageReferenceDate).
export const DEGREES_INFO_FIELDS: {
  key: string;
  label: string;
  extra?: boolean;
  get: (s: DegreesOverviewStudent, ageRef: Date) => string;
}[] = [
  { key: "name", label: "الاسم", get: (s) => s.name },
  { key: "gender", label: "النوع", extra: true, get: (s) => genderLabel(s.gender) },
  { key: "religion", label: "الديانة", extra: true, get: (s) => s.religion ?? "" },
  { key: "enrollment_type", label: "نوع القيد", extra: true, get: (s) => s.enrollment_type ?? "" },
  { key: "nationality", label: "الجنسية", extra: true, get: (s) => s.nationality ?? "" },
  { key: "national_id", label: "الرقم القومي", get: (s) => s.national_id ?? "" },
  { key: "moe_code", label: "كود الحكومة الالكترونية", get: (s) => formatMoeCode(s.moe_code) },
  { key: "birthday", label: "تاريخ الميلاد", extra: true, get: (s) => s.birthday ?? "" },
  { key: "age", label: "السن في ١ أكتوبر", extra: true, get: (s, ageRef) => (s.birthday ? ageOn(s.birthday, ageRef) : "") },
  { key: "school", label: "المدرسة", extra: true, get: (s) => s.school ?? "" },
  { key: "division", label: "المرحلة", get: (s) => s.division ?? "" },
  { key: "section", label: "الصف", get: (s) => s.section ?? "" },
];
