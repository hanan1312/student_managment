import { useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  UserPlus,
  Table2,
  FileBarChart,
  UserX,
  IdCard,
  Printer,
  ClipboardList,
  ClipboardCheck,
  CalendarCheck,
  BarChart3,
  Wallet,
  Search,
  Upload,
  Download,
  X,
  GraduationCap,
  ShieldCheck,
  BookMarked,
  Building2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useClasses, type ClassSelection } from "../context/ClassesContext";
import { api, ApiError } from "../lib/api";
import { downloadExcel } from "../lib/excel";
import { broadcastChange, useSyncListener } from "../lib/liveSync";
import { genderLabel } from "../lib/studentColumns";
import { SHOW_EXTENDED_FEATURES } from "../lib/features";
import { useUiControl } from "../lib/uiControl";
import { passStatus, roundDegree } from "../lib/degrees";
import { ageOn, ageReferenceDate } from "../lib/studentAge";
import { birthdayFromNationalId } from "../lib/nationalId";
import { normalizeRound, studentRound } from "../lib/certificateForms";
import { sameName, toNumber } from "../lib/importValues";
import { useSettings } from "../context/SettingsContext";
import type { AdmissionInput, ClassStage, FeeType, PaymentInput, Student, StudentInput, Subject } from "../lib/types";
import StudentFormModal from "../components/StudentFormModal";
import DegreesProfileModal from "../components/DegreesProfileModal";
import SubjectSetupModal from "../components/timetable/SubjectSetupModal";
import StudentsTable from "../components/StudentsTable";
import StudentsReportModal from "../components/StudentsReportModal";
import StudentsPrintModal from "../components/StudentsPrintModal";
import StudentCardsModal from "../components/StudentCardsModal";
import AdmissionFormModal from "../components/AdmissionFormModal";
import PendingAdmissionsModal from "../components/PendingAdmissionsModal";
import AttendanceModal from "../components/AttendanceModal";
import AttendanceAnalysisModal from "../components/AttendanceAnalysisModal";
import NoShowModal from "../components/NoShowModal";
import PaymentFormModal from "../components/PaymentFormModal";
import StudentCertificateModal, { type CertificateStudent } from "../components/StudentCertificateModal";
import CsvImportModal, { type ImportColumn, type MappedRow } from "../components/CsvImportModal";
import RibbonGroup from "../components/RibbonGroup";
import SchoolFormModal from "../components/SchoolFormModal";

type FlatClass = { id: number; className: string; stage: string; level: string };

function flattenTree(tree: ClassStage[]): FlatClass[] {
  return tree.flatMap((stage) =>
    stage.levels.flatMap((level) =>
      level.classes.map((cls) => ({ id: cls.id, className: cls.className, stage: stage.stage, level: level.level }))
    )
  );
}

function selectionLabel(tree: ClassStage[], selection: ClassSelection): string | null {
  if (selection.type === "all") return null;
  if (selection.type === "stage") return selection.stage;
  if (selection.type === "level") return `${selection.stage} / ${selection.level}`; // level holds the path
  for (const stage of tree) {
    for (const level of stage.levels) {
      const found = level.classes.find((c) => c.id === selection.classId);
      if (found) return `${stage.stage} / ${level.level} / ${found.className}`;
    }
  }
  return null;
}

function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, month, day, year] = slash;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  return trimmed;
}

// Import accepts the Arabic words or their English names; anything else is kept as typed.
function normalizeReligion(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (["مسلم", "مسلمة", "muslim", "islam"].includes(v.toLowerCase())) return "مسلم";
  if (["مسيحي", "مسيحية", "مسيحى", "christian"].includes(v.toLowerCase())) return "مسيحي";
  return v;
}

// نوع القيد: مستجد / غير مستجد; English "new" / "repeat" are accepted too.
function normalizeEnrollmentType(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (["مستجد", "مستجدة", "new"].includes(v.toLowerCase())) return "مستجد";
  if (["غير مستجد", "غير مستجدة", "باق للإعادة", "باقٍ للإعادة", "repeat", "repeater"].includes(v.toLowerCase())) {
    return "غير مستجد";
  }
  return v;
}

