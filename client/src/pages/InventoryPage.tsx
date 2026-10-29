import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Package, Plus, Search, Pencil, Trash2, Upload, Download } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";
import { downloadExcel } from "../lib/excel";
import type { InventoryItem, InventoryItemInput } from "../lib/types";
import InventoryItemModal from "../components/InventoryItemModal";
import CsvImportModal, { type ImportColumn } from "../components/CsvImportModal";

type OutletCtx = { notify: (label: string) => void };

const LOW_STOCK_THRESHOLD = 5;

const INVENTORY_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "name", label: "Name", required: true, example: "Whiteboard Markers" },
  { key: "category", label: "Category", example: "Supplies" },
  { key: "quantity", label: "Quantity", example: "20" },
  { key: "unit", label: "Unit", example: "box" },
  { key: "location", label: "Location", example: "Storage Room 1" },
  { key: "condition", label: "Condition", example: "Good" },
  { key: "notes", label: "Notes" },
];

function mapInventoryImportRow(raw: Record<string, string>): { input?: InventoryItemInput; error?: string } {
  return {
    input: {
      name: raw.name,
      category: raw.category || undefined,
      quantity: raw.quantity ? Number(raw.quantity) : undefined,
      unit: raw.unit || undefined,
      location: raw.location || undefined,
      condition: raw.condition || undefined,
      notes: raw.notes || undefined,
    },
  };
}

export default function InventoryPage() {
  useOutletContext<OutletCtx>();
  const { token } = useAuth();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InventoryItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.getInventory(token, { q: debouncedQuery || undefined });
      setItems(res.items);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not load inventory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, debouncedQuery]);

  const handleCreate = async (input: InventoryItemInput) => {
    if (!token) return;
    await api.createInventoryItem(token, input);
    setModalOpen(false);
    await load();
  };

  const handleUpdate = async (input: InventoryItemInput) => {
    if (!token || !editing) return;
    await api.updateInventoryItem(token, editing.id, input);
    setEditing(null);
    await load();
  };

  const confirmDelete = async () => {
    if (!token || !pendingDelete) return;
    await api.deleteInventoryItem(token, pendingDelete.id);
    setPendingDelete(null);
    await load();
  };

  const handleExport = () => {
    const headers = ["Name", "Category", "Quantity", "Unit", "Location", "Condition", "Notes"];
    const rows = items.map((item) => ({
      Name: item.name,
      Category: item.category ?? "",
      Quantity: item.quantity,
      Unit: item.unit ?? "",
      Location: item.location ?? "",
      Condition: item.condition ?? "",
      Notes: item.notes ?? "",
    }));
    downloadExcel("inventory.xlsx", headers, rows);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col items-center border-e border-slate-200 px-3 last:border-e-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setModalOpen(true)}
              className="flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 transition hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
            >
              <Plus size={18} />
              <span>New Item</span>
            </button>
            <button
              onClick={() => setImportOpen(true)}
              className="flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 transition hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
            >
              <Upload size={18} />
              <span>Import</span>
            </button>
            <button
              onClick={handleExport}
              className="flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 transition hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
            >
              <Download size={18} />
              <span>Export</span>
            </button>
          </div>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">Inventory</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="font-medium text-slate-700">Inventory</span>
          <span className="text-slate-300">&middot;</span>
          <span>
            {items.length} item{items.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="relative w-full max-w-xs">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items…"
            className="w-full rounded-lg border border-slate-200 py-2 ps-9 pe-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        {errorMsg && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>}

        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50 before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-0.5 before:bg-gradient-to-r before:from-brand-500 before:via-brand-400 before:to-gold-400 before:opacity-70 before:content-['']">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Quantity</th>
                <th className="px-3 py-2.5">Location</th>
                <th className="px-3 py-2.5">Condition</th>
                <th className="px-3 py-2.5">Notes</th>
                <th className="px-3 py-2.5 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                    Loading inventory…
                  </td>
                </tr>
              )}

              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Package size={28} />
                      No items yet.
                    </div>
                  </td>
                </tr>
              )}

              {!loading &&
                items.map((item) => {
                  const low = item.quantity <= LOW_STOCK_THRESHOLD;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-medium text-slate-800">{item.name}</td>
                      <td className="px-3 py-2.5 text-slate-500">{item.category ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            low ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"
                          }`}
                        >
                          {item.quantity} {item.unit ?? ""}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">{item.location ?? "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500">{item.condition ?? "—"}</td>
                      <td className="px-3 py-2.5 max-w-[200px] truncate text-slate-500" title={item.notes ?? ""}>
                        {item.notes ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setEditing(item)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                            title="Edit"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => setPendingDelete(item)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && <InventoryItemModal onClose={() => setModalOpen(false)} onSubmit={handleCreate} />}

      {editing && (
        <InventoryItemModal initial={editing} onClose={() => setEditing(null)} onSubmit={handleUpdate} />
      )}

      {importOpen && token && (
        <CsvImportModal<InventoryItemInput>
          title="Import Inventory"
          templateFilename="inventory-template.csv"
          columns={INVENTORY_IMPORT_COLUMNS}
          mapRow={mapInventoryImportRow}
          onImportRow={(input) => api.createInventoryItem(token, input).then(() => {})}
          onClose={() => setImportOpen(false)}
          onFinished={load}
        />
      )}

      {pendingDelete && (
        <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
          <div className="animate-rise-in w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-sm font-semibold text-slate-800">Remove item?</h3>
            <p className="mt-1.5 text-sm text-slate-500">
              This will permanently delete{" "}
              <span className="font-medium text-slate-700">{pendingDelete.name}</span> from inventory.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
