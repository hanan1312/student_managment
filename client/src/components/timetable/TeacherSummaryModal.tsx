import { useEffect, useState } from "react";
import { X, GraduationCap } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../lib/api";
import type { TeacherSummary } from "../../lib/types";

// Shared by the Teachers modal, Teachers Link tab, and a teacher's name inside the class
// timetable grid — one place answers "how loaded is this teacher": every class they're in
// with session counts, their HR & Staff Periods Share target vs. actual, and (when they're
// over-assigned) the overage price from their subject's per-period price.
export default function TeacherSummaryModal({ employeeId, onClose }: { employeeId: number; onClose: () => void }) {
  const { token } = useAuth();
  const [summary, setSummary] = useState<TeacherSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    api
      .getTeacherSummary(token, employeeId)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load teacher summary."))
      .finally(() => setLoading(false));
  }, [token, employeeId]);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-rise-in w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <GraduationCap size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800" dir="rtl">
              {summary?.employee.name ?? "Teacher"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {loading && <p className="py-6 text-center text-sm text-slate-400">Loading…</p>}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

          {summary && (
            <>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Class</th>
                      <th className="px-3 py-2 text-end">Sessions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.classes.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-4 text-center text-slate-400">
                          Not assigned to any class yet.
                        </td>
                      </tr>
                    )}
                    {summary.classes.map((c) => (
                      <tr key={c.class_id}>
                        <td className="px-3 py-2 text-slate-700">{c.class_name}</td>
                        <td className="px-3 py-2 text-end text-slate-500">{c.sessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-400">Periods Share</p>
                  <p className="font-semibold text-slate-700">{summary.employee.periodsShare}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-400">Total Actual</p>
                  <p className="font-semibold text-slate-700">{summary.totalActual}</p>
                </div>
                <div className={`rounded-lg px-3 py-2 ${summary.remaining < 0 ? "bg-red-50" : "bg-emerald-50"}`}>
                  <p className="text-[11px] text-slate-400">Remaining</p>
                  <p className={`font-semibold ${summary.remaining < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {summary.remaining}
                  </p>
                </div>
                {summary.remaining < 0 && (
                  <div className="rounded-lg bg-red-50 px-3 py-2">
                    <p className="text-[11px] text-slate-400">Overage Price</p>
                    <p className="font-semibold text-red-600">{summary.price}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