// Import matching of المرحلة / الصف: spelling variants (ا / أ / إ, ى / ي, ة / ه, diacritics) are
// ignored, and so are the words "المرحلة" and "الصف", so "الاعدادية" finds "المرحلة الإعدادية" and
// "الاول" finds "الصف الأول الإعدادي".
function arNorm(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/[ً-ْـ()"']/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ");
}

const IMPORT_FILLER_WORDS = new Set(["المرحله", "مرحله", "الصف", "صف"]);

function arWords(v: string): string[] {
  return arNorm(v)
    .split(/[\s/]+/)
    .filter((w) => w && !IMPORT_FILLER_WORDS.has(w));
}

// Every word of the typed value is in the candidate's name.
function wordsWithin(typed: string, name: string): boolean {
  const words = arWords(typed);
  const nameWords = new Set(arWords(name));
  return words.length > 0 && words.every((w) => nameWords.has(w));
}

// Tries each test in turn and returns the first one's matches, so an exact match wins over a looser one.
function firstMatches<T>(items: T[], tests: ((item: T) => boolean)[]): T[] {
  for (const test of tests) {
    const found = items.filter(test);
    if (found.length > 0) return found;
  }
  return [];
}

// A students import can carry degrees: the columns after الصف that aren't student fields, holding
// numbers, are subjects named by their header. They're added to (or linked in) المواد and the
// degrees saved to the student's ملف الدرجات.
type StudentImport = { student: StudentInput; grades: { subject: string; score: number }[] };

// Columns of an exported students file that hold numbers but aren't subjects.
const NOT_SUBJECT_HEADERS = new Set(["م", "مجموع الدرجات", "المجموع", "النسبة المئوية", "النسبة", "%", "الحالة"].map(arNorm));
// An empty degree cell: blank, a dash, or غ / غائب (absent).
const isNoDegree = (v: string | undefined) => /^([-—–]*|غ|غائب)$/.test((v ?? "").trim());

function subjectImportColumns(
  headers: string[],
  keyOf: (header: string) => string | undefined,
  rows: Record<string, string>[]
): ImportColumn[] {
  const sectionAt = headers.findIndex((h) => keyOf(h) === "section");
  return headers
    .filter((h, i) => i > sectionAt && !keyOf(h) && !h.startsWith("__EMPTY") && !NOT_SUBJECT_HEADERS.has(arNorm(h)))
    .filter((h) => rows.some((r) => toNumber(r[h]) !== null) && rows.every((r) => isNoDegree(r[h]) || toNumber(r[h]) !== null))
    .map((h) => ({ key: `subject:${h}`, label: h }));
}

// A row is a duplicate when its الرقم القومي or كود الحكومة الالكترونية is already a student's, or
// a student with the same name is in the same الصف; earlier rows of the same file count too.
type DuplicateRow = { rowNumber: number; name: string; reason: string };
const idDigits = (v: string | null | undefined) =>
  (v ?? "").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, "");

function findDuplicates(rows: MappedRow<StudentImport>[], existing: Student[]): DuplicateRow[] {
  type Known = { name: string; nationalId: string; moeCode: string; levelId: number | null; where: string };
  const known: Known[] = existing.map((st) => ({
    name: st.name,
    nationalId: idDigits(st.national_id),
    moeCode: idDigits(st.moe_code),
    levelId: st.level_id,
    where: `موجود: ${st.name}`,
  }));
  const out: DuplicateRow[] = [];
  for (const r of rows) {
    if (!r.input || r.error) continue;
    const st = r.input.student;
    const row: Known = {
      name: st.name,
      nationalId: idDigits(st.nationalId),
      moeCode: idDigits(st.moeCode),
      levelId: st.levelId ?? null,
      where: `مكرر في الملف (الصف ${r.rowNumber})`,
    };
    const match = known.find(
      (k) =>
        (row.nationalId && k.nationalId === row.nationalId) ||
        (row.moeCode && k.moeCode === row.moeCode) ||
        (sameName(k.name, row.name) && k.levelId === row.levelId)
    );
    if (match) {
      const by =
        row.nationalId && match.nationalId === row.nationalId
          ? "نفس الرقم القومي"
          : row.moeCode && match.moeCode === row.moeCode
          ? "نفس كود الحكومة الالكترونية"
          : "نفس الاسم والصف";
      out.push({ rowNumber: r.rowNumber, name: st.name, reason: `${by} · ${match.where}` });
    }
    known.push(row);
  }
  return out;
}

