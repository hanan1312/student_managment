import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, BookMarked, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { levelAndDescendants, useClasses } from "../../context/ClassesContext";
import { useHrEmployees } from "../../context/HrEmployeesContext";
import { api, ApiError } from "../../lib/api";
import type { ClassStage, Subject } from "../../lib/types";
import { autoMaxFromMin } from "../../lib/degrees";
import { useColumnOrder, orderedCells } from "../../lib/useColumnOrder";
import { downloadExcel } from "../../lib/excel";
import { isYes, sameName, toNumber } from "../../lib/importValues";
import CsvImportModal, { type ImportColumn } from "../CsvImportModal";
import ImportExportButtons from "../ImportExportButtons";

const SUBJECT_COLUMNS = { name: "المادة", level: "الصف", max: "كبرى", min: "صغرى", price: "السعر", category: "التصنيف" };
const SUBJECT_COLUMN_KEYS = Object.keys(SUBJECT_COLUMNS) as (keyof typeof SUBJECT_COLUMNS)[];

type FlatLevel = { id: number; level: string; stage: string };

function flattenLevels(tree: ClassStage[]): FlatLevel[] {
  const seen = new Set<number>();
  const out: FlatLevel[] = [];
  for (const stage of tree) {
    // Subjects link to the places students are placed: the leaves, shown by full path.
    for (const level of stage.levels) {
      if (!level.is_leaf || seen.has(level.id)) continue;
      seen.add(level.id);
      out.push({ id: level.id, level: level.path, stage: stage.stage });
    }
  }
  return out;
}

// The section picker as a tree: each stage, then its levels in order. Only leaves are linked to
// the subject; a stage or a level with sub-levels gets a checkbox that ticks every leaf under it.
type PickerRow =
  | { kind: "group"; key: string; label: string; depth: number; leafIds: number[] }
  | { kind: "leaf"; id: number; label: string; depth: number };

function pickerRows(tree: ClassStage[]): PickerRow[] {
  return tree.flatMap((stage) => [
    {
      kind: "group" as const,
      key: `stage-${stage.id}`,
      label: stage.stage,
      depth: 0,
      leafIds: stage.levels.filter((l) => l.is_leaf).map((l) => l.id),
    },
    ...stage.levels.map((level): PickerRow =>
      level.is_leaf
        ? { kind: "leaf", id: level.id, label: level.level, depth: level.depth + 1 }
        : {
            kind: "group",
            key: `level-${level.id}`,
            label: level.level,
            depth: level.depth + 1,
            leafIds: levelAndDescendants(stage.levels, level.id)
              .filter((l) => l.is_leaf)
              .map((l) => l.id),
          }
    ),
  ]);
}

// Import / Export: one row per subject and section (a subject with no section: one row without
// one). Importing adds the subject if its name is new and links it to the row's section with
// the row's marks; the subject's other sections are kept. Empty marks keep what the section had.
const IMPORT_COLUMNS: ImportColumn[] = [
  { key: "name", label: "المادة", required: true, example: "اللغة العربية", aliases: ["اسم المادة", "Subject"] },
  { key: "stage", label: "المرحلة", example: "المرحلة الابتدائية", aliases: ["Stage"] },
  { key: "level", label: "الصف", example: "أولى ابتدائى", aliases: ["القسم", "Section"] },
  { key: "max", label: "النهاية الكبرى", example: "100", aliases: ["كبرى"] },
  { key: "min", label: "النهاية الصغرى", example: "50", aliases: ["صغرى"] },
  { key: "outside", label: "خارج المجموع", example: "لا" },
];

type SubjectImport = {
  name: string;
  levelId: number | null;
  max: number | null;
  min: number | null;
  // undefined: the cell was empty, keep what the section had.
  outside?: boolean;
};

// "الصف الثاني / البكالوريا" and "الصف الثاني/البكالوريا" are the same path.
const samePath = (a: string, b: string) => sameName(a.replace(/\s*\/\s*/g, "/"), b.replace(/\s*\/\s*/g, "/"));

const emptyForm = {
  name: "",
  color: "#6366f1",
  igSubject: false,
  weeklyPeriods: "0",
  price: "0",
  category: "",
};

function degreeOrNull(v: string): number | null {
  return v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v);
}

type MarksDraft = Record<number, { max: string; min: string }>;

