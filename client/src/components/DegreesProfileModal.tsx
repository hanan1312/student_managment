import {
  cloneElement,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
  type ThHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { ClipboardList, FileText, Printer, Search, Settings2, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { levelAndDescendants, useClasses } from "../context/ClassesContext";
import { api, ApiError } from "../lib/api";
import {
  FAIL_LABEL,
  PASS_LABEL,
  degreeTotals,
  formatDegree,
  formatPercentage,
  marksText,
  passStatus,
  sharedTotalMarks,
  splitByOutside,
  statusBadgeClass,
  subjectInScope,
} from "../lib/degrees";
import { formatMoeCode } from "../lib/studentColumns";
import type { DegreesOverviewStudent, StudentGrade, SubjectDegrees } from "../lib/types";
import DegreesTablePrintModal from "./DegreesTablePrintModal";
import { useSettings } from "../context/SettingsContext";
import { DEGREES_INFO_FIELDS } from "../lib/degreesColumns";
import { ageReferenceDate } from "../lib/studentAge";
import ManageColumnsModal from "./ManageColumnsModal";
import CsvImportModal, { type ImportColumn } from "./CsvImportModal";
import ImportExportButtons from "./ImportExportButtons";
import { downloadExcel } from "../lib/excel";
import { sameName, toNumber } from "../lib/importValues";
import StudentCertificateModal, { type CertificateStudent } from "./StudentCertificateModal";
import StudentDegreesEditor from "./StudentDegreesEditor";
import { useColumnOrder, orderedCells } from "../lib/useColumnOrder";

function matches(s: DegreesOverviewStudent, q: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [s.name, s.national_id, s.moe_code, s.division, s.section, s.school, String(s.seq_no)].some((v) =>
    v?.toLowerCase().includes(needle)
  );
}

// الحالة filter: ناجح / راسب, or students with no degree yet.
type StatusFilter = "" | "pass" | "fail" | "none";

const STATUS_FILTER_LABELS: Record<Exclude<StatusFilter, "">, string> = {
  pass: "ناجح",
  fail: "راسب",
  none: "بدون درجات",
};

function statusMatches(status: string | null, filter: StatusFilter) {
  if (filter === "") return true;
  if (filter === "pass") return status === PASS_LABEL;
  if (filter === "fail") return status === FAIL_LABEL;
  return status === null;
}

// Columns switched with الأعمدة, remembered in this browser: a usual column listed here is hidden,
// an extra student-data column (DEGREES_INFO_FIELDS `extra`) listed here is shown. The subject
// columns are one switch, "subjects": on, the subjects of the students shown all show.
const HIDDEN_COLUMNS_KEY = "degrees-profile-hidden-columns";
const EXTRA_COLUMNS = new Set(DEGREES_INFO_FIELDS.filter((f) => f.extra).map((f) => f.key));

function loadHiddenColumns(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(HIDDEN_COLUMNS_KEY) ?? "[]") as unknown;
    // Subjects used to be switched one by one ("subject:<id>"); those choices are dropped.
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((k): k is string => typeof k === "string" && !k.startsWith("subject:"))
        : []
    );
  } catch {
    return new Set();
  }
}

const COLUMN_LABELS: Record<string, string> = {
  ...Object.fromEntries(DEGREES_INFO_FIELDS.map((f) => [f.key, f.label])),
  total: "مجموع الدرجات",
  percent: "النسبة المئوية",
  status: "الحالة",
};

// The same columns' keys in DegreesTablePrintModal.
const toPrintKey = (key: string) =>
  key.startsWith("subject:") ? `subject-${key.slice(8)}` : key === "total" ? "score" : key === "percent" ? "percentage" : key;

// Imported degrees: one student's row. Students are found by الرقم القومي, then كود الحكومة
// الالكترونية, then their name (when only one student has it).
type DegreesImport = { studentId: number; grades: { subjectId: number; score: number }[] };

const digits = (v: string | null | undefined) => (v ?? "").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, "");

