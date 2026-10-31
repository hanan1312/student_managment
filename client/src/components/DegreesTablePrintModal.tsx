import { useMemo, useState, type ReactNode } from "react";
import {
  degreeTotals,
  formatDegree,
  formatPercentage,
  passStatus,
  sharedTotalMarks,
  splitByOutside,
  statusTextClass,
  subjectInScope,
} from "../lib/degrees";
import { moveItem, useSignatures } from "../lib/print";
import { useUiControl } from "../lib/uiControl";
import { useSettings } from "../context/SettingsContext";
import { DEGREES_INFO_FIELDS } from "../lib/degreesColumns";
import { ageReferenceDate } from "../lib/studentAge";
import type { DegreesOverviewStudent, SubjectDegrees } from "../lib/types";
import {
  LayoutOptions,
  OptionCheckbox,
  OptionSection,
  PrintColumnHeader,
  PrintModalShell,
  PrintSheetHeader,
  RemoveRowCell,
  RestoreRowsButton,
  SignatureBlock,
  SignatureOptions,
  TitleOption,
  type Orientation,
} from "./PrintParts";

// Short values that read badly when wrapped; names, subjects and الحالة may wrap so wide tables fit.
const NOWRAP_KEYS = new Set(["national_id", "moe_code", "birthday", "score", "percentage"]);

type Row = { student: DegreesOverviewStudent; totals: ReturnType<typeof degreeTotals> };

type Column = {
  key: string;
  label: string;
  // Small text under the label, e.g. the marks as صغرى / كبرى.
  note?: string | null;
  render: (row: Row) => string;
  className?: (row: Row) => string;
};

const RESULT_COLUMNS: Column[] = [
  { key: "percentage", label: "النسبة المئوية", render: ({ totals }) => formatPercentage(totals.percentage) },
  {
    key: "status",
    label: "الحالة",
    render: ({ totals }) => passStatus(totals.percentage) ?? "",
    className: ({ totals }) => `font-semibold ${statusTextClass(passStatus(totals.percentage))}`,
  },
];

function headerLabel(c: Column): ReactNode {
  return (
    <>
      {c.label}
      {c.note && <span className="block text-[0.8em] font-normal text-slate-500">{c.note}</span>}
    </>
  );
}

