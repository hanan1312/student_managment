import type { StudentGrade } from "./types";

// The official result forms (بيان نجاح طالب) the education administration uses, one per stage:
//  - "secondary": اخطار بنتيجة … — الصف الأول الثانوي and الصف الثاني الثانوي (علمي / أدبي). The
//    subjects run across with rows for النهاية الكبرى / الصغرى / الدرجة.
//  - "prep": كشف درجات طالب إعدادي — the subjects run down, with الدرجة الكلية (كبرى / صغرى),
//    درجة الطالب and ملاحظات.
//  - "generic": the app's own certificate, for every other stage.
// Their subjects and marks were added to المواد on the server (server/src/db.ts,
// syncCertificateSubjects); here they only set the order of the columns, as on the paper forms.
export type FormKind = "generic" | "secondary" | "prep";

export type CertificateForm = {
  kind: FormKind;
  // e.g. "الصف الثاني الثانوي (علمي)" for the title of the secondary form.
  gradeLabel: string;
  // Subject names in the paper form's order (any spelling in the list).
  order: string[][];
};

// Arabic names as typed by different people: أ/إ/آ = ا, ى = ي, ة = ه, Arabic digits, no spaces.
export function looseName(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[\sـ]+/g, "");
}

const SECONDARY_OUTSIDE = [
  ["التربية الدينية"],
  ["اللغة الأجنبية الثانية", "اللغة الثانية"],
  ["التربية الوطنية"],
  ["التربية المهنية"],
];

const ORDER = {
  prep: [
    ["اللغة العربية"],
    ["اللغة الإنجليزية", "اللغة الأجنبية الأولى"],
    ["الدراسات الاجتماعية", "الدراسات"],
    ["الرياضيات"],
    ["العلوم والصحة", "العلوم"],
    ["نشاط تربوي 1", "نشاط1"],
    ["نشاط تربوي 2", "نشاط2"],
    ["التربية الفنية"],
    ["الحاسب الآلي"],
    ["التربية الدينية"],
    ["التربية الرياضية"],
    ["المستوى الرفيع"],
  ],
  sec1: [
    ["اللغة العربية"],
    ["اللغة الأجنبية الأولى", "اللغة الإنجليزية"],
    ["الرياضيات"],
    ["العلوم المتكاملة", "علوم متكاملة"],
    ["التاريخ"],
    ["الفلسفة والمنطق"],
    ...SECONDARY_OUTSIDE,
  ],
  sec2Science: [
    ["اللغة العربية"],
    ["اللغة الأجنبية الأولى", "اللغة الإنجليزية"],
    ["الرياضيات"],
    ["الكيمياء"],
    ["التاريخ"],
    ["الفيزياء"],
    ...SECONDARY_OUTSIDE,
  ],
  sec2Literary: [
    ["اللغة العربية"],
    ["اللغة الأجنبية الأولى", "اللغة الإنجليزية"],
    ["رياضيات عامة", "الرياضيات"],
    ["الجغرافيا"],
    ["التاريخ"],
    ["علم النفس والاجتماع", "علم النفس"],
    ...SECONDARY_OUTSIDE,
  ],
};

// The form for a student, from their المرحلة and الصف (the section's path, e.g.
// "الصف الثاني الثانوي / الثانوية العامة (نظام جديد) / شعبة علمي").
export function certificateFormFor(division: string | null, section: string | null): CertificateForm {
  const stage = looseName(division);
  const path = (section ?? "").split("/").map(looseName).filter(Boolean);
  const grade = (section ?? "").split("/")[0]?.trim() ?? "";
  if (stage.includes("اعدادي") && path.length > 0) return { kind: "prep", gradeLabel: grade, order: ORDER.prep };
  if (stage.includes("ثانوي")) {
    if (path.length === 1 && path[0] === looseName("الصف الأول الثانوي")) {
      return { kind: "secondary", gradeLabel: grade, order: ORDER.sec1 };
    }
    const amma = path[0] === looseName("الصف الثاني الثانوي") && path.includes(looseName("الثانوية العامة (نظام جديد)"));
    const track = path[path.length - 1];
    if (amma && track === looseName("شعبة علمي")) {
      return { kind: "secondary", gradeLabel: `${grade} (علمي)`, order: ORDER.sec2Science };
    }
    if (amma && track === looseName("شعبة أدبي")) {
      return { kind: "secondary", gradeLabel: `${grade} (أدبي)`, order: ORDER.sec2Literary };
    }
  }
  return { kind: "generic", gradeLabel: grade, order: [] };
}

// The student's subjects in the form's order; subjects the form doesn't list keep their own order
// after it.
export function orderGrades(grades: StudentGrade[], order: string[][]): StudentGrade[] {
  const rank = (g: StudentGrade) => {
    const name = looseName(g.subject_name);
    const i = order.findIndex((names) => names.some((n) => looseName(n) === name));
    return i < 0 ? order.length : i;
  };
  return grades
    .map((g, i) => ({ g, i, r: rank(g) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.g);
}

// The signatures printed on each form, as on the paper (right to left).
export const FORM_SIGNATURES: Record<Exclude<FormKind, "generic">, string[]> = {
  secondary: ["رئيس القسم", "مدير شئون الطلبة", "يعتمد مدير الإدارة"],
  prep: ["المراجع", "رئيس القسم", "مدير شئون الطلبة", "مدير عام الإدارة"],
};
