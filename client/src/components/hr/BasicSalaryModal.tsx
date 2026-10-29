import { useState } from "react";
import { X, Wallet, Check } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useHrEmployees } from "../../context/HrEmployeesContext";
import { api, ApiError } from "../../lib/api";

export default function BasicSalaryModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const { employees, refresh } = useHrEmployees();
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (employeeId: number) => {
    if (!token) return;
    const raw = edits[employeeId];
    if (raw === undefined) return;
    const value = Number(raw);
    if (Number.isNaN(value)) return;
    setSavingId(employeeId);
    setError(null);
    try {
      await api.setHrBasicSalary(token, employeeId, value);
      setEdits((e) => {
        const next = { ...e };
        delete next[employeeId];
        return next;
      });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <Wallet size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800">Basic Salary</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          <div className="space-y-1.5">
            {employees.map((e) => {
              const value = edits[e.id] ?? String(e.basic_salary);
              const dirty = edits[e.id] !== undefined && edits[e.id] !== String(e.basic_salary);
              return (
                <div key={e.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <span className="flex-1 truncate text-slate-700">{e.name_ar}</span>
                  <input
                    type="number"
                    value={value}
                    onChange={(ev) => setEdits((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                    className="w-28 rounded-md border border-slate-200 px-2 py-1 text-end text-sm outline-none focus:border-brand-500"
                  />
                  {dirty && (
                    <button
                      onClick={() => save(e.id)}
                      disabled={savingId === e.id}
                      className="rounded-lg p-1 text-brand-600 hover:bg-brand-50 disabled:opacity-60"
                    >
                      <Check size={15} />
                    </button>
                  )}
                </div>
              );
            })}
            {employees.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No employees yet.</p>}
          </div>
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
