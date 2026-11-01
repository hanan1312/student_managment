import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Plus, Printer, RotateCcw, X } from "lucide-react";
import { useSettings } from "../context/SettingsContext";
import { assetUrl } from "../lib/api";
import { printOnlyTarget } from "../lib/degrees";
import { isAdministrationManager, setStamp, useStamp, type Signatures } from "../lib/print";
import { useUiControl } from "../lib/uiControl";

// Shared pieces of the print previews (Students list, Degrees table, degrees certificates):
// a full-screen modal with an options panel beside an A4 preview sheet. Only the sheet prints
// (print-only-target); print CSS for .print-modal-root / .print-sheet is in index.css.

export type Orientation = "portrait" | "landscape";

const FONT_SIZES = [9, 10, 11, 12, 13, 14];

export function PrintModalShell({
  heading,
  subheading,
  orientation,
  fontSize,
  canPrint,
  onClose,
  options,
  children,
}: {
  heading: string;
  subheading?: string;
  orientation: Orientation;
  fontSize: number;
  canPrint: boolean;
  onClose: () => void;
  options: ReactNode;
  children: ReactNode;
}) {
  return createPortal(
    <div className="print-modal-root animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm">
      <style>{`@media print { @page { size: A4 ${orientation}; margin: 10mm; } }`}</style>
      <div className="animate-rise-in flex h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="print-hidden flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">{heading}</h2>
            {subheading && <p className="text-xs text-slate-400">{subheading}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={printOnlyTarget}
              disabled={!canPrint}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Printer size={14} />
              طباعة
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="print-hidden max-h-[40vh] shrink-0 space-y-5 overflow-y-auto border-b border-slate-100 p-4 text-sm md:max-h-none md:w-72 md:border-b-0 md:border-e">
            {options}
          </aside>

          <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4">
            <div
              className={`print-area print-only-target print-sheet mx-auto bg-white p-[10mm] text-slate-900 shadow-md ${
                orientation === "landscape" ? "max-w-[297mm]" : "max-w-[210mm]"
              }`}
              dir="rtl"
              style={{ fontSize }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Logo, school name and academic year, the sheet title, and the date and time of printing.
export function PrintSheetHeader({
  title,
  subtitle,
  schoolName,
  lines,
  meta,
  showDate = true,
  dateOnLeft = false,
}: {
  title: string;
  subtitle?: string;
  // Defaults to the school name from Preferences.
  schoolName?: string | null;
  // Replaces the school name and academic year at the right of the header.
  lines?: ReactNode;
  // Shown at the end of the date line, e.g. a count of students.
  meta?: ReactNode;
  showDate?: boolean;
  // The date at the left of the page (the end of the line) instead of the right.
  dateOnLeft?: boolean;
}) {
  const { settings } = useSettings();
  const { t } = useUiControl();
  const logoUrl = assetUrl(settings.logo_url);
  const printedAt = new Intl.DateTimeFormat("ar-EG", { dateStyle: "long", timeStyle: "short" }).format(new Date());
  return (
    <>
      <header className="mb-3 flex items-center justify-between gap-4 border-b-2 border-slate-700 pb-2">
        <div className="min-w-0 flex-1 space-y-0.5 text-[1.1em]">
          {lines ?? (
            <>
              <p className="font-bold">{schoolName || settings.school_name || "SchoolSuite"}</p>
              {settings.academic_year && <p>العام الدراسي {settings.academic_year}</p>}
            </>
          )}
        </div>
        <div className="flex-1 text-center">
          <h1 className="text-[1.6em] font-bold">{title}</h1>
          {subtitle && <p className="text-[0.95em] text-slate-600">{subtitle}</p>}
        </div>
        <div className="flex flex-1 justify-end">
          {logoUrl ? <img src={logoUrl} alt="" className="h-16 w-16 object-contain" /> : <div className="h-16 w-16" />}
        </div>
      </header>
      {(showDate || meta) && (
        <div className={`mb-3 flex justify-between text-[0.95em] text-slate-600 ${dateOnLeft ? "flex-row-reverse" : ""}`}>
          <span>{showDate ? `${t("print.printedAt")}: ${printedAt}` : ""}</span>
          {meta && <span>{meta}</span>}
        </div>
      )}
    </>
  );
}

export function OptionSection({ label, actions, children }: { label: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        {actions && <div className="flex gap-2 text-[11px] font-medium text-brand-600">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function OptionCheckbox({
  label,
  checked,
  onChange,
  count,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  count?: number;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-brand-600" />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-[11px] text-slate-400">{count}</span>}
    </label>
  );
}

export function TitleOption({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <OptionSection label="العنوان">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </OptionSection>
  );
}

// Portrait / landscape and font size, plus any extra layout switches passed as children.
export function LayoutOptions({
  orientation,
  onOrientation,
  fontSize,
  onFontSize,
  children,
}: {
  orientation: Orientation;
  onOrientation: (o: Orientation) => void;
  fontSize: number;
  onFontSize: (size: number) => void;
  children?: ReactNode;
}) {
  return (
    <OptionSection label="تنسيق الصفحة">
      <div className="flex gap-1">
        {(["portrait", "landscape"] as const).map((o) => (
          <button
            key={o}
            onClick={() => onOrientation(o)}
            className={`flex-1 rounded-lg px-2 py-1 text-xs transition ${
              orientation === o ? "bg-brand-600 font-semibold text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {o === "portrait" ? "طولي" : "عرضي"}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-2 px-1.5 text-xs text-slate-600">
        حجم الخط
        <select
          value={fontSize}
          onChange={(e) => onFontSize(Number(e.target.value))}
          className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-brand-500"
        >
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      {children}
    </OptionSection>
  );
}

// A preview table's column header: the label, then (preview only) move right / left and hide.
export function PrintColumnHeader({
  label,
  className,
  isFirst,
  isLast,
  onMove,
  onHide,
}: {
  label: ReactNode;
  className: string;
  isFirst: boolean;
  isLast: boolean;
  onMove: (step: -1 | 1) => void;
  onHide: () => void;
}) {
  return (
    <th className={className}>
      <span>{label}</span>
      <div className="print-hidden flex items-center justify-center gap-1.5">
        <button
          onClick={() => onMove(-1)}
          disabled={isFirst}
          className="text-slate-400 hover:text-brand-600 disabled:invisible"
          title="تحريك لليمين"
        >
          <ChevronRight size={12} />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={isLast}
          className="text-slate-400 hover:text-brand-600 disabled:invisible"
          title="تحريك لليسار"
        >
          <ChevronLeft size={12} />
        </button>
        <button onClick={onHide} className="text-slate-300 hover:text-red-500" title="إخفاء العمود">
          <X size={11} />
        </button>
      </div>
    </th>
  );
}

// Last cell of a preview row: drops the row from the printout (not from the data). Hidden in print.
export function RemoveRowCell({ onRemove }: { onRemove: () => void }) {
  return (
    <td className="print-hidden border border-slate-300 text-center">
      <button
        onClick={onRemove}
        className="text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
        title="حذف الصف من الطباعة"
      >
        <X size={12} />
      </button>
    </td>
  );
}

export function RestoreRowsButton({ count, onClick }: { count: number; onClick: () => void }) {
  if (count === 0) return null;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      <RotateCcw size={12} />
      استعادة الصفوف المحذوفة ({count})
    </button>
  );
}

// Options panel: show signatures, and edit, add or remove their captions; show the stamp (الختم) or
// put it back in its place.
export function SignatureOptions({ signatures, label = "التوقيعات" }: { signatures: Signatures; label?: string }) {
  const { names, setNames, shown, setShown, reset } = signatures;
  const stamp = useStamp();
  return (
    <OptionSection
      label={label}
      actions={
        <button onClick={reset} className="hover:underline">
          الافتراضي
        </button>
      }
    >
      <OptionCheckbox label="إظهار التوقيعات" checked={shown} onChange={setShown} />
      {shown && (
        <div className="space-y-1">
          {names.map((name, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                value={name}
                onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
                className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-brand-500"
              />
              <button
                onClick={() => setNames(names.filter((_, j) => j !== i))}
                className="rounded p-1 text-slate-300 hover:text-red-500"
                title="حذف"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {names.length < 5 && (
            <button
              onClick={() => setNames([...names, ""])}
              className="flex items-center gap-1 px-1 text-[11px] font-medium text-brand-600 hover:underline"
            >
              <Plus size={11} />
              إضافة توقيع
            </button>
          )}
          <div className="flex items-center justify-between">
            <OptionCheckbox label="الختم (اسحبه في المعاينة)" checked={stamp.shown} onChange={(on) => setStamp((st) => ({ ...st, shown: on }))} />
            {(stamp.x !== 0 || stamp.y !== 0) && (
              <button
                onClick={() => setStamp((st) => ({ ...st, x: 0, y: 0 }))}
                className="shrink-0 px-1 text-[11px] font-medium text-brand-600 hover:underline"
              >
                مكانه الأصلي
              </button>
            )}
          </div>
        </div>
      )}
    </OptionSection>
  );
}

// الختم: an empty place for the stamp, under مدير الإدارة's signature. Drag it in the preview to
// move it (every certificate's stamp moves together); the outline only shows in the preview.
export function StampBox() {
  const stamp = useStamp();
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  if (!stamp.shown) return null;
  return (
    <div
      className="stamp-box relative mx-auto mt-2 flex h-24 w-24 cursor-move touch-none select-none items-start justify-center rounded-full border-2 border-dashed border-slate-300 pt-1 text-[0.95em] font-semibold print:border-transparent"
      style={{ transform: `translate(${stamp.x}px, ${stamp.y}px)` }}
      title="اسحب لتحريك الختم"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { px: e.clientX, py: e.clientY, x: stamp.x, y: stamp.y };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        setStamp((st) => ({ ...st, x: Math.round(d.x + e.clientX - d.px), y: Math.round(d.y + e.clientY - d.py) }));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      الختم
    </div>
  );
}

// The signatures row. `plain` prints the captions only (as on the official result forms) instead
// of a caption over a signature line. The stamp goes under مدير الإدارة (or the last signature).
export function SignatureBlock({ signatures, plain = false }: { signatures: Signatures; plain?: boolean }) {
  const names = signatures.names.filter((n) => n.trim());
  if (!signatures.shown || names.length === 0) return null;
  const managerIndex = names.findIndex(isAdministrationManager);
  const stampIndex = managerIndex >= 0 ? managerIndex : names.length - 1;
  return (
    <div
      className={`signature-block grid text-center ${plain ? "gap-4 pt-4 font-semibold" : "gap-8 pt-6"}`}
      style={{ gridTemplateColumns: `repeat(${names.length}, minmax(0, 1fr))` }}
    >
      {names.map((name, i) => (
        <div key={i}>
          {plain ? (
            <p>{name}</p>
          ) : (
            <>
              <p className="mb-8">{name}</p>
              <p className="border-t border-slate-400 pt-1 text-[0.85em] text-slate-500">التوقيع</p>
            </>
          )}
          {i === stampIndex && <StampBox />}
        </div>
      ))}
    </div>
  );
}
