import type { StudentGrade } from "./types";

// The official result forms (بيان نجاح طالب) the education administration uses, one per stage:
//  - "secondary": اخطار بنتيجة … — every section of المرحلة الثانوية (the photographed forms of
//    الصف الأول and الصف الثاني علمي / أدبي, and the same form for البكالوريا المصرية and الصف
//    الثالث). The subjects run across with rows for النهاية الكبرى / الصغرى / الدرجة.
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
  // Sections without a paper form of their own: the language subjects first, the usual
  // خارج المجموع subjects in the form's order; the rest keep the order of المواد.
  secondary: [["اللغة العربية"], ["اللغة الأجنبية الأولى", "اللغة الإنجليزية"], ...SECONDARY_OUTSIDE],
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
    const parts = (section ?? "").split("/").map((p) => p.trim()).filter(Boolean);
    const amma = path[0] === looseName("الصف الثاني الثانوي") && path.includes(looseName("الثانوية العامة (نظام جديد)"));
    const track = path[path.length - 1];
    if (amma && track === looseName("شعبة علمي")) {
      return { kind: "secondary", gradeLabel: `${grade} (علمي)`, order: ORDER.sec2Science };
    }
    if (amma && track === looseName("شعبة أدبي")) {
      return { kind: "secondary", gradeLabel: `${grade} (أدبي)`, order: ORDER.sec2Literary };
    }
    // Every other section of the stage (البكالوريا المصرية's tracks, الصف الثالث الثانوي, …) uses the
    // same form: the track in brackets ("شعبة علمي" → "علمي"), البكالوريا named before it.
    const trackName = parts.length > 1 ? parts[parts.length - 1].replace(/^شعبة\s+/, "") : "";
    const system = parts.length > 2 && looseName(parts[1]).includes(looseName("البكالوريا")) ? ` - ${parts[1]}` : "";
    return {
      kind: "secondary",
      gradeLabel: `${grade}${system}${trackName ? ` (${trackName})` : ""}`,
      order: ORDER.secondary,
    };
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

// The official forms' texts kept with each student (البيانات الأساسية → بيانات بيان النجاح, stored
// as JSON in students.form_fields). In the print preview each one has a checkbox: ticked, the
// student's text is printed (or the form's own default when the student has none); unticked, the
// form shows an empty line to fill by hand.
export const STUDENT_FORM_FIELDS = [
  { key: "gov", label: "المحافظة" },
  { key: "directorate", label: "المديرية" },
  { key: "admin", label: "الإدارة التعليمية" },
  { key: "dept_secondary", label: "القسم (الثانوي)" },
  { key: "dept_prep", label: "القسم (الإعدادي)" },
  { key: "title_prep", label: "عنوان الإعدادي" },
  { key: "round", label: "الدور" },
  { key: "year", label: "العام" },
  { key: "submitTo", label: "لتقديمه إلى" },
  { key: "feeQ", label: "الرسوم (ق)" },
  { key: "feeJ", label: "الرسوم (ج)" },
  { key: "postal", label: "رقم الحوالة" },
  { key: "date", label: "بتاريخ" },
  { key: "writtenOn", label: "تحريرا في" },
] as const;

export type StudentFormFieldKey = (typeof STUDENT_FORM_FIELDS)[number]["key"];
export type StudentFormFields = Partial<Record<StudentFormFieldKey, string>>;

// Which forms print each field (the panel only offers the ones of the forms being printed).
export const FORM_FIELD_KINDS: Record<StudentFormFieldKey, Exclude<FormKind, "generic">[]> = {
  gov: ["secondary", "prep"],
  directorate: ["secondary", "prep"],
  admin: ["secondary", "prep"],
  dept_secondary: ["secondary"],
  dept_prep: ["prep"],
  title_prep: ["prep"],
  round: ["secondary", "prep"],
  year: ["secondary", "prep"],
  submitTo: ["secondary", "prep"],
  feeQ: ["secondary"],
  feeJ: ["secondary", "prep"],
  postal: ["secondary", "prep"],
  date: ["secondary", "prep"],
  writtenOn: ["prep"],
};

// الدور: chosen like الديانة in the student's ملف الدرجات and kept as the forms' "round" text, so
// the forms print it ("الدور الأول عام", "بالدور / الأول").
export const EXAM_ROUNDS = ["الأول", "الثاني"] as const;

// Typed variants (اول، أول، الدور الأول، 1 / ثاني، ثان، 2) read as الأول / الثاني; anything else is kept.
export function normalizeRound(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  const word = v.replace(/^الدور\s*/, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/^ال/, "");
  if (["اول", "1", "١"].includes(word)) return "الأول";
  if (["ثاني", "ثان", "2", "٢"].includes(word)) return "الثاني";
  return v;
}

export const studentRound = (formFields: string | null | undefined) => parseFormFields(formFields).round ?? "";

export function parseFormFields(raw: string | null | undefined): StudentFormFields {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      STUDENT_FORM_FIELDS.filter((f) => typeof parsed[f.key] === "string").map((f) => [f.key, parsed[f.key] as string])
    );
  } catch {
    return {};
  }
}
