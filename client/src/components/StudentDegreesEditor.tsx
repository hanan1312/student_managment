import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { degreeTotals, formatDegree, formatPercentage, passStatus, statusBadgeClass } from "../lib/degrees";
import type { StudentGrade } from "../lib/types";
import { inputCls } from "./FormLayout";
import StudentCertificateModal, { type CertificateStudent } from "./StudentCertificateModal";


const toText = (n: number | null) => (n === null ? "" : String(n));
const toNum = (v: string | undefined) => (!v || v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));

// A student's Degrees Profile: per subject the كبرى/صغرى marks (set only in Subjects, for the
// student's section) and the student's degree (one value, out of the كبرى). Used by the student form's Degrees
// tab and by clicking a row in Students > Degrees Profile.
export default function StudentDegreesEditor({
  student,
  onSaved,
}: {
  student: Omit<CertificateStudent, "grades">;
  onSaved?: () => void;
}) {
  const { token } = useAuth();
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .getStudentGrades(token, student.id)
      .then((res) => {
        setGrades(res.grades);
        setDraft(
          Object.fromEntries(res.grades.map((g) => [g.subject_id, toText(g.score)]))
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "تعذر تحميل الدرجات."))
      .finally(() => setLoading(false));
  }, [token, student.id]);

  // The table, totals and certificate all reflect what's typed, saved or not.
  const liveGrades = useMemo(
    () =>
      grades.map((g) => ({
        ...g,
        score: toNum(draft[g.subject_id]),
        score_min: null,
      })),
    [grades, draft]
  );
  const totals = degreeTotals(liveGrades);
  const status = passStatus(totals.percentage);

  const setField = (subjectId: number, value: string) => setDraft((d) => ({ ...d, [subjectId]: value }));

  const handleSave = async () => {
    if (!token) return;
    const over = liveGrades.find((g) => g.score !== null && g.max_degree !== null && g.score > g.max_degree);
    if (over) {
      setError(`درجة أعلى من نهاية المادة (${over.subject_name}).`);
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.saveStudentGrades(
        token,
        student.id,
        liveGrades.map((g) => ({ subjectId: g.subject_id, score: g.score, scoreMin: null }))
      );
      setMessage("تم حفظ الدرجات.");
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ الدرجات.");
    } finally {
      setSaving(false);
    }
  };

  const cellCls = "px-4 py-2 text-center text-slate-600";

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th rowSpan={2} className="px-4 py-2 text-start uppercase tracking-wide">
                المادة
              </th>
              <th colSpan={2} className="border-s border-slate-200 px-4 py-1.5">
                النهايات
              </th>
              <th rowSpan={2} className="w-36 border-s border-slate-200 bg-brand-50/60 px-4 py-1.5 text-brand-700">
                الدرجة
              </th>
            </tr>
            <tr>
              <th className="w-24 border-s border-slate-200 px-4 py-1.5">كبرى</th>
              <th className="w-24 px-4 py-1.5">صغرى</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-slate-400">
                  جارٍ التحميل…
                </td>
              </tr>
            ) : grades.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-slate-400">
                  لا توجد مواد بعد.
                </td>
              </tr>
            ) : (
              liveGrades.map((g) => {
                const overMax = g.score !== null && g.max_degree !== null && g.score > g.max_degree;
                return (
                  <tr key={g.subject_id}>
                    <td className="px-4 py-2 text-slate-700">
                      {g.subject_name}
                      {g.outside_total ? <span className="ms-1.5 rounded bg-slate-100 px-1 text-[10px] text-slate-500">خارج المجموع</span> : null}
                      {g.elective_group ? <span className="ms-1.5 rounded bg-amber-50 px-1 text-[10px] text-amber-700">اختياري</span> : null}
                    </td>
                    <td className={`${cellCls} border-s border-slate-100`}>{formatDegree(g.max_degree) || "—"}</td>
                    <td className={cellCls}>{formatDegree(g.min_degree) || "—"}</td>
                    <td className="border-s border-slate-100 px-4 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={g.max_degree ?? undefined}
                        value={draft[g.subject_id] ?? ""}
                        onChange={(e) => setField(g.subject_id, e.target.value)}
                        className={`${inputCls} ${overMax ? "border-red-300 text-red-600" : ""}`}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {grades.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-700">
              <tr>
                <td className="px-4 py-2">مجموع الدرجات</td>
                <td className={`${cellCls} border-s border-slate-100`}>{formatDegree(totals.max)}</td>
                <td className={cellCls}>{formatDegree(totals.min)}</td>
                <td className="border-s border-slate-100 px-4 py-2 text-center">
                  {totals.hasScore ? formatDegree(totals.score) : "—"}
                </td>
              </tr>
              <tr className="border-t border-slate-200">
                <td className="px-4 py-2">النسبة المئوية</td>
                <td colSpan={3} className="px-4 py-2 text-center text-brand-700">
                  {formatPercentage(totals.percentage) || "—"}
                </td>
              </tr>
              <tr className="border-t border-slate-200">
                <td className="px-4 py-2">الحالة</td>
                <td colSpan={3} className="px-4 py-2 text-center">
                  {status ? (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusBadgeClass(status)}`}>{status}</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-[11px] text-slate-400">
        النهايات تُحدد لكل صف من المواد. النسبة المئوية = مجموع الدرجات ÷ مجموع النهايات الكبرى؛ ناجح من ٥٠٪.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {message && <p className="text-xs text-emerald-600">{message}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setPrintOpen(true)}
          disabled={loading || grades.length === 0}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
        >
          <Printer size={13} />
          طباعة الشهادة
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading || grades.length === 0}
          className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-medium text-white transition hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md active:translate-y-0 disabled:opacity-60"
        >
          {saving ? "جارٍ الحفظ…" : "حفظ الدرجات"}
        </button>
      </div>

      {printOpen && (
        <StudentCertificateModal students={[{ ...student, grades: liveGrades }]} onClose={() => setPrintOpen(false)} />
      )}
    </div>
  );
}
