import { useEffect, useState } from "react";
import { X, Link2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import type { TimetableTeacher } from "../../lib/types";
import TeacherSummaryModal from "./TeacherSummaryModal";

// "Teachers Link" — a read-only roster (same source as the Teachers tile) whose whole job is
// to jump into a teacher's load summary: classes assigned, sessions per class, Periods Share
// vs. actual, and the overage price when they're over-assigned.
export default function TeachersLinkModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const [teachers, setTeachers] = useState<TimetableTeacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [summaryId, setSummaryId] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .getTimetableTeachers(token)
      .then((res) => setTeachers(res.teachers))
      .catch(() => setTeachers([]))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <Link2 size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800">Teachers Link</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-1.5">#</th>
                <th className="px-2 py-1.5">Teacher</th>
                <th className="px-2 py-1.5 text-end">Periods Share</th>
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
              {!loading && teachers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-6 text-center text-slate-400">
                    No teachers found.
                  </td>
                </tr>
              )}
              {!loading &&
                teachers.map((t, i) => (
                  <tr key={t.employee_id} className="hover:bg-slate-50">
                    <td className="px-2 py-1.5 text-slate-500">{i + 1}</td>
                    <td className="px-2 py-1.5 text-slate-700" dir="rtl">
                      <button type="button" onClick={() => setSummaryId(t.employee_id)} className="hover:underline">
                        {t.name}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-end text-slate-500">{t.periods_share ?? "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
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

      {summaryId != null && <TeacherSummaryModal employeeId={summaryId} onClose={() => setSummaryId(null)} />}
    </div>
  );
}
