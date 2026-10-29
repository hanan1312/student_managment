import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { Student } from "../lib/types";

type Props = {
  value: { id: number; label: string } | null;
  onChange: (student: { id: number; label: string } | null) => void;
  placeholder?: string;
};

export default function StudentPicker({ value, onChange, placeholder = "Search student by name…" }: Props) {
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token || !query.trim()) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const res = await api.getStudents(token, { q: query.trim() });
        setResults(res.students.slice(0, 20));
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [token, query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
        <span className="font-medium text-slate-800" dir="rtl">
          {value.label}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 py-2 ps-9 pe-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>
      {open && query.trim() && (
        <div className="absolute z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">No matches.</div>}
          {results.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => {
                onChange({ id: s.id, label: s.name });
                setQuery("");
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-brand-50"
            >
              <span dir="rtl">{s.name}</span>
              <span className="text-xs text-slate-400">{s.section ?? ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
