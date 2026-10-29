import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { SystemUser, SystemUserInput, UserCatalogItem } from "../lib/types";

const ROLES = ["admin", "staff", "accountant", "teacher"];

// Stored role values stay English (they're also part of the temporary password); shown in Arabic.
export const ROLE_LABELS: Record<string, string> = {
  admin: "مدير النظام",
  staff: "موظف",
  accountant: "محاسب",
  teacher: "مدرس",
  master: "الحساب الرئيسي",
  unknown: "غير معروف",
};

export function roleLabel(role: string | null | undefined): string {
  return role ? ROLE_LABELS[role] ?? role : "";
}

type Props = {
  initial?: SystemUser | null;
  onClose: () => void;
  onSubmit: (input: SystemUserInput) => Promise<void>;
};

const fieldCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300 disabled:bg-slate-50 disabled:text-slate-500";

// New and Edit share the same fields. Username ("<first name>_<city>_<code>") and the
// temporary password ("<role>_<code>") are derived, shown read-only so the admin knows what to
// hand over; the server (routes/users.ts) makes the final call.
export default function SystemUserModal({ initial, onClose, onSubmit }: Props) {
  const isEdit = Boolean(initial);
  const { token } = useAuth();

  const [cities, setCities] = useState<UserCatalogItem[]>([]);
  const [eduAdmins, setEduAdmins] = useState<UserCatalogItem[]>([]);
  const [cityId, setCityId] = useState<number | "">(initial?.city_id ?? "");
  const [eduAdminId, setEduAdminId] = useState<number | "">(initial?.education_admin_id ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [role, setRole] = useState(initial?.role ?? "staff");
  const [resetPassword, setResetPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCode = () => {
    if (!token) return;
    api
      .getNewUserCode(token)
      .then((res) => setCode(res.code))
      .catch(() => setCode(""));
  };

  useEffect(() => {
    if (!token) return;
    api.getUserCatalog(token, "cities").then((res) => setCities(res.items)).catch(() => {});
    api.getUserCatalog(token, "education-admins").then((res) => setEduAdmins(res.items)).catch(() => {});
    // Users created before codes existed get one the first time they're edited.
    if (!initial?.code) refreshCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const cityName = cities.find((c) => c.id === cityId)?.name.trim();
  const firstName = fullName.trim().split(/\s+/)[0];
  const generatedUsername = firstName && cityName && code ? `${firstName}_${cityName}_${code}` : "";
  const generatedPassword = code ? `${role}_${code}` : "";
  // An older user with neither picked keeps their existing username.
  const keepsLegacyUsername = isEdit && cityId === "" && eduAdminId === "";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("الاسم بالكامل مطلوب.");
      return;
    }
    if (!keepsLegacyUsername && (cityId === "" || eduAdminId === "")) {
      setError("اختر المدينة والإدارة التعليمية.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        fullName: fullName.trim(),
        role,
        ...(cityId !== "" && eduAdminId !== "" ? { cityId, educationAdminId: eduAdminId, code } : {}),
        ...(isEdit && resetPassword ? { resetPassword: true } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ ما.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">{isEdit ? "تعديل المستخدم" : "مستخدم جديد"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">الاسم بالكامل</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">الدور</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={`${fieldCls} capitalize`}>
              {ROLES.map((r) => (
                <option key={r} value={r} className="capitalize">
                  {ROLE_LABELS[r] ?? r}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">مدينة</label>
              <select
                value={cityId}
                onChange={(e) => setCityId(e.target.value ? Number(e.target.value) : "")}
                className={fieldCls}
              >
                <option value="">— اختر —</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">إدارة تعليمية</label>
              <select
                value={eduAdminId}
                onChange={(e) => setEduAdminId(e.target.value ? Number(e.target.value) : "")}
                className={fieldCls}
              >
                <option value="">— اختر —</option>
                {eduAdmins.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {(cities.length === 0 || eduAdmins.length === 0) && (
            <p className="text-[11px] text-amber-600">أضف بيانات في تبويبي مدينة وإدارة تعليمية أولًا.</p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">الكود</label>
            <div className="flex gap-2">
              <input value={code} disabled className={`${fieldCls} font-mono`} />
              <button
                type="button"
                onClick={refreshCode}
                title="توليد كود آخر"
                className="rounded-lg border border-slate-200 px-2.5 text-slate-500 hover:bg-slate-50"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">اسم المستخدم</label>
            <input
              value={keepsLegacyUsername ? initial?.username ?? "" : generatedUsername}
              disabled
              placeholder="الاسم الأول_مدينة_الكود"
              className={fieldCls}
            />
            {keepsLegacyUsername && (
              <p className="mt-1 text-[11px] text-slate-400">اختر المدينة والإدارة للتحويل إلى اسم مستخدم مُولّد.</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">كلمة المرور المؤقتة</label>
            <input value={generatedPassword} disabled className={`${fieldCls} font-mono`} />
            {isEdit ? (
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={resetPassword}
                  onChange={(e) => setResetPassword(e.target.checked)}
                  className="h-3.5 w-3.5 accent-brand-600"
                />
                إعادة تعيين كلمة المرور إلى هذه المؤقتة (يجب تغييرها عند الدخول التالي)
              </label>
            ) : (
              <p className="mt-1 text-[11px] text-slate-400">يجب على المستخدم اختيار كلمة مرور خاصة به عند أول دخول.</p>
            )}
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-600/30 active:translate-y-0 disabled:opacity-60"
            >
              {submitting ? "جارٍ الحفظ…" : isEdit ? "حفظ التعديلات" : "إنشاء المستخدم"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
