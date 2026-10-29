import type { ComponentType, ReactNode } from "react";

export const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 hover:border-slate-300";
export const disabledInputCls =
  "w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-400 outline-none";

export function Section({
  title,
  icon: Icon,
  cols = 2,
  className = "",
  children,
}: {
  title: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  cols?: 1 | 2;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/50 transition hover:border-brand-200 hover:shadow-md hover:shadow-brand-100/40 ${className}`}
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-500 via-brand-400 to-gold-400 opacity-70" />
      <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        {Icon && (
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Icon size={13} />
          </span>
        )}
        {title}
      </h3>
      <div className={`grid gap-3 ${cols === 1 ? "grid-cols-1" : "grid-cols-2"}`}>{children}</div>
    </div>
  );
}

export function Field({ label, span = 1, children }: { label: string; span?: 1 | 2; children: ReactNode }) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}
