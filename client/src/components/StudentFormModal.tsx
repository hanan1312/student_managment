import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  X,
  Upload,
  Trash2,
  User,
  Info,
  UserCircle2,
  Wallet,
  Paperclip,
  MessageSquare,
  Users,
  ShieldAlert,
  FileText,
  Award,
  KeyRound,
  QrCode,
  MessageCircleWarning,
  BookOpen,
  GraduationCap,
  Heart,
  StickyNote,
  Sparkles,
  ClipboardList,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useSchools } from "../context/SchoolsContext";
import { positionOptions } from "../context/ClassesContext";
import { api, ApiError, assetUrl } from "../lib/api";
import type { ClassStage, FeeType, Payment, Student, StudentInput } from "../lib/types";
import { genderLabel } from "../lib/studentColumns";
import { SHOW_EXTENDED_FEATURES } from "../lib/features";
import { ageOn, ageReferenceDate } from "../lib/studentAge";
import { birthdayFromNationalId } from "../lib/nationalId";
import StudentDegreesEditor from "./StudentDegreesEditor";
import { studentDisplayId } from "../lib/studentId";
import { Section, Field, inputCls, disabledInputCls } from "./FormLayout";

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-20 text-center text-slate-400">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
        <Info size={22} className="text-brand-400" />
      </span>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="text-xs text-slate-400">غير متاح حاليًا.</p>
    </div>
  );
}

