import { useEffect, useState } from "react";
import { X, CalendarCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";
import type { AttendanceStatus, Student } from "../lib/types";

type Props = {
  students: Student[];
  classId: number | null;
  onClose: () => void;
  onSaved: () => void;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; className: string }[] = [
  { value: "present", label: "Present", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "late", label: "Late", className: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "absent", label: "Absent", className: "bg-red-50 text-red-700 border-red-200" },
];

export default function AttendanceModal({ students, classId, onClose, onSaved }: Props) {
  const { token } = useAuth();
  const [date, setDate] = useState(today());
  const [marks, setMarks] = useState<Record<number, AttendanceStatus>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.getAttendance(token, { classId: classId ?? undefined, date });
      const next: Record<number, AttendanceStatus> = {};
      for (const s of students) next[s.id] = "present";
      for (const r of res.records) next[r.student_id] = r.status;
      setMarks(next);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not load attendance.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, date]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const entries = students.map((s) => ({
        studentId: s.id,
        classId: s.class_id ?? undefined,
        status: marks[s.id] ?? "present",
      }));
      await api.saveAttendanceBulk(token, date, entries);
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(null), 2000);
      onSaved();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not save attendance.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarCheck size={16} className="text-brand-500" />
            <h2 className="text-base font-semibold text-slate-800">Take Attendance</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <label className="text-xs font-medium text-slate-500">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500"
          />
          <span className="ms-auto text-xs text-slate-400">
            {students.length} student{students.length === 1 ? "" : "s"}
          </span>
        </div>

        {errorMsg && <p className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{errorMsg}</p>}

        <div className="overflow-y-auto px-5 py-3">
          {loading && <p className="py-8 text-center text-sm text-slate-400">Loading roster…</p>}
          {!loading && students.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">No students in the current view.</p>
          )}
          {!loading &&
            students.map((s) => (
              <div key={s.id} className="flex items-center justify-between border-b border-slate-50 py-2 last:border-b-0">
                <span className="text-sm font-medium text-slate-700" dir="rtl">
                  {s.name}
                </span>
                <div className="flex gap-1">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setMarks((prev) => ({ ...prev, [s.id]: opt.value }))}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                        marks[s.id] === opt.value ? opt.className : "border-slate-200 text-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4">
          {savedAt && <span className="text-xs text-emerald-600">Saved.</span>}
          <button
            onClick={handleSave}
            disabled={saving || students.length === 0}
            className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-600/30 active:translate-y-0 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save attendance"}
          </button>
        </div>
      </div>
    </div>
  );
}
