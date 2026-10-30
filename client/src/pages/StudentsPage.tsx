import { useEffect, useState } from "react";
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
import { passStatus } from "../lib/degrees";
import { ageOn, ageReferenceDate } from "../lib/studentAge";
import { useSettings } from "../context/SettingsContext";
import type { AdmissionInput, ClassStage, FeeType, PaymentInput, Student, StudentInput } from "../lib/types";
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
import CsvImportModal, { type ImportColumn } from "../components/CsvImportModal";
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

  const mapStudentImportRow = (raw: Record<string, string>): { input?: StudentInput; error?: string; warning?: string } => {
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
    // Position: the Section names a leaf level, by its full path ("الصف الثاني الثانوي / البكالوريا
    // المصرية / الأعمال") or by its own name when that's unique; Division narrows it when given.
    if (section) {
      const norm = (v: string) => v.trim().replace(/\s*\/\s*/g, " / ").toLowerCase();
      const leaves = tree.flatMap((st) =>
        st.levels
          .filter((l) => l.is_leaf && (!division || norm(st.stage) === norm(division)))
          .map((l) => ({ id: l.id, stage: st.stage, path: l.path, name: l.level }))
      );
      const byPath = leaves.filter((l) => norm(l.path) === norm(section!));
      const candidates = byPath.length > 0 ? byPath : leaves.filter((l) => norm(l.name) === norm(section!));
      if (candidates.length === 0) return { error: `صف غير معروف "${section}"${division ? ` في "${division}"` : ""}` };
      if (candidates.length > 1) {
        return { error: `الصف "${section}" موجود في أكثر من مكان — اكتب المسار كاملاً أو أضف المرحلة` };
      }
      levelId = candidates[0].id;
      division = candidates[0].stage;
      section = candidates[0].path;
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
        birthday: toIsoDate(raw.birthday),
        category: raw.category || undefined,
        school: raw.school || undefined,
        religion: normalizeReligion(raw.religion),
        enrollmentType: normalizeEnrollmentType(raw.enrollmentType),
        nationality: raw.nationality?.trim() || undefined,
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
        <CsvImportModal<StudentInput>
          title="استيراد الطلاب"
          templateFilename="students-template.csv"
          columns={STUDENT_IMPORT_COLUMNS}
          mapRow={mapStudentImportRow}
          onImportRow={(input) => api.createStudent(token, input).then(() => {})}
          onClose={() => setImportOpen(false)}
          onFinished={() => {
            loadStudents();
            broadcastChange("students");
          }}
        />
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