const STUDENT_IMPORT_COLUMNS: ImportColumn[] = [
  // Arabic headers; the old English ones stay as aliases so earlier files still import.
  { key: "name", label: "الاسم", required: true, example: "Ahmed Mostafa Hassan", aliases: ["Name"] },
  { key: "gender", label: "النوع", example: "M", aliases: ["Gender", "Sex"] },
  { key: "nationalId", label: "الرقم القومي", aliases: ["National ID", "ID"] },
  { key: "moeCode", label: "كود الحكومة الالكترونية", aliases: ["كود الوزارة", "MOE Code"] },
  { key: "birthday", label: "تاريخ الميلاد", example: "2020-01-15", aliases: ["Birthday", "Birthday Date"] },
  { key: "division", label: "المرحلة", example: "رياض اطفال", aliases: ["Division"] },
  { key: "section", label: "الصف", example: "Kg1", aliases: ["Section"] },
  { key: "school", label: "المدرسة", aliases: ["School"] },
  { key: "religion", label: "الديانة", example: "مسلم", aliases: ["Religion"] },
  { key: "enrollmentType", label: "نوع القيد", example: "مستجد", aliases: ["Enrollment Type"] },
  { key: "round", label: "الدور", example: "الأول" },
  { key: "nationality", label: "الجنسية", example: "مصري", aliases: ["Nationality"] },
  ...(SHOW_EXTENDED_FEATURES
    ? [
        { key: "className", label: "Class", example: "KG1 - A" },
        { key: "tel1", label: "Tel-1", example: "01012345678" },
        { key: "tel2", label: "Tel-2" },
        { key: "address", label: "Address" },
        { key: "category", label: "Category", example: "خارجى", aliases: ["Catogry"] },
      ]
    : []),
];

type OutletCtx = { notify: (label: string) => void };

