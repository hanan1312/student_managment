import { useEffect, useMemo, useState } from "react";
import { X, Wallet, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";
import type { FeeType, Student } from "../lib/types";

type Props = {
  student: Student;
  onClose: () => void;
};

export default function StudentExpendItemsModal({ student, onClose }: Props) {
  const { token } = useAuth();
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([api.getFeeTypes(token), api.getStudentFeeItems(token, student.id)])
      .then(([feeTypesRes, assignedRes]) => {
        setFeeTypes(feeTypesRes.feeTypes);
        setSelected(new Set(assignedRes.feeTypeIds));
      })
      .catch(() => setError("Could not load Expend Items."))
      .finally(() => setLoading(false));
  }, [token, student.id]);

  const visible = useMemo(
    () => feeTypes.filter((f) => !filter.trim() || f.name.toLowerCase().includes(filter.trim().toLowerCase())),
    [feeTypes, filter]
  );

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const persist = async () => {
    if (!token) return false;
    setSaving(true);
    setError(null);
    try {
      await api.setStudentFeeItems(token, student.id, [...selected]);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const update = () => {
    void persist();
  };

  const save = async () => {
    if (await persist()) onClose();
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <Wallet size={18} className="text-brand-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-800">Expend Items</h2>
              <p className="text-xs text-slate-400" dir="rtl">
                {student.name}
              </p>
            </div>
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
              placeholder="Expend item"
              className="w-full rounded-lg border border-slate-200 py-1.5 ps-8 pe-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          {loading ? (
            <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">Item</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-2 py-6 text-center text-slate-400">
                      No Expend Items found.
                    </td>
                  </tr>
                )}
                {visible.map((f, i) => (
                  <tr
                    key={f.id}
                    onClick={() => toggle(f.id)}
                    className={`cursor-pointer ${selected.has(f.id) ? "bg-amber-100/70" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-2 py-1.5 text-slate-500">{i + 1}</td>
                    <td className="px-2 py-1.5 text-slate-700" dir="rtl">
                      {f.name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
              onClick={update}
              disabled={saving}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              Update
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 hover:-translate-y-0.5 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
