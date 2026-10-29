import { useEffect, useState } from "react";
import { X, BarChart3 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";
import type { AttendanceAnalysisRow } from "../lib/types";

type Props = {
  classId: number | null;
  onClose: () => void;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function AttendanceAnalysisModal({ classId, onClose }: Props) {
  const { token } = useAuth();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<AttendanceAnalysisRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.getAttendanceAnalysis(token, { classId: classId ?? undefined, from, to });
      setRows(res.rows);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not load analysis.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, from, to, classId]);

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-brand-500" />
            <h2 className="text-base font-semibold text-slate-800">Attendance Analysis</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-xs">
          <label className="font-medium text-slate-500">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500"
          />
          <label className="font-medium text-slate-500">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500"
          />
        </div>

        {errorMsg && <p className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{errorMsg}</p>}

        <div className="overflow-y-auto px-5 py-3">
          {loading && <p className="py-8 text-center text-sm text-slate-400">Loading…</p>}
          {!loading && rows.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">No students in the current view.</p>
          )}
          {!loading && rows.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1.5">Student</th>
                  <th className="py-1.5 text-center">Present</th>
                  <th className="py-1.5 text-center">Late</th>
                  <th className="py-1.5 text-center">Absent</th>
                  <th className="py-1.5 text-end">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.student_id}>
                    <td className="py-1.5 font-medium text-slate-800" dir="rtl">
                      {r.student_name}
                    </td>
                    <td className="py-1.5 text-center text-emerald-700">{r.present_count}</td>
                    <td className="py-1.5 text-center text-amber-700">{r.late_count}</td>
                    <td className="py-1.5 text-center text-red-600">{r.absent_count}</td>
                    <td className="py-1.5 text-end font-medium text-slate-700">
                      {r.attendance_rate == null ? "—" : `${r.attendance_rate}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
