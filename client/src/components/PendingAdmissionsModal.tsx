import { useEffect, useState } from "react";
import { Check, X, XCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";
import type { Admission, ClassStage } from "../lib/types";

type Props = {
  tree: ClassStage[];
  onClose: () => void;
  onApproved: () => void;
};

type FlatClass = { id: number; label: string };

function flattenTree(tree: ClassStage[]): FlatClass[] {
  return tree.flatMap((stage) =>
    stage.levels.flatMap((level) =>
      level.classes.map((cls) => ({ id: cls.id, label: `${level.level} · ${cls.className}` }))
    )
  );
}

export default function PendingAdmissionsModal({ tree, onClose, onApproved }: Props) {
  const { token } = useAuth();
  const flatClasses = flattenTree(tree);

  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chosenClass, setChosenClass] = useState<Record<number, number | "">>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.getAdmissions(token, "pending");
      setAdmissions(res.admissions);
      setChosenClass((prev) => {
        const next = { ...prev };
        for (const a of res.admissions) {
          if (!(a.id in next)) next[a.id] = a.desired_class_id ?? "";
        }
        return next;
      });
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not load admissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleApprove = async (a: Admission) => {
    if (!token) return;
    setBusyId(a.id);
    setErrorMsg(null);
    try {
      const classId = chosenClass[a.id];
      await api.approveAdmission(token, a.id, typeof classId === "number" ? classId : undefined);
      await load();
      onApproved();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not approve admission.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (a: Admission) => {
    if (!token) return;
    setBusyId(a.id);
    setErrorMsg(null);
    try {
      await api.rejectAdmission(token, a.id);
      await load();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not reject admission.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">Pending Admissions ({admissions.length})</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {errorMsg && <p className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{errorMsg}</p>}

        <div className="overflow-y-auto px-5 py-4">
          {loading && <p className="py-8 text-center text-sm text-slate-400">Loading…</p>}
          {!loading && admissions.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">No pending admissions.</p>
          )}
          <div className="space-y-3">
            {admissions.map((a) => (
              <div key={a.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-800" dir="rtl">
                      {a.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {a.gender === "M" ? "Male" : "Female"}
                      {a.guardian_name ? ` · Guardian: ${a.guardian_name}` : ""}
                      {a.guardian_phone ? ` · ${a.guardian_phone}` : ""}
                    </p>
                    {a.notes && <p className="mt-1 text-xs text-slate-500">{a.notes}</p>}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={chosenClass[a.id] ?? ""}
                    onChange={(e) =>
                      setChosenClass((prev) => ({ ...prev, [a.id]: e.target.value ? Number(e.target.value) : "" }))
                    }
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-500"
                  >
                    <option value="">No class yet</option>
                    {flatClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleApprove(a)}
                    disabled={busyId === a.id}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check size={13} />
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(a)}
                    disabled={busyId === a.id}
                    className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <XCircle size={13} />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
