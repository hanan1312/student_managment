import type { LucideIcon } from "lucide-react";

export default function ComingSoonPage({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon size={22} />
      </span>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="text-xs text-slate-400">هذا القسم سيتوفر قريباً.</p>
    </div>
  );
}
