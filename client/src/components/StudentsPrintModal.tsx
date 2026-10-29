import { useMemo, useState } from "react";
import { statusTextClass } from "../lib/degrees";
import { STUDENT_COLUMNS, loadVisibleColumns, type StudentColumnKey } from "../lib/studentColumns";
import type { Student } from "../lib/types";
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
import { moveItem, useSignatures } from "../lib/print";

const COLUMN_MAP = new Map(STUDENT_COLUMNS.map((c) => [c.key, c]));
const NO_DIVISION = "غير محدد";
const NOWRAP_COLUMNS = new Set<StudentColumnKey>(["birthday", "national_id", "moe_code"]);

type DivisionBlock = { division: string; sections: { section: string; students: Student[] }[]; count: number };

// Divisions (and the sections inside them) in the order they first appear in the list.
function groupForPrint(students: Student[]): DivisionBlock[] {
  const divisions = new Map<string, Map<string, Student[]>>();
  for (const s of students) {
    const division = s.division || NO_DIVISION;
    const section = s.section || "";
    let sections = divisions.get(division);
    if (!sections) divisions.set(division, (sections = new Map()));
    let list = sections.get(section);
    if (!list) sections.set(section, (list = []));
    list.push(s);
  }
  return [...divisions.entries()].map(([division, sections]) => {
    const list = [...sections.entries()].map(([section, students]) => ({ section, students }));
    return { division, sections: list, count: list.reduce((n, s) => n + s.students.length, 0) };
  });
}

