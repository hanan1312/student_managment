import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, CalendarRange, Check, Eye, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { api, ApiError } from "../lib/api";
import { broadcastChange } from "../lib/liveSync";
import type { AcademicYear, AcademicYearsResponse } from "../lib/types";
import { useUiControl } from "../lib/uiControl";

// "2026 / 2027" → "2027 / 2028"; anything else gets no suggestion.
function nextYearName(years: AcademicYear[]): string {
  const latest = [...years].reverse().find((y) => /^\s*\d{4}\s*\/\s*\d{4}\s*$/.test(y.name));
  if (!latest) return "";
  const [a, b] = latest.name.split("/").map((p) => Number(p.trim()));
  const taken = new Set(years.map((y) => y.name.replace(/\s+/g, "")));
  for (let step = 1; step < 50; step++) {
    const name = `${a + step} / ${b + step}`;
    if (!taken.has(name.replace(/\s+/g, ""))) return name;
  }
  return "";
}

// العام الدراسي: one card per year. "عرض بيانات العام الدراسي" (green) opens the year: the app
// works in it and شئون الطلاب shows its students (a new year starts empty). "ارشيف" (red) locks a
// year: its card can't be opened until the green word is pressed again. Students and their
// degrees belong to a year; subjects, schools, users and settings are shared by all years.
export default function AcademicYearsPage() {
  const { token } = useAuth();
  const { setSettings } = useSettings();
  const { tabLabel } = useUiControl();
  const navigate = useNavigate();
  const [data, setData] = useState<AcademicYearsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!token) return;
    api
      .getAcademicYears(token)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "تعذّر تحميل الأعوام الدراسية."));
  }, [token]);

  // Runs a change, then shows the new list and the settings (academic_year follows the open year).
  const run = async (action: () => Promise<AcademicYearsResponse>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      setData(res);
      setSettings(res.settings);
      setSelected((prev) => new Set([...prev].filter((id) => res.years.some((y) => y.id === id))));
      after?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تنفيذ العملية.");
    } finally {
      setBusy(false);
    }
  };

  if (!token) return null;
  const years = data?.years ?? [];
  const currentId = data?.currentId ?? null;

  const startAdding = () => {
    setNewName(nextYearName(years));
    setAdding(true);
  };
  const add = () => {
    const name = newName.trim();
    if (!name) return;
    run(() => api.createAcademicYear(token, name), () => setAdding(false));
  };
  const open = (year: AcademicYear) =>
    run(
      () => api.openAcademicYear(token, year.id),
      () => {
        // Other open windows of the app reload their students for the new year.
        broadcastChange("students");
        navigate("/");
      }
    );
  const archive = (year: AcademicYear) => {
    if (year.id === currentId) {
      setError("لا يمكن أرشفة العام المفتوح حاليًا. افتح عامًا آخر أولاً.");
      return;
    }
    run(() => api.archiveAcademicYear(token, year.id));
  };
  const removeSelected = () => {
    const chosen = years.filter((y) => selected.has(y.id));
    if (chosen.length === 0) return;
    const students = chosen.reduce((n, y) => n + y.student_count, 0);
    const names = chosen.map((y) => y.name).join("، ");
    if (!window.confirm(`حذف ${names}؟\nسيتم حذف ${students} طالب وكل درجاتهم في هذه الأعوام نهائيًا.`)) return;
    run(() => api.deleteAcademicYears(token, chosen.map((y) => y.id)), () => setSelected(new Set()));
  };
  const saveRename = () => {
    if (!renaming) return;
    const { id, name } = renaming;
    run(() => api.renameAcademicYear(token, id, name), () => setRenaming(null));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        <span className="flex items-center gap-2">
          <CalendarRange size={15} className="text-brand-500" />
          <span className="font-medium text-slate-700">{tabLabel("academicYears")}</span>
        </span>
        <span className="flex items-center gap-2">
          <button
            onClick={removeSelected}
            disabled={busy || selected.size === 0}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            <Trash2 size={13} />
            حذف{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
          <button
            onClick={startAdding}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-1.5 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
          >
            <Plus size={14} />
            اضافة عام دراسي جديد
          </button>
        </span>
      </div>

      <div className="flex-1 space-y-4 overflow-auto px-4 py-6">
        <p className="max-w-3xl text-xs leading-6 text-slate-500">
          لكل عام دراسي بيانات الطلاب ودرجاتهم الخاصة به. المواد والمدارس والمستخدمين والإعدادات مشتركة بين كل الأعوام.
          حدد الأعوام بالمربع ثم اضغط حذف لحذفها.
        </p>

        {error && (
          <div className="flex max-w-3xl items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <X size={14} />
            </button>
          </div>
        )}

        {adding && (
          <div className="flex max-w-md items-center gap-2 rounded-xl border border-brand-200 bg-white p-3 shadow-sm">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="مثال: 2027 / 2028"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <button
              onClick={add}
              disabled={busy || !newName.trim()}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              إضافة
            </button>
            <button onClick={() => setAdding(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X size={16} />
            </button>
          </div>
        )}

        {!data && !error && <p className="text-sm text-slate-400">جارٍ التحميل…</p>}

        <div className="grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {years.map((year) => {
            const isOpen = year.id === currentId;
            const tone = year.archived
              ? "border-red-300 bg-red-50"
              : isOpen
                ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200"
                : "border-slate-200 bg-white";
            return (
              <div key={year.id} className={`relative flex flex-col gap-4 rounded-xl border p-4 shadow-sm transition ${tone}`}>
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(year.id)}
                    disabled={isOpen}
                    title={isOpen ? "العام المفتوح حاليًا لا يمكن حذفه" : "تحديد للحذف"}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(year.id);
                        else next.delete(year.id);
                        return next;
                      })
                    }
                    className="mt-1 h-4 w-4 accent-red-600 disabled:opacity-30"
                  />
                  <div className={`min-w-0 flex-1 ${year.archived ? "opacity-60" : ""}`}>
                    {renaming?.id === year.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={renaming.name}
                          onChange={(e) => setRenaming({ id: year.id, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename();
                            if (e.key === "Escape") setRenaming(null);
                          }}
                          className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-brand-500"
                        />
                        <button onClick={saveRename} className="rounded p-1 text-emerald-600 hover:bg-emerald-100">
                          <Check size={14} />
                        </button>
                        <button onClick={() => setRenaming(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                        <span className="truncate">{year.name}</span>
                        {!year.archived && (
                          <button
                            onClick={() => setRenaming({ id: year.id, name: year.name })}
                            className="rounded p-1 text-slate-300 hover:text-slate-600"
                            title="تعديل الاسم"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                      </h3>
                    )}
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <Users size={12} />
                      {year.student_count} طالب
                      {isOpen && <span className="font-semibold text-emerald-700">· العام المفتوح حاليًا</span>}
                      {year.archived && <span className="font-semibold text-red-600">· مؤرشف</span>}
                    </p>
                  </div>
                </div>

                {/* RTL: ارشيف on the right, عرض بيانات العام الدراسي on the left. */}
                <div className="flex items-center justify-between border-t border-black/5 pt-3 text-sm font-semibold">
                  <button
                    onClick={() => archive(year)}
                    disabled={busy || year.archived}
                    className="flex items-center gap-1 text-red-600 hover:underline disabled:cursor-default disabled:no-underline"
                  >
                    <Archive size={14} />
                    ارشيف
                  </button>
                  <button
                    onClick={() => open(year)}
                    disabled={busy}
                    className="flex items-center gap-1 text-emerald-600 hover:underline disabled:opacity-50"
                    title={year.archived ? "إلغاء الأرشفة وفتح العام" : "فتح بيانات الطلاب لهذا العام"}
                  >
                    <Eye size={14} />
                    عرض بيانات العام الدراسي
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
