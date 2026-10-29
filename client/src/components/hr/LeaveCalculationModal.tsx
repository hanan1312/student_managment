import { useEffect, useState } from "react";
import { X, CalendarRange } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSchools } from "../../context/SchoolsContext";
import { api } from "../../lib/api";
import type { HrLeaveSummaryRow } from "../../lib/types";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function LeaveCalculationModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const { selectedSchoolId } = useSchools();
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<HrLeaveSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!token || !selectedSchoolId) return;
    setLoading(true);
    try {
      const res = await api.getHrLeaveSummary(token, selectedSchoolId, month);
      setRows(res.rows.filter((r) => r.leave_days > 0));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedSchoolId, month]);

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarRange size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800">Leves Calculation</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mb-3 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          />
          <p className="mb-3 text-xs text-slate-400">
            Leave days taken this month, deducted from salary at basic salary ÷ 30 per day when Load Salary runs.
          </p>

          {loading ? (
            <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Leave Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.employee_id}>
                      <td className="px-3 py-1.5 font-medium text-slate-700">{r.employee_name}</td>
                      <td className="px-3 py-1.5 text-red-600">{r.leave_days}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-3 py-6 text-center text-slate-400">
                        No leave taken this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
