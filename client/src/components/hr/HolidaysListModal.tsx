import { useEffect, useState } from "react";
import { X, CalendarDays, Plus, Pencil, Trash2, Check } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSchools } from "../../context/SchoolsContext";
import { api, ApiError } from "../../lib/api";
import type { HrHoliday } from "../../lib/types";

export default function HolidaysListModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const { selectedSchoolId } = useSchools();
  const [holidays, setHolidays] = useState<HrHoliday[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");

  const load = async () => {
    if (!token || !selectedSchoolId) return;
    setLoading(true);
    try {
      const res = await api.getHrHolidays(token, selectedSchoolId);
      setHolidays(res.holidays);
    } catch {
      setError("Could not load holidays.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedSchoolId]);

  const startAdd = () => {
    setName("");
    setDate("");
    setEditingId("new");
  };

  const startEdit = (h: HrHoliday) => {
    setName(h.name);
    setDate(h.date);
    setEditingId(h.id);
  };

  const save = async () => {
    if (!token || !selectedSchoolId || !name.trim() || !date) return;
    setError(null);
    try {
      if (editingId === "new") {
        await api.createHrHoliday(token, { schoolId: selectedSchoolId, name: name.trim(), date });
      } else if (typeof editingId === "number") {
        await api.updateHrHoliday(token, editingId, { name: name.trim(), date });
      }
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    }
  };

  const remove = async (id: number) => {
    if (!token) return;
    if (!window.confirm("Remove this holiday?")) return;
    try {
      await api.deleteHrHoliday(token, id);
      await load();
    } catch {
      setError("Could not remove.");
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800">Official Holidays</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          {loading ? (
            <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
          ) : (
            <div className="space-y-1.5">
              {holidays.map((h) => (
                <div key={h.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
                  <span className="flex-1 truncate">{h.name}</span>
                  <span className="text-xs text-slate-400">{h.date}</span>
                  <button onClick={() => startEdit(h)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => remove(h.id)} className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {editingId !== null ? (
            <div className="mt-3 space-y-2 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Holiday name"
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingId(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button onClick={save} className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
                  <Check size={12} />
                  Save
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={startAdd}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
            >
              <Plus size={13} />
              Add
            </button>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
