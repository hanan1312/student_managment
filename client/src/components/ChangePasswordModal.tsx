import { useState, type FormEvent } from "react";
import { X, KeyRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";

function isStrongPassword(password: string): boolean {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

// Self-service "change my own password" — any logged-in user (not just admins), reachable
// from the account menu in DashboardLayout. Requires the current password, so it doubles as
// re-authentication rather than trusting the still-open session alone.
export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      setError("كلا الحقلين مطلوب.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("كلمة المرور الجديدة وتأكيدها غير متطابقين.");
      return;
    }
    if (!isStrongPassword(newPassword)) {
      setError("يجب أن تتكون كلمة المرور الجديدة من 8 أحرف على الأقل وتحتوي على حروف وأرقام.");
      return;
    }
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.changeMyPassword(token, { currentPassword, newPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تغيير كلمة المرور.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800">تغيير كلمة المرور</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-6 text-center">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">تم تغيير كلمة المرور بنجاح.</p>
            <button
              onClick={onClose}
              className="mt-4 rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 hover:-translate-y-0.5"
            >
              تم
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">كلمة المرور الحالية</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">كلمة المرور الجديدة</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300"
              />
              <p className="mt-1 text-[11px] text-slate-400">8 أحرف على الأقل، تحتوي على حروف وأرقام.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">تأكيد كلمة المرور الجديدة</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300"
              />
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
                {submitting ? "جارٍ الحفظ…" : "تغيير كلمة المرور"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
