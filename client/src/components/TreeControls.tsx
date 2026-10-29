import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Check, X } from "lucide-react";

export function AddInline({
  placeholder,
  onAdd,
  onDone,
}: {
  placeholder: string;
  onAdd: (name: string) => Promise<void>;
  onDone: () => void;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    const name = value.trim();
    if (!name) return;
    setSubmitting(true);
    setError(null);
    try {
      await onAdd(name);
      setValue("");
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّرت الإضافة.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      onDone();
    }
  };

  return (
    <div className="flex flex-col gap-1 px-2 py-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={submitting}
          dir="auto"
          className="w-full min-w-0 rounded-md border border-brand-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          title="إضافة"
          className="shrink-0 rounded-md bg-brand-600 p-1 text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          <Check size={12} />
        </button>
        <button
          type="button"
          onClick={onDone}
          title="تم"
          className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={12} />
        </button>
      </div>
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

export function RenameInline({
  initialValue,
  onSave,
  onCancel,
}: {
  initialValue: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = async () => {
    const name = value.trim();
    if (!name || name === initialValue) {
      onCancel();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSave(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّرت إعادة التسمية.");
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="flex flex-col gap-1 px-2 py-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
          dir="auto"
          className="w-full min-w-0 rounded-md border border-brand-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          title="حفظ"
          className="shrink-0 rounded-md bg-brand-600 p-1 text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          <Check size={12} />
        </button>
        <button
          type="button"
          onClick={onCancel}
          title="إلغاء"
          className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={12} />
        </button>
      </div>
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

export function ConfirmDeleteDialog({
  title,
  message,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر الحذف.");
      setBusy(false);
    }
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="animate-rise-in w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <p className="mt-1.5 text-sm text-slate-500">{message}</p>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            إلغاء
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className="rounded-lg bg-red-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            حذف
          </button>
        </div>
      </div>
    </div>
  );
}

export function RowActionButton({
  onClick,
  title,
  variant = "default",
  children,
}: {
  onClick: (e: MouseEvent) => void;
  title: string;
  variant?: "default" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`shrink-0 rounded-md p-1 text-slate-300 opacity-0 transition hover:bg-slate-100 group-hover:opacity-100 ${
        variant === "danger" ? "hover:text-red-600" : "hover:bg-brand-50 hover:text-brand-600"
      }`}
    >
      {children}
    </button>
  );
}
