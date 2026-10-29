import { useEffect, useState } from "react";
import { X, UserX } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";
import type { Student } from "../lib/types";

type Props = {
  classId: number | null;
  onClose: () => void;
  onMarked: () => void;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function NoShowModal({ classId, onClose, onMarked }: Props) {
  const { token } = useAuth();
  const [date, setDate] = useState(today());
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<number | null>(null);
  const [bulkMarking, setBulkMarking] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.getNoShow(token, { classId: classId ?? undefined, date });
      setStudents(res.students);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not load no-show list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, date, classId]);

  const markAbsent = async (student: Student) => {
    if (!token) return;
    setMarkingId(student.id);
    try {
      await api.saveAttendanceBulk(token, date, [
        { studentId: student.id, classId: student.class_id ?? undefined, status: "absent" },
      ]);
      await load();
      onMarked();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not mark absent.");
    } finally {
      setMarkingId(null);
    }
  };

  const markAllAbsent = async () => {
    if (!token || students.length === 0) return;
    setBulkMarking(true);
    try {
      await api.saveAttendanceBulk(
        token,
        date,
        students.map((s) => ({ studentId: s.id, classId: s.class_id ?? undefined, status: "absent" }))
      );
      await load();
      onMarked();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not mark all absent.");
    } finally {
      setBulkMarking(false);
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <UserX size={16} className="text-amber-500" />
            <h2 className="text-base font-semibold text-slate-800">No Show</h2>
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
          <p className="ms-auto text-xs text-slate-400">Not yet marked present, late or absent</p>
        </div>

        {errorMsg && <p className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{errorMsg}</p>}

        <div className="overflow-y-auto px-5 py-3">
          {loading && <p className="py-8 text-center text-sm text-slate-400">Loading…</p>}
          {!loading && students.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">Everyone in view has been marked for this date.</p>
          )}
          {!loading &&
            students.map((s) => (
              <div key={s.id} className="flex items-center justify-between border-b border-slate-50 py-2 last:border-b-0">
                <div>
                  <p className="text-sm font-medium text-slate-700" dir="rtl">
                    {s.name}
                  </p>
                  <p className="text-xs text-slate-400">{s.section ?? "Unassigned"}</p>
                </div>
                <button
                  onClick={() => markAbsent(s)}
                  disabled={markingId === s.id}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Mark absent
                </button>
              </div>
            ))}
        </div>

        {students.length > 0 && (
          <div className="flex justify-end border-t border-slate-100 px-5 py-4">
            <button
              onClick={markAllAbsent}
              disabled={bulkMarking}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {bulkMarking ? "Marking…" : "Mark all as absent"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
