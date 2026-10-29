import { useMemo, useState } from "react";
import { Search } from "lucide-react";

export type FilterOption = { value: string; count: number };

// The per-column filter popover from the Students table, generalized so any other table can
// reuse the exact same "click a header, tick values, Done" interaction instead of growing its
// own copy.
export default function ColumnFilterMenu({
  anchorRect,
  label,
  options,
  active,
  onChange,
  onClose,
}: {
  anchorRect: DOMRect;
  label: string;
  options: FilterOption[];
  active: Set<string> | null;
  onChange: (next: Set<string> | null) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const allValues = useMemo(() => options.map((o) => o.value), [options]);
  const selected = active ?? new Set(allValues);
  const visibleOptions = options.filter((o) => o.value.toLowerCase().includes(search.toLowerCase()));

  const toggleValue = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next.size >= allValues.length ? null : next);
  };

  const menuWidth = 240;
  // Right-to-left page: line the menu up with the anchor's right edge, kept on screen.
  const left = Math.max(8, Math.min(anchorRect.right - menuWidth, window.innerWidth - menuWidth - 8));
  const top = anchorRect.bottom + 4;

  return (
    <div
      data-col-filter-popover
      style={{ position: "fixed", top, left, width: menuWidth }}
      className="animate-scale-in z-50 origin-top-left rounded-xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-black/5"
    >
      <p className="mb-1.5 truncate px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        تصفية: {label}
      </p>
      <div className="relative mb-2">
        <Search size={12} className="pointer-events-none absolute start-2 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث في القيم…"
          className="w-full rounded-md border border-slate-200 py-1 ps-6 pe-2 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className="mb-1.5 flex items-center justify-between px-0.5 text-[11px] font-medium text-brand-600">
        <button type="button" onClick={() => onChange(null)} className="hover:underline">
          تحديد الكل
        </button>
        <button type="button" onClick={() => onChange(new Set())} className="hover:underline">
          مسح
        </button>
      </div>
      <div className="max-h-48 space-y-0.5 overflow-y-auto">
        {visibleOptions.length === 0 && <p className="px-1 py-2 text-center text-[11px] text-slate-400">لا توجد قيم</p>}
        {visibleOptions.map(({ value, count }) => (
          <label
            key={value || "(blank)"}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            <input
              type="checkbox"
              checked={selected.has(value)}
              onChange={() => toggleValue(value)}
              className="h-3.5 w-3.5 accent-brand-600"
            />
            <span className="flex-1 truncate">{value || "(فارغ)"}</span>
            <span className="text-[10px] text-slate-300">{count}</span>
          </label>
        ))}
      </div>
      <div className="mt-2 flex justify-end border-t border-slate-100 pt-1.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-700"
        >
          تم
        </button>
      </div>
    </div>
  );
}
