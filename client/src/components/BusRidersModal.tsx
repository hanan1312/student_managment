import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";
import type { Bus, BusRider } from "../lib/types";
import StudentPicker from "./StudentPicker";

type Props = {
  bus: Bus;
  onClose: () => void;
  onChanged: () => void;
};

export default function BusRidersModal({ bus, onClose, onChanged }: Props) {
  const { token } = useAuth();
  const [riders, setRiders] = useState<BusRider[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newStudent, setNewStudent] = useState<{ id: number; label: string } | null>(null);
  const [pickupPoint, setPickupPoint] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.getBusRiders(token, bus.id);
      setRiders(res.students);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not load riders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus.id]);

  const handleAdd = async () => {
    if (!token || !newStudent) return;
    setAdding(true);
    setErrorMsg(null);
    try {
      await api.addBusRider(token, bus.id, { studentId: newStudent.id, pickupPoint: pickupPoint.trim() || undefined });
      setNewStudent(null);
      setPickupPoint("");
      await load();
      onChanged();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not add student.");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (studentId: number) => {
    if (!token) return;
    await api.removeBusRider(token, bus.id, studentId);
    await load();
    onChanged();
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">{bus.route_name}</h2>
            <p className="text-xs text-slate-400">
              {riders.length} rider{riders.length === 1 ? "" : "s"}
              {bus.capacity ? ` of ${bus.capacity} seats` : ""}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-end gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Add student</label>
            <StudentPicker value={newStudent} onChange={setNewStudent} />
          </div>
          <div className="w-32">
            <label className="mb-1 block text-xs font-medium text-slate-500">Pickup point</label>
            <input
              value={pickupPoint}
              onChange={(e) => setPickupPoint(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!newStudent || adding}
            className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus size={15} />
            Add
          </button>
        </div>

        {errorMsg && <p className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{errorMsg}</p>}

        <div className="max-h-72 overflow-y-auto px-5 py-3">
          {loading && <p className="py-6 text-center text-sm text-slate-400">Loading riders…</p>}
          {!loading && riders.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">No students assigned to this bus yet.</p>
          )}
          {!loading &&
            riders.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b border-slate-50 py-2 last:border-b-0">
                <div>
                  <p className="text-sm font-medium text-slate-800" dir="rtl">
                    {r.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {r.section ?? "Unassigned class"}
                    {r.pickup_point ? ` · Pickup: ${r.pickup_point}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(r.id)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Remove from bus"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
