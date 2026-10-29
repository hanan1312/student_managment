import { useMemo } from "react";
import { Printer, X } from "lucide-react";
import { useSettings } from "../context/SettingsContext";
import type { Student } from "../lib/types";

type Props = {
  students: Student[];
  scopeLabel: string;
  onClose: () => void;
};

export default function StudentsReportModal({ students, scopeLabel, onClose }: Props) {
  const { settings } = useSettings();
  const stats = useMemo(() => {
    const male = students.filter((s) => s.gender === "M").length;
    const female = students.filter((s) => s.gender === "F").length;
    const unknown = students.length - male - female;

    const byCategory = new Map<string, number>();
    const byClass = new Map<string, number>();
    for (const s of students) {
      const cat = s.category ?? "Uncategorized";
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
      const cls = s.section ?? "Unassigned";
      byClass.set(cls, (byClass.get(cls) ?? 0) + 1);
    }

    return {
      total: students.length,
      male,
      female,
      unknown,
      byCategory: Array.from(byCategory.entries()),
      byClass: Array.from(byClass.entries()),
    };
  }, [students]);

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="print-hidden flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">Students Report</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              <Printer size={14} />
              Print
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="print-area overflow-y-auto px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-800">{settings.school_name || "SchoolSuite"}</h3>
          {(settings.school_address || settings.school_phone) && (
            <p className="text-xs text-slate-400">
              {settings.school_address}
              {settings.school_address && settings.school_phone ? " · " : ""}
              {settings.school_phone}
            </p>
          )}
          <h4 className="mt-2 text-base font-semibold text-slate-700">Students Report</h4>
          <p className="text-sm text-slate-500">{scopeLabel}</p>
          <p className="mb-4 text-xs text-slate-400">Generated {new Date().toLocaleString()}</p>

          <div className={`mb-4 grid gap-3 ${stats.unknown > 0 ? "grid-cols-4" : "grid-cols-3"}`}>
            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-2xl font-semibold text-slate-800">{stats.total}</p>
              <p className="text-xs text-slate-500">Total students</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-2xl font-semibold text-brand-700">{stats.male}</p>
              <p className="text-xs text-slate-500">Male</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-2xl font-semibold text-pink-600">{stats.female}</p>
              <p className="text-xs text-slate-500">Female</p>
            </div>
            {stats.unknown > 0 && (
              <div className="rounded-lg border border-slate-200 p-3 text-center">
                <p className="text-2xl font-semibold text-slate-500">{stats.unknown}</p>
                <p className="text-xs text-slate-500">Unknown</p>
              </div>
            )}
          </div>

          <div className="mb-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By category</h4>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {stats.byCategory.map(([cat, count]) => (
                  <tr key={cat}>
                    <td className="py-1.5 text-slate-600" dir="rtl">
                      {cat}
                    </td>
                    <td className="py-1.5 text-end font-medium text-slate-800">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By class</h4>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {stats.byClass.map(([cls, count]) => (
                  <tr key={cls}>
                    <td className="py-1.5 text-slate-600">{cls}</td>
                    <td className="py-1.5 text-end font-medium text-slate-800">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
