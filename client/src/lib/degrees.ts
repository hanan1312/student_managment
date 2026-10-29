import type { StudentGrade, SubjectDegrees } from "./types";

export type DegreeTotals = {
  // مجموع النهايات: the كبرى / صغرى marks of the subjects in the total.
  max: number;
  min: number;
  // مجموع الدرجات: the student's degrees (one value per subject).
  score: number;
  hasScore: boolean;
  // النسبة المئوية = مجموع الدرجات ÷ مجموع النهايات الكبرى × 100; null before any degree is entered.
  percentage: number | null;
};

// Subjects خارج المجموع are left out entirely. In a choose-one group the student studies one
// subject, so only the graded member's marks count (or one member's, before any is graded).
// The server's students list uses the same rule (server/src/routes/students.ts, degreeSummary).
export function degreeTotals(grades: StudentGrade[]): DegreeTotals {
  const graded = (g: StudentGrade) => g.score !== null;
  const counted = grades.filter((g) => !g.outside_total);
  const groups = new Map<string, StudentGrade[]>();
  for (const g of counted) if (g.elective_group) groups.set(g.elective_group, [...(groups.get(g.elective_group) ?? []), g]);
  const marksRows = counted.filter((g) => {
    if (!g.elective_group) return true;
    const members = groups.get(g.elective_group)!;
    const gradedMembers = members.filter(graded);
    return gradedMembers.length > 0 ? graded(g) : members[0] === g;
  });

  const sum = (rows: StudentGrade[], f: (g: StudentGrade) => number) => rows.reduce((t, g) => t + f(g), 0);
  const max = sum(marksRows, (g) => g.max_degree ?? 0);
  const score = sum(counted, (g) => g.score ?? 0);
  const hasScore = counted.some(graded);
  return {
    max,
    min: sum(marksRows, (g) => g.min_degree ?? 0),
    score,
    hasScore,
    percentage: hasScore && max > 0 ? Math.round((1000 * score) / max) / 10 : null,
  };
}

// الحالة: ناجح at 50% or more, راسب below; none before any degree is entered.
export const PASS_LABEL = "ناجح و منقول للصف التالي";
export const FAIL_LABEL = "راسب";

export function passStatus(percentage: number | null | undefined): string | null {
  if (percentage === null || percentage === undefined) return null;
  return percentage >= 50 ? PASS_LABEL : FAIL_LABEL;
}

export function statusBadgeClass(status: string | null): string {
  if (status === PASS_LABEL) return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (status === FAIL_LABEL) return "bg-red-50 text-red-600 ring-1 ring-red-200";
  return "bg-slate-100 text-slate-400";
}

// Text colour for printed sheets (badges' backgrounds may not print).
export function statusTextClass(status: string | null): string {
  if (status === PASS_LABEL) return "text-emerald-700";
  if (status === FAIL_LABEL) return "text-red-600";
  return "";
}

// Marks shown as "صغرى / كبرى", e.g. "240 / 480".
export function marksText(min: number | null | undefined, max: number | null | undefined): string {
  return `${formatDegree(min) || "—"} / ${formatDegree(max) || "—"}`;
}

// How a subject reads over a set of sections (null = every section): خارج المجموع when it is in
// all of them, and its marks when they are the same in all of them (null when they differ).
export function subjectInScope(subject: SubjectDegrees, levelIds: Set<number> | null) {
  const rows = subject.level_marks.filter((m) => !levelIds || levelIds.has(m.level_id));
  const pairs = new Set(rows.map((m) => marksText(m.min_degree, m.max_degree)));
  return {
    outside: rows.length > 0 && rows.every((m) => m.outside_total),
    marks: pairs.size === 1 ? [...pairs][0] : null,
  };
}

// The students' مجموع النهايات when it is the same for all of them, else null.
export function sharedTotalMarks(totals: DegreeTotals[]): string | null {
  const pairs = new Set(totals.map((t) => marksText(t.min, t.max)));
  return pairs.size === 1 ? [...pairs][0] : null;
}

// Subjects in the total come first and those خارج المجموع last; مجموع الدرجات sits between them.
export function splitByOutside<T>(items: T[], isOutside: (item: T) => boolean): { inTotal: T[]; outside: T[] } {
  return { inTotal: items.filter((i) => !isOutside(i)), outside: items.filter(isOutside) };
}

export function formatPercentage(p: number | null | undefined): string {
  return p === null || p === undefined ? "" : `${p.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

export function formatDegree(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Prints only the element marked .print-only-target, even when other .print-area blocks
// (e.g. the Students table underneath) are on the page.
export function printOnlyTarget() {
  document.body.classList.add("printing-only");
  const cleanup = () => {
    document.body.classList.remove("printing-only");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  cleanup();
}

// كبرى = صغرى × 2 by default (for subject marks): typing a صغرى fills كبرى, unless كبرى was typed by hand (it no
// longer matches the old صغرى × 2). Returns the new كبرى text.
export function autoMaxFromMin(prevMin: string, newMin: string, currentMax: string): string {
  const prevAuto = prevMin.trim() === "" || Number.isNaN(Number(prevMin)) ? "" : String(Number(prevMin) * 2);
  const followsRule = currentMax.trim() === "" || currentMax === prevAuto;
  if (!followsRule) return currentMax;
  return newMin.trim() === "" || Number.isNaN(Number(newMin)) ? "" : String(Number(newMin) * 2);
}
