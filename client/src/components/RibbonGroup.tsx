import type { ComponentType } from "react";

export type RibbonButtonDef = {
  label: string;
  icon: ComponentType<{ size?: number }>;
  onClick?: () => void;
  disabled?: boolean;
};

export default function RibbonGroup({ caption, buttons }: { caption: string; buttons: RibbonButtonDef[] }) {
  return (
    <div className="flex flex-col items-center border-e border-slate-200 px-3 last:border-e-0">
      <div className="flex items-center gap-1">
        {buttons.map((b) => {
          const Icon = b.icon;
          return (
            <button
              key={b.label}
              onClick={b.onClick}
              title={b.disabled ? "Coming soon" : b.label}
              className={`flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] transition ${
                b.disabled
                  ? "text-slate-300 hover:bg-slate-50"
                  : "text-slate-600 hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
              }`}
            >
              <Icon size={18} />
              <span className="max-w-[64px] truncate">{b.label}</span>
            </button>
          );
        })}
      </div>
      <span className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{caption}</span>
    </div>
  );
}
