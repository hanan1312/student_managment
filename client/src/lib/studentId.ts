import type { Student } from "./types";
import { formatMoeCode } from "./studentColumns";

export function studentDisplayId(s: Pick<Student, "id" | "student_no" | "moe_code" | "national_id">): string {
  return s.student_no?.trim() || formatMoeCode(s.moe_code) || s.national_id?.trim() || `STU-${s.id}`;
}
