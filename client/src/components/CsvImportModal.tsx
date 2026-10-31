import { useState } from "react";
import { Download, Upload, X, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { parseCsv, readFileAsText, buildCsv, downloadCsv } from "../lib/csv";
import { isExcelFile, parseExcelFile, downloadExcel } from "../lib/excel";
import { useColumnOrder } from "../lib/useColumnOrder";

export type ImportColumn = {
  key: string;
  label: string;
  required?: boolean;
  example?: string;
  aliases?: string[];
  // Read when the file has it, but left out of the template and the expected-columns list (e.g.
  // subjects of other stages).
  hidden?: boolean;
};

export type MappedRow<T> = { rowNumber: number; raw: Record<string, string>; input?: T; error?: string; warning?: string };

type Props<T> = {
  title: string;
  description?: string;
  templateFilename: string;
  columns: ImportColumn[];
  mapRow: (raw: Record<string, string>) => { input?: T; error?: string; warning?: string };
  // Runs once, right before the per-row import loop starts (after "Import N rows" is clicked) —
  // lets a caller resolve anything that needs cross-row context or user confirmation first (e.g.
  // "these divisions aren't in the org tree yet, create them?"). Return the (optionally amended)
  // rows to proceed, or null to cancel and stay on the preview screen.
  onBeforeImport?: (rows: MappedRow<T>[]) => Promise<MappedRow<T>[] | null>;
  onImportRow: (input: T) => Promise<void>;
  onClose: () => void;
  onFinished: () => void;
};

function normalizeHeader(s: string) {
  return s.toLowerCase().replace(/[\s_-]+/g, "");
}

export default function CsvImportModal<T>({
  title,
  description,
  templateFilename,
  columns,
  mapRow,
  onBeforeImport,
  onImportRow,
  onClose,
  onFinished,
}: Props<T>) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<MappedRow<T>[]>([]);
  const [phase, setPhase] = useState<"idle" | "preview" | "importing" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [importErrors, setImportErrors] = useState<{ rowNumber: number; message: string }[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);

  const baseTemplateName = templateFilename.replace(/\.csv$/i, "");
  // Preview columns can be dragged into another order (the template keeps its own).
  const previewOrder = useColumnOrder(`import:${baseTemplateName}`, columns.map((c) => c.key));
  // The preview shows the columns the file fills (all of them before a file is read).
  const previewColumns = previewOrder.order
    .map((key) => columns.find((c) => c.key === key)!)
    .filter((c) => rows.length === 0 || rows.some((r) => r.raw[c.key]?.trim()));
  const templateColumns = columns.filter((c) => !c.hidden);

  const handleDownloadTemplate = (format: "csv" | "xlsx") => {
    const headers = templateColumns.map((c) => c.label);
    const sample: Record<string, string> = {};
    templateColumns.forEach((c) => {
      sample[c.label] = c.example ?? "";
    });
    if (format === "xlsx") {
      downloadExcel(`${baseTemplateName}.xlsx`, headers, [sample]);
    } else {
      downloadCsv(`${baseTemplateName}.csv`, buildCsv(headers, [sample]));
    }
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setParseError(null);
    try {
      const rawRows = isExcelFile(file) ? await parseExcelFile(file) : parseCsv(await readFileAsText(file));
      if (rawRows.length === 0) {
        setParseError("لا توجد صفوف بيانات في هذا الملف. تأكد أن الصف الأول يحتوي على عناوين الأعمدة.");
        return;
      }

      const headerLookup = new Map<string, string>();
      for (const col of columns) {
        headerLookup.set(normalizeHeader(col.label), col.key);
        headerLookup.set(normalizeHeader(col.key), col.key);
        for (const alias of col.aliases ?? []) {
          headerLookup.set(normalizeHeader(alias), col.key);
        }
      }

      const mapped: MappedRow<T>[] = rawRows.map((raw, idx) => {
        const remapped: Record<string, string> = {};
        for (const [header, value] of Object.entries(raw)) {
          const key = headerLookup.get(normalizeHeader(header));
          if (key) remapped[key] = value;
        }
        const rowNumber = idx + 2;
        const missing = columns.filter((c) => c.required && !remapped[c.key]?.trim());
        if (missing.length > 0) {
          return { rowNumber, raw: remapped, error: `ناقص: ${missing.map((m) => m.label).join("، ")}` };
        }
        const { input, error, warning } = mapRow(remapped);
        return { rowNumber, raw: remapped, input, error, warning };
      });

      setRows(mapped);
      setPhase("preview");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "تعذرت قراءة هذا الملف.");
    }
  };

  const validRows = rows.filter((r) => r.input && !r.error);
  const invalidRows = rows.filter((r) => !r.input || r.error);

  const handleImport = async () => {
    let rowsToImport = rows;
    if (onBeforeImport) {
      const resolved = await onBeforeImport(rows);
      if (!resolved) return;
      rowsToImport = resolved;
      setRows(resolved);
    }
    const finalValidRows = rowsToImport.filter((r) => r.input && !r.error);

    setPhase("importing");
    setProgress(0);
    const failures: { rowNumber: number; message: string }[] = [];
    let ok = 0;
    for (const r of finalValidRows) {
      try {
        await onImportRow(r.input as T);
        ok++;
      } catch (err) {
        failures.push({ rowNumber: r.rowNumber, message: err instanceof Error ? err.message : "فشل الاستيراد" });
      }
      setProgress((p) => p + 1);
    }
    setImportedCount(ok);
    setImportErrors(failures);
    setPhase("done");
  };

  const handleFinish = () => {
    onFinished();
    onClose();
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">{title}</h2>
            {description && <p className="text-xs text-slate-400">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {phase === "idle" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-600">
                  استورد مباشرة من ملف <span className="font-medium">Excel (.xlsx / .xls)</span> أو{" "}
                  <span className="font-medium">CSV</span> — بدون أي تحويل، فقط ارفعه بالأسفل.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleDownloadTemplate("xlsx")}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
                  >
                    <Download size={13} />
                    تحميل نموذج Excel
                  </button>
                  <button
                    onClick={() => handleDownloadTemplate("csv")}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
                  >
                    <Download size={13} />
                    تحميل نموذج CSV
                  </button>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-500">الأعمدة المتوقعة</p>
                <div className="flex flex-wrap gap-1.5">
                  {templateColumns.map((c) => (
                    <span
                      key={c.key}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        c.required ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {c.label}
                      {c.required ? " *" : ""}
                    </span>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-10 text-center transition hover:scale-[1.01] hover:border-brand-300 hover:bg-brand-50/30">
                <Upload size={22} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-600">اضغط لاختيار ملف CSV أو Excel</span>
                <span className="text-xs text-slate-400">.csv, .xlsx, .xls</span>
                <input
                  type="file"
                  accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </label>

              {parseError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{parseError}</p>}
            </div>
          )}

          {phase === "preview" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm text-slate-600">
                  <FileSpreadsheet size={14} className="text-slate-400" />
                  {fileName}
                </p>
                <p className="text-xs text-slate-500">
                  <span className="font-medium text-emerald-600">{validRows.length} جاهز</span>
                  {invalidRows.length > 0 && (
                    <>
                      {" "}
                      &middot; <span className="font-medium text-red-600">{invalidRows.length} متخطى</span>
                    </>
                  )}
                </p>
              </div>

              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-100 text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-start font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2.5 py-2">الصف</th>
                      {previewColumns.map((c) => (
                        <th key={c.key} {...previewOrder.headerProps(c.key)} className="px-2.5 py-2">
                          {c.label}
                        </th>
                      ))}
                      <th className="px-2.5 py-2">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map((r) => (
                      <tr key={r.rowNumber} className={r.error ? "bg-red-50/40" : ""}>
                        <td className="px-2.5 py-1.5 text-slate-400">{r.rowNumber}</td>
                        {previewColumns.map((c) => (
                          <td key={c.key} className="max-w-[140px] truncate px-2.5 py-1.5 text-slate-600">
                            {r.raw[c.key] ?? ""}
                          </td>
                        ))}
                        <td className="px-2.5 py-1.5">
                          {r.error ? (
                            <span className="text-red-600">{r.error}</span>
                          ) : r.warning ? (
                            <span className="flex items-center gap-1 text-amber-600">
                              <AlertTriangle size={12} /> {r.warning}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 size={12} /> سليم
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPhase("idle")}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  اختيار ملف آخر
                </button>
                <button
                  onClick={handleImport}
                  disabled={validRows.length === 0}
                  className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-600/30 active:translate-y-0 disabled:opacity-50"
                >
                  استيراد {validRows.length} صف
                </button>
              </div>
            </div>
          )}

          {phase === "importing" && (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-brand-500 transition-all"
                  style={{ width: `${validRows.length ? (progress / validRows.length) * 100 : 0}%` }}
                />
              </div>
              <p className="text-sm text-slate-500">
                جارٍ الاستيراد {progress} / {validRows.length}…
              </p>
            </div>
          )}

          {phase === "done" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
                <CheckCircle2 size={16} />
                تم استيراد {importedCount} من {validRows.length} صف.
              </div>
              {importErrors.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                    <AlertTriangle size={13} />
                    فشل {importErrors.length} صف
                  </p>
                  <ul className="space-y-0.5 text-xs text-amber-700">
                    {importErrors.map((e) => (
                      <li key={e.rowNumber}>
                        الصف {e.rowNumber}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end">
                <button
                  onClick={handleFinish}
                  className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-600/30 active:translate-y-0"
                >
                  تم
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
