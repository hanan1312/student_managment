import { useEffect, useState } from "react";
import { X, ShieldCheck, KeyRound, Layers } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useClasses } from "../context/ClassesContext";
import { api, ApiError } from "../lib/api";
import { MODULES, SECTIONS } from "../lib/modules";
import { CORE_MODULE_KEYS, SHOW_EXTENDED_FEATURES } from "../lib/features";
import type { SystemUser } from "../lib/types";

// Only the modules the app currently shows are offered. Grants for hidden modules are left as
// they are (they're loaded and saved back untouched), so turning SHOW_EXTENDED_FEATURES on again
// doesn't lose them.
const OFFERED_MODULES = MODULES.filter((m) => SHOW_EXTENDED_FEATURES || CORE_MODULE_KEYS.includes(m.key));

const MODULE_HINTS: Record<string, string> = {
  students: "الطلاب، الاستيراد والتصدير والطباعة، المواد، ملف الدرجات",
  control: "المستخدمين والنشاط والمدن والإدارات التعليمية",
  configuration: "الإعدادات: اسم المدرسة والشعار والعام الدراسي",
};

type Props = {
  targetUser: SystemUser;
  onClose: () => void;
};

export default function UserPermissionsModal({ targetUser, onClose }: Props) {
  const { token } = useAuth();
  const { tree } = useClasses();
  const isAdmin = targetUser.role === "admin";

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allStages, setAllStages] = useState(true);
  const [stageIds, setStageIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .getUserPermissions(token, targetUser.id)
      .then((res) => {
        setSelected(new Set(res.modules));
        setAllStages(res.stageIds === null);
        setStageIds(new Set(res.stageIds ?? []));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "تعذر تحميل الصلاحيات."))
      .finally(() => setLoading(false));
  }, [token, targetUser.id, isAdmin]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleStage = (id: number) => {
    setStageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!token) return;
    // Stages that were deleted since they were granted are dropped on save.
    const chosenStages = tree.filter((st) => stageIds.has(st.id)).map((st) => st.id);
    if (!allStages && chosenStages.length === 0) {
      setError("اختر مرحلة واحدة على الأقل، أو اختر كل المراحل.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateUserPermissions(token, targetUser.id, [...selected], allStages ? null : chosenStages);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذر حفظ الصلاحيات.");
    } finally {
      setSaving(false);
    }
  };

  const sections = SECTIONS.filter((s) => OFFERED_MODULES.some((m) => m.section === s.key));

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">إدارة الصلاحيات</h2>
            <p className="text-xs text-slate-400">{targetUser.full_name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isAdmin ? (
            <div className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-3.5 py-3 text-sm text-brand-700">
              <ShieldCheck size={18} className="shrink-0" />
              <span>مدير النظام لديه دائمًا صلاحية كاملة لكل الأقسام والمراحل.</span>
            </div>
          ) : loading ? (
            <p className="py-6 text-center text-sm text-slate-400">جارٍ التحميل…</p>
          ) : (
            <div className="space-y-5">
              <div className="space-y-3">
                {sections.map((s) => (
                  <div key={s.key} className="space-y-1.5">
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{s.label}</p>
                    {OFFERED_MODULES.filter((m) => m.section === s.key).map((m) => {
                      const Icon = m.icon;
                      const checked = selected.has(m.key);
                      return (
                        <label
                          key={m.key}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition ${
                            checked
                              ? "border-brand-200 bg-brand-50/60 text-brand-700"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(m.key)}
                            className="h-4 w-4 accent-brand-600"
                          />
                          <Icon size={15} className={checked ? "text-brand-600" : "text-slate-400"} />
                          <span className="flex-1">
                            {m.label}
                            {MODULE_HINTS[m.key] && (
                              <span className="block text-[11px] font-normal text-slate-400">{MODULE_HINTS[m.key]}</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">المراحل</p>
                <p className="px-1 text-[11px] text-slate-400">
                  المراحل التي يديرها المستخدم: يرى طلابها ودرجاتها ومواد صفوفها فقط.
                </p>
                <label
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition ${
                    allStages ? "border-brand-200 bg-brand-50/60 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={allStages}
                    onChange={(e) => setAllStages(e.target.checked)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  <Layers size={15} className={allStages ? "text-brand-600" : "text-slate-400"} />
                  كل المراحل
                </label>
                {!allStages && (
                  <div className="space-y-1 ps-4">
                    {tree.length === 0 && <p className="text-xs text-slate-400">لا توجد مراحل في الهيكل.</p>}
                    {tree.map((st) => {
                      const checked = stageIds.has(st.id);
                      return (
                        <label
                          key={st.id}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-1.5 text-sm transition ${
                            checked
                              ? "border-brand-200 bg-brand-50/60 text-brand-700"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStage(st.id)}
                            className="h-4 w-4 accent-brand-600"
                          />
                          {st.stage}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            {isAdmin ? "إغلاق" : "إلغاء"}
          </button>
          {!isAdmin && (
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-600/30 active:translate-y-0 disabled:opacity-60"
            >
              <KeyRound size={14} />
              {saving ? "جارٍ الحفظ…" : "حفظ الصلاحيات"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
