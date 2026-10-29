import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarRange, Shuffle, Send, Printer, Save, Lock, Unlock } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useClasses } from "../../context/ClassesContext";
import { api, ApiError } from "../../lib/api";
import type { DailyPeriod, Subject, TimetableEntry, TimetableTeacher } from "../../lib/types";
import TeacherSummaryModal from "./TeacherSummaryModal";

const DAY_LABELS = ["الاحد", "الاثنين", "الثلاثاء", "الاربعاء", "الخميس"];

type Props = {
  initialClassId?: number | null;
  onBack: () => void;
};

export default function ClassTimetableEditor({ initialClassId, onBack }: Props) {
  const { token } = useAuth();
  const { tree } = useClasses();

  const [stageName, setStageName] = useState("");
  const [levelId, setLevelId] = useState<number | "">("");
  const [classId, setClassId] = useState<number | "">("");
  const [session, setSession] = useState("");

  const [periods, setPeriods] = useState<DailyPeriod[]>([]);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<TimetableTeacher[]>([]);
  const [posted, setPosted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ day: number; periodNo: number } | null>(null);
  const [cellSubjectId, setCellSubjectId] = useState<number | "">("");
  const [cellTeacherId, setCellTeacherId] = useState<number | "">("");
  const [summaryTeacherId, setSummaryTeacherId] = useState<number | null>(null);

  useEffect(() => {
    if (!initialClassId || tree.length === 0) return;
    for (const stage of tree) {
      for (const level of stage.levels) {
        const found = level.classes.find((c) => c.id === initialClassId);
        if (found) {
          setStageName(stage.stage);
          setLevelId(level.id);
          setClassId(found.id);
          return;
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialClassId, tree]);

  useEffect(() => {
    if (!token) return;
    api.getSettings(token).then((res) => setSession(res.settings.academic_year ?? "")).catch(() => {});
    api.getDailyPeriods(token).then((res) => setPeriods(res.periods)).catch(() => {});
    api.getTimetableTeachers(token).then((res) => setTeachers(res.teachers.filter((t) => t.active))).catch(() => {});
  }, [token]);

  const stages = tree.map((s) => s.stage);
  const levels = tree.find((s) => s.stage === stageName)?.levels ?? [];
  const classes = levels.find((l) => l.id === levelId)?.classes ?? [];

  const loadClassData = async () => {
    if (!token || typeof classId !== "number") return;
    setLoading(true);
    setError(null);
    try {
      const [entriesRes, statusRes] = await Promise.all([
        api.getTimetable(token, classId),
        api.getClassTimetableStatus(token, classId),
      ]);
      setEntries(entriesRes.entries as unknown as TimetableEntry[]);
      setPosted(statusRes.posted);
      if (typeof levelId === "number") {
        const subjectsRes = await api.getSubjects(token, levelId);
        setSubjects(subjectsRes.subjects);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this class's timetable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClassData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, classId, levelId]);

  const entryFor = (day: number, periodNo: number) => entries.find((e) => e.day_of_week === day && e.period_no === periodNo) ?? null;

  const subjectStats = useMemo(
    () =>
      subjects.map((s) => {
        const actual = entries.filter((e) => e.subject_id === s.id).length;
        const target = s.weekly_periods;
        return { id: s.id, name: s.name, target, actual, capacity: target > 0 ? Math.round((actual / target) * 100) : 0 };
      }),
    [subjects, entries]
  );

  const teacherStats = useMemo(() => {
    const byTeacher = new Map<number, { name: string; actual: number; subjectIds: Set<number> }>();
    for (const e of entries) {
      if (!e.teacher_id) continue;
      const name = teachers.find((t) => t.employee_id === e.teacher_id)?.name ?? e.teacher_name ?? "—";
      const bucket = byTeacher.get(e.teacher_id) ?? { name, actual: 0, subjectIds: new Set<number>() };
      bucket.actual += 1;
      if (e.subject_id) bucket.subjectIds.add(e.subject_id);
      byTeacher.set(e.teacher_id, bucket);
    }
    return [...byTeacher.entries()].map(([id, v]) => ({
      id,
      name: v.name,
      actual: v.actual,
      target: [...v.subjectIds].reduce((sum, sid) => sum + (subjects.find((s) => s.id === sid)?.weekly_periods ?? 0), 0),
    }));
  }, [entries, teachers, subjects]);

  const openCell = (day: number, periodNo: number) => {
    if (posted) return;
    const existing = entryFor(day, periodNo);
    setEditingCell({ day, periodNo });
    setCellSubjectId(existing?.subject_id ?? "");
    setCellTeacherId(existing?.teacher_id ?? "");
  };

  // Strictly the teacher(s) assigned to the chosen subject (hr_employees.subject_id, set from
  // the Employee form's Section field) — no subject picked yet shows everyone, but once one
  // is, only that subject's teachers are selectable. Matched by id, not by comparing section
  // name strings, so it can't be thrown off by renames, casing, or Arabic/English spelling.
  const cellTeacherOptions = useMemo(() => {
    if (!cellSubjectId) return teachers;
    return teachers.filter((t) => t.subject_id === cellSubjectId);
  }, [cellSubjectId, teachers]);

  const chooseCellSubject = (subjectId: number | "") => {
    setCellSubjectId(subjectId);
    if (!subjectId || !cellTeacherId) return;
    const matching = teachers.filter((t) => t.subject_id === subjectId);
    if (!matching.some((t) => t.employee_id === cellTeacherId)) {
      setCellTeacherId("");
    }
  };

  const saveCell = async () => {
    if (!token || !editingCell || typeof classId !== "number" || !cellSubjectId) return;
    const existing = entryFor(editingCell.day, editingCell.periodNo);
    try {
      if (existing) {
        await api.updateTimetableEntry(token, existing.id, {
          subjectId: cellSubjectId,
          teacherId: cellTeacherId || null,
        });
      } else {
        await api.createTimetableEntry(token, {
          classId,
          dayOfWeek: editingCell.day,
          periodNo: editingCell.periodNo,
          subjectId: cellSubjectId,
          teacherId: cellTeacherId || undefined,
        });
      }
      setEditingCell(null);
      await loadClassData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this period.");
    }
  };

  const removeCell = async () => {
    if (!token || !editingCell) return;
    const existing = entryFor(editingCell.day, editingCell.periodNo);
    if (!existing) {
      setEditingCell(null);
      return;
    }
    try {
      await api.deleteTimetableEntry(token, existing.id);
      setEditingCell(null);
      await loadClassData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove this period.");
    }
  };

  const randomFill = async () => {
    if (!token || typeof classId !== "number") return;
    try {
      await api.randomFillClassTimetable(token, classId);
      await loadClassData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not auto-fill this timetable.");
    }
  };

  const togglePost = async () => {
    if (!token || typeof classId !== "number") return;
    try {
      const res = await api.toggleClassTimetablePost(token, classId);
      setPosted(res.posted);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update post status.");
    }
  };

  const selectCls =
    "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-500";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" title="Back to Time Tables">
            <ArrowLeft size={16} />
          </button>
          <CalendarRange size={18} className="text-brand-600" />
          <h2 className="text-sm font-semibold text-slate-800">Classes's Time Table</h2>
          {posted && (
            <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              <Lock size={11} /> Posted
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Division</label>
            <select
              value={stageName}
              onChange={(e) => {
                setStageName(e.target.value);
                setLevelId("");
                setClassId("");
              }}
              className={selectCls}
            >
              <option value="">—</option>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Section</label>
            <select
              value={levelId}
              onChange={(e) => {
                setLevelId(e.target.value ? Number(e.target.value) : "");
                setClassId("");
              }}
              className={selectCls}
              disabled={!stageName}
            >
              <option value="">—</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.level}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Class</label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : "")}
              className={selectCls}
              disabled={!levelId}
            >
              <option value="">—</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Session</label>
            <input value={session} disabled className="w-full rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-sm text-slate-400" />
          </div>
        </div>

        {typeof classId === "number" && (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-100 text-xs">
                  <thead className="bg-slate-50 text-start font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5">Subject</th>
                      <th className="px-2 py-1.5 text-end">Target</th>
                      <th className="px-2 py-1.5 text-end">Actual</th>
                      <th className="px-2 py-1.5 text-end">Capacity %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subjectStats.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-2 py-3 text-center text-slate-400">
                          No subjects assigned to this section yet.
                        </td>
                      </tr>
                    )}
                    {subjectStats.map((s) => (
                      <tr key={s.id}>
                        <td className="px-2 py-1.5 text-slate-700">{s.name}</td>
                        <td className="px-2 py-1.5 text-end text-slate-500">{s.target}</td>
                        <td className="px-2 py-1.5 text-end text-slate-500">{s.actual}</td>
                        <td className="px-2 py-1.5 text-end text-slate-500">{s.capacity}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-100 text-xs">
                  <thead className="bg-slate-50 text-start font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5">Teachers</th>
                      <th className="px-2 py-1.5 text-end">Target</th>
                      <th className="px-2 py-1.5 text-end">Actual Class</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teacherStats.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-2 py-3 text-center text-slate-400">
                          No teachers scheduled yet.
                        </td>
                      </tr>
                    )}
                    {teacherStats.map((t) => (
                      <tr key={t.id}>
                        <td className="px-2 py-1.5 text-slate-700" dir="rtl">
                          <button type="button" onClick={() => setSummaryTeacherId(t.id)} className="hover:underline">
                            {t.name}
                          </button>
                        </td>
                        <td className="px-2 py-1.5 text-end text-slate-500">{t.target}</td>
                        <td className="px-2 py-1.5 text-end text-slate-500">{t.actual}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full table-fixed divide-y divide-slate-100 text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="w-20 px-2 py-2 text-start font-semibold uppercase tracking-wide">Days</th>
                    {periods.map((p) => (
                      <th key={p.id} className="px-1.5 py-2 text-center font-semibold">
                        {p.start_time}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {DAY_LABELS.map((label, day) => (
                    <tr key={day}>
                      <td className="px-2 py-1.5 text-right font-medium text-slate-600" dir="rtl">
                        {label}
                      </td>
                      {periods.map((p) => {
                        const entry = entryFor(day, p.period_no);
                        const color = entry?.subject_id
                          ? subjects.find((s) => s.id === entry.subject_id)?.color
                          : null;
                        const teacherId = entry?.teacher_id ?? null;
                        return (
                          <td key={p.id} className="px-1 py-1 align-top">
                            <div
                              className={`flex h-12 w-full flex-col overflow-hidden rounded-lg border text-[11px] font-medium transition ${
                                entry
                                  ? "border-slate-200 bg-white hover:border-slate-300"
                                  : "border-dashed border-slate-200 text-slate-300 hover:border-brand-300 hover:text-brand-400"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => openCell(day, p.period_no)}
                                disabled={posted}
                                style={entry && color ? { color } : undefined}
                                className={`flex-1 px-1 text-center ${
                                  entry && !color ? "text-slate-700" : ""
                                } disabled:cursor-not-allowed disabled:opacity-60`}
                              >
                                {entry ? entry.subject : "+"}
                              </button>
                              {teacherId && entry?.teacher_name && (
                                <button
                                  type="button"
                                  onClick={() => setSummaryTeacherId(teacherId)}
                                  title={entry.teacher_name}
                                  dir="rtl"
                                  className="truncate border-t border-slate-100 px-1 text-[9px] font-normal text-slate-400 transition hover:text-brand-600 hover:underline"
                                >
                                  {entry.teacher_name}
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {loading && <p className="mt-3 text-center text-xs text-slate-400">Loading…</p>}

        {editingCell &&
          (() => {
            const dayLabel = DAY_LABELS[editingCell.day];
            return (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-950/50 p-4" onClick={() => setEditingCell(null)}>
                <div
                  className="w-full max-w-xs rounded-xl bg-white p-4 shadow-2xl ring-1 ring-black/5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="mb-3 text-xs font-medium text-slate-500">
                    {dayLabel} &middot; {editingCell.periodNo}
                  </p>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Subject</label>
                  <select
                    value={cellSubjectId}
                    onChange={(e) => chooseCellSubject(e.target.value ? Number(e.target.value) : "")}
                    className={`${selectCls} mb-3`}
                    autoFocus
                  >
                    <option value="">—</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Teacher</label>
                  <select
                    value={cellTeacherId}
                    onChange={(e) => setCellTeacherId(e.target.value ? Number(e.target.value) : "")}
                    className={selectCls}
                  >
                    <option value="">—</option>
                    {cellTeacherOptions.map((t) => (
                      <option key={t.employee_id} value={t.employee_id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {cellSubjectId && cellTeacherOptions.length === 0 && (
                    <p className="mb-1 mt-1 text-[11px] text-amber-600">
                      No teacher is assigned to this subject yet — set it from Employees &gt; Section.
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between">
                    <button onClick={removeCell} className="text-sm text-red-600 hover:underline">
                      Remove
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingCell(null)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveCell}
                        disabled={!cellSubjectId}
                        className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
        <button
          onClick={onBack}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Back to Time Tables
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={togglePost}
            disabled={typeof classId !== "number"}
            className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-40"
          >
            {posted ? <Unlock size={14} /> : <Send size={14} />}
            {posted ? "Un-post" : "Time Table Post"}
          </button>
          <button
            onClick={randomFill}
            disabled={typeof classId !== "number" || posted}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <Shuffle size={14} />
            Random Table
          </button>
          <button
            onClick={() => window.print()}
            disabled={typeof classId !== "number"}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <Printer size={14} />
            Reports
          </button>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 hover:-translate-y-0.5"
          >
            <Save size={14} />
            Save
          </button>
        </div>
      </div>

      {summaryTeacherId != null && (
        <TeacherSummaryModal employeeId={summaryTeacherId} onClose={() => setSummaryTeacherId(null)} />
      )}
    </div>
  );
}
