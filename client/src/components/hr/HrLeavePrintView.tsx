import { Printer, X } from "lucide-react";
import { assetUrl } from "../../lib/api";
import { useSettings } from "../../context/SettingsContext";
import type { HrEmployee, HrLeaveEntry, School } from "../../lib/types";

type Props = {
  employee: HrEmployee;
  school: School;
  entry: HrLeaveEntry;
  balanceBefore: number;
  balanceAfter: number;
  onClose: () => void;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export default function HrLeavePrintView({ employee, school, entry, balanceBefore, balanceAfter, onClose }: Props) {
  const { settings } = useSettings();
  const days = Math.abs(entry.count);
  // Prefers this school's own logo (kept distinct per school for multi-school installs) but
  // falls back to the single global branding logo set in Preferences, so the header circle
  // isn't left empty for a school that never uploaded its own.
  const logoUrl = assetUrl(school.logo_url || settings.logo_url);

  return (
    <div className="animate-fade-in fixed inset-0 z-40 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="print-hidden flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">Leave Request Form</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Printer size={14} />
              Print
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="print-area overflow-y-auto px-8 py-6" dir="rtl">
          <div className="mb-4 flex items-start justify-between border-b border-slate-300 pb-3 text-xs">
            <div className="space-y-0.5 text-right">
              {school.governorate && <p>محافظة {school.governorate}</p>}
              {school.directorate && <p>{school.directorate}</p>}
              <p className="font-semibold">{school.name}</p>
            </div>
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="h-16 w-16 rounded-full border border-slate-300" />
            )}
            <div className="space-y-0.5 text-left" dir="ltr">
              {school.phone && <p>تليفون: {school.phone}</p>}
              {school.address && <p>{school.address}</p>}
            </div>
          </div>

          <h1 className="mb-4 text-center text-lg font-bold underline">استمارة اجازة اعتيادية</h1>

          <div className="mb-6 grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-slate-500">الاسم</span>
            <span className="font-medium">{employee.name_ar}</span>
            <span className="text-slate-500">الوظيفة</span>
            <span className="font-medium">{employee.job ?? "—"}</span>
            <span className="text-slate-500">مدة الاجازة المطلوبة</span>
            <span className="font-medium">{days} يوم</span>
            <span className="text-slate-500">العنوان اثناء الاجازة</span>
            <span className="font-medium">{employee.address ?? "—"}</span>
            <span className="text-slate-500">اعتبارا من</span>
            <span className="font-medium">
              {formatDate(entry.leave_start)} حتى {formatDate(entry.leave_end)}
            </span>
            <span className="text-slate-500">تليفون</span>
            <span className="font-medium">{employee.tel1 ?? "—"}</span>
            <span className="text-slate-500">تاريخ التعيين</span>
            <span className="font-medium">{formatDate(employee.registration_date)}</span>
          </div>

          <div className="mb-8 flex items-center justify-between text-sm">
            <span>توقيع العامل: __________________</span>
            <span>توقيع القائم بالعمل أثناء الاجازة: __________________</span>
          </div>
          <p className="mb-8 text-sm">تحريراً في: {new Date().toLocaleDateString()}</p>

          <div className="border-t border-slate-300 pt-4">
            <p className="mb-3 text-center text-sm font-semibold">بيانات تملأ بمعرفة إدارة المدرسة</p>
            <div className="mb-6 grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-slate-500">الرصيد قبل الاجازة</span>
              <span className="font-medium">{balanceBefore} يوما</span>
              <span className="text-slate-500">تستنزل مدة الاجازة</span>
              <span className="font-medium">{days} يوما</span>
              <span className="text-slate-500">الرصيد بعد الاجازة</span>
              <span className="font-medium">{balanceAfter} يوما</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>وكيل المرحلة</span>
              <span>شئون العاملين</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
