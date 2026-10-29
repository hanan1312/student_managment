import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { Bus, BusInput } from "../lib/types";

type Props = {
  initial?: Bus | null;
  onClose: () => void;
  onSubmit: (input: BusInput) => Promise<void>;
};

export default function BusFormModal({ initial, onClose, onSubmit }: Props) {
  const isEdit = Boolean(initial);

  const [routeName, setRouteName] = useState(initial?.route_name ?? "");
  const [plateNumber, setPlateNumber] = useState(initial?.plate_number ?? "");
  const [driverName, setDriverName] = useState(initial?.driver_name ?? "");
  const [driverPhone, setDriverPhone] = useState(initial?.driver_phone ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!routeName.trim()) {
      setError("Route name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        routeName: routeName.trim(),
        plateNumber: plateNumber.trim() || undefined,
        driverName: driverName.trim() || undefined,
        driverPhone: driverPhone.trim() || undefined,
        capacity: capacity ? Number(capacity) : undefined,
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">{isEdit ? "Edit Bus" : "New Bus"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Route name</label>
            <input
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300"
              placeholder="e.g. Route 3 – Nasr City"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Plate number</label>
              <input
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Capacity</label>
              <input
                type="number"
                min="0"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Driver name</label>
              <input
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Driver phone</label>
              <input
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300"
            />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-600/30 active:translate-y-0 disabled:opacity-60"
            >
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Add bus"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