function StudentPhotoField({
  studentId,
  photoUrl,
  onChanged,
}: {
  studentId: number | null;
  photoUrl: string | null;
  onChanged: (url: string | null) => void;
}) {
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = assetUrl(photoUrl);

  const handleFile = async (file: File) => {
    if (!token || !studentId) return;
    setUploading(true);
    setError(null);
    try {
      const res = await api.uploadStudentPhoto(token, studentId, file);
      onChanged(res.student.photo_url ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!token || !studentId) return;
    setUploading(true);
    setError(null);
    try {
      const res = await api.removeStudentPhoto(token, studentId);
      onChanged(res.student.photo_url ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/50">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-500 via-brand-400 to-gold-400 opacity-70" />
      <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-50 to-white p-1 ring-4 ring-brand-50">
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white shadow-inner">
          {url ? (
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <User size={34} className="text-slate-300" />
          )}
        </div>
      </div>
      {studentId ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60"
          >
            <Upload size={12} />
            {uploading ? "…" : url ? "Replace" : "Upload"}
          </button>
          {url && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ) : (
        <p className="text-center text-[11px] text-slate-400">Save the student first to add a photo.</p>
      )}
      {error && <p className="text-center text-[11px] text-red-600">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}

function StudentQrTab({ student }: { student: Student }) {
  const idValue = studentDisplayId(student);
  const photoUrl = assetUrl(student.photo_url);

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/50 py-10">
      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-slate-200 bg-white">
        {photoUrl ? (
          <img src={photoUrl} alt={student.name} className="h-full w-full object-cover" />
        ) : (
          <User size={28} className="text-slate-300" />
        )}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <QRCodeSVG value={idValue} size={140} />
      </div>
      <p className="text-sm font-semibold text-slate-700">{idValue}</p>
      <p className="max-w-xs text-center text-xs text-slate-400">
        This code is generated from the student's ID and also appears on their printed ID card, so both always match.
      </p>
    </div>
  );
}

function StudentPaymentsTab({ studentId }: { studentId: number }) {
  const { token } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [loading, setLoading] = useState(false);
  const [feeTypeId, setFeeTypeId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.getPayments(token, { studentId });
      setPayments(res.payments);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, studentId]);

  useEffect(() => {
    if (!token) return;
    api
      .getFeeTypes(token)
      .then((res) => setFeeTypes(res.feeTypes))
      .catch(() => setFeeTypes([]));
  }, [token]);

  const total = payments.reduce((s, p) => s + p.amount, 0);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createPayment(token, {
        studentId,
        feeTypeId: typeof feeTypeId === "number" ? feeTypeId : undefined,
        amount: amt,
        method,
        paidOn,
      });
      setAmount("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record payment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 text-sm text-white shadow-md shadow-emerald-600/20">
        <span className="flex items-center gap-2 font-medium">
          <Wallet size={16} />
          Payment history
        </span>
        <span className="font-semibold">
          Total paid: {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 shadow-sm">
        <table className="min-w-full divide-y divide-slate-100 text-xs">
          <thead className="sticky top-0 bg-slate-50 text-start font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Fee type</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Method</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && payments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                  No payments yet.
                </td>
              </tr>
            )}
            {!loading &&
              payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 text-slate-500">{p.paid_on}</td>
                  <td className="px-3 py-2 text-slate-500">{p.fee_type_name ?? "Other"}</td>
                  <td className="px-3 py-2 font-medium text-emerald-700">{p.amount}</td>
                  <td className="px-3 py-2 capitalize text-slate-500">{p.method}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleAdd} className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-500 via-brand-400 to-gold-400 opacity-70" />
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Record a payment</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <select
            value={feeTypeId}
            onChange={(e) => setFeeTypeId(e.target.value ? Number(e.target.value) : "")}
            className={inputCls}
          >
            <option value="">Other</option>
            {feeTypes.map((ft) => (
              <option key={ft.id} value={ft.id}>
                {ft.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls}
          />
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={`${inputCls} capitalize`}>
            {["cash", "card", "bank transfer", "cheque"].map((m) => (
              <option key={m} value={m} className="capitalize">
                {m}
              </option>
            ))}
          </select>
          <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={inputCls} />
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-medium text-white transition hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md active:translate-y-0 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Record payment"}
          </button>
        </div>
      </form>
    </div>
  );
}

const RELIGIONS = ["مسلم", "مسيحي"] as const;
const ENROLLMENT_TYPES = ["مستجد", "غير مستجد"] as const;

const TABS = [
  { key: "basic", label: "البيانات الأساسية", icon: UserCircle2 },
  { key: "degrees", label: "ملف الدرجات", icon: ClipboardList },
  { key: "payment", label: "Payment", icon: Wallet },
  { key: "attachments", label: "Attachments", icon: Paperclip },
  { key: "messages", label: "Messages", icon: MessageSquare },
  { key: "sibling", label: "Sibling", icon: Users },
  { key: "emergency", label: "Emergency", icon: ShieldAlert },
  { key: "memo", label: "Memo", icon: FileText },
  { key: "skills", label: "Skills", icon: Award },
  { key: "login", label: "Login", icon: KeyRound },
  { key: "barcode", label: "BarCode-QR", icon: QrCode },
  { key: "complaints", label: "Complaint / Suggestion", icon: MessageCircleWarning },
  { key: "books", label: "Books", icon: BookOpen },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const VISIBLE_TABS = SHOW_EXTENDED_FEATURES ? TABS : TABS.filter((t) => t.key === "basic" || t.key === "degrees");

const TEXT_KEYS = [
  "nameEn",
  "tel1",
  "tel2",
  "nationalId",
  "moeCode",
  "address",
  "birthday",
  "category",
  "country",
  "area",
  "district",
  "admissionDate",
  "studentNo",
  "religion",
  "nationality",
  "countValue",
  "status",
  "statusDate",
  "fatherName",
  "fatherNationalId",
  "fatherMobile",
  "fatherJob",
  "fatherEducation",
  "fatherCompany",
  "fatherEmail",
  "motherName",
  "motherNationalId",
  "motherMobile",
  "motherJob",
  "motherEducation",
  "motherCompany",
  "motherEmail",
  "notes",
  "medicalCondition",
  "educationAuthority",
  "emergencyName",
  "emergencyTel",
  "transferredFrom",
  "transferredIn",
  "school",
  "enrollmentType",
] as const;

type TextKey = (typeof TEXT_KEYS)[number];

const SNAKE_MAP: Record<TextKey, keyof Student> = {
  nameEn: "name_en",
  tel1: "tel1",
  tel2: "tel2",
  nationalId: "national_id",
  moeCode: "moe_code",
  address: "address",
  birthday: "birthday",
  category: "category",
  country: "country",
  area: "area",
  district: "district",
  admissionDate: "admission_date",
  studentNo: "student_no",
  religion: "religion",
  nationality: "nationality",
  countValue: "count_value",
  status: "status",
  statusDate: "status_date",
  fatherName: "father_name",
  fatherNationalId: "father_national_id",
  fatherMobile: "father_mobile",
  fatherJob: "father_job",
  fatherEducation: "father_education",
  fatherCompany: "father_company",
  fatherEmail: "father_email",
  motherName: "mother_name",
  motherNationalId: "mother_national_id",
  motherMobile: "mother_mobile",
  motherJob: "mother_job",
  motherEducation: "mother_education",
  motherCompany: "mother_company",
  motherEmail: "mother_email",
  notes: "notes",
  medicalCondition: "medical_condition",
  educationAuthority: "education_authority",
  emergencyName: "emergency_name",
  emergencyTel: "emergency_tel",
  transferredFrom: "transferred_from",
  transferredIn: "transferred_in",
  school: "school",
  enrollmentType: "enrollment_type",
};

function deriveFatherNameFromStudentName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" ") : "";
}

function initialValues(initial?: Student | null): Record<TextKey, string> {
  const out = {} as Record<TextKey, string>;
  for (const key of TEXT_KEYS) {
    const raw = initial ? (initial[SNAKE_MAP[key]] as string | null) : null;
    out[key] = raw ?? (key === "category" && !initial ? "خارجى" : "");
  }
  return out;
}

type Props = {
  tree: ClassStage[];
  initial?: Student | null;
  onClose: () => void;
  onSubmit: (input: StudentInput) => Promise<void>;
};

export default function StudentFormModal({ tree, initial, onClose, onSubmit }: Props) {
  const isEdit = Boolean(initial);
  const { settings } = useSettings();
  const { schools } = useSchools();

  const [tab, setTab] = useState<TabKey>("basic");
  const [name, setName] = useState(initial?.name ?? "");
  const [gender, setGender] = useState<"M" | "F" | "U">(initial?.gender ?? "M");
  const [classId, setClassId] = useState<number | "">(initial?.class_id ?? "");
  // Position: a level (Division > Section). The class stays as-is unless SHOW_EXTENDED_FEATURES
  // brings its picker back; the server drops it if it doesn't belong to the new level.
  const [levelId, setLevelId] = useState<number | "">(initial?.level_id ?? "");
  const [specialCase, setSpecialCase] = useState(Boolean(initial?.special_case));
  const [integrated, setIntegrated] = useState(Boolean(initial?.integrated));
  const [usesBus, setUsesBus] = useState(Boolean(initial?.uses_bus));
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial?.photo_url ?? null);
  const [values, setValues] = useState<Record<TextKey, string>>(() => initialValues(initial));
  const [fatherNameTouched, setFatherNameTouched] = useState(() => Boolean(initial?.father_name?.trim()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    if (!fatherNameTouched) {
      setValues((v) => ({ ...v, fatherName: deriveFatherNameFromStudentName(newName) }));
    }
  };

  const handleFatherNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFatherNameTouched(true);
    setValues((v) => ({ ...v, fatherName: e.target.value }));
  };

  const matchedLevel = useMemo(() => {
    if (typeof levelId !== "number") return undefined;
    for (const stage of tree) {
      const level = stage.levels.find((l) => l.id === levelId);
      // section text is the level's full path (e.g. "الصف الثاني الثانوي / البكالوريا المصرية / الأعمال").
      if (level) return { stage: stage.stage, level: level.path, classes: level.classes };
    }
    return undefined;
  }, [levelId, tree]);

  const handleLevelChange = (value: string) => {
    const next = value ? Number(value) : "";
    setLevelId(next);
    const levelClasses = tree.flatMap((st) => st.levels).find((l) => l.id === next)?.classes ?? [];
    if (typeof classId === "number" && !levelClasses.some((c) => c.id === classId)) setClassId("");
  };

  const setField = (key: TextKey) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("الاسم مطلوب.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        gender,
        name: name.trim(),
        nameEn: values.nameEn.trim() || undefined,
        tel1: values.tel1.trim() || undefined,
        tel2: values.tel2.trim() || undefined,
        nationalId: values.nationalId.trim() || undefined,
        moeCode: values.moeCode.trim() || undefined,
        address: values.address.trim() || undefined,
        birthday: values.birthday || undefined,
        category: values.category,
        classId: typeof classId === "number" ? classId : undefined,
        levelId: typeof levelId === "number" ? levelId : null,
        division: matchedLevel?.stage ?? initial?.division ?? undefined,
        section: matchedLevel?.level ?? initial?.section ?? undefined,
        country: values.country.trim() || undefined,
        area: values.area.trim() || undefined,
        district: values.district.trim() || undefined,
        admissionDate: values.admissionDate || undefined,
        studentNo: values.studentNo.trim() || undefined,
        religion: values.religion.trim() || undefined,
        nationality: values.nationality.trim() || undefined,
        countValue: values.countValue.trim() || undefined,
        status: values.status || undefined,
        statusDate: values.statusDate || undefined,
        fatherName: values.fatherName.trim() || undefined,
        fatherNationalId: values.fatherNationalId.trim() || undefined,
        fatherMobile: values.fatherMobile.trim() || undefined,
        fatherJob: values.fatherJob.trim() || undefined,
        fatherEducation: values.fatherEducation.trim() || undefined,
        fatherCompany: values.fatherCompany.trim() || undefined,
        fatherEmail: values.fatherEmail.trim() || undefined,
        motherName: values.motherName.trim() || undefined,
        motherNationalId: values.motherNationalId.trim() || undefined,
        motherMobile: values.motherMobile.trim() || undefined,
        motherJob: values.motherJob.trim() || undefined,
        motherEducation: values.motherEducation.trim() || undefined,
        motherCompany: values.motherCompany.trim() || undefined,
        motherEmail: values.motherEmail.trim() || undefined,
        notes: values.notes.trim() || undefined,
        medicalCondition: values.medicalCondition.trim() || undefined,
        educationAuthority: values.educationAuthority.trim() || undefined,
        specialCase,
        integrated,
        usesBus,
        emergencyName: values.emergencyName.trim() || undefined,
        emergencyTel: values.emergencyTel.trim() || undefined,
        transferredFrom: values.transferredFrom || undefined,
        transferredIn: values.transferredIn || undefined,
        school: values.school.trim() || undefined,
        enrollmentType: values.enrollmentType || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ ما.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex bg-ink-950/60 backdrop-blur-sm">
      <div className="animate-rise-in relative flex h-full w-full flex-col overflow-hidden bg-slate-50 shadow-2xl">
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-r from-ink-900 via-brand-700 to-ink-900">
          <div className="animate-float-slow pointer-events-none absolute -start-10 -top-16 h-48 w-48 rounded-full bg-brand-400/20 blur-3xl" />
          <div className="animate-float-slower pointer-events-none absolute -end-10 -bottom-16 h-56 w-56 rounded-full bg-gold-400/10 blur-3xl" />
          <div className="relative flex items-center justify-between px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-gold-300 ring-1 ring-white/15">
                {isEdit ? <UserCircle2 size={22} /> : <Sparkles size={20} />}
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-white">
                  {isEdit ? "تعديل طالب" : "طالب جديد"}
                </h2>
                {isEdit ? (
                  <p className="text-xs text-white/50">رقم الطالب {initial?.seq_no}</p>
                ) : (
                  <p className="text-xs text-white/50">أدخل البيانات لتسجيل طالب جديد</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div className="relative flex items-center gap-1 overflow-x-auto px-4 pb-2">
            {VISIBLE_TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-white text-brand-700 shadow-md shadow-black/20"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon size={13} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-6 py-5">
          {tab === "basic" && (
            <form id="student-basic-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Section title="بيانات الطالب" icon={UserCircle2}>
                  <Field label="الاسم" span={2}>
                    <input
                      value={name}
                      onChange={handleNameChange}
                      className={inputCls}
                      placeholder="اسم الطالب بالكامل"
                    />
                  </Field>
                  <Field label="النوع">
                    <div className="flex h-[38px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
                      {/* Only ذكر/أنثى can be picked; a student already stored as غير محدد ("U") keeps it
                          until one is chosen. */}
                      {(["M", "F"] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setGender(g)}
                          className={`flex-1 rounded-md py-1 text-sm font-medium transition ${
                            gender === g ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          {genderLabel(g)}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="الديانة">
                    <div className="flex h-[38px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
                      {/* Stored as the word itself in students.religion. */}
                      {RELIGIONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setValues((v) => ({ ...v, religion: r }))}
                          className={`flex-1 rounded-md py-1 text-sm font-medium transition ${
                            values.religion === r ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="نوع القيد">
                    <div className="flex h-[38px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
                      {/* Stored as the word itself in students.enrollment_type. */}
                      {ENROLLMENT_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setValues((v) => ({ ...v, enrollmentType: t }))}
                          className={`flex-1 rounded-md py-1 text-sm font-medium transition ${
                            values.enrollmentType === t ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="الجنسية">
                    <input
                      value={values.nationality}
                      onChange={setField("nationality")}
                      list="nationality-options"
                      placeholder="مصري"
                      className={inputCls}
                    />
                    <datalist id="nationality-options">
                      <option value="مصري" />
                      <option value="سوداني" />
                      <option value="سوري" />
                      <option value="فلسطيني" />
                      <option value="ليبي" />
                      <option value="يمني" />
                    </datalist>
                  </Field>
                  <Field label="الرقم القومي">
                    <input
                      value={values.nationalId}
                      onChange={(e) => {
                        // A full national ID fills in تاريخ الميلاد, which can still be changed by hand.
                        const nationalId = e.target.value;
                        const birthday = birthdayFromNationalId(nationalId);
                        setValues((v) => ({ ...v, nationalId, ...(birthday ? { birthday } : {}) }));
                      }}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="كود الحكومة الالكترونية">
                    <input value={values.moeCode} onChange={setField("moeCode")} className={inputCls} />
                  </Field>
                  <Field label="تاريخ الميلاد">
                    <input type="date" value={values.birthday} onChange={setField("birthday")} className={inputCls} />
                  </Field>
                  <Field label="السن في ١ أكتوبر">
                    <input
                      value={values.birthday ? ageOn(values.birthday, ageReferenceDate(settings.academic_year)) : ""}
                      disabled
                      className={disabledInputCls}
                    />
                  </Field>
                </Section>

                <Section title="بيانات القبول" icon={GraduationCap}>
                  <Field label="التسكين" span={2}>
                    <select value={levelId} onChange={(e) => handleLevelChange(e.target.value)} className={inputCls}>
                      <option value="">غير مسكّن</option>
                      {positionOptions(tree).map((stage) => (
                        <optgroup key={stage.stageId} label={stage.stage}>
                          {stage.levels.map((level) => (
                            <option key={level.id} value={level.id}>
                              {level.path}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </Field>
                  {SHOW_EXTENDED_FEATURES && (
                    <Field label="الفصل" span={2}>
                      <select
                        value={classId}
                        onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : "")}
                        className={inputCls}
                      >
                        <option value="">غير مسكّن</option>
                        {(matchedLevel?.classes ?? []).map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.className}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label="المرحلة">
                    <input
                      value={matchedLevel?.stage ?? initial?.division ?? ""}
                      disabled
                      className={disabledInputCls}
                    />
                  </Field>
                  <Field label="الصف">
                    <input
                      value={matchedLevel?.level ?? initial?.section ?? ""}
                      disabled
                      className={disabledInputCls}
                    />
                  </Field>
                  <Field label="المدرسة" span={2}>
                    {/* Schools come from Students > إضافة مدرسة; an older free-text value stays selectable. */}
                    <select value={values.school} onChange={setField("school")} className={inputCls}>
                      <option value="">—</option>
                      {values.school && !schools.some((s) => s.name === values.school) && (
                        <option value={values.school}>{values.school}</option>
                      )}
                      {schools.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </Section>
              </div>

              {SHOW_EXTENDED_FEATURES && (
                <>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="space-y-4 lg:col-span-2">
                    <Section title="بيانات الطالب" icon={UserCircle2}>
                      <Field label="Name (En)">
                        <input value={values.nameEn} onChange={setField("nameEn")} className={inputCls} />
                      </Field>
                      <Field label="Country">
                        <input value={values.country} onChange={setField("country")} className={inputCls} />
                      </Field>
                      <Field label="Area">
                        <input value={values.area} onChange={setField("area")} className={inputCls} />
                      </Field>
                      <Field label="District">
                        <input value={values.district} onChange={setField("district")} className={inputCls} />
                      </Field>
                      <Field label="Address" span={2}>
                        <input value={values.address} onChange={setField("address")} className={inputCls} />
                      </Field>
                      <Field label="Tel 1">
                        <input value={values.tel1} onChange={setField("tel1")} className={inputCls} />
                      </Field>
                      <Field label="Tel 2">
                        <input value={values.tel2} onChange={setField("tel2")} className={inputCls} />
                      </Field>
                      <Field label="Admission Date">
                        <input
                          type="date"
                          value={values.admissionDate}
                          onChange={setField("admissionDate")}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Student No.">
                        <input value={values.studentNo} onChange={setField("studentNo")} className={inputCls} />
                      </Field>
                      <Field label="Religion">
                        <input value={values.religion} onChange={setField("religion")} className={inputCls} />
                      </Field>
                      <Field label="Category">
                        <select value={values.category} onChange={setField("category")} className={inputCls}>
                          <option value="خارجى">خارجى</option>
                          <option value="هيئة">هيئة</option>
                        </select>
                      </Field>
                      <Field label="Count">
                        <input value={values.countValue} onChange={setField("countValue")} className={inputCls} />
                      </Field>
                    </Section>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Section title="بيانات القبول" icon={GraduationCap}>
                        <Field label="Transfere Out">
                          <select value={values.transferredFrom} onChange={setField("transferredFrom")} className={inputCls}>
                            <option value="">— None —</option>
                          </select>
                        </Field>
                        <Field label="Transfere In">
                          <select value={values.transferredIn} onChange={setField("transferredIn")} className={inputCls}>
                            <option value="">— None —</option>
                          </select>
                        </Field>
                      </Section>
                      <Section title="Status" icon={Info}>
                        <Field label="Status" span={2}>
                          <select value={values.status} onChange={setField("status")} className={inputCls}>
                            <option value="">—</option>
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                            <option value="Withdrawn">Withdrawn</option>
                            <option value="Graduated">Graduated</option>
                          </select>
                        </Field>
                        <Field label="Status Date" span={2}>
                          <input
                            type="date"
                            value={values.statusDate}
                            onChange={setField("statusDate")}
                            className={inputCls}
                          />
                        </Field>
                      </Section>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <StudentPhotoField studentId={initial?.id ?? null} photoUrl={photoUrl} onChanged={setPhotoUrl} />

                    <Section title="Flags" icon={Sparkles} cols={1}>
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={specialCase}
                          onChange={(e) => setSpecialCase(e.target.checked)}
                          className="h-4 w-4 accent-brand-600"
                        />
                        Special Case
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={integrated}
                          onChange={(e) => setIntegrated(e.target.checked)}
                          className="h-4 w-4 accent-brand-600"
                        />
                        Integrated
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={usesBus}
                          onChange={(e) => setUsesBus(e.target.checked)}
                          className="h-4 w-4 accent-brand-600"
                        />
                        Uses School Bus
                      </label>
                    </Section>

                    <Section title="Emergency Contact" icon={ShieldAlert}>
                      <Field label="Name" span={2}>
                        <input value={values.emergencyName} onChange={setField("emergencyName")} className={inputCls} />
                      </Field>
                      <Field label="Tel" span={2}>
                        <input value={values.emergencyTel} onChange={setField("emergencyTel")} className={inputCls} />
                      </Field>
                    </Section>
                  </div>
                </div>

                <Section title="Family Data — Father" icon={Users}>
                  <Field label="Father Name" span={2}>
                    <input value={values.fatherName} onChange={handleFatherNameChange} className={inputCls} />
                  </Field>
                  <Field label="National ID">
                    <input value={values.fatherNationalId} onChange={setField("fatherNationalId")} className={inputCls} />
                  </Field>
                  <Field label="Mobile">
                    <input value={values.fatherMobile} onChange={setField("fatherMobile")} className={inputCls} />
                  </Field>
                  <Field label="Job">
                    <input value={values.fatherJob} onChange={setField("fatherJob")} className={inputCls} />
                  </Field>
                  <Field label="Company">
                    <input value={values.fatherCompany} onChange={setField("fatherCompany")} className={inputCls} />
                  </Field>
                  <Field label="Education">
                    <input value={values.fatherEducation} onChange={setField("fatherEducation")} className={inputCls} />
                  </Field>
                  <Field label="Email">
                    <input value={values.fatherEmail} onChange={setField("fatherEmail")} className={inputCls} />
                  </Field>
                </Section>

                <Section title="Family Data — Mother" icon={Heart}>
                  <Field label="Mother Name" span={2}>
                    <input value={values.motherName} onChange={setField("motherName")} className={inputCls} />
                  </Field>
                  <Field label="National ID">
                    <input value={values.motherNationalId} onChange={setField("motherNationalId")} className={inputCls} />
                  </Field>
                  <Field label="Mobile">
                    <input value={values.motherMobile} onChange={setField("motherMobile")} className={inputCls} />
                  </Field>
                  <Field label="Job">
                    <input value={values.motherJob} onChange={setField("motherJob")} className={inputCls} />
                  </Field>
                  <Field label="Company">
                    <input value={values.motherCompany} onChange={setField("motherCompany")} className={inputCls} />
                  </Field>
                  <Field label="Education">
                    <input value={values.motherEducation} onChange={setField("motherEducation")} className={inputCls} />
                  </Field>
                  <Field label="Email">
                    <input value={values.motherEmail} onChange={setField("motherEmail")} className={inputCls} />
                  </Field>
                </Section>

                <Section title="Additional" icon={StickyNote} cols={1}>
                  <Field label="Education Authority">
                    <input
                      value={values.educationAuthority}
                      onChange={setField("educationAuthority")}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Medical Condition">
                    <textarea
                      value={values.medicalCondition}
                      onChange={setField("medicalCondition")}
                      rows={2}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Notes">
                    <textarea value={values.notes} onChange={setField("notes")} rows={2} className={inputCls} />
                  </Field>
                </Section>
                </>
              )}

              {error && (
                <p className="animate-fade-in flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-600">
                  <Info size={14} />
                  {error}
                </p>
              )}
            </form>
          )}

          {tab === "payment" &&
            (initial ? (
              <StudentPaymentsTab studentId={initial.id} />
            ) : (
              <ComingSoon label="Save the student first, then Payment" />
            ))}

          {tab === "degrees" &&
            (initial ? (
              <StudentDegreesEditor student={initial} />
            ) : (
              <ComingSoon label="احفظ الطالب أولًا، ثم ملف الدرجات" />
            ))}

          {tab === "barcode" &&
            (initial ? <StudentQrTab student={initial} /> : <ComingSoon label="Save the student first, then BarCode-QR" />)}

          {tab !== "basic" && tab !== "payment" && tab !== "barcode" && tab !== "degrees" && (
            <ComingSoon label={TABS.find((t) => t.key === tab)?.label ?? ""} />
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            {tab === "basic" ? "إلغاء" : "إغلاق"}
          </button>
          {tab === "basic" && (
            <button
              type="submit"
              form="student-basic-form"
              disabled={submitting}
              className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-600/30 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "جارٍ الحفظ…" : isEdit ? "حفظ التعديلات" : "إضافة الطالب"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
