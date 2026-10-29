import { useState } from "react";
import { X, Building2, Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import { useSchools } from "../../context/SchoolsContext";

export default function SchoolsSwitcherModal({ onClose }: { onClose: () => void }) {
  const { schools, selectedSchoolId, setSelectedSchoolId, createSchool, updateSchool, deleteSchool } = useSchools();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startAdd = () => {
    setName("");
    setEditingId(null);
    setAdding(true);
  };

  const startEdit = (id: number, currentName: string) => {
    setName(currentName);
    setEditingId(id);
    setAdding(true);
  };

  const save = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      if (editingId) await updateSchool(editingId, { name: name.trim() });
      else await createSchool({ name: name.trim() });
      setAdding(false);
    } catch {
      setError("Could not save the school.");
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("Remove this school? Its employees/attendance/leave data stays but becomes unreachable from the switcher.")) return;
    try {
      await deleteSchool(id);
    } catch {
      setError("Could not remove the school — at least one school is required.");
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800">My Schools</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

          <div className="space-y-1.5">
            {schools.map((s) => (
              <div
                key={s.id}
                onClick={() => setSelectedSchoolId(s.id)}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                  s.id === selectedSchoolId ? "border-brand-200 bg-brand-50/60 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Building2 size={15} className={s.id === selectedSchoolId ? "text-brand-600" : "text-slate-400"} />
                <span className="flex-1 truncate">{s.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(s.id, s.name);
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  title="Rename"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(s.id);
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Remove"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {adding ? (
            <div className="mt-3 flex items-center gap-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="School name"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              <button
                onClick={save}
                className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
              >
                Save
              </button>
              <button
                onClick={() => setAdding(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={startAdd}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
            >
              <Plus size={13} />
              Add school
            </button>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Close
          </button>
          <button
            onClick={() => {
              if (selectedSchoolId) onClose();
            }}
            disabled={!selectedSchoolId}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
          >
            Go To School
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