function findStudent(students: DegreesOverviewStudent[], raw: Record<string, string>) {
  const nationalId = digits(raw.national_id);
  if (nationalId) {
    const found = students.find((s) => digits(s.national_id) === nationalId);
    if (found) return found;
  }
  const moeCode = digits(raw.moe_code);
  if (moeCode) {
    const found = students.find((s) => digits(s.moe_code) === moeCode);
    if (found) return found;
  }
  const byName = students.filter((s) => sameName(s.name, raw.name));
  if (byName.length > 1) return `${byName.length} طلاب بهذا الاسم: اكتب الرقم القومي أو كود الحكومة الالكترونية`;
  return byName[0] ?? null;
}

export default function DegreesProfileModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const [subjects, setSubjects] = useState<SubjectDegrees[]>([]);
  const [students, setStudents] = useState<DegreesOverviewStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { tree, selection } = useClasses();
  const [query, setQuery] = useState("");
  // المراحل filter: a whole stage ("s:<id>") or any item in it, with what's nested under it ("l:<id>").
  // It starts on what's selected in the الهيكل tree.
  const [scope, setScope] = useState(() => {
    if (selection.type === "level") return `l:${selection.levelId}`;
    if (selection.type === "stage") {
      const stage = tree.find((s) => s.stage === selection.stage);
      return stage ? `s:${stage.id}` : "";
    }
    return "";
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [printingCertificates, setPrintingCertificates] = useState<CertificateStudent[] | null>(null);
  const [printingTable, setPrintingTable] = useState(false);
  const [editing, setEditing] = useState<DegreesOverviewStudent | null>(null);
  const { settings } = useSettings();
  const ageRef = ageReferenceDate(settings.academic_year);
  const [switchedColumns, setSwitchedColumns] = useState<Set<string>>(loadHiddenColumns);
  const [manageColumnsOpen, setManageColumnsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify([...switchedColumns]));
    } catch {
      // Storage unavailable: the choice just isn't remembered.
    }
  }, [switchedColumns]);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDegreesOverview(token);
      setSubjects(res.subjects);
      setStudents(res.students);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذر تحميل الدرجات.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // The levels the المراحل filter covers (null = everything) and its label.
  const scopeInfo = useMemo(() => {
    const [kind, rawId] = scope.split(":");
    const id = Number(rawId);
    for (const stage of tree) {
      if (kind === "s" && stage.id === id) {
        return { levelIds: new Set(stage.levels.map((l) => l.id)), label: stage.stage };
      }
      const level = kind === "l" ? stage.levels.find((l) => l.id === id) : undefined;
      if (level) {
        return {
          levelIds: new Set(levelAndDescendants(stage.levels, id).map((l) => l.id)),
          label: `${stage.stage} / ${level.path}`,
        };
      }
    }
    return { levelIds: null, label: "كل المراحل" };
  }, [scope, tree]);

  const rows = useMemo(
    () => students.map((student) => ({ student, totals: degreeTotals(student.grades) })),
    [students]
  );
  const filteredRows = useMemo(
    () =>
      rows.filter(
        ({ student, totals }) =>
          (!scopeInfo.levelIds || (student.level_id !== null && scopeInfo.levelIds.has(student.level_id))) &&
          statusMatches(passStatus(totals.percentage), statusFilter) &&
          matches(student, query.trim())
      ),
    [rows, scopeInfo, statusFilter, query]
  );
  const filtered = useMemo(() => filteredRows.map((r) => r.student), [filteredRows]);
  // The subject columns are the subjects linked (in المواد) to the sections of the students shown,
  // so e.g. a stage whose students are all in one track gets only that track's subjects. With no
  // placed student in view, the subjects of the chosen part of the tree.
  const columnLevelIds = useMemo(() => {
    const placed = new Set(filtered.flatMap((s) => (s.level_id === null ? [] : [s.level_id])));
    return placed.size > 0 ? placed : scopeInfo.levelIds;
  }, [filtered, scopeInfo]);
  const visibleSubjects = useMemo(
    () =>
      columnLevelIds ? subjects.filter((s) => s.level_marks.some((m) => columnLevelIds.has(m.level_id))) : subjects,
    [subjects, columnLevelIds]
  );
  // Per subject over the sections in view: its marks (صغرى / كبرى, when the same everywhere) and
  // whether it's خارج المجموع. Subjects in the total come first, then مجموع الدرجات, then the
  // subjects خارج المجموع.
  const subjectInfo = useMemo(
    () => new Map(visibleSubjects.map((s) => [s.id, subjectInScope(s, columnLevelIds)])),
    [visibleSubjects, columnLevelIds]
  );
  const { inTotal, outside } = useMemo(
    () => splitByOutside(visibleSubjects, (s) => subjectInfo.get(s.id)!.outside),
    [visibleSubjects, subjectInfo]
  );
  const totalMarks = useMemo(() => sharedTotalMarks(filteredRows.map((r) => r.totals)), [filteredRows]);
  const columnKeys = useMemo(
    () => [
      ...DEGREES_INFO_FIELDS.map((f) => f.key),
      ...inTotal.map((s) => `subject:${s.id}`),
      "total",
      ...outside.map((s) => `subject:${s.id}`),
      "percent",
      "status",
    ],
    [inTotal, outside]
  );
  const shownColumnKeys = useMemo(
    () =>
      columnKeys.filter((k) =>
        k.startsWith("subject:") ? !switchedColumns.has("subjects") : EXTRA_COLUMNS.has(k) === switchedColumns.has(k)
      ),
    [columnKeys, switchedColumns]
  );
  const columns = useColumnOrder("degrees-profile", shownColumnKeys);

  // Certificates print for the ticked students that are in the current view.
  const selectedInView = filtered.filter((s) => selectedIds.has(s.id));
  const allInViewSelected = filtered.length > 0 && selectedInView.length === filtered.length;
  const toggleAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((s) => (allInViewSelected ? next.delete(s.id) : next.add(s.id)));
      return next;
    });
  const toggleOne = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const th = "whitespace-nowrap border-b border-slate-200 px-3 py-2";
  const td = "whitespace-nowrap border-slate-200 px-3 py-2";

  const subjectHeader = (s: SubjectDegrees) => {
    const info = subjectInfo.get(s.id)!;
    return (
      <th key={s.id} {...columns.headerProps(`subject:${s.id}`)} className={`${th} border-s text-center`}>
        {s.name}
        {info.marks && <span className="block text-[10px] font-normal text-slate-400">{info.marks}</span>}
        {info.outside && <span className="block text-[10px] font-normal text-slate-400">خارج المجموع</span>}
      </th>
    );
  };

  const subjectCell = (s: SubjectDegrees, g: StudentGrade | undefined) =>
    g ? (
      <td key={s.id} className={`${td} border-s text-center text-slate-700`} title={`النهايات: ${marksText(g.min_degree, g.max_degree)}`}>
        {formatDegree(g.score)}
      </td>
    ) : (
      <td key={s.id} className={`${td} border-s bg-slate-50 text-center text-slate-300`} title="لا تُدرّس في صف هذا الطالب">
        —
      </td>
    );
  // The columns shown, plus the checkbox, م and the print button.
  const colCount = columns.order.length + 3;
  const subjectById = new Map(visibleSubjects.map((s) => [s.id, s]));
  const headers: Record<string, ReactNode> = {
    ...Object.fromEntries(DEGREES_INFO_FIELDS.map((f) => [f.key, <th key={f.key} className={`${th} text-start`}>{f.label}</th>])),
    total: (
      <th className={`${th} border-s bg-brand-50 text-center text-brand-700`}>
        مجموع الدرجات
        {totalMarks && <span className="block text-[10px] font-normal text-brand-600/70">{totalMarks}</span>}
      </th>
    ),
    percent: <th className={`${th} border-s bg-brand-50 text-center text-brand-700`}>%</th>,
    status: <th className={`${th} border-s text-center`}>الحالة</th>,
  };
  // Every header but the checkbox, م and the print button can be dragged to another place.
  const header = (key: string) => {
    if (key.startsWith("subject:")) return subjectHeader(subjectById.get(Number(key.slice(8)))!);
    const el = headers[key] as ReactElement<ThHTMLAttributes<HTMLTableCellElement>>;
    return cloneElement(el, { key, ...columns.headerProps(key) });
  };
  // تصدير: the table as shown (its rows, columns and column order) to Excel.
  const columnLabel = (key: string) =>
    key.startsWith("subject:") ? subjectById.get(Number(key.slice(8)))?.name ?? key : COLUMN_LABELS[key] ?? key;
  const handleExport = () => {
    const infoByKey = new Map(DEGREES_INFO_FIELDS.map((f) => [f.key, f]));
    const cell = (key: string, st: DegreesOverviewStudent, totals: (typeof filteredRows)[number]["totals"]) => {
      const info = infoByKey.get(key);
      if (info) return info.get(st, ageRef);
      if (key.startsWith("subject:")) {
        const g = st.grades.find((x) => x.subject_id === Number(key.slice(8)));
        return g?.score ?? "";
      }
      if (key === "total") return totals.hasScore ? totals.score : "";
      if (key === "percent") return formatPercentage(totals.percentage);
      if (key === "status") return passStatus(totals.percentage) ?? "";
      return "";
    };
    downloadExcel(
      "degrees.xlsx",
      columns.order.map(columnLabel),
      filteredRows.map(({ student, totals }) =>
        Object.fromEntries(columns.order.map((key) => [columnLabel(key), cell(key, student, totals)]))
      )
    );
  };

  // استيراد: the identifying columns plus one column per subject (by its name). Other columns,
  // e.g. the totals of an exported file, are ignored.
  // The template lists the subjects shown; the others are still read when the file has them.
  const templateSubjects = visibleSubjects.length > 0 ? visibleSubjects : subjects;
  const importColumns: ImportColumn[] = [
    { key: "national_id", label: "الرقم القومي", example: "28812131900228", aliases: ["National ID"] },
    { key: "moe_code", label: "كود الحكومة الالكترونية", aliases: ["كود الوزارة"] },
    { key: "name", label: "الاسم", example: "اسم الطالب", aliases: ["اسم الطالب", "Name"] },
    ...subjects.map((s) => ({ key: `subject:${s.id}`, label: s.name, hidden: !templateSubjects.includes(s) })),
  ];
  const mapImportRow = (raw: Record<string, string>): { input?: DegreesImport; error?: string; warning?: string } => {
    const student = findStudent(students, raw);
    if (typeof student === "string") return { error: student };
    if (!student) return { error: "الطالب غير موجود (بالرقم القومي أو كود الحكومة أو الاسم)" };
    const grades: DegreesImport["grades"] = [];
    const skipped: string[] = [];
    for (const [key, value] of Object.entries(raw)) {
      if (!key.startsWith("subject:") || !value.trim() || /^[-—–]+$/.test(value.trim())) continue;
      const subjectId = Number(key.slice(8));
      const name = subjects.find((s) => s.id === subjectId)?.name ?? "";
      const score = toNumber(value);
      if (score === null || score < 0) return { error: `${name}: "${value}" ليست درجة صحيحة` };
      const grade = student.grades.find((g) => g.subject_id === subjectId);
      if (!grade) {
        skipped.push(name);
        continue;
      }
      if (grade.max_degree !== null && score > grade.max_degree) {
        return { error: `${name}: ${score} أكبر من النهاية الكبرى (${grade.max_degree})` };
      }
      grades.push({ subjectId, score });
    }
    if (grades.length === 0) return { error: "لا توجد درجات لمواد هذا الطالب" };
    return {
      input: { studentId: student.id, grades },
      warning: [`${student.name}`, skipped.length ? `مواد ليست لصفه تُركت: ${skipped.join("، ")}` : null]
        .filter(Boolean)
        .join(" · "),
    };
  };

  const selectCls =
    "rounded-lg border border-white/10 bg-white py-1.5 ps-2 pe-7 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-gold-400/40";

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex bg-ink-950/60 backdrop-blur-sm">
      <div className="animate-rise-in relative flex h-full w-full flex-col overflow-hidden bg-slate-50 shadow-2xl">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-ink-900 via-brand-700 to-ink-900 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-gold-300 ring-1 ring-white/15">
              <ClipboardList size={20} />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-white">ملف الدرجات</h2>
              <p className="text-xs text-white/50">
                {filtered.length} من {students.length} طالب
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={scope} onChange={(e) => setScope(e.target.value)} className={selectCls} title="المراحل">
              <option value="">كل المراحل</option>
              {tree.map((stage) => (
                <optgroup key={stage.id} label={stage.stage}>
                  <option value={`s:${stage.id}`}>{stage.stage} (كل المرحلة)</option>
                  {stage.levels.map((level) => (
                    <option key={level.id} value={`l:${level.id}`}>
                      {"  ".repeat(level.depth + 1)}
                      {level.level}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className={selectCls}
              title="الحالة"
            >
              <option value="">كل الحالات</option>
              {(Object.keys(STATUS_FILTER_LABELS) as Exclude<StatusFilter, "">[]).map((key) => (
                <option key={key} value={key}>
                  {STATUS_FILTER_LABELS[key]}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="بحث بالاسم، الرقم القومي، كود الحكومة الالكترونية، المرحلة…"
                className="w-72 rounded-lg border border-white/10 bg-white py-1.5 ps-8 pe-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-gold-400/40"
              />
            </div>
            {selectedInView.length > 0 && (
              <button
                onClick={() => setPrintingCertificates(selectedInView)}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
              >
                <FileText size={14} />
                طباعة الشهادات ({selectedInView.length})
              </button>
            )}
            <ImportExportButtons
              tone="dark"
              onImport={() => setImportOpen(true)}
              onExport={handleExport}
              exportDisabled={filtered.length === 0}
            />
            <button
              onClick={() => setManageColumnsOpen(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
              title="اختيار الأعمدة المعروضة والمطبوعة"
            >
              <Settings2 size={14} />
              الأعمدة
            </button>
            <button
              onClick={() => setPrintingTable(true)}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              title="طباعة صفوف الجدول المعروضة"
            >
              <Printer size={14} />
              طباعة الكل
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3">
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm font-bold">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-bold text-slate-500">
                <tr>
                  <th className={th}>
                    <input
                      type="checkbox"
                      checked={allInViewSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = !allInViewSelected && selectedInView.length > 0;
                      }}
                      onChange={toggleAll}
                      disabled={filtered.length === 0}
                      className="h-3.5 w-3.5 accent-brand-600"
                      title="تحديد الكل"
                    />
                  </th>
                  <th className={`${th} text-start`}>م</th>
                  {columns.order.map(header)}
                  <th className={`${th} border-s`} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={colCount} className="px-3 py-10 text-center text-slate-400">
                      جارٍ التحميل…
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="px-3 py-10 text-center text-slate-400">
                      لا يوجد طلاب مطابقون.
                    </td>
                  </tr>
                )}
                {!loading &&
                  filteredRows.map(({ student: st, totals }) => {
                    const bySubject = new Map(st.grades.map((g) => [g.subject_id, g]));
                    const status = passStatus(totals.percentage);
                    return (
                      <tr
                        key={st.id}
                        onClick={() => setEditing(st)}
                        className={`cursor-pointer hover:bg-brand-50/40 ${selectedIds.has(st.id) ? "bg-brand-50/40" : ""}`}
                        title="تعديل الدرجات"
                      >
                        <td className={td} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(st.id)}
                            onChange={() => toggleOne(st.id)}
                            className="h-3.5 w-3.5 accent-brand-600"
                          />
                        </td>
                        <td className={`${td} text-slate-400`}>{st.seq_no}</td>
                        {orderedCells(columns.order, {
                          ...Object.fromEntries(
                            DEGREES_INFO_FIELDS.map((f) => [
                              f.key,
                              <td key={f.key} className={`${td} ${f.key === "name" ? "text-base text-slate-800" : "text-slate-600"}`}>
                                {f.get(st, ageRef)}
                              </td>,
                            ])
                          ),
                          ...Object.fromEntries(
                            visibleSubjects.map((s) => [`subject:${s.id}`, subjectCell(s, bySubject.get(s.id))])
                          ),
                          total: (
                            <td className={`${td} border-s bg-brand-50/40 text-center font-bold`}>
                              {totals.hasScore ? formatDegree(totals.score) : ""}
                            </td>
                          ),
                          percent: (
                            <td className={`${td} border-s bg-brand-50/40 text-center font-bold text-brand-700`}>
                              {formatPercentage(totals.percentage)}
                            </td>
                          ),
                          status: (
                            <td className={`${td} border-s text-center`}>
                              {status && (
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusBadgeClass(status)}`}>
                                  {status}
                                </span>
                              )}
                            </td>
                          ),
                        })}
                        <td className={`${td} border-s`}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPrintingCertificates([st]);
                            }}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                            title="طباعة شهادة الطالب"
                          >
                            <Printer size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing &&
        createPortal(
          <div className="animate-fade-in fixed inset-0 z-40 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
            <div className="animate-rise-in flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-800">{editing.name}</h3>
                  <p className="text-xs text-slate-400">
                    {[editing.division, editing.section, formatMoeCode(editing.moe_code)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-y-auto px-5 py-4">
                <StudentDegreesEditor key={editing.id} student={editing} onSaved={load} />
              </div>
            </div>
          </div>,
          document.body
        )}

      {importOpen &&
        createPortal(
          <CsvImportModal<DegreesImport>
            title="استيراد الدرجات"
            description="صف لكل طالب: الرقم القومي (أو كود الحكومة الالكترونية أو الاسم) وعمود لكل مادة باسمها. الخانة الفارغة لا تغيّر الدرجة الموجودة. يمكن استيراد ملف مُصدَّر من هنا مباشرة."
            templateFilename="degrees-template.csv"
            columns={importColumns}
            mapRow={mapImportRow}
            onImportRow={({ studentId, grades }) =>
              api
                .saveStudentGrades(
                  token!,
                  studentId,
                  grades.map((g) => ({ ...g, scoreMin: null }))
                )
                .then(() => {})
            }
            onClose={() => setImportOpen(false)}
            onFinished={load}
          />,
          document.body
        )}

      {manageColumnsOpen && (
        <ManageColumnsModal
          // The subject columns are one checkbox, in the place of the first subject.
          columns={columnKeys.flatMap((key) =>
            !key.startsWith("subject:")
              ? [{ key, label: COLUMN_LABELS[key] ?? key }]
              : key === columnKeys.find((k) => k.startsWith("subject:"))
                ? [{ key: "subjects", label: `المواد (${visibleSubjects.length})` }]
                : []
          )}
          visible={new Set([...shownColumnKeys, ...(switchedColumns.has("subjects") ? [] : ["subjects"])])}
          onToggle={(key) =>
            setSwitchedColumns((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })
          }
          onReset={() => setSwitchedColumns(new Set())}
          onClose={() => setManageColumnsOpen(false)}
        />
      )}

      {printingCertificates && (
        <StudentCertificateModal students={printingCertificates} onClose={() => setPrintingCertificates(null)} />
      )}

      {printingTable && (
        <DegreesTablePrintModal
          students={filtered}
          subjects={visibleSubjects}
          scopeLevelIds={columnLevelIds}
          initialColumns={columns.order.map(toPrintKey)}
          scopeLabel={[
            scopeInfo.label,
            statusFilter ? STATUS_FILTER_LABELS[statusFilter] : null,
            query.trim() ? `بحث: ${query.trim()}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          onClose={() => setPrintingTable(false)}
        />
      )}
    </div>
  );
}
