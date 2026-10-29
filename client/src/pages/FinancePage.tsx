import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, RefreshCcw, Pencil, Trash2, X, Wallet, Upload, Download } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useClasses } from "../context/ClassesContext";
import { useSettings } from "../context/SettingsContext";
import { api, ApiError } from "../lib/api";
import { downloadExcel } from "../lib/excel";
import { useSyncListener } from "../lib/liveSync";
import type { FeeType, Payment, PaymentInput, Student } from "../lib/types";
import PaymentFormModal from "../components/PaymentFormModal";
import CsvImportModal, { type ImportColumn } from "../components/CsvImportModal";

type OutletCtx = { notify: (label: string) => void };

const PAYMENT_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "studentId", label: "Student ID", example: "1" },
  { key: "studentName", label: "Student Name" },
  { key: "studentNationalId", label: "Student National ID" },
  { key: "feeType", label: "Fee Type", example: "Tuition" },
  { key: "amount", label: "Amount", required: true, example: "500" },
  { key: "method", label: "Method", example: "cash" },
  { key: "paidOn", label: "Date Paid", required: true, example: "2026-08-01" },
  { key: "note", label: "Note" },
];

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

export default function FinancePage() {
  useOutletContext<OutletCtx>();
  const { token } = useAuth();
  const { selectedClassId, selectedClassName, setSelectedClassId } = useClasses();
  const { settings } = useSettings();
  const currency = settings.currency || "";

  const formatMoney = (value: number) =>
    `${currency ? `${currency} ` : ""}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Payment | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importStudents, setImportStudents] = useState<Student[] | null>(null);

  const loadPayments = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.getPayments(token, { classId: selectedClassId ?? undefined });
      setPayments(res.payments);
      setTotal(res.total);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not load payments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedClassId]);

  useSyncListener("students", loadPayments);

  useEffect(() => {
    if (!token) return;
    api
      .getFeeTypes(token)
      .then((res) => setFeeTypes(res.feeTypes))
      .catch(() => setFeeTypes([]));
  }, [token]);

  const handleCreate = async (input: PaymentInput) => {
    if (!token) return;
    await api.createPayment(token, input);
    setModalOpen(false);
    await loadPayments();
  };

  const handleUpdate = async (input: PaymentInput) => {
    if (!token || !editing) return;
    await api.updatePayment(token, editing.id, input);
    setEditing(null);
    await loadPayments();
  };

  const confirmDelete = async () => {
    if (!token || !pendingDelete) return;
    await api.deletePayment(token, pendingDelete.id);
    setPendingDelete(null);
    await loadPayments();
  };

  const openImport = async () => {
    if (token && !importStudents) {
      try {
        const res = await api.getStudents(token);
        setImportStudents(res.students);
      } catch {
        setImportStudents([]);
      }
    }
    setImportOpen(true);
  };

  const mapPaymentImportRow = (raw: Record<string, string>): { input?: PaymentInput; error?: string } => {
    const students = importStudents ?? [];
    let student: Student | undefined;

    if (raw.studentId?.trim()) {
      const id = Number(raw.studentId.trim());
      student = students.find((s) => s.id === id);
      if (!student) return { error: `No student with ID "${raw.studentId}"` };
    } else if (raw.studentNationalId?.trim()) {
      student = students.find((s) => s.national_id === raw.studentNationalId.trim());
      if (!student) return { error: `No student with National ID "${raw.studentNationalId}"` };
    } else if (raw.studentName?.trim()) {
      const matches = students.filter((s) => s.name.trim().toLowerCase() === raw.studentName.trim().toLowerCase());
      if (matches.length === 0) return { error: `No student named "${raw.studentName}"` };
      if (matches.length > 1) return { error: `Multiple students named "${raw.studentName}" — use Student ID instead` };
      student = matches[0];
    } else {
      return { error: "Provide Student ID, Student Name, or Student National ID" };
    }

    const amount = Number(raw.amount);
    if (!amount || amount <= 0) return { error: `Invalid amount "${raw.amount}"` };

    const feeType = raw.feeType?.trim()
      ? feeTypes.find((f) => f.name.toLowerCase() === raw.feeType.trim().toLowerCase())
      : undefined;

    return {
      input: {
        studentId: student.id,
        feeTypeId: feeType?.id,
        amount,
        method: raw.method?.trim() || "cash",
        paidOn: raw.paidOn,
        note: raw.note || undefined,
      },
    };
  };

  const handleExport = () => {
    const headers = ["Date", "Student", "Fee Type", "Amount", "Method", "Note"];
    const rows = payments.map((p) => ({
      Date: formatDate(p.paid_on),
      Student: p.student_name,
      "Fee Type": p.fee_type_name ?? "Other",
      Amount: p.amount,
      Method: p.method,
      Note: p.note ?? "",
    }));
    downloadExcel("payments.xlsx", headers, rows);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col items-center border-e border-slate-200 px-3 last:border-e-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setModalOpen(true)}
              className="flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 transition hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
            >
              <Plus size={18} />
              <span>New Payment</span>
            </button>
            <button
              onClick={openImport}
              className="flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 transition hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
            >
              <Upload size={18} />
              <span>Import</span>
            </button>
            <button
              onClick={handleExport}
              className="flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 transition hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
            >
              <Download size={18} />
              <span>Export</span>
            </button>
            <button
              onClick={() => loadPayments()}
              className="group flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 transition hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
            >
              <RefreshCcw size={18} className="transition-transform duration-500 group-active:rotate-180" />
              <span>Refresh</span>
            </button>
          </div>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">Payments</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="font-medium text-slate-700">My School</span>
          {selectedClassName && (
            <>
              <span>/</span>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                {selectedClassName}
              </span>
              <button
                onClick={() => setSelectedClassId(null)}
                className="text-slate-400 hover:text-slate-600"
                title="Clear class filter"
              >
                <X size={14} />
              </button>
            </>
          )}
          <span className="text-slate-300">&middot;</span>
          <span>
            {payments.length} payment{payments.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
          <Wallet size={15} />
          Total collected: {formatMoney(total)}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        {errorMsg && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>}

        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50 before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-0.5 before:bg-gradient-to-r before:from-brand-500 before:via-brand-400 before:to-gold-400 before:opacity-70 before:content-['']">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Student</th>
                <th className="px-3 py-2.5">Fee type</th>
                <th className="px-3 py-2.5">Amount</th>
                <th className="px-3 py-2.5">Method</th>
                <th className="px-3 py-2.5">Note</th>
                <th className="px-3 py-2.5 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                    Loading payments…
                  </td>
                </tr>
              )}

              {!loading && payments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                    No payments recorded.
                  </td>
                </tr>
              )}

              {!loading &&
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-slate-500">{formatDate(p.paid_on)}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800" dir="rtl">
                      {p.student_name}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{p.fee_type_name ?? "Other"}</td>
                    <td className="px-3 py-2.5 font-medium text-emerald-700">{formatMoney(p.amount)}</td>
                    <td className="px-3 py-2.5 capitalize text-slate-500">{p.method}</td>
                    <td className="px-3 py-2.5 max-w-[200px] truncate text-slate-500" title={p.note ?? ""}>
                      {p.note ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setEditing(p)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setPendingDelete(p)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <PaymentFormModal feeTypes={feeTypes} onClose={() => setModalOpen(false)} onSubmit={handleCreate} />
      )}

      {editing && (
        <PaymentFormModal
          feeTypes={feeTypes}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={handleUpdate}
        />
      )}

      {importOpen && token && (
        <CsvImportModal<PaymentInput>
          title="Import Payments"
          description="Match each row to a student by ID, name, or national ID."
          templateFilename="payments-template.csv"
          columns={PAYMENT_IMPORT_COLUMNS}
          mapRow={mapPaymentImportRow}
          onImportRow={(input) => api.createPayment(token, input).then(() => {})}
          onClose={() => setImportOpen(false)}
          onFinished={loadPayments}
        />
      )}

      {pendingDelete && (
        <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
          <div className="animate-rise-in w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-sm font-semibold text-slate-800">Remove payment?</h3>
            <p className="mt-1.5 text-sm text-slate-500">
              This will permanently delete this payment of{" "}
              <span className="font-medium text-slate-700">{formatMoney(pendingDelete.amount)}</span> for{" "}
              <span className="font-medium text-slate-700">{pendingDelete.student_name}</span>.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