// Print preview for the Students list: pick the divisions and columns, adjust the table
// (column order, font size, orientation, drop rows), then print with the school logo and the
// date of printing. Prints only the students currently loaded on the page (sidebar + search).
export default function StudentsPrintModal({
  students,
  scopeLabel,
  onClose,
}: {
  students: Student[];
  scopeLabel: string;
  onClose: () => void;
}) {
  const allBlocks = useMemo(() => groupForPrint(students), [students]);
  const [selectedDivisions, setSelectedDivisions] = useState<Set<string>>(
    () => new Set(allBlocks.map((b) => b.division))
  );
  const [columns, setColumns] = useState<StudentColumnKey[]>(() => {
    const visible = new Set(loadVisibleColumns());
    return STUDENT_COLUMNS.filter((c) => visible.has(c.key)).map((c) => c.key);
  });
  const [title, setTitle] = useState("كشف بيانات الطلاب");
  const [orientation, setOrientation] = useState<Orientation>(() => (columns.length > 7 ? "landscape" : "portrait"));
  const [fontSize, setFontSize] = useState(11);
  const [showSections, setShowSections] = useState(true);
  const [breakPerDivision, setBreakPerDivision] = useState(false);
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set());
  const signatures = useSignatures(false);

  const blocks = useMemo(
    () =>
      allBlocks
        .filter((b) => selectedDivisions.has(b.division))
        .map((b) => {
          const sections = b.sections
            .map((sec) => ({ ...sec, students: sec.students.filter((s) => !removedIds.has(s.id)) }))
            .filter((sec) => sec.students.length > 0);
          return { ...b, sections, count: sections.reduce((n, s) => n + s.students.length, 0) };
        })
        .filter((b) => b.count > 0),
    [allBlocks, selectedDivisions, removedIds]
  );
  const total = blocks.reduce((n, b) => n + b.count, 0);

  const toggleDivision = (division: string, on: boolean) =>
    setSelectedDivisions((prev) => {
      const next = new Set(prev);
      if (on) next.add(division);
      else next.delete(division);
      return next;
    });

  const toggleColumn = (key: StudentColumnKey) =>
    setColumns((prev) =>
      prev.includes(key)
        ? prev.filter((k) => k !== key)
        : STUDENT_COLUMNS.map((c) => c.key).filter((k) => k === key || prev.includes(k))
    );

  const cell = "border border-slate-400 px-2 py-1";
  const colCount = columns.length + 2; // م + columns + remove button

  const options = (
    <>
      <TitleOption value={title} onChange={setTitle} />

      <OptionSection
        label="المراحل"
        actions={
          <>
            <button onClick={() => setSelectedDivisions(new Set(allBlocks.map((b) => b.division)))} className="hover:underline">
              الكل
            </button>
            <button onClick={() => setSelectedDivisions(new Set())} className="hover:underline">
              مسح
            </button>
          </>
        }
      >
        {allBlocks.length === 0 && <p className="text-xs text-slate-400">لا يوجد طلاب.</p>}
        {allBlocks.map((b) => (
          <OptionCheckbox
            key={b.division}
            label={b.division}
            count={b.count}
            checked={selectedDivisions.has(b.division)}
            onChange={(on) => toggleDivision(b.division, on)}
          />
        ))}
      </OptionSection>

      <OptionSection label="الأعمدة">
        <div className="grid grid-cols-2 gap-1">
          {STUDENT_COLUMNS.map((c) => (
            <OptionCheckbox key={c.key} label={c.label} checked={columns.includes(c.key)} onChange={() => toggleColumn(c.key)} />
          ))}
        </div>
        <p className="text-[11px] text-slate-400">رتّب الأعمدة بالأسهم في رأس الجدول.</p>
      </OptionSection>

      <SignatureOptions signatures={signatures} />

      <LayoutOptions orientation={orientation} onOrientation={setOrientation} fontSize={fontSize} onFontSize={setFontSize}>
        <OptionCheckbox label="عناوين الصفوف داخل الجدول" checked={showSections} onChange={setShowSections} />
        <OptionCheckbox label="كل مرحلة في صفحة جديدة" checked={breakPerDivision} onChange={setBreakPerDivision} />
      </LayoutOptions>

      <RestoreRowsButton count={removedIds.size} onClick={() => setRemovedIds(new Set())} />
    </>
  );

  return (
    <PrintModalShell
      heading="طباعة الطلاب"
      subheading={`${scopeLabel} · ${total} طالب`}
      orientation={orientation}
      fontSize={fontSize}
      canPrint={total > 0 && columns.length > 0}
      onClose={onClose}
      options={options}
    >
      <PrintSheetHeader title={title} subtitle={scopeLabel} meta={`عدد الطلاب: ${total}`} />

      {columns.length === 0 && <p className="py-10 text-center text-slate-400">اختر عمودًا واحدًا على الأقل.</p>}
      {columns.length > 0 && blocks.length === 0 && (
        <p className="py-10 text-center text-slate-400">لا يوجد طلاب في المراحل المختارة.</p>
      )}

      {columns.length > 0 &&
        blocks.map((block) => {
          let n = 0;
          return (
            <section key={block.division} className={`mb-4 ${breakPerDivision ? "print-division-break" : ""}`}>
              <h2 className="mb-1 text-[1.15em] font-bold">
                {block.division} <span className="font-normal text-slate-500">({block.count})</span>
              </h2>
              <table className="print-table w-full border-collapse">
                <thead>
                  <tr className="bg-slate-200">
                    <th className={`${cell} w-8`}>م</th>
                    {columns.map((key, i) => (
                      <PrintColumnHeader
                        key={key}
                        label={COLUMN_MAP.get(key)?.label}
                        className={cell}
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
                  {block.sections.map((sec) => [
                    showSections && sec.section ? (
                      <tr key={`sec-${sec.section}`} className="bg-slate-100">
                        <td colSpan={colCount} className={`${cell} font-semibold`}>
                          {sec.section} <span className="font-normal text-slate-500">({sec.students.length})</span>
                        </td>
                      </tr>
                    ) : null,
                    ...sec.students.map((s) => (
                      <tr key={s.id} className="group">
                        <td className={`${cell} text-center`}>{++n}</td>
                        {columns.map((key) => {
                          const value = COLUMN_MAP.get(key)?.get(s) || "";
                          return (
                            <td
                              key={key}
                              className={`${cell} ${NOWRAP_COLUMNS.has(key) ? "whitespace-nowrap" : ""} ${
                                key === "pass_status" ? `font-semibold ${statusTextClass(value)}` : ""
                              }`}
                            >
                              {value}
                            </td>
                          );
                        })}
                        <RemoveRowCell onRemove={() => setRemovedIds((prev) => new Set(prev).add(s.id))} />
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </section>
          );
        })}

      <SignatureBlock signatures={signatures} />
    </PrintModalShell>
  );
}
