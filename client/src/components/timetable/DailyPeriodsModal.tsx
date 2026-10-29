import { useEffect, useState } from "react";
import { X, Clock3, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../lib/api";
import type { DailyPeriod } from "../../lib/types";
import TimePicker from "../TimePicker";

export default function DailyPeriodsModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const [periods, setPeriods] = useState<DailyPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [breakStart, setBreakStart] = useState("");
  const [breakDuration, setBreakDuration] = useState("");
  const [periodDuration, setPeriodDuration] = useState("");
  const [savingBreak, setSavingBreak] = useState(false);
  const [savingDuration, setSavingDuration] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.getDailyPeriods(token);
      setPeriods(res.periods);
    } catch {
      setError("Could not load daily periods.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // TimePicker has no "blur" moment (it's a button + popover, not a text field), so a pick
  // saves immediately — using the incoming value plus the other field straight from this
  // render's periods array, rather than round-tripping through local state first.
  const updateAndPersist = async (id: number, field: "start_time" | "end_time", value: string) => {
    setPeriods((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    if (!token) return;
    const period = periods.find((p) => p.id === id);
    if (!period) return;
    const next = { ...period, [field]: value };
    try {
      await api.updateDailyPeriod(token, id, { startTime: next.start_time, endTime: next.end_time });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    }
  };

  const add = async () => {
    if (!token || !newStart || !newEnd) return;
    try {
      await api.createDailyPeriod(token, { startTime: newStart, endTime: newEnd });
      setNewStart("");
      setNewEnd("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add period.");
    }
  };

  const remove = async (id: number) => {
    if (!token) return;
    if (!window.confirm("Remove this period?")) return;
    try {
      await api.deleteDailyPeriod(token, id);
      await load();
    } catch {
      setError("Could not remove.");
    }
  };

  const setBreak = async () => {
    if (!token || !breakStart || !breakDuration) return;
    setSavingBreak(true);
    setError(null);
    try {
      const res = await api.setDailyPeriodBreak(token, { startTime: breakStart, durationMinutes: Number(breakDuration) });
      setPeriods(res.periods);
      setBreakStart("");
      setBreakDuration("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not set the break.");
    } finally {
      setSavingBreak(false);
    }
  };

  const applyDuration = async () => {
    if (!token || !periodDuration) return;
    setSavingDuration(true);
    setError(null);
    try {
      const res = await api.applyPeriodDuration(token, { periodDurationMinutes: Number(periodDuration) });
      setPeriods(res.periods);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not apply the period duration.");
    } finally {
      setSavingDuration(false);
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock3 size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800">Daily Period</h2>
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
              {periods.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                    p.is_break ? "border-emerald-300 bg-emerald-50" : "border-slate-200"
                  }`}
                >
                  <span className={`w-10 text-xs font-medium ${p.is_break ? "text-emerald-600" : "text-slate-400"}`}>
                    {p.is_break ? "Break" : p.period_no}
                  </span>
                  <TimePicker
                    value={p.start_time}
                    onChange={(v) => updateAndPersist(p.id, "start_time", v)}
                    className="flex-1"
                  />
                  <span className="text-slate-300">–</span>
                  <TimePicker
                    value={p.end_time}
                    onChange={(v) => updateAndPersist(p.id, "end_time", v)}
                    className="flex-1"
                  />
                  <button onClick={() => remove(p.id)} className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2">
            <TimePicker value={newStart} onChange={setNewStart} className="flex-1" />
            <span className="text-slate-300">–</span>
            <TimePicker value={newEnd} onChange={setNewEnd} className="flex-1" />
            <button onClick={add} className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50" title="Add period">
              <Plus size={16} />
            </button>
          </div>

          <div className="mt-4 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5">
            <p className="text-xs font-semibold text-emerald-700">Break</p>
            <div className="flex items-center gap-2">
              <TimePicker value={breakStart} onChange={setBreakStart} className="flex-1" />
              <input
                type="number"
                min={1}
                value={breakDuration}
                onChange={(e) => setBreakDuration(e.target.value)}
                placeholder="Duration (min)"
                className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-brand-500"
              />
              <button
                onClick={setBreak}
                disabled={savingBreak || !breakStart || !breakDuration}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingBreak ? "…" : "Set Break"}
              </button>
            </div>
          </div>

          <div className="mt-2 space-y-2 rounded-xl border border-slate-200 px-3 py-2.5">
            <p className="text-xs font-semibold text-slate-600">Period Duration</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={periodDuration}
                onChange={(e) => setPeriodDuration(e.target.value)}
                placeholder="Minutes per period"
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-brand-500"
              />
              <button
                onClick={applyDuration}
                disabled={savingDuration || !periodDuration}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {savingDuration ? "…" : "Apply"}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Recomputes every period from the first period's start time, keeping the break's own duration fixed.
            </p>
          </div>
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
