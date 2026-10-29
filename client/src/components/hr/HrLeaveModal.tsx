import { useEffect, useMemo, useState } from "react";
import { X, Search } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSchools } from "../../context/SchoolsContext";
import { api, ApiError } from "../../lib/api";
import type { HrEmployee, HrLeaveEntry, HrValuedItem } from "../../lib/types";
import HrLeavePrintView from "./HrLeavePrintView";

function daysBetween(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function HrLeaveModal({ employees, onClose }: { employees: HrEmployee[]; onClose: () => void }) {
  const { token } = useAuth();
  const { selectedSchoolId, selectedSchool } = useSchools();
  const [query, setQuery] = useState("");
  const [employeeId, setEmployeeId] = useState<number | null>(employees[0]?.id ?? null);
  const [leaveTypes, setLeaveTypes] = useState<HrValuedItem[]>([]);
  const [leaveTypeId, setLeaveTypeId] = useState<number | null>(null);
  const [ledger, setLedger] = useState<HrLeaveEntry[]>([]);
  const [entryDate, setEntryDate] = useState(today());
  const [kind, setKind] = useState<"leave" | "opening_balance">("leave");
  const [periodFrom, setPeriodFrom] = useState(today());
  const [periodTo, setPeriodTo] = useState(today());
  const [openingCount, setOpeningCount] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printEntry, setPrintEntry] = useState<HrLeaveEntry | null>(null);

  const employee = employees.find((e) => e.id === employeeId) ?? null;

  useEffect(() => {
    if (!token) return;
    api
      .getHrValued(token, "leave_type", selectedSchoolId ?? undefined)
      .then((res) => {
        setLeaveTypes(res.items);
        setLeaveTypeId((current) => current ?? res.items[0]?.id ?? null);
      })
      .catch(() => setLeaveTypes([]));
  }, [token, selectedSchoolId]);

  const loadLedger = async () => {
    if (!token || !employeeId) return;
    try {
      const res = await api.getHrLeaveLedger(token, employeeId);
      setLedger(res.ledger);
    } catch {
      setLedger([]);
    }
  };

  useEffect(() => {
    loadLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, employeeId]);

  const balance = useMemo(() => {
    if (!leaveTypeId) return 0;
    return ledger.filter((l) => l.leave_type_id === leaveTypeId).reduce((sum, l) => sum + l.count, 0);
  }, [ledger, leaveTypeId]);

  const requestedDays = kind === "leave" ? Math.max(0, daysBetween(periodFrom, periodTo)) : 0;

  const filteredEmployees = employees.filter((e) => e.name_ar.toLowerCase().includes(query.trim().toLowerCase()));

  const save = async () => {
    if (!token || !employeeId || !selectedSchoolId || !leaveTypeId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.createHrLeaveEntry(token, {
        employeeId,
        schoolId: selectedSchoolId,
        entryDate,
        leaveTypeId,
        kind,
        leaveStart: kind === "leave" ? periodFrom : undefined,
        leaveEnd: kind === "leave" ? periodTo : undefined,
        count: kind === "opening_balance" ? Number(openingCount) || 0 : undefined,
      });
      await loadLedger();
      if (kind === "leave") setPrintEntry(res.entry);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this entry.");
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (id: number) => {
    if (!token) return;
    if (!window.confirm("Remove this ledger entry?")) return;
    await api.deleteHrLeaveEntry(token, id);
    await loadLedger();
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex h-[85vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
            <h2 className="text-base font-semibold text-slate-800">Leave Request</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Code</label>
                <input disabled value={employee?.id ?? ""} className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-400" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
                <input disabled value={employee?.name_ar ?? ""} className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-400" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Date</label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Leaves</label>
                <select
                  value={leaveTypeId ?? ""}
                  onChange={(e) => setLeaveTypeId(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
                >
                  {leaveTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Balance</label>
                <input disabled value={balance} className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-400" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Kind</label>
                <div className="flex h-[42px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
                  {(["leave", "opening_balance"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={`flex-1 rounded-md py-1 text-xs font-medium transition ${
                        kind === k ? "bg-white text-brand-700 shadow-sm" : "text-slate-400"
                      }`}
                    >
                      {k === "leave" ? "Leave" : "Opening Balance"}
                    </button>
                  ))}
                </div>
              </div>

              {kind === "leave" ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Period From</label>
                    <input
                      type="date"
                      value={periodFrom}
                      onChange={(e) => setPeriodFrom(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
                    <input
                      type="date"
                      value={periodTo}
                      onChange={(e) => setPeriodTo(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
                    />
                  </div>
                  <div className="col-span-2 text-sm font-medium text-red-500">{requestedDays} Days</div>
                </>
              ) : (
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Count</label>
                  <input
                    type="number"
                    value={openingCount}
                    onChange={(e) => setOpeningCount(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
                  />
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={save}
                disabled={saving || !employeeId || !leaveTypeId}
                className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Leave</th>
                    <th className="px-3 py-2">Leves_Start</th>
                    <th className="px-3 py-2">Leves_End</th>
                    <th className="px-3 py-2">Count</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-1.5">{l.entry_date}</td>
                      <td className="px-3 py-1.5">{l.leave_type_name}</td>
                      <td className="px-3 py-1.5">{l.leave_start ?? ""}</td>
                      <td className="px-3 py-1.5">{l.leave_end ?? ""}</td>
                      <td className={`px-3 py-1.5 font-medium ${l.count < 0 ? "text-red-600" : "text-emerald-600"}`}>{l.count}</td>
                      <td className="px-3 py-1.5 capitalize text-slate-500">{l.kind.replace("_", " ")}</td>
                      <td className="px-3 py-1.5">
                        <button onClick={() => removeEntry(l.id)} className="text-xs text-slate-400 hover:text-red-600">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                        No ledger entries yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex w-72 shrink-0 flex-col border-s border-slate-100">
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find…"
                className="w-full rounded-lg border border-slate-200 py-1.5 ps-8 pe-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredEmployees.map((e) => (
              <button
                key={e.id}
                onClick={() => setEmployeeId(e.id)}
                className={`block w-full truncate px-3 py-2 text-start text-sm ${
                  e.id === employeeId ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {e.name_ar}
              </button>
            ))}
          </div>
        </div>
      </div>

      {printEntry && employee && selectedSchool && (
        <HrLeavePrintView
          employee={employee}
          school={selectedSchool}
          entry={printEntry}
          balanceBefore={balance - printEntry.count}
          balanceAfter={balance}
          onClose={() => setPrintEntry(null)}
        />
      )}
    </div>
  );
}
