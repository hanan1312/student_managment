import { useEffect, useState } from "react";
import { X, DollarSign, Printer } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSchools } from "../../context/SchoolsContext";
import { useHrEmployees } from "../../context/HrEmployeesContext";
import { api, ApiError } from "../../lib/api";
import type { HrPayrollLine } from "../../lib/types";
import HrPayslipPrintView from "./HrPayslipPrintView";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function LoadSalaryModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const { selectedSchoolId, selectedSchool } = useSchools();
  const { employees } = useHrEmployees();
  const [month, setMonth] = useState(currentMonth());
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [lines, setLines] = useState<HrPayrollLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printLine, setPrintLine] = useState<HrPayrollLine | null>(null);

  const openPeriod = async () => {
    if (!token || !selectedSchoolId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.createHrPayrollPeriod(token, selectedSchoolId, month);
      setPeriodId(res.period.id);
      const linesRes = await api.getHrPayrollLines(token, res.period.id);
      setLines(linesRes.lines);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open this period.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    openPeriod();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedSchoolId, month]);

  const load = async () => {
    if (!token || !periodId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.loadHrPayroll(token, periodId);
      setLines(res.lines);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not compute salaries.");
    } finally {
      setLoading(false);
    }
  };

  const printEmployee = printLine ? employees.find((e) => e.id === printLine.employee_id) ?? null : null;

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800">Load Salary</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

          <div className="mb-3 flex items-center gap-3">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
            />
            <button
              onClick={load}
              disabled={loading || !periodId}
              className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 disabled:opacity-60"
            >
              {loading ? "Working…" : "Load Salary"}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Basic</th>
                  <th className="px-3 py-2">Additions</th>
                  <th className="px-3 py-2">Deductions</th>
                  <th className="px-3 py-2">Leave Ded.</th>
                  <th className="px-3 py-2">Tax</th>
                  <th className="px-3 py-2">Net</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-1.5 font-medium text-slate-700">{l.employee_name}</td>
                    <td className="px-3 py-1.5">{money(l.basic_salary)}</td>
                    <td className="px-3 py-1.5 text-emerald-600">+{money(l.additions_total)}</td>
                    <td className="px-3 py-1.5 text-red-600">-{money(l.deductions_total)}</td>
                    <td className="px-3 py-1.5 text-red-600">-{money(l.leave_deduction)}</td>
                    <td className="px-3 py-1.5 text-red-600">-{money(l.tax_total)}</td>
                    <td className="px-3 py-1.5 font-semibold text-slate-800">{money(l.net_salary)}</td>
                    <td className="px-3 py-1.5">
                      <button onClick={() => setPrintLine(l)} className="text-slate-400 hover:text-brand-600">
                        <Printer size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                      Not loaded yet for {month} — click Load Salary.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Close
          </button>
        </div>
      </div>

      {printLine && selectedSchool && (
        <HrPayslipPrintView
          employee={printEmployee}
          school={selectedSchool}
          line={printLine}
          month={month}
          onClose={() => setPrintLine(null)}
        />
      )}
    </div>
  );
}
