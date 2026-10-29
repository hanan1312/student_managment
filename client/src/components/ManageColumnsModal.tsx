import { X, RotateCcw } from "lucide-react";

export type ColumnDef<K extends string> = { key: K; label: string };

// Generic column-visibility picker — the same "Manage Columns" pattern StudentsTable.tsx
// pioneered, factored out so any other table (HR Employees, Management's Staff view, …) can
// reuse it instead of growing its own copy.
export default function ManageColumnsModal<K extends string>({
  columns,
  visible,
  onToggle,
  onClose,
  onReset,
}: {
  columns: ColumnDef<K>[];
  visible: Set<K>;
  onToggle: (key: K) => void;
  onClose: () => void;
  onReset: () => void;
}) {
  return (
    <div
      className="animate-fade-in fixed inset-0 z-40 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-rise-in flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">أعمدة الجدول</h2>
            <p className="text-xs text-slate-400">اختر البيانات التي تظهر في الجدول.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-2">
            {columns.map((col) => (
              <label
                key={col.key}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:border-brand-200 hover:bg-brand-50/40"
              >
                <input
                  type="checkbox"
                  checked={visible.has(col.key)}
                  onChange={() => onToggle(col.key)}
                  className="h-4 w-4 accent-brand-600"
                />
                {col.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-between gap-2 border-t border-slate-100 px-5 py-4">
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <RotateCcw size={13} />
            استعادة الافتراضي
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-600/30 active:translate-y-0"
          >
            تم
          </button>
        </div>
      </div>
    </div>
  );
}

export function loadVisibleColumnKeys<K extends string>(storageKey: string, defaultKeys: K[]): K[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultKeys;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : defaultKeys;
  } catch {
    return defaultKeys;
  }
}

export function saveVisibleColumnKeys<K extends string>(storageKey: string, keys: K[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}

// Persists a full start-to-right column order (drag-to-reorder), separately from which columns
// are visible. `defaultOrder` also acts as the allowlist: any stored key no longer known is
// dropped, and any known key missing from storage (e.g. a newly added column) is appended at
// the end rather than silently disappearing.
export function loadColumnOrder<K extends string>(storageKey: string, defaultOrder: K[]): K[] {
  try {
    const raw = localStorage.getItem(`${storageKey}:order`);
    if (!raw) return defaultOrder;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultOrder;
    const known = new Set(defaultOrder);
    const ordered = parsed.filter((k): k is K => known.has(k));
    const missing = defaultOrder.filter((k) => !ordered.includes(k));
    return [...ordered, ...missing];
  } catch {
    return defaultOrder;
  }
}

export function saveColumnOrder<K extends string>(storageKey: string, order: K[]) {
  try {
    localStorage.setItem(`${storageKey}:order`, JSON.stringify(order));
  } catch {
    /* ignore */
  }
}
