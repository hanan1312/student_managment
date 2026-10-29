import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { FeeType, Payment, PaymentInput } from "../lib/types";
import StudentPicker from "./StudentPicker";

const METHODS = ["cash", "card", "bank transfer", "cheque"];

type Props = {
  feeTypes: FeeType[];
  initial?: Payment | null;
  onClose: () => void;
  onSubmit: (input: PaymentInput) => Promise<void>;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function PaymentFormModal({ feeTypes, initial, onClose, onSubmit }: Props) {
  const isEdit = Boolean(initial);

  const [student, setStudent] = useState<{ id: number; label: string } | null>(
    initial ? { id: initial.student_id, label: initial.student_name } : null
  );
  const [feeTypeId, setFeeTypeId] = useState<number | "">(initial?.fee_type_id ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [method, setMethod] = useState(initial?.method ?? "cash");
  const [paidOn, setPaidOn] = useState(initial?.paid_on ?? today());
  const [note, setNote] = useState(initial?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFeeTypeChange = (id: number | "") => {
    setFeeTypeId(id);
    if (!amount) {
      const ft = feeTypes.find((f) => f.id === id);
      if (ft) setAmount(String(ft.default_amount));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!student) {
      setError("Select a student.");
      return;
    }
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        studentId: student.id,
        feeTypeId: typeof feeTypeId === "number" ? feeTypeId : undefined,
        amount: amountNum,
        method,
        paidOn,
        note: note.trim() || undefined,
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
          <h2 className="text-base font-semibold text-slate-800">{isEdit ? "Edit Payment" : "New Payment"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Student</label>
            <StudentPicker value={student} onChange={setStudent} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Fee type</label>
              <select
                value={feeTypeId}
                onChange={(e) => handleFeeTypeChange(e.target.value ? Number(e.target.value) : "")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300"
              >
                <option value="">Other</option>
                {feeTypes.map((ft) => (
                  <option key={ft.id} value={ft.id}>
                    {ft.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm capitalize outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m} className="capitalize">
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Date paid</label>
              <input
                type="date"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Note</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Record payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
