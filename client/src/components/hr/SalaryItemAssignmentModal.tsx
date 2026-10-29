import { useEffect, useState, type ComponentType } from "react";
import { X, Search, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSchools } from "../../context/SchoolsContext";
import { useHrEmployees } from "../../context/HrEmployeesContext";
import { api, ApiError } from "../../lib/api";
import type { HrSalaryCategory, HrSalaryItem, HrValuedItem } from "../../lib/types";

function today() {
  return new Date().toISOString().slice(0, 7);
}

type Props = {
  category: HrSalaryCategory;
  title: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  onClose: () => void;
};

export default function SalaryItemAssignmentModal({ category, title, icon: Icon, onClose }: Props) {
  const { token } = useAuth();
  const { selectedSchoolId } = useSchools();
  const { employees } = useHrEmployees();
  const [query, setQuery] = useState("");
  const [employeeId, setEmployeeId] = useState<number | null>(employees[0]?.id ?? null);
  const [items, setItems] = useState<HrSalaryItem[]>([]);
  const [catalog, setCatalog] = useState<HrValuedItem[]>([]);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("0");
  const [isPercentage, setIsPercentage] = useState(false);
  const [recurring, setRecurring] = useState(true);
  const [oneOffMonth, setOneOffMonth] = useState(today());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .getHrValued(token, category)
      .then((res) => setCatalog(res.items))
      .catch(() => setCatalog([]));
  }, [token, category]);

  const loadItems = async () => {
    if (!token || !employeeId) return;
    try {
      const res = await api.getHrSalaryItems(token, employeeId, category);
      setItems(res.items);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, employeeId, category]);

  const pickFromCatalog = (item: HrValuedItem) => {
    setLabel(item.name);
    setAmount(String(item.amount));
    setIsPercentage(Boolean(item.is_percentage));
  };

  const add = async () => {
    if (!token || !employeeId || !selectedSchoolId || !label.trim()) return;
    setError(null);
    try {
      await api.createHrSalaryItem(token, {
        employeeId,
        schoolId: selectedSchoolId,
        category,
        label: label.trim(),
        amount: Number(amount) || 0,
        isPercentage,
        recurring,
        oneOffMonth: recurring ? undefined : oneOffMonth,
      });
      setLabel("");
      setAmount("0");
      setIsPercentage(false);
      await loadItems();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add this item.");
    }
  };

  const remove = async (id: number) => {
    if (!token) return;
    await api.deleteHrSalaryItem(token, id);
    await loadItems();
  };

  const filteredEmployees = employees.filter((e) => e.name_ar.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex h-[75vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
            <div className="flex items-center gap-2">
              <Icon size={18} className="text-brand-600" />
              <h2 className="text-base font-semibold text-slate-800">{title}</h2>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

            {catalog.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-xs font-medium text-slate-500">Quick pick from catalog</p>
                <div className="flex flex-wrap gap-1.5">
                  {catalog.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => pickFromCatalog(c)}
                      className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                    >
                      {c.name} ({c.is_percentage ? `${c.amount}%` : c.amount})
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">Label</label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Amount</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input type="checkbox" checked={isPercentage} onChange={(e) => setIsPercentage(e.target.checked)} className="h-3.5 w-3.5 accent-brand-600" />
                    %
                  </label>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Recurs every month?</label>
                <div className="flex h-[42px] items-center gap-2">
                  <label className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                    Recurring
                  </label>
                  {!recurring && (
                    <input
                      type="month"
                      value={oneOffMonth}
                      onChange={(e) => setOneOffMonth(e.target.value)}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-brand-500"
                    />
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={add}
              disabled={!employeeId || !label.trim()}
              className="mt-3 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 disabled:opacity-60"
            >
              <Plus size={14} />
              Add
            </button>

            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Label</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-3 py-1.5">{i.label}</td>
                      <td className="px-3 py-1.5">{i.is_percentage ? `${i.amount}%` : i.amount}</td>
                      <td className="px-3 py-1.5 text-slate-500">{i.recurring ? "Recurring" : i.one_off_month}</td>
                      <td className="px-3 py-1.5">
                        <button onClick={() => remove(i.id)} className="text-slate-400 hover:text-red-600">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                        No items yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex w-72 shrink-0 flex-col border-s border-slate-100">
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find…"
                className="w-full rounded-lg border border-slate-200 py-1.5 ps-8 pe-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredEmployees.map((e) => (
              <button
                key={e.id}
                onClick={() => setEmployeeId(e.id)}
                className={`block w-full truncate px-3 py-2 text-start text-sm ${
                  e.id === employeeId ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {e.name_ar}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
