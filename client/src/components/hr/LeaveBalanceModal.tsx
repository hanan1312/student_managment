import { useEffect, useState } from "react";
import { X, Plus, Pencil, Trash2, Check, CalendarClock } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSchools } from "../../context/SchoolsContext";
import { useHrEmployees } from "../../context/HrEmployeesContext";
import { api, ApiError } from "../../lib/api";
import type { HrValuedItem, HrLeaveBalanceRow } from "../../lib/types";

// "Leaves Balance" — manages the leave-type catalog (same hr_valued_items rows the generic
// ValuedListModal would show) alongside a live employee x leave-type balance matrix, so adding
// a type here is immediately visible both as a column here and as a field in Add/Edit Employee
// > Position (see EmployeeFormModal.tsx's "Leave Balances" section).
export default function LeaveBalanceModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const { selectedSchoolId } = useSchools();
  const { employees } = useHrEmployees();
  const [types, setTypes] = useState<HrValuedItem[]>([]);
  const [balances, setBalances] = useState<HrLeaveBalanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("0");

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [typesRes, balancesRes] = await Promise.all([
        api.getHrValued(token, "leave_type", selectedSchoolId ?? undefined),
        selectedSchoolId ? api.getHrLeaveBalances(token, selectedSchoolId) : Promise.resolve({ balances: [] }),
      ]);
      setTypes(typesRes.items);
      setBalances(balancesRes.balances);
    } catch {
      setError("Could not load leave balances.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedSchoolId]);

  const balanceFor = (employeeId: number, leaveTypeId: number): number =>
    balances.find((b) => b.employee_id === employeeId && b.leave_type_id === leaveTypeId)?.balance ?? 0;

  const startAdd = () => {
    setName("");
    setAmount("0");
    setEditingId("new");
  };

  const startEdit = (t: HrValuedItem) => {
    setName(t.name);
    setAmount(String(t.amount));
    setEditingId(t.id);
  };

  const saveType = async () => {
    if (!token || !name.trim()) return;
    const numAmount = Number(amount) || 0;
    try {
      if (editingId === "new") {
        await api.createHrValued(token, { category: "leave_type", name: name.trim(), amount: numAmount });
      } else if (typeof editingId === "number") {
        await api.updateHrValued(token, editingId, { name: name.trim(), amount: numAmount });
      }
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this leave type.");
    }
  };

  const removeType = async (id: number) => {
    if (!token) return;
    if (!window.confirm("Remove this leave type? Existing ledger entries for it are kept.")) return;
    try {
      await api.deleteHrValued(token, id);
      await load();
    } catch {
      setError("Could not remove this leave type.");
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarClock size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800">Leaves Balance</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Leave Types</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {types.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600"
              >
                <span>{t.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  {t.amount} days/yr
                </span>
                <button onClick={() => startEdit(t)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <Pencil size={12} />
                </button>
                <button onClick={() => removeType(t.id)} className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {editingId === null && (
              <button
                onClick={startAdd}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
              >
                <Plus size={13} />
                Add leave type
              </button>
            )}
          </div>

          {editingId !== null && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              />
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Annual days"
                className="w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              />
              <button onClick={() => setEditingId(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={saveType} className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
                <Check size={12} />
                Save
              </button>
            </div>
          )}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Employee Balances</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">Employee</th>
                  {types.map((t) => (
                    <th key={t.id} className="whitespace-nowrap px-3 py-2 text-end">
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={types.length + 1} className="px-3 py-6 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && employees.length === 0 && (
                  <tr>
                    <td colSpan={types.length + 1} className="px-3 py-6 text-center text-slate-400">
                      No employees in this school yet.
                    </td>
                  </tr>
                )}
                {!loading &&
                  employees.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-700" dir="rtl">
                        {e.name_ar}
                      </td>
                      {types.map((t) => {
                        const bal = balanceFor(e.id, t.id);
                        return (
                          <td
                            key={t.id}
                            className={`px-3 py-1.5 text-end font-medium ${bal < 0 ? "text-red-600" : "text-slate-600"}`}
                          >
                            {bal}
                          </td>
                        );
                      })}
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
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
