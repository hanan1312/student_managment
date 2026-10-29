import { useEffect, useMemo, useState } from "react";
import { X, GraduationCap, Search } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../lib/api";
import type { TimetableTeacher } from "../../lib/types";
import TeacherSummaryModal from "./TeacherSummaryModal";

export default function TeachersModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const [teachers, setTeachers] = useState<TimetableTeacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pending, setPending] = useState<Map<number, boolean>>(new Map());
  const [saving, setSaving] = useState(false);
  const [summaryId, setSummaryId] = useState<number | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.getTimetableTeachers(token);
      setTeachers(res.teachers);
      setPending(new Map());
    } catch {
      setError(
        "Could not load teachers from HR & Staff. Employees are synced in from the المدرسين division there."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const visible = useMemo(() => {
    return teachers
      .filter((t) => !filter.trim() || t.name.toLowerCase().includes(filter.trim().toLowerCase()))
      .filter((t) => !activeOnly || (pending.get(t.employee_id) ?? Boolean(t.active)));
  }, [teachers, filter, activeOnly, pending]);

  const toggleActive = (employeeId: number, current: boolean) => {
    setPending((prev) => {
      const next = new Map(prev);
      next.set(employeeId, !current);
      return next;
    });
  };

  const save = async () => {
    if (!token || pending.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      for (const [employeeId, active] of pending) {
        await api.setTimetableTeacherActive(token, employeeId, active);
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = async () => {
    if (!token || selectedId == null) return;
    try {
      await api.clearTimetableTeacherOverride(token, selectedId);
      setSelectedId(null);
      await load();
    } catch {
      setError("Could not reset this teacher.");
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <GraduationCap size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800">Teachers</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <div className="relative flex-1">
            <Search size={13} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Teacher"
              className="w-full rounded-lg border border-slate-200 py-1.5 ps-8 pe-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-brand-600"
            />
            Active
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-1.5">#</th>
                <th className="px-2 py-1.5">Teacher</th>
                <th className="px-2 py-1.5 text-center">actv</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={3} className="px-2 py-6 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-6 text-center text-slate-400">
                    No teachers found. Assign employees to the المدرسين division
                    in HR &amp; Staff &gt; Employees.
                  </td>
                </tr>
              )}
              {!loading &&
                visible.map((t, i) => {
                  const active = pending.get(t.employee_id) ?? Boolean(t.active);
                  return (
                    <tr
                      key={t.employee_id}
                      onClick={() => setSelectedId(t.employee_id)}
                      className={`cursor-pointer ${selectedId === t.employee_id ? "bg-brand-50/60" : "hover:bg-slate-50"}`}
                    >
                      <td className="px-2 py-1.5 text-slate-500">{i + 1}</td>
                      <td className="px-2 py-1.5 text-slate-700" dir="rtl">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSummaryId(t.employee_id);
                          }}
                          className="hover:underline"
                        >
                          {t.name}
                        </button>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleActive(t.employee_id, active);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-3.5 w-3.5 accent-brand-600"
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Close
          </button>
          <div className="flex gap-2">
            <button
              onClick={removeOverride}
              disabled={selectedId == null}
              className="rounded-lg border border-red-200 px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              Delete
            </button>
            <button
              onClick={save}
              disabled={saving || pending.size === 0}
              className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 hover:-translate-y-0.5 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {summaryId != null && <TeacherSummaryModal employeeId={summaryId} onClose={() => setSummaryId(null)} />}
    </div>
  );
}
