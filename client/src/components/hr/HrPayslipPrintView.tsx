import { Printer, X } from "lucide-react";
import { assetUrl } from "../../lib/api";
import type { HrEmployee, HrPayrollLine, School } from "../../lib/types";

type Props = {
  employee: HrEmployee | null;
  school: School;
  line: HrPayrollLine;
  month: string;
  onClose: () => void;
};

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function HrPayslipPrintView({ employee, school, line, month, onClose }: Props) {
  const logoUrl = assetUrl(school.logo_url);

  return (
    <div className="animate-fade-in fixed inset-0 z-40 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="print-hidden flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">Payslip</h2>
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
          <div className="mb-4 flex items-center justify-between border-b border-slate-300 pb-3 text-xs">
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
          </div>

          <h1 className="mb-4 text-center text-lg font-bold underline">مفردات المرتب</h1>

          <div className="mb-4 grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-slate-500">الاسم</span>
            <span className="font-medium">{employee?.name_ar ?? line.employee_name}</span>
            <span className="text-slate-500">الوظيفة</span>
            <span className="font-medium">{employee?.job ?? "—"}</span>
            <span className="text-slate-500">الشهر</span>
            <span className="font-medium">{month}</span>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-y-2 border-t border-slate-200 pt-3 text-sm">
            <span className="text-slate-500">الراتب الاساسي</span>
            <span className="font-medium">{money(line.basic_salary)}</span>
            <span className="text-slate-500">إجمالي الإضافات</span>
            <span className="font-medium text-emerald-600">+{money(line.additions_total)}</span>
            <span className="text-slate-500">إجمالي الخصومات</span>
            <span className="font-medium text-red-600">-{money(line.deductions_total)}</span>
            <span className="text-slate-500">خصم الإجازات</span>
            <span className="font-medium text-red-600">-{money(line.leave_deduction)}</span>
            <span className="text-slate-500">الضريبة</span>
            <span className="font-medium text-red-600">-{money(line.tax_total)}</span>
          </div>

          <div className="flex items-center justify-between border-t border-slate-300 pt-3 text-base font-bold">
            <span>صافي المرتب</span>
            <span>{money(line.net_salary)}</span>
          </div>

          <div className="mt-10 flex items-center justify-between text-sm">
            <span>توقيع الموظف: __________________</span>
            <span>شئون العاملين: __________________</span>
          </div>
        </div>
      </div>
    </div>
  );
}
