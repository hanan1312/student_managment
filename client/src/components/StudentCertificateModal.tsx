import { createContext, useContext, useEffect, useState } from "react";
import { useSchools } from "../context/SchoolsContext";
import { useSettings } from "../context/SettingsContext";
import { degreeTotals, formatDegree, formatPercentage, PASS_LABEL, passStatus, splitByOutside, statusTextClass } from "../lib/degrees";
import {
  certificateFormFor,
  FORM_FIELD_KINDS,
  FORM_SIGNATURES,
  orderGrades,
  parseFormFields,
  STUDENT_FORM_FIELDS,
  type CertificateForm,
  type StudentFormFieldKey,
  type StudentFormFields,
} from "../lib/certificateForms";
import { useSignatures, type Signatures } from "../lib/print";
import { formatMoeCode } from "../lib/studentColumns";
import type { StudentGrade } from "../lib/types";
import { useUiControl } from "../lib/uiControl";
import {
  LayoutOptions,
  OptionCheckbox,
  OptionSection,
  PrintModalShell,
  PrintSheetHeader,
  SignatureBlock,
  SignatureOptions,
  TitleOption,
  type Orientation,
} from "./PrintParts";

export type CertificateStudent = {
  id: number;
  name: string;
  national_id: string | null;
  moe_code: string | null;
  division: string | null;
  section: string | null;
  school: string | null;
  // The official form's texts saved with the student (البيانات الأساسية).
  form_fields?: string | null;
  grades: StudentGrade[];
};

type CertificateOptions = {
  title: string;
  showMax: boolean;
  showMin: boolean;
  showPercentage: boolean;
  showStatus: boolean;
  showDate: boolean;
  showMoeCode: boolean;
};

// A certificate column: a subject, or المجموع (which sits after the subjects in the total and
// before those خارج المجموع).
type CertColumn = { kind: "subject"; grade: StudentGrade } | { kind: "total" };

// إدارة and ادارة (and أ / آ) are the same word as typed by different people.
const normalizeAlef = (text: string) => text.replace(/[أإآ]/g, "ا").trim();

// "إدارة <the administration of the student's school>" (إضافة مدرسة → الإدارة); the word isn't
// printed twice when the name already starts with it.
function useAdminLine(schoolName: string | null): string {
  const { schools } = useSchools();
  const { t } = useUiControl();
  const school = schools.find((s) => s.name.trim() === schoolName?.trim());
  const adminName = school?.education_admin_name?.trim() || school?.directorate?.trim() || "";
  const adminPrefix = t("print.adminPrefix");
  return adminName && !normalizeAlef(adminName).startsWith(normalizeAlef(adminPrefix)) ? `${adminPrefix} ${adminName}` : adminName;
}

// The texts of the official forms (header lines, الدور, the fees, the dates, …). Most are saved with
// the student (البيانات الأساسية → بيانات بيان النجاح; lib/certificateForms.ts) and printed when
// their checkbox is ticked in the preview; a ticked field with no saved text prints the form's own
// default, an unticked one an empty line. Anything can still be typed on a sheet for that printout.
type FieldKey = StudentFormFieldKey | "grade" | "seat" | "lang2" | "result" | "verdict";

const SAVED_FIELDS = new Set<string>(STUDENT_FORM_FIELDS.map((f) => f.key));
const HIDDEN_FIELDS_KEY = "certificate-form-hidden-fields-v1";

type FieldsState = {
  // Typed on a sheet, for this printout only.
  typed: Record<number, Partial<Record<FieldKey, string>>>;
  saved: Record<number, StudentFormFields>;
  hidden: Set<string>;
};

const FieldsContext = createContext<{
  state: FieldsState;
  setTyped: (studentId: number, key: FieldKey, value: string) => void;
} | null>(null);

