import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Bus as BusIcon, Plus, RefreshCcw, Pencil, Trash2, Users, Phone, Upload, Download } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";
import { downloadExcel } from "../lib/excel";
import type { Bus, BusInput } from "../lib/types";
import BusFormModal from "../components/BusFormModal";
import BusRidersModal from "../components/BusRidersModal";
import CsvImportModal, { type ImportColumn } from "../components/CsvImportModal";

type OutletCtx = { notify: (label: string) => void };

const BUS_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "routeName", label: "Route Name", required: true, example: "Route 3 - Nasr City" },
  { key: "plateNumber", label: "Plate Number", example: "ABC 1234" },
  { key: "driverName", label: "Driver Name", example: "Hassan Ali" },
  { key: "driverPhone", label: "Driver Phone", example: "01012345678" },
  { key: "capacity", label: "Capacity", example: "24" },
  { key: "notes", label: "Notes" },
];

function mapBusImportRow(raw: Record<string, string>): { input?: BusInput; error?: string } {
  return {
    input: {
      routeName: raw.routeName,
      plateNumber: raw.plateNumber || undefined,
      driverName: raw.driverName || undefined,
      driverPhone: raw.driverPhone || undefined,
      capacity: raw.capacity ? Number(raw.capacity) : undefined,
      notes: raw.notes || undefined,
    },
  };
}

export default function BusesPage() {
  useOutletContext<OutletCtx>();
  const { token } = useAuth();

  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Bus | null>(null);
  const [ridersFor, setRidersFor] = useState<Bus | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Bus | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.getBuses(token);
      setBuses(res.buses);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not load buses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleCreate = async (input: BusInput) => {
    if (!token) return;
    await api.createBus(token, input);
    setModalOpen(false);
    await load();
  };

  const handleUpdate = async (input: BusInput) => {
    if (!token || !editing) return;
    await api.updateBus(token, editing.id, input);
    setEditing(null);
    await load();
  };

  const confirmDelete = async () => {
    if (!token || !pendingDelete) return;
    await api.deleteBus(token, pendingDelete.id);
    setPendingDelete(null);
    await load();
  };

  const handleExport = () => {
    const headers = ["Route Name", "Plate Number", "Driver Name", "Driver Phone", "Capacity", "Riders", "Notes"];
    const rows = buses.map((b) => ({
      "Route Name": b.route_name,
      "Plate Number": b.plate_number ?? "",
      "Driver Name": b.driver_name ?? "",
      "Driver Phone": b.driver_phone ?? "",
      Capacity: b.capacity ?? "",
      Riders: b.rider_count,
      Notes: b.notes ?? "",
    }));
    downloadExcel("buses.xlsx", headers, rows);
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
              <span>New Bus</span>
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
            <button
              onClick={() => load()}
              className="group flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 transition hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
            >
              <RefreshCcw size={18} className="transition-transform duration-500 group-active:rotate-180" />
              <span>Refresh</span>
            </button>
          </div>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">Buses</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        {errorMsg && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>}

        {loading && <p className="py-10 text-center text-sm text-slate-400">Loading buses…</p>}

        {!loading && buses.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-16 text-center text-slate-400">
            <BusIcon size={32} />
            <p className="text-sm">No buses yet. Add one to start assigning riders.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {buses.map((bus) => {
            const over = bus.capacity != null && bus.rider_count > bus.capacity;
            return (
              <div
                key={bus.id}
                className="animate-rise-in relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-brand-500 before:via-brand-400 before:to-gold-400 before:opacity-70 before:content-[''] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-100/50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <BusIcon size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{bus.route_name}</p>
                      <p className="text-xs text-slate-400">{bus.plate_number ?? "No plate on file"}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditing(bus)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setPendingDelete(bus)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  {bus.driver_name && <p>Driver: {bus.driver_name}</p>}
                  {bus.driver_phone && (
                    <p className="flex items-center gap-1">
                      <Phone size={11} /> {bus.driver_phone}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => setRidersFor(bus)}
                  className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    over ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Users size={13} />
                  {bus.rider_count} rider{bus.rider_count === 1 ? "" : "s"}
                  {bus.capacity ? ` / ${bus.capacity} seats` : ""}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {modalOpen && <BusFormModal onClose={() => setModalOpen(false)} onSubmit={handleCreate} />}

      {editing && <BusFormModal initial={editing} onClose={() => setEditing(null)} onSubmit={handleUpdate} />}

      {ridersFor && <BusRidersModal bus={ridersFor} onClose={() => setRidersFor(null)} onChanged={load} />}

      {importOpen && token && (
        <CsvImportModal<BusInput>
          title="Import Buses"
          templateFilename="buses-template.csv"
          columns={BUS_IMPORT_COLUMNS}
          mapRow={mapBusImportRow}
          onImportRow={(input) => api.createBus(token, input).then(() => {})}
          onClose={() => setImportOpen(false)}
          onFinished={load}
        />
      )}

      {pendingDelete && (
        <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
          <div className="animate-rise-in w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-sm font-semibold text-slate-800">Remove bus?</h3>
            <p className="mt-1.5 text-sm text-slate-500">
              This will delete <span className="font-medium text-slate-700">{pendingDelete.route_name}</span> and
              unassign all its riders.
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
