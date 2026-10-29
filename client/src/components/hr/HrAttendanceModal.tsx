import { useEffect, useState } from "react";
import { X, CalendarCheck, ListChecks, BarChart3, Lock, Unlock } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSchools } from "../../context/SchoolsContext";
import { api, ApiError } from "../../lib/api";
import type { HrAttendanceRecord, HrAttendanceStatus, HrDayClosed, HrOverallRow } from "../../lib/types";
import TimePicker from "../TimePicker";

const TABS = [
  { key: "daily", label: "Daily Attendance", icon: CalendarCheck },
  { key: "details", label: "Day Details", icon: ListChecks },
  { key: "overall", label: "Overall", icon: BarChart3 },
  { key: "closed", label: "Days Closed", icon: Lock },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const STATUSES: HrAttendanceStatus[] = ["present", "late", "absent"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function HrAttendanceModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const { selectedSchoolId } = useSchools();
  const [tab, setTab] = useState<TabKey>("daily");
  const [date, setDate] = useState(today());
  const [records, setRecords] = useState<HrAttendanceRecord[]>([]);
  const [closed, setClosed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [overall, setOverall] = useState<HrOverallRow[]>([]);

  const [daysClosed, setDaysClosed] = useState<HrDayClosed[]>([]);

  const loadDay = async () => {
    if (!token || !selectedSchoolId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getHrAttendance(token, { schoolId: selectedSchoolId, date });
      setRecords(res.records);
      setClosed(res.closed);
    } catch {
      setError("Could not load attendance.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "daily" || tab === "details") loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedSchoolId, date, tab]);

  const loadOverall = async () => {
    if (!token || !selectedSchoolId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getHrAttendanceOverall(token, { schoolId: selectedSchoolId, from, to });
      setOverall(res.rows);
    } catch {
      setError("Could not load the range.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "overall") loadOverall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadDaysClosed = async () => {
    if (!token || !selectedSchoolId) return;
    try {
      const res = await api.getHrDaysClosed(token, selectedSchoolId);
      setDaysClosed(res.daysClosed);
    } catch {
      setDaysClosed([]);
    }
  };

  useEffect(() => {
    if (tab === "closed") loadDaysClosed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const setStatus = (employeeId: number, status: HrAttendanceStatus) => {
    setRecords((rs) => rs.map((r) => (r.employee_id === employeeId ? { ...r, status } : r)));
  };

  const setTime = (employeeId: number, field: "check_in" | "check_out", value: string) => {
    setRecords((rs) => rs.map((r) => (r.employee_id === employeeId ? { ...r, [field]: value } : r)));
  };

  const save = async () => {
    if (!token || !selectedSchoolId) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveHrAttendanceBulk(
        token,
        selectedSchoolId,
        date,
        records.map((r) => ({
          employeeId: r.employee_id,
          status: r.status ?? "present",
          checkIn: r.check_in || undefined,
          checkOut: r.check_out || undefined,
          note: r.note || undefined,
        }))
      );
      await loadDay();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save attendance.");
    } finally {
      setSaving(false);
    }
  };

  const closeDay = async () => {
    if (!token || !selectedSchoolId) return;
    if (!window.confirm(`Close ${date}? No further edits will be allowed for this day.`)) return;
    await api.closeHrDay(token, selectedSchoolId, date);
    await loadDay();
    await loadDaysClosed();
  };

  const reopenDay = async (id: number) => {
    if (!token) return;
    await api.reopenHrDay(token, id);
    await loadDaysClosed();
    await loadDay();
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">Employee Attendance</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-1 border-b border-slate-100 px-4 pt-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium transition ${
                  active ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Icon size={13} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

          {(tab === "daily" || tab === "details") && (
            <>
              <div className="mb-3 flex items-center gap-3">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
                />
                {closed && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                    <Lock size={12} />
                    This day is closed
                  </span>
                )}
              </div>

              {loading ? (
                <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Code</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Status</th>
                        {tab === "daily" && (
                          <>
                            <th className="px-3 py-2">Check In</th>
                            <th className="px-3 py-2">Check Out</th>
                            <th className="px-3 py-2">Notes</th>
                          </>
                        )}
                        {tab === "details" && (
                          <>
                            <th className="px-3 py-2">Check In</th>
                            <th className="px-3 py-2">Check Out</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {records.map((r) => (
                        <tr key={r.employee_id}>
                          <td className="px-3 py-1.5 text-slate-500">{r.employee_id}</td>
                          <td className="px-3 py-1.5 font-medium text-slate-700">{r.name_ar}</td>
                          <td className="px-3 py-1.5">
                            {tab === "daily" ? (
                              <div className="flex gap-1">
                                {STATUSES.map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    disabled={closed}
                                    onClick={() => setStatus(r.employee_id, s)}
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize transition disabled:opacity-50 ${
                                      (r.status ?? "present") === s
                                        ? s === "present"
                                          ? "bg-emerald-100 text-emerald-700"
                                          : s === "late"
                                          ? "bg-amber-100 text-amber-700"
                                          : "bg-red-100 text-red-700"
                                        : "bg-slate-100 text-slate-400"
                                    }`}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className="capitalize text-slate-500">{r.status ?? "—"}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            {tab === "daily" ? (
                              <TimePicker
                                disabled={closed}
                                value={r.check_in ?? ""}
                                onChange={(v) => setTime(r.employee_id, "check_in", v)}
                                className="w-28 text-xs"
                              />
                            ) : (
                              r.check_in ?? "—"
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            {tab === "daily" ? (
                              <TimePicker
                                disabled={closed}
                                value={r.check_out ?? ""}
                                onChange={(v) => setTime(r.employee_id, "check_out", v)}
                                className="w-28 text-xs"
                              />
                            ) : (
                              r.check_out ?? "—"
                            )}
                          </td>
                          {tab === "daily" && (
                            <td className="px-3 py-1.5">
                              <input
                                disabled={closed}
                                value={r.note ?? ""}
                                onChange={(e) =>
                                  setRecords((rs) =>
                                    rs.map((row) => (row.employee_id === r.employee_id ? { ...row, note: e.target.value } : row))
                                  )
                                }
                                className="w-32 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none disabled:bg-slate-50"
                              />
                            </td>
                          )}
                        </tr>
                      ))}
                      {records.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                            No employees for this school yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === "daily" && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={save}
                    disabled={saving || closed}
                    className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  {!closed && (
                    <button
                      onClick={closeDay}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      <Lock size={13} />
                      Close this day
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {tab === "overall" && (
            <>
              <div className="mb-3 flex items-center gap-2">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
                />
                <button onClick={loadOverall} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
                  Refresh
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Present</th>
                      <th className="px-3 py-2">Late</th>
                      <th className="px-3 py-2">Absent</th>
                      <th className="px-3 py-2">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {overall.map((r) => (
                      <tr key={r.employee_id}>
                        <td className="px-3 py-1.5 font-medium text-slate-700">{r.employee_name}</td>
                        <td className="px-3 py-1.5 text-emerald-600">{r.present_count}</td>
                        <td className="px-3 py-1.5 text-amber-600">{r.late_count}</td>
                        <td className="px-3 py-1.5 text-red-600">{r.absent_count}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.attendance_rate ?? "—"}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "closed" && (
            <div className="space-y-1.5">
              {daysClosed.map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <Lock size={13} className="text-amber-500" />
                  <span className="flex-1 font-medium text-slate-700">{d.date}</span>
                  <span className="text-xs text-slate-400">{d.closed_by ?? ""}</span>
                  <button
                    onClick={() => reopenDay(d.id)}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    <Unlock size={12} />
                    Reopen
                  </button>
                </div>
              ))}
              {daysClosed.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No closed days yet.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