// Print preview of the Degrees Profile table: the rows currently shown (المراحل, status and
// search filters applied). Subjects in the total, then مجموع الدرجات, then subjects خارج المجموع;
// marks (صغرى / كبرى) under each subject and the total when they're the same for everyone shown.
// Columns can be hidden or moved, rows dropped, and the page laid out like the Students print.
export default function DegreesTablePrintModal({
  students,
  subjects,
  scopeLevelIds,
  scopeLabel,
  initialColumns,
  onClose,
}: {
  students: DegreesOverviewStudent[];
  subjects: SubjectDegrees[];
  // The sections the المراحل filter covers (null = all), for each subject's marks and خارج flag.
  scopeLevelIds: Set<number> | null;
  scopeLabel: string;
  // The columns to start from, in order (the table's الأعمدة choice). Default: all of them.
  initialColumns?: string[];
  onClose: () => void;
}) {
  const { settings } = useSettings();
  const ageYear = settings.academic_year;
  const infoColumns = useMemo<Column[]>(() => {
    const ageRef = ageReferenceDate(ageYear);
    return DEGREES_INFO_FIELDS.map((f) => ({ key: f.key, label: f.label, render: ({ student }) => f.get(student, ageRef) }));
  }, [ageYear]);
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set());
  const rows = useMemo<Row[]>(
    () => students.filter((s) => !removedIds.has(s.id)).map((student) => ({ student, totals: degreeTotals(student.grades) })),
    [students, removedIds]
  );

  const { allColumns, subjectColumns, resultColumns } = useMemo(() => {
    const subjectColumn = (s: SubjectDegrees): Column => {
      const info = subjectInScope(s, scopeLevelIds);
      return {
        key: `subject-${s.id}`,
        label: s.name,
        note: [info.marks, info.outside ? "خارج المجموع" : null].filter(Boolean).join(" · ") || null,
        render: ({ student }) => {
          const g = student.grades.find((x) => x.subject_id === s.id);
          return g ? formatDegree(g.score) : "—";
        },
      };
    };
    const { inTotal, outside } = splitByOutside(subjects, (s) => subjectInScope(s, scopeLevelIds).outside);
    const totalColumn: Column = {
      key: "score",
      label: "مجموع الدرجات",
      note: sharedTotalMarks(students.map((s) => degreeTotals(s.grades))),
      render: ({ totals }) => (totals.hasScore ? formatDegree(totals.score) : ""),
    };
    return {
      allColumns: [
        ...infoColumns,
        ...inTotal.map(subjectColumn),
        totalColumn,
        ...outside.map(subjectColumn),
        ...RESULT_COLUMNS,
      ],
      subjectColumns: [...inTotal, ...outside].map(subjectColumn),
      resultColumns: [totalColumn, ...RESULT_COLUMNS],
    };
  }, [subjects, scopeLevelIds, students, infoColumns]);
  const columnByKey = useMemo(() => new Map(allColumns.map((c) => [c.key, c])), [allColumns]);

  const [columns, setColumns] = useState<string[]>(() => {
    const start = initialColumns?.filter((k) => columnByKey.has(k)) ?? [];
    return start.length > 0 ? start : allColumns.map((c) => c.key);
  });
  const { t } = useUiControl();
  const [title, setTitle] = useState(() => t("print.degreesTitle"));
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [fontSize, setFontSize] = useState(subjects.length > 8 ? 9 : 11);
  const signatures = useSignatures(false);

  const toggleColumn = (key: string) =>
    setColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : allColumns.map((c) => c.key).filter((k) => k === key || prev.includes(k))
    );

  const cell = "border border-slate-400 px-1.5 py-1";
  const columnGroup = (label: string, list: Column[]) => (
    <OptionSection label={label}>
      <div className="grid grid-cols-2 gap-1">
        {list.map((c) => (
          <OptionCheckbox key={c.key} label={c.label} checked={columns.includes(c.key)} onChange={() => toggleColumn(c.key)} />
        ))}
      </div>
    </OptionSection>
  );

  const options = (
    <>
      <TitleOption value={title} onChange={setTitle} />
      {columnGroup("بيانات الطالب", infoColumns)}
      {subjectColumns.length > 0 && columnGroup("المواد", subjectColumns)}
      {columnGroup("النتيجة", resultColumns)}
      <p className="text-[11px] text-slate-400">رتّب الأعمدة بالأسهم في رأس الجدول.</p>
      <SignatureOptions signatures={signatures} />
      <LayoutOptions orientation={orientation} onOrientation={setOrientation} fontSize={fontSize} onFontSize={setFontSize} />
      <RestoreRowsButton count={removedIds.size} onClick={() => setRemovedIds(new Set())} />
    </>
  );

  return (
    <PrintModalShell
      heading="طباعة ملف الدرجات"
      subheading={`${scopeLabel} · ${rows.length} طالب`}
      orientation={orientation}
      fontSize={fontSize}
      canPrint={rows.length > 0 && columns.length > 0}
      onClose={onClose}
      options={options}
    >
      <PrintSheetHeader title={title} subtitle={scopeLabel} meta={`عدد الطلاب: ${rows.length}`} />

      {columns.length === 0 ? (
        <p className="py-10 text-center text-slate-400">اختر عمودًا واحدًا على الأقل.</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-slate-400">لا يوجد طلاب.</p>
      ) : (
        <table className="print-table w-full border-collapse">
          <thead>
            <tr className="bg-slate-200">
              <th className={`${cell} w-8`}>م</th>
              {columns.map((key, i) => (
                <PrintColumnHeader
                  key={key}
                  label={headerLabel(columnByKey.get(key)!)}
                  className={`${cell} ${key === "score" ? "bg-slate-300" : ""}`}
                  isFirst={i === 0}
                  isLast={i === columns.length - 1}
                  onMove={(step) => setColumns((prev) => moveItem(prev, key, step))}
                  onHide={() => toggleColumn(key)}
                />
              ))}
              <th className="print-hidden w-6 border border-slate-300" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.student.id} className="group">
                <td className={`${cell} text-center`}>{i + 1}</td>
                {columns.map((key) => {
                  const col = columnByKey.get(key)!;
                  return (
                    <td
                      key={key}
                      className={`${cell} ${key === "name" ? "" : "text-center"} ${NOWRAP_KEYS.has(key) ? "whitespace-nowrap" : ""} ${
                        key === "score" ? "bg-slate-100 font-bold" : ""
                      } ${col.className?.(row) ?? ""}`}
                    >
                      {col.render(row)}
                    </td>
                  );
                })}
                <RemoveRowCell onRemove={() => setRemovedIds((prev) => new Set(prev).add(row.student.id))} />
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SignatureBlock signatures={signatures} />
    </PrintModalShell>
  );
}