export default function StudentsPage() {
  useOutletContext<OutletCtx>();
  const { token, hasModule } = useAuth();
  const ui = useUiControl();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [degreesOpen, setDegreesOpen] = useState(false);
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [schoolsOpen, setSchoolsOpen] = useState(false);
  const { tree, selection, setSelection, selectedClassIds, selectedLevelIds, selectedClassId } = useClasses();
  const scopeName = selectionLabel(tree, selection);

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [certificate, setCertificate] = useState<CertificateStudent | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Student[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [admissionModalOpen, setAdmissionModalOpen] = useState(false);
  const [pendingAdmissionsOpen, setPendingAdmissionsOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const loadStudents = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      // Stage/level selections filter by Position (level); only a class selection (shown while
      // SHOW_EXTENDED_FEATURES is on) still filters by class.
      const res = await api.getStudents(token, {
        levelIds: selectedLevelIds ?? undefined,
        classIds: selectedLevelIds ? undefined : selectedClassIds ?? undefined,
        q: debouncedQuery || undefined,
      });
      setStudents(res.students);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "تعذر تحميل الطلاب.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedClassIds, selectedLevelIds, debouncedQuery]);

  useSyncListener("students", loadStudents);

  useEffect(() => {
    if (!token) return;
    api
      .getFeeTypes(token)
      .then((res) => setFeeTypes(res.feeTypes))
      .catch(() => setFeeTypes([]));
  }, [token]);

  const handleCreate = async (input: StudentInput) => {
    if (!token) return;
    await api.createStudent(token, input);
    setModalOpen(false);
    await loadStudents();
    broadcastChange("students");
  };

  const handleUpdate = async (input: StudentInput) => {
    if (!token || !editing) return;
    await api.updateStudent(token, editing.id, input);
    setEditing(null);
    await loadStudents();
    broadcastChange("students");
  };

  const confirmDelete = async () => {
    if (!token || pendingDelete.length === 0) return;
    if (pendingDelete.length === 1) {
      await api.deleteStudent(token, pendingDelete[0].id);
    } else {
      await api.deleteStudents(token, pendingDelete.map((s) => s.id));
    }
    setPendingDelete([]);
    await loadStudents();
    broadcastChange("students");
  };

  const handleCreateAdmission = async (input: AdmissionInput) => {
    if (!token) return;
    await api.createAdmission(token, input);
    setAdmissionModalOpen(false);
  };

  const handleCreatePayment = async (input: PaymentInput) => {
    if (!token) return;
    await api.createPayment(token, input);
    setPaymentOpen(false);
  };

  // Subjects as they are in المواد while the import is open, and the ids its subject columns get
  // once they're added or linked (just before the rows are saved).
  const [importSubjects, setImportSubjects] = useState<Subject[]>([]);
  const importSubjectIds = useRef(new Map<string, number>());
  useEffect(() => {
    if (!importOpen || !token) return;
    api
      .getSubjects(token)
      .then((r) => setImportSubjects(r.subjects))
      .catch(() => setImportSubjects([]));
  }, [importOpen, token]);

  const mapStudentImportRow = (raw: Record<string, string>): { input?: StudentImport; error?: string; warning?: string } => {
    const { input, error, warning } = mapStudentFields(raw);
    if (!input) return { error, warning };
    const grades: StudentImport["grades"] = [];
    for (const [key, value] of Object.entries(raw)) {
      if (!key.startsWith("subject:") || isNoDegree(value)) continue;
      const subject = key.slice(8);
      const typed = toNumber(value);
      const score = typed === null ? null : roundDegree(typed);
      if (score === null || score < 0) return { error: `${subject}: "${value}" ليست درجة صحيحة` };
      const max = importSubjects
        .find((s) => arNorm(s.name) === arNorm(subject))
        ?.level_marks.find((m) => m.level_id === input.levelId)?.max_degree;
      if (max != null && score > max) return { error: `${subject}: ${score} أكبر من النهاية الكبرى (${max})` };
      grades.push({ subject, score });
    }
    return { input: { student: input, grades }, warning };
  };

  // Each subject column becomes a subject in المواد (when none has its name), linked to the sections
  // of the students who have a degree in it; an existing subject keeps its other sections and marks.
  const syncImportSubjects = async (rows: MappedRow<StudentImport>[]): Promise<MappedRow<StudentImport>[] | null> => {
    if (!token) return null;
    const used = new Map<string, { name: string; levelIds: Set<number> }>();
    for (const r of rows) {
      if (!r.input || r.error) continue;
      for (const g of r.input.grades) {
        const entry = used.get(arNorm(g.subject)) ?? { name: g.subject, levelIds: new Set<number>() };
        if (r.input.student.levelId) entry.levelIds.add(r.input.student.levelId);
        used.set(arNorm(g.subject), entry);
      }
    }
    if (used.size === 0) return rows;
    try {
      const { subjects } = await api.getSubjects(token);
      const ids = new Map<string, number>();
      for (const [key, { name, levelIds }] of used) {
        const existing = subjects.find((s) => arNorm(s.name) === key);
        if (!existing) {
          const { subject } = await api.createSubject(token, { name, levelIds: [...levelIds] });
          ids.set(key, subject.id);
          continue;
        }
        const missing = [...levelIds].filter((id) => !existing.level_ids.includes(id));
        if (missing.length > 0) await api.updateSubject(token, existing.id, { levelIds: [...existing.level_ids, ...missing] });
        ids.set(key, existing.id);
      }
      importSubjectIds.current = ids;
      return rows;
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "تعذر تحديث المواد.");
      return null;
    }
  };

  // Duplicates are listed before anything is saved: add them anyway, skip them, or go back.
  const [duplicateAsk, setDuplicateAsk] = useState<{
    rows: DuplicateRow[];
    resolve: (choice: "all" | "skip" | null) => void;
  } | null>(null);

  const beforeStudentImport = async (rows: MappedRow<StudentImport>[]): Promise<MappedRow<StudentImport>[] | null> => {
    if (!token) return null;
    let duplicates: DuplicateRow[];
    try {
      const { students: existing } = await api.getStudents(token);
      duplicates = findDuplicates(rows, existing);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "تعذر التحقق من الطلاب المكررين.");
      return null;
    }
    let result = rows;
    if (duplicates.length > 0) {
      const choice = await new Promise<"all" | "skip" | null>((resolve) => setDuplicateAsk({ rows: duplicates, resolve }));
      setDuplicateAsk(null);
      if (!choice) return null;
      if (choice === "skip") {
        const skipped = new Set(duplicates.map((d) => d.rowNumber));
        result = rows.map((r) => (skipped.has(r.rowNumber) ? { ...r, error: "مكرر — تم التخطي" } : r));
      }
    }
    return syncImportSubjects(result);
  };

  const importStudentRow = async ({ student, grades }: StudentImport) => {
    if (!token) return;
    const { student: created } = await api.createStudent(token, student);
    if (grades.length === 0) return;
    try {
      await api.saveStudentGrades(
        token,
        created.id,
        grades.map((g) => ({ subjectId: importSubjectIds.current.get(arNorm(g.subject))!, score: g.score, scoreMin: null }))
      );
    } catch (err) {
      throw new Error(`تمت إضافة الطالب لكن لم تُحفظ درجاته: ${err instanceof Error ? err.message : ""}`);
    }
  };

  const mapStudentFields = (raw: Record<string, string>): { input?: StudentInput; error?: string; warning?: string } => {
    const genderRaw = raw.gender?.trim().toUpperCase();
    const gender: "M" | "F" | "U" =
      genderRaw === "M" || genderRaw === "MALE" || genderRaw === "ذكر"
        ? "M"
        : genderRaw === "F" || genderRaw === "FEMALE" || genderRaw === "أنثى" || genderRaw === "انثى"
        ? "F"
        : "U";

    let classId: number | undefined;
    let levelId: number | undefined;
    let division: string | undefined = raw.division?.trim() || undefined;
    let section: string | undefined = raw.section?.trim() || undefined;
    // Division is matched to a stage of the Hierarchy ("الاعدادية" → "المرحلة الإعدادية") and saved
    // under the stage's own name; one that matches no stage (or several) is kept as typed.
    let stageName: string | undefined;
    if (division) {
      const typed = division;
      const stages = firstMatches(tree, [
        (st) => arNorm(st.stage) === arNorm(typed),
        (st) => arWords(st.stage).join(" ") === arWords(typed).join(" "),
        (st) => wordsWithin(typed, st.stage),
      ]);
      if (stages.length === 1) {
        stageName = stages[0].stage;
        division = stageName;
      }
    }
    // Position: the Section names a leaf level, by its full path ("الصف الثاني الثانوي / البكالوريا
    // المصرية / الأعمال"), by its own name when that's unique, or by part of it ("الاول" →
    // "الصف الأول الإعدادي"); the matched Division narrows it.
    if (section) {
      const typed = section;
      const leaves = tree.flatMap((st) =>
        st.levels
          .filter((l) => l.is_leaf && (!stageName || st.stage === stageName))
          .map((l) => ({ id: l.id, stage: st.stage, path: l.path, name: l.level }))
      );
      const candidates = firstMatches(leaves, [
        (l) => arNorm(l.path) === arNorm(typed),
        (l) => arNorm(l.name) === arNorm(typed),
        (l) => wordsWithin(typed, l.name),
        (l) => wordsWithin(typed, l.path),
      ]);
      if (candidates.length > 1) {
        return { error: `الصف "${section}" موجود في أكثر من مكان — اكتب المسار كاملاً أو أضف المرحلة` };
      }
      // A section that isn't in the Hierarchy is left empty; the row still imports.
      if (candidates.length === 0) {
        section = undefined;
      } else {
        levelId = candidates[0].id;
        division = candidates[0].stage;
        section = candidates[0].path;
      }
    }
    if (raw.className?.trim()) {
      const match = flattenTree(tree).find(
        (c) => c.className.trim().toLowerCase() === raw.className.trim().toLowerCase()
      );
      if (!match) return { error: `فصل غير معروف "${raw.className}"` };
      classId = match.id;
      division = match.stage;
      section = match.level;
    }

    return {
      input: {
        name: raw.name,
        gender,
        classId,
        levelId,
        division,
        section,
        tel1: raw.tel1 || undefined,
        tel2: raw.tel2 || undefined,
        nationalId: raw.nationalId || undefined,
        moeCode: raw.moeCode || undefined,
        address: raw.address || undefined,
        // An empty birth date is read from the national ID when it holds one.
        birthday: toIsoDate(raw.birthday) ?? (birthdayFromNationalId(raw.nationalId ?? "") || undefined),
        category: raw.category || undefined,
        school: raw.school || undefined,
        religion: normalizeReligion(raw.religion),
        enrollmentType: normalizeEnrollmentType(raw.enrollmentType),
        nationality: raw.nationality?.trim() || undefined,
        formFields: normalizeRound(raw.round) ? { round: normalizeRound(raw.round)! } : undefined,
      },
      warning: gender === "U" ? "النوع غير موجود في الملف — تم الاستيراد كغير محدد" : undefined,
    };
  };

  // Row action: the student's degrees certificate, with its grades fetched first.
  const printDegrees = async (s: Student) => {
    if (!token) return;
    try {
      const { grades } = await api.getStudentGrades(token, s.id);
      setCertificate({ ...s, grades });
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "تعذر تحميل الدرجات.");
    }
  };

  const handleExport = () => {
    const ageRef = ageReferenceDate(settings.academic_year);
    const headers = [
      "م",
      "الاسم",
      "النوع",
      "الرقم القومي",
      "كود الحكومة الالكترونية",
      "تاريخ الميلاد",
      "السن في ١ أكتوبر",
      "المرحلة",
      "الصف",
      "المدرسة",
      "الديانة",
      "نوع القيد",
      "الدور",
      "الجنسية",
      "مجموع الدرجات",
      "النسبة المئوية",
      "الحالة",
      ...(SHOW_EXTENDED_FEATURES ? ["Tel-1", "Tel-2", "Address", "Category"] : []),
    ];
    const rows = students.map((s) => ({
      م: s.seq_no,
      الاسم: s.name,
      النوع: genderLabel(s.gender),
      "الرقم القومي": s.national_id ?? "",
      "كود الحكومة الالكترونية": s.moe_code ?? "",
      "تاريخ الميلاد": s.birthday ?? "",
      "السن في ١ أكتوبر": s.birthday ? ageOn(s.birthday, ageRef) : "",
      المرحلة: s.division ?? "",
      الصف: s.section ?? "",
      المدرسة: s.school ?? "",
      الديانة: s.religion ?? "",
      "نوع القيد": s.enrollment_type ?? "",
      الدور: studentRound(s.form_fields),
      الجنسية: s.nationality ?? "",
      "مجموع الدرجات": s.total_degrees ?? "",
      "النسبة المئوية": s.percentage == null ? "" : `${s.percentage}%`,
      الحالة: passStatus(s.percentage) ?? "",
      "Tel-1": s.tel1 ?? "",
      "Tel-2": s.tel2 ?? "",
      Address: s.address ?? "",
      Category: s.category ?? "",
    }));
    downloadExcel("students.xlsx", headers, rows);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm">
        <RibbonGroup
          caption={ui.t("ribbon.caption")}
          buttons={[
            // Named and shown or hidden in التحكم.
            ...(
              [
                { key: "ribbon.newStudent", icon: UserPlus, onClick: () => setModalOpen(true) },
                { key: "ribbon.import", icon: Upload, onClick: () => setImportOpen(true) },
                { key: "ribbon.export", icon: Download, onClick: handleExport },
                { key: "ribbon.print", icon: Printer, onClick: () => setPrintOpen(true) },
                { key: "ribbon.subjects", icon: BookMarked, onClick: () => setSubjectsOpen(true) },
                { key: "ribbon.degrees", icon: GraduationCap, onClick: () => setDegreesOpen(true) },
                { key: "ribbon.schools", icon: Building2, onClick: () => setSchoolsOpen(true) },
              ] as const
            )
              .filter((b) => ui.isButtonVisible(b.key))
              .map((b) => ({ label: ui.t(b.key), icon: b.icon, onClick: b.onClick })),
            // المستخدمين is a tab of its own in التحكم: renaming or hiding it applies to this button.
            ...(hasModule("control") && ui.isTabVisible("control")
              ? [{ label: ui.tabLabel("control"), icon: ShieldCheck, onClick: () => navigate("/users") }]
              : []),
            ...(SHOW_EXTENDED_FEATURES
              ? [
                  { label: "Students Data", icon: Table2, onClick: () => loadStudents() },
                  { label: "Reports", icon: FileBarChart, onClick: () => setReportOpen(true) },
                  { label: "No Show", icon: UserX, onClick: () => setNoShowOpen(true) },
                ]
              : []),
          ]}
        />
        {SHOW_EXTENDED_FEATURES && (
          <>
            <RibbonGroup
              caption="Cards"
              buttons={[
                { label: "Cards", icon: IdCard, onClick: () => setCardsOpen(true) },
                { label: "Print", icon: Printer, onClick: () => window.print() },
              ]}
            />
            <RibbonGroup
              caption="Admissions"
              buttons={[
                { label: "New Admission", icon: ClipboardList, onClick: () => setModalOpen(true) },
                { label: "Pending", icon: ClipboardCheck, onClick: () => setPendingAdmissionsOpen(true) },
              ]}
            />
            <RibbonGroup
              caption="Attendance"
              buttons={[
                { label: "Attendance", icon: CalendarCheck, onClick: () => setAttendanceOpen(true) },
                { label: "Analysis", icon: BarChart3, onClick: () => setAnalysisOpen(true) },
              ]}
            />
            <RibbonGroup
              caption="Payment"
              buttons={[{ label: "Payment", icon: Wallet, onClick: () => setPaymentOpen(true) }]}
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="font-medium text-slate-700">المراحل</span>
          {scopeName && (
            <>
              <span>/</span>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                {scopeName}
              </span>
              <button
                onClick={() => setSelection({ type: "all" })}
                className="text-slate-400 hover:text-slate-600"
                title="إلغاء التصفية"
              >
                <X size={14} />
              </button>
            </>
          )}
          <span className="text-slate-300">&middot;</span>
          <span>{students.length} طالب</span>
        </div>

        <div className="relative w-full max-w-xs">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="اكتب للبحث…"
            className="w-full rounded-lg border border-slate-200 py-2 ps-9 pe-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        {errorMsg && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>}

        <StudentsTable
          students={students}
          loading={loading}
          onEdit={setEditing}
          onDeleteMany={setPendingDelete}
          onPrintDegrees={printDegrees}
          pageResetKey={`${JSON.stringify(selection)}|${debouncedQuery}`}
        />
      </div>

      {subjectsOpen && <SubjectSetupModal onClose={() => setSubjectsOpen(false)} />}
      {schoolsOpen && (
        <SchoolFormModal
          onClose={() => {
            setSchoolsOpen(false);
            // A renamed school renames the students' المدرسة too.
            loadStudents();
          }}
        />
      )}

      {degreesOpen && (
        <DegreesProfileModal
          onClose={() => {
            setDegreesOpen(false);
            loadStudents();
          }}
        />
      )}

      {modalOpen && <StudentFormModal tree={tree} onClose={() => setModalOpen(false)} onSubmit={handleCreate} />}

      {editing && (
        <StudentFormModal
          tree={tree}
          initial={editing}
          onClose={() => {
            setEditing(null);
            loadStudents();
          }}
          onSubmit={handleUpdate}
        />
      )}

      {certificate && (
        <StudentCertificateModal students={[certificate]} onClose={() => setCertificate(null)} />
      )}

      {reportOpen && (
        <StudentsReportModal
          students={students}
          scopeLabel={scopeName ? `المراحل / ${scopeName}` : "المراحل (الكل)"}
          onClose={() => setReportOpen(false)}
        />
      )}

      {printOpen && (
        <StudentsPrintModal
          students={students}
          scopeLabel={scopeName ? `المراحل / ${scopeName}` : "المراحل (الكل)"}
          onClose={() => setPrintOpen(false)}
        />
      )}

      {cardsOpen && <StudentCardsModal students={students} tree={tree} onClose={() => setCardsOpen(false)} />}

      {admissionModalOpen && (
        <AdmissionFormModal tree={tree} onClose={() => setAdmissionModalOpen(false)} onSubmit={handleCreateAdmission} />
      )}

      {pendingAdmissionsOpen && (
        <PendingAdmissionsModal
          tree={tree}
          onClose={() => setPendingAdmissionsOpen(false)}
          onApproved={() => {
            loadStudents();
            broadcastChange("students");
          }}
        />
      )}

      {attendanceOpen && (
        <AttendanceModal
          students={students}
          classId={selectedClassId}
          onClose={() => setAttendanceOpen(false)}
          onSaved={() => {}}
        />
      )}

      {analysisOpen && <AttendanceAnalysisModal classId={selectedClassId} onClose={() => setAnalysisOpen(false)} />}

      {noShowOpen && (
        <NoShowModal classId={selectedClassId} onClose={() => setNoShowOpen(false)} onMarked={() => {}} />
      )}

      {paymentOpen && (
        <PaymentFormModal feeTypes={feeTypes} onClose={() => setPaymentOpen(false)} onSubmit={handleCreatePayment} />
      )}

      {importOpen && token && (
        <CsvImportModal<StudentImport>
          title="استيراد الطلاب"
          description="بعد عمود الصف يمكن إضافة عمود لكل مادة باسمها فيه درجات الطلاب: تُضاف المادة إلى المواد وتُحفظ الدرجات في ملف الدرجات."
          templateFilename="students-template.csv"
          columns={STUDENT_IMPORT_COLUMNS}
          fileColumns={subjectImportColumns}
          mapRow={mapStudentImportRow}
          onBeforeImport={beforeStudentImport}
          onImportRow={importStudentRow}
          onClose={() => setImportOpen(false)}
          onFinished={() => {
            loadStudents();
            broadcastChange("students");
          }}
        />
      )}

      {duplicateAsk && (
        <div className="animate-fade-in fixed inset-0 z-40 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
          <div className="animate-rise-in flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-800">طلاب مكررون ({duplicateAsk.rows.length})</h2>
              <p className="text-xs text-slate-500">هذه الصفوف موجودة بالفعل أو مكررة في الملف. هل تريد إضافتها؟</p>
            </div>
            <ul className="flex-1 divide-y divide-slate-50 overflow-y-auto px-5 py-2 text-xs">
              {duplicateAsk.rows.map((d) => (
                <li key={d.rowNumber} className="py-1.5">
                  <span className="text-slate-400">الصف {d.rowNumber}: </span>
                  <span className="font-medium text-slate-700">{d.name}</span>
                  <span className="text-amber-700"> — {d.reason}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button
                onClick={() => duplicateAsk.resolve(null)}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                رجوع
              </button>
              <button
                onClick={() => duplicateAsk.resolve("all")}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
              >
                إضافتهم أيضًا
              </button>
              <button
                onClick={() => duplicateAsk.resolve("skip")}
                className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-1.5 text-sm font-semibold text-white shadow-md shadow-brand-600/25"
              >
                تخطي المكرر
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete.length > 0 && (
        <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
          <div className="animate-rise-in w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-sm font-semibold text-slate-800">
              {pendingDelete.length === 1 ? "حذف الطالب؟" : `حذف ${pendingDelete.length} طالب؟`}
            </h3>
            <p className="mt-1.5 text-sm text-slate-500">
              {pendingDelete.length === 1 ? (
                <>
                  سيتم حذف <span className="font-medium text-slate-700">{pendingDelete[0].name}</span> نهائيًا من
                  السجل.
                </>
              ) : (
                <>
                  سيتم حذف <span className="font-medium text-slate-700">{pendingDelete.length} طالب</span> نهائيًا من
                  السجل. لا يمكن التراجع عن ذلك.
                </>
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete([])}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