function loadHiddenFields(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(HIDDEN_FIELDS_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

// A blank on the form: an input on a dotted line, as wide as its text. It prints as typed (or as
// an empty dotted line to fill by hand).
function Field({
  studentId,
  name,
  fallback = "",
  minChars = 10,
  className = "",
}: {
  studentId: number;
  name: FieldKey;
  fallback?: string;
  minChars?: number;
  className?: string;
}) {
  const { state, setTyped } = useContext(FieldsContext)!;
  const saved = SAVED_FIELDS.has(name) ? state.saved[studentId]?.[name as StudentFormFieldKey] : undefined;
  const printed = SAVED_FIELDS.has(name) && state.hidden.has(name) ? "" : saved || fallback;
  const value = state.typed[studentId]?.[name] ?? printed;
  return (
    <input
      value={value}
      onChange={(e) => setTyped(studentId, name, e.target.value)}
      size={Math.max(minChars, [...value].length + 1)}
      className={`form-field border-0 border-b border-dotted border-slate-500 bg-transparent px-1 text-center font-semibold text-slate-900 outline-none focus:bg-amber-50 ${className}`}
    />
  );
}

// The four header lines at the top right of both official forms.
function FormHeaderLines({ student, dept }: { student: CertificateStudent; dept: "dept_secondary" | "dept_prep" }) {
  const { t } = useUiControl();
  const adminLine = useAdminLine(student.school);
  const line = "text-start !font-bold";
  return (
    <div className="flex flex-col items-start gap-0.5 text-[1.05em]">
      <Field studentId={student.id} name="gov" fallback="محافظة " minChars={14} className={line} />
      <Field studentId={student.id} name="directorate" fallback={t("print.directorate")} minChars={14} className={line} />
      <Field studentId={student.id} name="admin" fallback={adminLine ? `${adminLine} التعليمية` : ""} minChars={14} className={line} />
      <Field
        studentId={student.id}
        name={dept}
        fallback={dept === "dept_prep" ? "قسم شئون الطلبة والامتحانات" : "شئون الطلبة والامتحانات"}
        minChars={14}
        className={line}
      />
    </div>
  );
}

// اخطار بنتيجة الصف … (الصف الأول الثانوي، الصف الثاني الثانوي علمي / أدبي), laid out as the paper
// form: subjects across, the total shaded between the subjects in the total and those outside it.
function SecondaryForm({
  student,
  form,
  options,
  signatures,
}: {
  student: CertificateStudent;
  form: CertificateForm;
  options: CertificateOptions;
  signatures: Signatures;
}) {
  const { settings } = useSettings();
  const grades = orderGrades(student.grades, form.order);
  const totals = degreeTotals(grades);
  const status = passStatus(totals.percentage);
  const { inTotal, outside } = splitByOutside(grades, (g) => Boolean(g.outside_total));
  const columns: CertColumn[] = [
    ...inTotal.map((grade) => ({ kind: "subject" as const, grade })),
    { kind: "total" },
    ...outside.map((grade) => ({ kind: "subject" as const, grade })),
  ];
  const cell = "border border-slate-700 px-1.5 py-1.5 text-center";
  const label = `${cell} whitespace-nowrap text-start font-bold`;
  const row = (title: string, subjectValue: (g: StudentGrade) => string, totalValue: string) => (
    <tr>
      <td className={label}>{title}</td>
      {columns.map((c) =>
        c.kind === "total" ? (
          <td key="total" className={`${cell} bg-slate-200 font-bold`}>
            {totalValue}
          </td>
        ) : (
          <td key={c.grade.subject_id} className={cell}>
            {subjectValue(c.grade)}
          </td>
        )
      )}
    </tr>
  );
  const id = student.id;

  return (
    <div className="official-form space-y-3 border-2 border-slate-800 p-5">
      <FormHeaderLines student={student} dept="dept_secondary" />

      <p className="text-center text-[1.2em] font-bold">
        <span className="underline underline-offset-4">اخطار بنتيجة</span>{" "}
        <Field studentId={id} name="grade" fallback={form.gradeLabel} minChars={12} className="!text-[1em] underline underline-offset-4" /> الدور{" "}
        <Field studentId={id} name="round" minChars={10} /> عام{" "}
        <Field studentId={id} name="year" fallback={settings.academic_year ?? ""} minChars={12} />
      </p>

      <div className="grid grid-cols-2 gap-x-10 gap-y-1.5 text-[1.05em] font-semibold">
        <p>
          رقم الجلوس / <Field studentId={id} name="seat" minChars={16} />
        </p>
        <span />
        <p>
          اسم الطالب / <span className="border-b border-dotted border-slate-500 px-2 font-bold">{student.name}</span>
        </p>
        <span />
        <p>
          المدرسة / <span className="border-b border-dotted border-slate-500 px-2">{student.school || ""}</span>
        </p>
        <p className="text-end">
          اللغة الثانية / <Field studentId={id} name="lang2" minChars={16} />
        </p>
      </div>

      <table className="w-full border-collapse border-2 border-slate-800">
        <thead>
          <tr>
            <th className={`${label} w-[1%]`}>البيان</th>
            {columns.map((c) =>
              c.kind === "total" ? (
                <th key="total" className={`${cell} bg-slate-200 font-bold`}>
                  المجموع
                </th>
              ) : (
                <th key={c.grade.subject_id} className={`${cell} font-bold`}>
                  {c.grade.subject_name}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {options.showMax && row("النهاية الكبرى", (g) => formatDegree(g.max_degree), formatDegree(totals.max))}
          {options.showMin && row("النهاية الصغرى", (g) => formatDegree(g.min_degree), formatDegree(totals.min))}
          {row("الدرجة", (g) => formatDegree(g.score), totals.hasScore ? formatDegree(totals.score) : "")}
        </tbody>
      </table>

      <div className="space-y-2 text-[1.05em] font-semibold">
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-2">
          <p>
            نتيجة الطالب / <Field studentId={id} name="result" fallback={status ?? ""} minChars={20} />
          </p>
          <p>
            تم استخراج هذا البيان لتقديمه الى / <Field studentId={id} name="submitTo" minChars={22} />
          </p>
        </div>
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-2">
          <span>بعد سداد الرسوم المقرر</span>
          <Field studentId={id} name="feeQ" minChars={4} /> <span>ق</span>
          <Field studentId={id} name="feeJ" minChars={4} /> <span>ج</span>
          <span className="ms-6">بالحوالة رقم /</span>
          <Field studentId={id} name="postal" minChars={12} />
          <span className="ms-6">بتاريخ :</span>
          <Field studentId={id} name="date" fallback="   /   / 20" minChars={12} />
        </p>
      </div>

      <SignatureBlock signatures={signatures} plain />
    </div>
  );
}

// كشف درجات طالب إعدادي, laid out as the paper form: the subjects run down, المجموع after the
// subjects in the total, with الدرجة الكلية (نهاية كبرى / صغرى), درجة الطالب and ملاحظات.
function PrepForm({
  student,
  form,
  options,
  signatures,
}: {
  student: CertificateStudent;
  form: CertificateForm;
  options: CertificateOptions;
  signatures: Signatures;
}) {
  const { settings } = useSettings();
  const grades = orderGrades(student.grades, form.order);
  const totals = degreeTotals(grades);
  const status = passStatus(totals.percentage);
  const { inTotal, outside } = splitByOutside(grades, (g) => Boolean(g.outside_total));
  const cell = "border border-slate-700 px-2 py-1 text-center";
  const label = `${cell} text-start font-bold`;
  const marksCols = (options.showMax ? 1 : 0) + (options.showMin ? 1 : 0);
  const subjectRow = (g: StudentGrade) => (
    <tr key={g.subject_id}>
      <td className={label}>{g.subject_name}</td>
      {options.showMax && <td className={cell}>{formatDegree(g.max_degree)}</td>}
      {options.showMin && <td className={cell}>{formatDegree(g.min_degree)}</td>}
      <td className={`${cell} font-semibold`}>{formatDegree(g.score)}</td>
      <td className={cell} />
    </tr>
  );
  const id = student.id;

  return (
    <div className="official-form space-y-3 border-2 border-slate-800 p-5">
      <FormHeaderLines student={student} dept="dept_prep" />

      <p className="text-center">
        <Field
          studentId={id}
          name="title_prep"
          fallback="كشف درجات طالب إعدادي"
          minChars={20}
          className="!text-[1.3em] underline underline-offset-4"
        />
      </p>

      <div className="space-y-2 text-[1.05em] font-semibold">
        <p>
          اسم الطالب / <span className="border-b border-dotted border-slate-500 px-2 font-bold">{student.name}</span>
        </p>
        <p className="flex flex-wrap justify-between gap-x-6">
          <span>
            بالكشف في سجلات مدرسة / <span className="border-b border-dotted border-slate-500 px-2">{student.school || ""}</span>
          </span>
          <span>
            الصف / <Field studentId={id} name="grade" fallback={form.gradeLabel} minChars={14} />
          </span>
        </p>
        <p className="flex flex-wrap justify-between gap-x-6">
          <span>
            وجد ان الطالب{" "}
            <Field studentId={id} name="verdict" fallback={status === null ? "" : status === PASS_LABEL ? "ناجح" : "راسب"} minChars={6} />{" "}
            بالدور / <Field studentId={id} name="round" minChars={12} />
          </span>
          <span>
            عام / <Field studentId={id} name="year" fallback={settings.academic_year ?? ""} minChars={12} />
          </span>
        </p>
        <p className="underline underline-offset-4">وبيان درجاته كالتالي /</p>
      </div>

      <table className="w-full border-collapse border-2 border-slate-800">
        <thead>
          <tr>
            <th rowSpan={marksCols > 0 ? 2 : 1} className={`${cell} w-[30%] font-bold`}>
              البيان
            </th>
            {marksCols > 0 && (
              <th colSpan={marksCols} className={`${cell} font-bold`}>
                الدرجة الكلية
              </th>
            )}
            <th rowSpan={marksCols > 0 ? 2 : 1} className={`${cell} font-bold`}>
              درجة الطالب
            </th>
            <th rowSpan={marksCols > 0 ? 2 : 1} className={`${cell} w-[20%] font-bold`}>
              ملاحظات
            </th>
          </tr>
          {marksCols > 0 && (
            <tr>
              {options.showMax && <th className={`${cell} font-bold`}>نهاية كبرى</th>}
              {options.showMin && <th className={`${cell} font-bold`}>نهاية صغرى</th>}
            </tr>
          )}
        </thead>
        <tbody>
          {inTotal.map(subjectRow)}
          <tr className="bg-slate-200 font-bold">
            <td className={label}>المجموع</td>
            {options.showMax && <td className={cell}>{formatDegree(totals.max)}</td>}
            {options.showMin && <td className={cell}>{formatDegree(totals.min)}</td>}
            <td className={cell}>{totals.hasScore ? formatDegree(totals.score) : ""}</td>
            <td className={cell} />
          </tr>
          {outside.map(subjectRow)}
        </tbody>
      </table>

      <div className="space-y-2.5 text-[1.05em] font-semibold">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-2">
          <span>وقد استخرج هذا البيان بعد سداد الرسوم المقررة</span>
          <Field studentId={id} name="feeJ" minChars={6} />
          <span>ج بالحوالة البريدية رقم /</span>
          <Field studentId={id} name="postal" minChars={16} />
        </p>
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-2">
          <span>بتاريخ :</span>
          <Field studentId={id} name="date" fallback="   /   / 20" minChars={12} />
          <span>م بناء على طلبه لتقديمها الى :</span>
          <Field studentId={id} name="submitTo" minChars={24} />
        </p>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span>تحريرا في :</span>
          <Field studentId={id} name="writtenOn" fallback="   /   / 20" minChars={12} />
          <span>م</span>
        </p>
      </div>

      <SignatureBlock signatures={signatures} plain />
    </div>
  );
}

// One student's degrees certificate. The header names the directorate and the education
// administration of the student's school (إضافة مدرسة → الإدارة). The subjects run across (one
// column each), with rows for النهاية الكبرى, النهاية الصغرى and الدرجة.
function Certificate({
  student,
  options,
  signatures,
}: {
  student: CertificateStudent;
  options: CertificateOptions;
  signatures: Signatures;
}) {
  const { settings } = useSettings();
  const { t } = useUiControl();
  const adminLine = useAdminLine(student.school);
  const adminPrefix = t("print.adminPrefix");
  const totals = degreeTotals(student.grades);
  const status = passStatus(totals.percentage);
  const cell = "border border-slate-400 px-1.5 py-1 text-center";
  const label = `${cell} whitespace-nowrap bg-slate-100 text-start font-semibold`;
  const { inTotal, outside } = splitByOutside(student.grades, (g) => Boolean(g.outside_total));
  const columns: CertColumn[] = [
    ...inTotal.map((grade) => ({ kind: "subject" as const, grade })),
    { kind: "total" },
    ...outside.map((grade) => ({ kind: "subject" as const, grade })),
  ];
  const row = (title: string, subjectValue: (g: StudentGrade) => string, totalValue: string, bold = false) => (
    <tr className={bold ? "font-bold" : ""}>
      <td className={label}>{title}</td>
      {columns.map((c) =>
        c.kind === "total" ? (
          <td key="total" className={`${cell} bg-slate-100 font-bold`}>
            {totalValue}
          </td>
        ) : (
          <td key={c.grade.subject_id} className={cell}>
            {subjectValue(c.grade)}
          </td>
        )
      )}
    </tr>
  );

  return (
    <div className="space-y-3">
      <PrintSheetHeader
        title={options.title}
        showDate={options.showDate}
        dateOnLeft
        lines={
          <>
            <p className="font-bold">{t("print.directorate")}</p>
            <p className="font-bold">{adminLine || `${adminPrefix} —`}</p>
          </>
        }
      />

      {/* The student on the right, the school and placement on the left. */}
      <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-1">
        <span className="text-slate-500">الاسم</span>
        <span className="font-bold">{student.name}</span>
        <span className="text-slate-500">المدرسة</span>
        <span className="font-medium">{student.school || "—"}</span>
        <span className="text-slate-500">الرقم القومى</span>
        <span className="font-medium">{student.national_id || "—"}</span>
        <span className="text-slate-500">المرحلة</span>
        <span className="font-medium">{student.division || "—"}</span>
        <span className="text-slate-500">العام الدراسي</span>
        <span className="font-medium">{settings.academic_year || "—"}</span>
        <span className="text-slate-500">الصف</span>
        <span className="font-medium">{student.section || "—"}</span>
        {options.showMoeCode && (
          <>
            <span className="text-slate-500">كود الحكومة الالكترونية</span>
            <span className="col-span-3 font-medium">{formatMoeCode(student.moe_code) || "—"}</span>
          </>
        )}
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-200">
            <th className={label}>المادة</th>
            {columns.map((c) =>
              c.kind === "total" ? (
                <th key="total" className={`${cell} bg-slate-300 font-bold`}>
                  المجموع
                </th>
              ) : (
                <th key={c.grade.subject_id} className={`${cell} font-semibold`}>
                  {c.grade.subject_name}
                  {c.grade.outside_total ? (
                    <span className="block text-[0.75em] font-normal text-slate-500">خارج المجموع</span>
                  ) : null}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {options.showMax && row("النهاية الكبرى", (g) => formatDegree(g.max_degree), formatDegree(totals.max))}
          {options.showMin && row("النهاية الصغرى", (g) => formatDegree(g.min_degree), formatDegree(totals.min))}
          {row("الدرجة", (g) => formatDegree(g.score), totals.hasScore ? formatDegree(totals.score) : "", true)}
        </tbody>
      </table>

      {(options.showPercentage || options.showStatus) && (
        <div className="flex flex-wrap gap-x-10 gap-y-1 text-[1.1em]">
          {options.showPercentage && (
            <span>
              النسبة المئوية: <span className="font-bold">{formatPercentage(totals.percentage) || "—"}</span>
            </span>
          )}
          {options.showStatus && (
            <span>
              الحالة: <span className={`font-bold ${statusTextClass(status)}`}>{status ?? "—"}</span>
            </span>
          )}
        </div>
      )}

      <SignatureBlock signatures={signatures} />
    </div>
  );
}

// Print preview of one or more students' degrees certificates, with options like the Students
// print: which students, which rows, layout, and one certificate per page or one after another.
// A student in a stage with an official form (الإعدادية، الصف الأول والثاني الثانوي) gets that form
// (lib/certificateForms.ts); the others get the app's own certificate.
export default function StudentCertificateModal({
  students,
  onClose,
}: {
  students: CertificateStudent[];
  onClose: () => void;
}) {
  const { t } = useUiControl();
  const [included, setIncluded] = useState<Set<number>>(() => new Set(students.map((s) => s.id)));
  const [options, setOptions] = useState<CertificateOptions>(() => ({
    title: t("print.certificateTitle"),
    showMax: true,
    showMin: true,
    showPercentage: true,
    showStatus: true,
    showDate: true,
    showMoeCode: false,
  }));
  const [useForms, setUseForms] = useState(true);
  const signatures = useSignatures(true);
  const secondarySignatures = useSignatures(true, { key: "form-secondary", defaults: FORM_SIGNATURES.secondary });
  const prepSignatures = useSignatures(true, { key: "form-prep", defaults: FORM_SIGNATURES.prep });
  const formOf = (s: CertificateStudent): CertificateForm =>
    useForms ? certificateFormFor(s.division, s.section) : { kind: "generic", gradeLabel: "", order: [] };
  // The prep form is portrait on paper; the secondary forms and the app's certificate are landscape.
  const [orientation, setOrientation] = useState<Orientation>(() =>
    students.every((s) => certificateFormFor(s.division, s.section).kind === "prep") ? "portrait" : "landscape"
  );
  const [fontSize, setFontSize] = useState(12);
  const [pagePerStudent, setPagePerStudent] = useState(true);
  const [typed, setTyped] = useState<FieldsState["typed"]>({});
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(loadHiddenFields);

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_FIELDS_KEY, JSON.stringify([...hiddenFields]));
    } catch {
      // ignore storage failures
    }
  }, [hiddenFields]);

  const printed = students.filter((s) => included.has(s.id));
  const kinds = new Set(printed.map((s) => formOf(s).kind));
  const setOption = (key: keyof CertificateOptions) => (value: boolean) => setOptions((o) => ({ ...o, [key]: value }));
  const fieldsContext = {
    state: {
      typed,
      saved: Object.fromEntries(students.map((s) => [s.id, parseFormFields(s.form_fields)])),
      hidden: hiddenFields,
    },
    setTyped: (studentId: number, key: FieldKey, value: string) =>
      setTyped((t) => ({ ...t, [studentId]: { ...t[studentId], [key]: value } })),
  };
  const formFields = STUDENT_FORM_FIELDS.filter((f) => FORM_FIELD_KINDS[f.key].some((k) => kinds.has(k)));
  // Ticking or unticking a field drops what was typed for it on the sheets.
  const toggleField = (key: string, on: boolean) => {
    setHiddenFields((prev) => {
      const next = new Set(prev);
      if (on) next.delete(key);
      else next.add(key);
      return next;
    });
    setTyped((t) =>
      Object.fromEntries(
        Object.entries(t).map(([id, values]) => {
          const { [key as FieldKey]: _dropped, ...rest } = values;
          return [id, rest];
        })
      )
    );
  };

  const optionsPanel = (
    <>
      <OptionSection label="النموذج">
        <OptionCheckbox label="النموذج الرسمي لكل مرحلة" checked={useForms} onChange={setUseForms} />
        <p className="px-1.5 text-[11px] leading-5 text-slate-400">
          الإعدادي، الصف الأول الثانوي، والصف الثاني الثانوي (علمي / أدبي) تُطبع على نموذج الإدارة. باقي المراحل على الشهادة العامة.
        </p>
      </OptionSection>

      {kinds.has("generic") && <TitleOption value={options.title} onChange={(title) => setOptions((o) => ({ ...o, title }))} />}

      {formFields.length > 0 && (
        <OptionSection
          label="بيانات النموذج"
          actions={
            <>
              <button onClick={() => formFields.forEach((f) => toggleField(f.key, true))} className="hover:underline">
                الكل
              </button>
              <button onClick={() => formFields.forEach((f) => toggleField(f.key, false))} className="hover:underline">
                مسح
              </button>
            </>
          }
        >
          <p className="px-1.5 text-[11px] leading-5 text-slate-400">
            من بيانات الطالب (البيانات الأساسية ← بيانات بيان النجاح). غير المحدد يُطبع سطرًا فارغًا. يمكن أيضًا الكتابة مباشرة في
            المعاينة.
          </p>
          {formFields.map((f) => (
            <OptionCheckbox key={f.key} label={f.label} checked={!hiddenFields.has(f.key)} onChange={(on) => toggleField(f.key, on)} />
          ))}
        </OptionSection>
      )}

      {students.length > 1 && (
        <OptionSection
          label={`الطلاب (${printed.length} من ${students.length})`}
          actions={
            <>
              <button onClick={() => setIncluded(new Set(students.map((s) => s.id)))} className="hover:underline">
                الكل
              </button>
              <button onClick={() => setIncluded(new Set())} className="hover:underline">
                مسح
              </button>
            </>
          }
        >
          <div className="max-h-56 overflow-y-auto">
            {students.map((s) => (
              <OptionCheckbox
                key={s.id}
                label={s.name}
                checked={included.has(s.id)}
                onChange={(on) =>
                  setIncluded((prev) => {
                    const next = new Set(prev);
                    if (on) next.add(s.id);
                    else next.delete(s.id);
                    return next;
                  })
                }
              />
            ))}
          </div>
        </OptionSection>
      )}

      <OptionSection label="المحتوى">
        <OptionCheckbox label="صف النهاية الكبرى" checked={options.showMax} onChange={setOption("showMax")} />
        <OptionCheckbox label="صف النهاية الصغرى" checked={options.showMin} onChange={setOption("showMin")} />
        {kinds.has("generic") && (
          <>
            <OptionCheckbox label="النسبة المئوية" checked={options.showPercentage} onChange={setOption("showPercentage")} />
            <OptionCheckbox label="الحالة (ناجح / راسب)" checked={options.showStatus} onChange={setOption("showStatus")} />
            <OptionCheckbox label="تاريخ الطباعة" checked={options.showDate} onChange={setOption("showDate")} />
            <OptionCheckbox label="كود الحكومة الالكترونية" checked={options.showMoeCode} onChange={setOption("showMoeCode")} />
          </>
        )}
      </OptionSection>

      {kinds.has("generic") && (
        <SignatureOptions signatures={signatures} label={kinds.size > 1 ? "التوقيعات (الشهادة العامة)" : "التوقيعات"} />
      )}
      {kinds.has("secondary") && <SignatureOptions signatures={secondarySignatures} label="التوقيعات (نموذج الثانوي)" />}
      {kinds.has("prep") && <SignatureOptions signatures={prepSignatures} label="التوقيعات (نموذج الإعدادي)" />}

      <LayoutOptions orientation={orientation} onOrientation={setOrientation} fontSize={fontSize} onFontSize={setFontSize}>
        <OptionCheckbox label="كل شهادة في صفحة" checked={pagePerStudent} onChange={setPagePerStudent} />
      </LayoutOptions>
    </>
  );

  // A plain function, not a component, so typing in a sheet doesn't remount it.
  const renderForm = (student: CertificateStudent, form: CertificateForm) =>
    form.kind === "secondary" ? (
      <SecondaryForm student={student} form={form} options={options} signatures={secondarySignatures} />
    ) : form.kind === "prep" ? (
      <PrepForm student={student} form={form} options={options} signatures={prepSignatures} />
    ) : (
      <Certificate student={student} options={options} signatures={signatures} />
    );

  return (
    <FieldsContext.Provider value={fieldsContext}>
    <PrintModalShell
      heading={`${options.title}${students.length > 1 ? ` (${printed.length})` : ""}`}
      orientation={orientation}
      fontSize={fontSize}
      canPrint={printed.length > 0}
      onClose={onClose}
      options={optionsPanel}
    >
      {printed.length === 0 && <p className="py-10 text-center text-slate-400">اختر طالبًا واحدًا على الأقل.</p>}
      {printed.map((s, i) => (
        <div
          key={s.id}
          className={`certificate-block ${pagePerStudent ? "certificate-page" : ""} ${
            // In the preview a dashed line marks where the next page starts; it isn't printed.
            i > 0 ? (pagePerStudent ? "mt-8 border-t-2 border-dashed border-slate-300 pt-8 print:mt-0 print:border-0 print:pt-0" : "mt-8 border-t border-slate-300 pt-6") : ""
          }`}
        >
          {renderForm(s, formOf(s))}
        </div>
      ))}
    </PrintModalShell>
    </FieldsContext.Provider>
  );
}