// One value when every linked section has the same mark, "varies" otherwise.
function marksSummary(s: Subject, key: "max_degree" | "min_degree"): string {
  const values = [...new Set(s.level_marks.map((m) => m[key]))];
  if (values.length === 0 || (values.length === 1 && values[0] === null)) return "—";
  return values.length === 1 ? String(values[0]) : "متفاوتة";
}

const markInputCls =
  "w-16 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs outline-none focus:border-brand-500 disabled:bg-slate-50 disabled:text-slate-300";

export default function SubjectSetupModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const { tree } = useClasses();
  const { refresh: refreshEmployees } = useHrEmployees();
  const levels = useMemo(() => flattenLevels(tree), [tree]);
  const rows = useMemo(() => pickerRows(tree), [tree]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const levelListRef = useRef<HTMLDivElement>(null);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const subjectColumns = useColumnOrder("subjects", SUBJECT_COLUMN_KEYS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [levelIds, setLevelIds] = useState<Set<number>>(new Set());
  // كبرى/صغرى per section — they differ by grade year.
  const [marks, setMarks] = useState<MarksDraft>({});
  const [sameMarks, setSameMarks] = useState({ max: "", min: "" });
  // Sections where this subject is خارج المجموع, and its choose-one group per section (read-only here).
  const [outside, setOutside] = useState<Set<number>>(new Set());
  const [electives, setElectives] = useState<Record<number, string>>({});

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.getSubjects(token);
      setSubjects(res.subjects);
    } catch {
      setError("تعذر تحميل المواد.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setLevelIds(new Set());
    setMarks({});
    setSameMarks({ max: "", min: "" });
    setOutside(new Set());
    setElectives({});
  };

  const startEdit = (s: Subject) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      color: s.color ?? "#6366f1",
      igSubject: Boolean(s.ig_subject),
      weeklyPeriods: String(s.weekly_periods),
      price: String(s.price),
      category: s.category ?? "",
    });
    setLevelIds(new Set(s.level_ids));
    setMarks(
      Object.fromEntries(
        s.level_marks.map((m) => [
          m.level_id,
          { max: m.max_degree === null ? "" : String(m.max_degree), min: m.min_degree === null ? "" : String(m.min_degree) },
        ])
      )
    );
    setSameMarks({ max: "", min: "" });
    setOutside(new Set(s.level_marks.filter((m) => m.outside_total).map((m) => m.level_id)));
    setElectives(
      Object.fromEntries(s.level_marks.filter((m) => m.elective_group).map((m) => [m.level_id, m.elective_group as string]))
    );
    // Bring the form into view, with the section list scrolled to the subject's first section.
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => {
      const list = levelListRef.current;
      const first = list?.querySelector<HTMLElement>('[data-linked="true"]');
      if (list) list.scrollTop = first ? first.offsetTop - 8 : 0;
    });
  };

  const toggleLevel = (id: number) => {
    setLevelIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Typing a صغرى fills كبرى = صغرى × 2 unless كبرى was set by hand.
  const setMark = (levelId: number, key: "max" | "min", value: string) =>
    setMarks((prev) => {
      const row = prev[levelId] ?? { max: "", min: "" };
      const next = { ...row, [key]: value };
      if (key === "min") next.max = autoMaxFromMin(row.min, value, row.max);
      return { ...prev, [levelId]: next };
    });

  const applySameMarks = () =>
    setMarks((prev) => {
      const next = { ...prev };
      for (const id of levelIds) next[id] = { max: sameMarks.max, min: sameMarks.min };
      return next;
    });

  const toggleGroup = (leafIds: number[]) =>
    setLevelIds((prev) => {
      const next = new Set(prev);
      const all = leafIds.every((id) => next.has(id));
      leafIds.forEach((id) => (all ? next.delete(id) : next.add(id)));
      return next;
    });

  const selectAllLevels = () => {
    setLevelIds((prev) => (prev.size === levels.length ? new Set() : new Set(levels.map((l) => l.id))));
  };

  const save = async () => {
    if (!token || !form.name.trim()) return;
    const levelMarks = [...levelIds].map((levelId) => ({
      levelId,
      maxDegree: degreeOrNull(marks[levelId]?.max ?? ""),
      minDegree: degreeOrNull(marks[levelId]?.min ?? ""),
      outsideTotal: outside.has(levelId),
    }));
    const bad = levelMarks.find((m) => m.maxDegree !== null && m.minDegree !== null && m.minDegree > m.maxDegree);
    if (bad) {
      setError(`لا يمكن أن تكون الصغرى أكبر من الكبرى (${levels.find((l) => l.id === bad.levelId)?.level ?? ""}).`);
      return;
    }
    setError(null);
    const body = {
      name: form.name.trim(),
      color: form.color,
      igSubject: form.igSubject,
      weeklyPeriods: Number(form.weeklyPeriods) || 0,
      price: Number(form.price) || 0,
      category: form.category.trim() || undefined,
      levelIds: [...levelIds],
      levelMarks,
    };
    try {
      if (editingId == null) {
        await api.createSubject(token, body);
      } else {
        await api.updateSubject(token, editingId, body);
        // A renamed subject's name is mirrored server-side onto every hr_employees row
        // teaching it (section text + derived Title — see subjects.ts's rename cascade) —
        // refresh the already-loaded employees list so the HR sidebar/table pick it up now.
        // Best-effort: users with only Students access can't load HR employees.
        await refreshEmployees().catch(() => {});
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذر الحفظ.");
    }
  };

  const remove = async (id: number) => {
    if (!token) return;
    if (!window.confirm("حذف هذه المادة؟")) return;
    try {
      await api.deleteSubject(token, id);
      if (editingId === id) resetForm();
      await load();
    } catch {
      setError("تعذر الحذف.");
    }
  };

  const levelName = (id: number) => levels.find((l) => l.id === id)?.level ?? "—";
  const [importOpen, setImportOpen] = useState(false);

  const handleExport = () => {
    const [name, stage, level, max, min, out] = IMPORT_COLUMNS.map((c) => c.label);
    const rowsOut = subjects.flatMap((s) =>
      s.level_marks.length === 0
        ? [{ [name]: s.name, [stage]: "", [level]: "", [max]: "", [min]: "", [out]: "" }]
        : s.level_marks.map((m) => {
            const lvl = levels.find((l) => l.id === m.level_id);
            return {
              [name]: s.name,
              [stage]: lvl?.stage ?? "",
              [level]: lvl?.level ?? "",
              [max]: m.max_degree ?? "",
              [min]: m.min_degree ?? "",
              [out]: m.outside_total ? "نعم" : "لا",
            };
          })
    );
    downloadExcel("subjects.xlsx", IMPORT_COLUMNS.map((c) => c.label), rowsOut);
  };

  const mapImportRow = (raw: Record<string, string>): { input?: SubjectImport; error?: string; warning?: string } => {
    let levelId: number | null = null;
    if (raw.level?.trim()) {
      const matches = levels.filter((l) => samePath(l.level, raw.level) && (!raw.stage?.trim() || sameName(l.stage, raw.stage)));
      if (matches.length === 0) return { error: `الصف "${raw.level.trim()}" غير موجود في الهيكل (أو ليس آخر فرع)` };
      if (matches.length > 1) return { error: `الصف "${raw.level.trim()}" موجود في أكثر من مرحلة: اكتب المرحلة` };
      levelId = matches[0].id;
    }
    const min = toNumber(raw.min);
    let max = toNumber(raw.max);
    if ((raw.max?.trim() && max === null) || (raw.min?.trim() && min === null)) return { error: "النهايات يجب أن تكون أرقامًا" };
    // Same rule as the form: a صغرى alone makes the كبرى double it.
    if (max === null && min !== null) max = min * 2;
    if (max !== null && min !== null && min > max) return { error: "النهاية الصغرى أكبر من الكبرى" };
    const existing = subjects.find((s) => sameName(s.name, raw.name));
    if (existing && levelId === null) return { error: "المادة موجودة: اكتب الصف لربطها به" };
    return {
      input: {
        name: raw.name.trim(),
        levelId,
        max,
        min,
        outside: raw.outside?.trim() ? isYes(raw.outside) : undefined,
      },
      warning: existing ? "مادة موجودة: سيُضاف الصف أو تُحدَّث نهاياته" : "مادة جديدة",
    };
  };

  // Rows run one after another; each reads the subjects again so a subject added by an earlier
  // row of the file is found.
  const importRow = async (input: SubjectImport) => {
    if (!token) return;
    const { subjects: current } = await api.getSubjects(token);
    const existing = current.find((s) => sameName(s.name, input.name));
    const prev = existing?.level_marks.find((m) => m.level_id === input.levelId);
    const levelMarks =
      input.levelId === null
        ? []
        : [
            {
              levelId: input.levelId,
              maxDegree: input.max ?? prev?.max_degree ?? null,
              minDegree: input.min ?? prev?.min_degree ?? null,
              outsideTotal: input.outside,
            },
          ];
    if (!existing) {
      await api.createSubject(token, {
        name: input.name,
        levelIds: input.levelId === null ? [] : [input.levelId],
        levelMarks,
      });
    } else if (input.levelId !== null) {
      await api.updateSubject(token, existing.id, {
        levelIds: [...new Set([...existing.level_ids, input.levelId])],
        levelMarks,
      });
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <BookMarked size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800">إعداد المواد</h2>
          </div>
          <div className="flex items-center gap-2">
            <ImportExportButtons onImport={() => setImportOpen(true)} onExport={handleExport} exportDisabled={subjects.length === 0} />
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_420px]">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-500">الاسم</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">عدد الحصص</label>
                  <input
                    type="number"
                    min={0}
                    value={form.weeklyPeriods}
                    onChange={(e) => setForm((f) => ({ ...f, weeklyPeriods: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">اللون</label>
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-slate-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">السعر</label>
                  <input
                    type="number"
                    min={0}
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">التصنيف</label>
                  <input
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
                <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.igSubject}
                    onChange={(e) => setForm((f) => ({ ...f, igSubject: e.target.checked }))}
                    className="h-4 w-4 accent-brand-600"
                  />
                  مادة IG
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-2">
              <label className="mb-1.5 flex items-center gap-2 border-b border-slate-100 px-1 pb-1.5 text-xs font-semibold text-slate-500">
                <input
                  type="checkbox"
                  checked={levels.length > 0 && levelIds.size === levels.length}
                  onChange={selectAllLevels}
                  className="h-3.5 w-3.5 accent-brand-600"
                />
                <span className="flex-1">الصف — تحديد الكل</span>
                <span className="w-16 text-center">كبرى</span>
                <span className="w-16 text-center">صغرى</span>
                <span className="w-12 text-center" title="خارج المجموع">خارج</span>
              </label>
              <div className="mb-1.5 flex items-center gap-2 border-b border-slate-100 px-1 pb-1.5 text-xs text-slate-500">
                <button
                  type="button"
                  onClick={applySameMarks}
                  disabled={levelIds.size === 0}
                  className="flex-1 rounded-md bg-slate-100 px-2 py-0.5 text-start font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40"
                  title="نسخ هذه النهايات لكل الصفوف المحددة"
                >
                  نفس القيم لكل المحدد ↓
                </button>
                <input
                  type="number"
                  min={0}
                  value={sameMarks.max}
                  onChange={(e) => setSameMarks((m) => ({ ...m, max: e.target.value }))}
                  className={markInputCls}
                />
                <input
                  type="number"
                  min={0}
                  value={sameMarks.min}
                  onChange={(e) =>
                    setSameMarks((m) => ({ min: e.target.value, max: autoMaxFromMin(m.min, e.target.value, m.max) }))
                  }
                  className={markInputCls}
                />
                <span className="w-12" />
              </div>
              <div ref={levelListRef} className="relative max-h-72 space-y-0.5 overflow-y-auto">
                {rows.map((row) => {
                  if (row.kind === "group") {
                    const picked = row.leafIds.filter((id) => levelIds.has(id)).length;
                    const all = row.leafIds.length > 0 && picked === row.leafIds.length;
                    return (
                      <label
                        key={row.key}
                        className={`flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-slate-50 ${
                          row.depth === 0 ? "mt-1 bg-slate-50 font-semibold text-slate-700" : "font-medium text-slate-600"
                        }`}
                        style={{ paddingInlineStart: row.depth * 14 + 4 }}
                        title="تحديد كل الصفوف تحتها"
                      >
                        <input
                          type="checkbox"
                          checked={all}
                          ref={(el) => {
                            if (el) el.indeterminate = picked > 0 && !all;
                          }}
                          disabled={row.leafIds.length === 0}
                          onChange={() => toggleGroup(row.leafIds)}
                          className="h-3.5 w-3.5 accent-brand-600"
                        />
                        <span className="truncate">{row.label}</span>
                        <span className="text-[10px] font-normal text-slate-400">
                          {picked}/{row.leafIds.length}
                        </span>
                      </label>
                    );
                  }
                  const checked = levelIds.has(row.id);
                  return (
                    <div
                      key={row.id}
                      data-linked={checked}
                      className="flex items-center gap-2 rounded px-1 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      <label className="flex flex-1 items-center gap-2 truncate" dir="rtl" style={{ paddingInlineStart: row.depth * 14 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLevel(row.id)}
                          className="h-3.5 w-3.5 accent-brand-600"
                        />
                        <span className="truncate">{row.label}</span>
                        {checked && electives[row.id] && (
                          <span
                            className="shrink-0 rounded bg-amber-50 px-1 text-[10px] text-amber-700"
                            title="مادة اختيارية: يدرس الطالب مادة واحدة من هذه المجموعة"
                          >
                            اختياري
                          </span>
                        )}
                      </label>
                      <input
                        type="number"
                        min={0}
                        disabled={!checked}
                        value={marks[row.id]?.max ?? ""}
                        onChange={(e) => setMark(row.id, "max", e.target.value)}
                        className={markInputCls}
                      />
                      <input
                        type="number"
                        min={0}
                        disabled={!checked}
                        value={marks[row.id]?.min ?? ""}
                        onChange={(e) => setMark(row.id, "min", e.target.value)}
                        className={markInputCls}
                      />
                      <span className="flex w-12 justify-center">
                        <input
                          type="checkbox"
                          disabled={!checked}
                          checked={checked && outside.has(row.id)}
                          onChange={() =>
                            setOutside((prev) => {
                              const next = new Set(prev);
                              next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                              return next;
                            })
                          }
                          title="خارج المجموع: تُسجل الدرجة ولا تدخل في المجموع والنسبة"
                          className="h-3.5 w-3.5 accent-brand-600 disabled:opacity-30"
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            {editingId != null && (
              <button
                onClick={resetForm}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                إلغاء التعديل
              </button>
            )}
            <button
              onClick={save}
              className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-1.5 text-sm font-semibold text-white shadow-md shadow-brand-600/25 hover:-translate-y-0.5"
            >
              {editingId == null ? "حفظ" : "تحديث"}
            </button>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  {subjectColumns.order.map((key) => (
                    <th key={key} {...subjectColumns.headerProps(key)} className="px-3 py-2">
                      {SUBJECT_COLUMNS[key]}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-end">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                      جارٍ التحميل…
                    </td>
                  </tr>
                )}
                {!loading && subjects.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                      لا توجد مواد بعد.
                    </td>
                  </tr>
                )}
                {!loading &&
                  subjects.map((s, i) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                      {orderedCells(subjectColumns.order, {
                        name: (
                          <td className="px-3 py-2 font-medium text-slate-800">
                            <span className="me-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: s.color ?? "#94a3b8" }} />
                            {s.name}
                          </td>
                        ),
                        level: (
                          <td className="px-3 py-2 text-slate-500" dir="rtl">
                            {s.level_ids.length === 0
                              ? "—"
                              : s.level_ids.length === 1
                              ? levelName(s.level_ids[0])
                              : `${s.level_ids.length} صفوف`}
                          </td>
                        ),
                        max: <td className="px-3 py-2 text-slate-500">{marksSummary(s, "max_degree")}</td>,
                        min: <td className="px-3 py-2 text-slate-500">{marksSummary(s, "min_degree")}</td>,
                        price: <td className="px-3 py-2 text-slate-500">{s.price}</td>,
                        category: <td className="px-3 py-2 text-slate-500">{s.category || "—"}</td>,
                      })}
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => startEdit(s)} className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => remove(s.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            إغلاق
          </button>
        </div>
      </div>

      {importOpen &&
        createPortal(
          <CsvImportModal<SubjectImport>
            title="استيراد المواد"
            description="صف لكل مادة وصف دراسي. المادة الجديدة تُضاف، والموجودة يُضاف لها الصف أو تُحدَّث نهاياته، وتبقى صفوفها الأخرى كما هي. الخانات الفارغة لا تغيّر النهايات. خارج المجموع: نعم / لا."
            templateFilename="subjects-template.csv"
            columns={IMPORT_COLUMNS}
            mapRow={mapImportRow}
            onImportRow={importRow}
            onClose={() => setImportOpen(false)}
            onFinished={load}
          />,
          document.body
        )}
    </div>
  );
}
