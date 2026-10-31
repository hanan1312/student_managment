import { Download, Upload } from "lucide-react";

// استيراد / تصدير buttons for a screen's header. "dark" sits on a dark gradient header.
export default function ImportExportButtons({
  onImport,
  onExport,
  exportDisabled,
  tone = "light",
}: {
  onImport?: () => void;
  onExport: () => void;
  exportDisabled?: boolean;
  tone?: "light" | "dark";
}) {
  const cls =
    tone === "dark"
      ? "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
      : "flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40";
  return (
    <>
      {onImport && (
        <button type="button" onClick={onImport} className={cls}>
          <Upload size={14} />
          استيراد
        </button>
      )}
      <button type="button" onClick={onExport} disabled={exportDisabled} className={cls}>
        <Download size={14} />
        تصدير
      </button>
    </>
  );
}
