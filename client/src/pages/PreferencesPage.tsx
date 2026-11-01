import { useEffect, useRef, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import { Settings, Save, Image as ImageIcon, Upload, Trash2, Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { api, ApiError, assetUrl } from "../lib/api";
import { THEME_PALETTES, DEFAULT_THEME_KEY } from "../lib/themePalettes";

type OutletCtx = { notify: (label: string) => void };

const FIELDS: { key: string; label: string }[] = [
  { key: "school_name", label: "اسم المدرسة" },
  { key: "school_address", label: "العنوان" },
  { key: "school_phone", label: "الهاتف" },
  { key: "academic_year", label: "العام الدراسي" },
  { key: "license_to", label: "مرخص لـ" },
  { key: "currency", label: "العملة" },
];

function BrandingUploadField({
  kind,
  label,
  description,
  previewClassName,
}: {
  kind: "logo" | "background";
  label: string;
  description: string;
  previewClassName: string;
}) {
  const { token } = useAuth();
  const { settings, setSettings } = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = assetUrl(settings[`${kind}_url`]);

  const handleFile = async (file: File) => {
    if (!token) return;
    setUploading(true);
    setError(null);
    try {
      const res = await api.uploadBranding(token, kind, file);
      setSettings(res.settings);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل الرفع.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!token) return;
    setUploading(true);
    setError(null);
    try {
      const res = await api.removeBranding(token, kind);
      setSettings(res.settings);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّرت الإزالة.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-start gap-4">
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 ${previewClassName}`}
      >
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon size={20} className="text-slate-300" />
        )}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="mb-2 text-xs text-slate-400">{description}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            <Upload size={12} />
            {uploading ? "جارٍ الرفع…" : url ? "استبدال" : "رفع"}
          </button>
          {url && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 size={12} />
              إزالة
            </button>
          )}
        </div>
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
    </div>
  );
}

function ThemePaletteField() {
  const { token } = useAuth();
  const { settings, setSettings } = useSettings();
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = settings.theme_palette || DEFAULT_THEME_KEY;

  const choose = async (key: string) => {
    if (!token || key === current) return;
    setApplying(key);
    setError(null);
    try {
      const res = await api.updateSettings(token, { theme_palette: key });
      setSettings(res.settings);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تطبيق السمة.");
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">السمة</h3>
        <p className="text-xs text-slate-400">اختر لوحة ألوان للتطبيق بالكامل.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {THEME_PALETTES.map((p) => {
          const active = current === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => choose(p.key)}
              disabled={applying !== null}
              className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-start transition disabled:cursor-not-allowed ${
                active
                  ? "border-brand-400 ring-2 ring-brand-100"
                  : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
              } ${applying === p.key ? "opacity-60" : ""}`}
            >
              <div className="flex h-9 w-full overflow-hidden rounded-lg ring-1 ring-black/5">
                <span className="flex-[2]" style={{ background: p.colors[500] }} />
                <span className="flex-[2]" style={{ background: p.colors[700] }} />
                <span className="flex-1" style={{ background: "var(--color-gold-500)" }} />
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  {p.label}
                  {active && <Check size={13} className="text-brand-600" />}
                </p>
                <p className="text-[11px] text-slate-400">{p.description}</p>
              </div>
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function PreferencesPage() {
  useOutletContext<OutletCtx>();
  const { token } = useAuth();
  const { settings, loading, setSettings } = useSettings();

  const [values, setValues] = useState<Record<string, string>>(settings);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setValues(settings);
  }, [settings]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await api.updateSettings(token, values);
      setSettings(res.settings);
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(null), 2500);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "تعذّر حفظ الإعدادات.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        <Settings size={15} className="text-brand-500" />
        <span className="font-medium text-slate-700">إعدادات المدرسة</span>
      </div>

      <div className="flex-1 overflow-auto px-4 py-6">
        {errorMsg && <p className="mb-4 max-w-lg rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>}

        {loading ? (
          <p className="text-sm text-slate-400">جارٍ تحميل الإعدادات…</p>
        ) : (
          <div className="max-w-lg space-y-6">
            <div className="space-y-5 relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-0.5 before:bg-gradient-to-r before:from-brand-500 before:via-brand-400 before:to-gold-400 before:opacity-70 before:content-['']">
              <h3 className="text-sm font-semibold text-slate-800">الهوية البصرية</h3>
              <BrandingUploadField
                kind="logo"
                label="شعار التطبيق"
                description="يظهر في الشريط العلوي وعلى البطاقات المطبوعة. الصور المربعة هي الأفضل."
                previewClassName="h-14 w-14"
              />
              <BrandingUploadField
                kind="background"
                label="خلفية التطبيق"
                description="تظهر خلف واجهة التطبيق وفي شاشة تسجيل الدخول."
                previewClassName="h-14 w-24"
              />
            </div>

            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-0.5 before:bg-gradient-to-r before:from-brand-500 before:via-brand-400 before:to-gold-400 before:opacity-70 before:content-['']">
              <ThemePaletteField />
            </div>

          <form onSubmit={handleSubmit} className="space-y-4 relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-0.5 before:bg-gradient-to-r before:from-brand-500 before:via-brand-400 before:to-gold-400 before:opacity-70 before:content-['']">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-medium text-slate-500">{f.label}</label>
                <input
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  // The academic year is the year opened in the العام الدراسي tab.
                  readOnly={f.key === "academic_year"}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition read-only:bg-slate-50 read-only:text-slate-500 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300"
                />
                {f.key === "academic_year" && (
                  <p className="mt-1 text-[11px] text-slate-400">يتغير بفتح عام آخر من تبويب العام الدراسي.</p>
                )}
              </div>
            ))}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-600/30 active:translate-y-0 disabled:opacity-60"
              >
                <Save size={14} />
                {saving ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
              </button>
              {savedAt && <span className="text-xs text-emerald-600">تم الحفظ.</span>}
            </div>
          </form>
          </div>
        )}
      </div>
    </div>
  );
}
