import { useEffect, useState, type ReactNode } from "react";
import { Eye, EyeOff, Plus, RotateCcw, Save, SlidersHorizontal, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { api, ApiError } from "../lib/api";
import { SECTIONS, type SectionKey } from "../lib/modules";
import {
  EMPTY_UI_CONTROL,
  TEXTS,
  TEXT_GROUPS,
  ancestorsOf,
  buildTabs,
  isHiddenIn,
  orderWithChildren,
  parseUiControl,
  type AppTab,
  type TabControl,
  type TextKey,
  type UiControl,
} from "../lib/uiControl";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 hover:border-slate-300";

const cardClass =
  "relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-0.5 before:bg-gradient-to-r before:from-brand-500 before:via-brand-400 before:to-gold-400 before:opacity-70 before:content-['']";

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={`${cardClass} space-y-4`}>
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

// التحكم: which tabs other users see, what tabs, ribbon buttons and printouts are called, tabs
// added here, and which tab follows which. Edits are a draft until حفظ.
export default function ControlPage() {
  const { token } = useAuth();
  const { settings, setSettings } = useSettings();
  const [draft, setDraft] = useState<UiControl>(() => parseUiControl(settings.ui_control));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [openTab, setOpenTab] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newSection, setNewSection] = useState<SectionKey>("studentsAffair");

  useEffect(() => {
    if (!dirty) setDraft(parseUiControl(settings.ui_control));
    // Only when the saved value changes; a draft being edited is kept.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.ui_control]);

  const change = (update: (d: UiControl) => UiControl) => {
    setDraft(update);
    setDirty(true);
  };

  const setTab = (key: string, patch: Partial<TabControl>) =>
    change((d) => ({ ...d, tabs: { ...d.tabs, [key]: { ...d.tabs[key], ...patch } } }));

  const setText = (key: TextKey, value: string) => change((d) => ({ ...d, texts: { ...d.texts, [key]: value } }));

  const addTab = () => {
    const label = newLabel.trim();
    if (!label) return;
    const key = `t${Date.now().toString(36)}`;
    change((d) => ({ ...d, customTabs: [...d.customTabs, { key, label, section: newSection, body: "" }] }));
    setNewLabel("");
    setOpenTab(key);
  };

  const removeTab = (tab: AppTab) => {
    if (!window.confirm(`حذف التبويب "${tab.label}"؟`)) return;
    change((d) => {
      const tabs: Record<string, TabControl> = {};
      for (const [k, v] of Object.entries(d.tabs)) {
        if (k === tab.key) continue;
        // Tabs that followed it no longer follow anything.
        tabs[k] = v.parent === tab.key ? { ...v, parent: undefined } : v;
      }
      return { ...d, tabs, customTabs: d.customTabs.filter((c) => c.key !== tab.key) };
    });
  };

  const setCustom = (key: string, patch: Partial<UiControl["customTabs"][number]>) =>
    change((d) => ({ ...d, customTabs: d.customTabs.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateUiControl(token, draft);
      setSettings(res.settings);
      setDirty(false);
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(null), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر حفظ التحكم.");
    } finally {
      setSaving(false);
    }
  };

  const tabs = buildTabs(draft);
  const tabName = (key: string) => tabs.find((t) => t.key === key)?.label ?? key;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        <span className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-brand-500" />
          <span className="font-medium text-slate-700">التحكم</span>
          {dirty && <span className="text-xs text-amber-600">تغييرات غير محفوظة</span>}
          {savedAt && <span className="text-xs text-emerald-600">تم الحفظ.</span>}
        </span>
        <span className="flex items-center gap-2">
          <button
            onClick={() => {
              if (window.confirm("إرجاع كل التبويبات والنصوص إلى الافتراضي وحذف التبويبات المضافة؟")) change(() => EMPTY_UI_CONTROL);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw size={12} />
            الافتراضي
          </button>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-1.5 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? "جارٍ الحفظ…" : "حفظ"}
          </button>
        </span>
      </div>

      <div className="flex-1 overflow-auto px-4 py-6">
        {error && <p className="mb-4 max-w-4xl rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="max-w-4xl space-y-6">
          <Card
            title="التبويبات"
            hint="التبويب المخفي لا يظهر لباقي المستخدمين (يظهر لك بعلامة مخفي). «يتبع» يضع التبويب بعد تبويب آخر ويخفيه معه. اترك الاسم فارغًا لاستخدام الاسم الأصلي."
          >
            {SECTIONS.map((section) => {
              const rows = orderWithChildren(
                draft,
                tabs.filter((t) => t.section === section.key)
              );
              if (rows.length === 0) return null;
              return (
                <div key={section.key} className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500">
                    {draft.texts[`section.${section.key}`]?.trim() || section.label}
                  </p>
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {rows.map(({ tab, depth }) => {
                      const ctl = draft.tabs[tab.key] ?? {};
                      const custom = draft.customTabs.find((c) => c.key === tab.key);
                      const hiddenBy = !ctl.hidden && isHiddenIn(draft, tab.key) ? ancestorsOf(draft, tab.key).find((k) => draft.tabs[k]?.hidden) : null;
                      // A tab can follow any other tab of its section, except itself and the tabs
                      // that (indirectly) follow it.
                      const parentOptions = tabs.filter(
                        (t) => t.section === tab.section && t.key !== tab.key && !ancestorsOf(draft, t.key).includes(tab.key)
                      );
                      const isOpen = openTab === tab.key;
                      return (
                        <div key={tab.key} className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2" style={{ paddingInlineStart: depth * 20 }}>
                            <tab.icon size={15} className="shrink-0 text-slate-400" />
                            <span className="w-28 shrink-0 truncate text-xs text-slate-500" title={tab.defaultLabel}>
                              {tab.defaultLabel}
                              {tab.custom && <span className="ms-1 text-[10px] text-brand-600">(مضاف)</span>}
                              {!tab.inNav && <span className="ms-1 text-[10px] text-slate-400">(من شريط الطلاب)</span>}
                            </span>
                            <input
                              value={ctl.label ?? ""}
                              placeholder={tab.defaultLabel}
                              onChange={(e) => setTab(tab.key, { label: e.target.value })}
                              className={`${inputClass} min-w-0 flex-1 basis-40`}
                            />
                            <label className="flex items-center gap-1 text-xs text-slate-500">
                              يتبع
                              <select
                                value={ctl.parent ?? ""}
                                onChange={(e) => setTab(tab.key, { parent: e.target.value || undefined })}
                                className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-brand-500"
                              >
                                <option value="">—</option>
                                {parentOptions.map((p) => (
                                  <option key={p.key} value={p.key}>
                                    {p.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              onClick={() => setTab(tab.key, { hidden: !ctl.hidden })}
                              className={`flex w-20 items-center justify-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition ${
                                ctl.hidden
                                  ? "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              }`}
                              title={ctl.hidden ? "إظهار للمستخدمين" : "إخفاء عن المستخدمين"}
                            >
                              {ctl.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                              {ctl.hidden ? "مخفي" : "ظاهر"}
                            </button>
                            {custom ? (
                              <>
                                <button
                                  onClick={() => setOpenTab(isOpen ? null : tab.key)}
                                  className="rounded p-1 text-slate-400 hover:text-brand-600"
                                  title="المحتوى"
                                >
                                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                <button onClick={() => removeTab(tab)} className="rounded p-1 text-slate-300 hover:text-red-500" title="حذف التبويب">
                                  <Trash2 size={14} />
                                </button>
                              </>
                            ) : (
                              <span className="w-[52px]" />
                            )}
                          </div>
                          {hiddenBy && (
                            <p className="mt-1 text-[11px] text-amber-600" style={{ paddingInlineStart: depth * 20 + 24 }}>
                              مخفي لأنه يتبع «{tabName(hiddenBy)}».
                            </p>
                          )}
                          {custom && isOpen && (
                            <div className="mt-2 space-y-2" style={{ paddingInlineStart: depth * 20 + 24 }}>
                              <div className="flex flex-wrap gap-2">
                                <label className="flex-1 basis-40 text-xs text-slate-500">
                                  الاسم الأصلي
                                  <input
                                    value={custom.label}
                                    onChange={(e) => setCustom(custom.key, { label: e.target.value })}
                                    className={`${inputClass} mt-1`}
                                  />
                                </label>
                                <label className="text-xs text-slate-500">
                                  القسم
                                  <select
                                    value={custom.section}
                                    onChange={(e) => {
                                      setCustom(custom.key, { section: e.target.value as SectionKey });
                                      setTab(custom.key, { parent: undefined });
                                    }}
                                    className={`${inputClass} mt-1`}
                                  >
                                    {SECTIONS.map((s) => (
                                      <option key={s.key} value={s.key}>
                                        {s.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <label className="block text-xs text-slate-500">
                                محتوى التبويب
                                <textarea
                                  value={custom.body}
                                  onChange={(e) => setCustom(custom.key, { body: e.target.value })}
                                  rows={5}
                                  className={`${inputClass} mt-1`}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
              <label className="min-w-0 flex-1 basis-48 text-xs text-slate-500">
                تبويب جديد
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTab()}
                  placeholder="اسم التبويب"
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="text-xs text-slate-500">
                القسم
                <select value={newSection} onChange={(e) => setNewSection(e.target.value as SectionKey)} className={`${inputClass} mt-1`}>
                  {SECTIONS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={addTab}
                disabled={!newLabel.trim()}
                className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
              >
                <Plus size={13} />
                إضافة تبويب
              </button>
            </div>
          </Card>

          {TEXT_GROUPS.map((group) => (
            <Card
              key={group.key}
              title={group.label}
              hint={group.key === "print" ? "تُستخدم في معاينات الطباعة وملفات PDF. التوقيعات المعدّلة داخل معاينة الطباعة تبقى كما هي حتى الضغط على «الافتراضي» هناك." : undefined}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(TEXTS) as TextKey[])
                  .filter((key) => TEXTS[key].group === group.key)
                  .map((key) => (
                    <label key={key} className="block text-xs text-slate-500">
                      {TEXTS[key].label}
                      <input
                        value={draft.texts[key] ?? ""}
                        placeholder={TEXTS[key].default}
                        onChange={(e) => setText(key, e.target.value)}
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                  ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
