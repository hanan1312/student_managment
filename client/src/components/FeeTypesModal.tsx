import { useEffect, useState } from "react";
import { X, Plus, Pencil, Trash2, Check, Wallet } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";
import type { FeeType } from "../lib/types";

export default function FeeTypesModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const [items, setItems] = useState<FeeType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.getFeeTypes(token);
      setItems(res.feeTypes);
    } catch {
      setError("Could not load fee items.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const startAdd = () => {
    setName("");
    setAmount("");
    setEditingId("new");
  };

  const startEdit = (item: FeeType) => {
    setName(item.name);
    setAmount(String(item.default_amount));
    setEditingId(item.id);
  };

  const save = async () => {
    if (!token || !name.trim()) return;
    setError(null);
    try {
      const body = { name: name.trim(), defaultAmount: Number(amount) || 0 };
      if (editingId === "new") {
        await api.createFeeType(token, body);
      } else if (typeof editingId === "number") {
        await api.updateFeeType(token, editingId, body);
      }
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    }
  };

  const remove = async (id: number) => {
    if (!token) return;
    if (!window.confirm("Remove this fee item?")) return;
    try {
      await api.deleteFeeType(token, id);
      await load();
    } catch {
      setError("Could not remove.");
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <Wallet size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800">Fees Items</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          {loading ? (
            <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
          ) : (
            <div className="space-y-1.5">
              {items.map((item) =>
                editingId === item.id ? (
                  <div key={item.id} className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/40 px-3 py-2">
                    <input
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-brand-500"
                    />
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-brand-500"
                    />
                    <button onClick={save} className="rounded-lg p-1 text-brand-600 hover:bg-brand-100">
                      <Check size={15} />
                    </button>
                  </div>
                ) : (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600"
                  >
                    <span className="flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-slate-400">{item.default_amount}</span>
                    <button
                      onClick={() => startEdit(item)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => remove(item.id)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              )}
              {!loading && items.length === 0 && editingId !== "new" && (
                <p className="py-6 text-center text-sm text-slate-400">No fee items yet.</p>
              )}
            </div>
          )}

          {editingId === "new" ? (
            <div className="mt-3 space-y-2 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              />
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Default amount"
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button onClick={save} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
                  Save
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={startAdd}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
            >
              <Plus size={13} />
              Add
            </button>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
