import { useState } from "react";
import { useSchools } from "../context/SchoolsContext";
import { useSettings } from "../context/SettingsContext";
import { degreeTotals, formatDegree, formatPercentage, passStatus, splitByOutside, statusTextClass } from "../lib/degrees";
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
  const { schools } = useSchools();
  const { t } = useUiControl();
  const school = schools.find((s) => s.name.trim() === student.school?.trim());
  const adminName = school?.education_admin_name?.trim() || school?.directorate?.trim() || "";
  const adminPrefix = t("print.adminPrefix");
  // Administrations are often named "إدارة …" / "ادارة …" already; don't print the word twice.
  const adminLine =
    adminName && !normalizeAlef(adminName).startsWith(normalizeAlef(adminPrefix)) ? `${adminPrefix} ${adminName}` : adminName;
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
  const signatures = useSignatures(true);
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [fontSize, setFontSize] = useState(12);
  const [pagePerStudent, setPagePerStudent] = useState(true);

  const printed = students.filter((s) => included.has(s.id));
  const setOption = (key: keyof CertificateOptions) => (value: boolean) => setOptions((o) => ({ ...o, [key]: value }));

  const optionsPanel = (
    <>
      <TitleOption value={options.title} onChange={(title) => setOptions((o) => ({ ...o, title }))} />

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
        <OptionCheckbox label="النسبة المئوية" checked={options.showPercentage} onChange={setOption("showPercentage")} />
        <OptionCheckbox label="الحالة (ناجح / راسب)" checked={options.showStatus} onChange={setOption("showStatus")} />
        <OptionCheckbox label="تاريخ الطباعة" checked={options.showDate} onChange={setOption("showDate")} />
        <OptionCheckbox label="كود الحكومة الالكترونية" checked={options.showMoeCode} onChange={setOption("showMoeCode")} />
      </OptionSection>

      <SignatureOptions signatures={signatures} />

      <LayoutOptions orientation={orientation} onOrientation={setOrientation} fontSize={fontSize} onFontSize={setFontSize}>
        <OptionCheckbox label="كل شهادة في صفحة" checked={pagePerStudent} onChange={setPagePerStudent} />
      </LayoutOptions>
    </>
  );

  return (
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
          <Certificate student={s} options={options} signatures={signatures} />
        </div>
      ))}
    </PrintModalShell>
  );
}
