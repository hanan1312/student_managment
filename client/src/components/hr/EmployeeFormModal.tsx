import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  X,
  Upload,
  Trash2,
  User,
  UserCircle2,
  Briefcase,
  FileText,
  GraduationCap,
  Landmark,
  Sparkles,
  Plus,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSchools } from "../../context/SchoolsContext";
import { useHrOrg } from "../../context/HrOrgContext";
import { useHrEmployees } from "../../context/HrEmployeesContext";
import { useClasses } from "../../context/ClassesContext";
import { api, ApiError, assetUrl } from "../../lib/api";
import type { HrEmployee, HrEmployeeInput, HrValuedItem } from "../../lib/types";
import { isTeacherDivisionName, isPrincipalDivisionName, deriveEmployeeTitle } from "../../lib/hrEmployeeTitle";
import { useSubjects } from "../../lib/useSubjects";
import { useLookupOptions } from "../../lib/useLookupOptions";
import { Section, Field, inputCls } from "../FormLayout";
import { AddInline } from "../TreeControls";

const STAFF_DIVISION = "Staff";
const STAFF_ROLES = [
  { value: "hr", label: "HR" },
  { value: "students_affair", label: "Student's Affair" },
  { value: "bus_supervisor", label: "Bus Supervisor" },
  { value: "corridor_supervisor", label: "Corridor Supervisor" },
] as const;
const DEPARTMENT_SCOPED_ROLES = new Set(["students_affair", "corridor_supervisor"]);

const TABS = [
  { key: "basic", label: "Basic Data", icon: UserCircle2 },
  { key: "position", label: "Position", icon: Briefcase },
  { key: "contracts", label: "Contracts", icon: FileText },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "documentation", label: "Documentation", icon: Landmark },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const TEXT_KEYS = [
  "nameEn",
  "address",
  "country",
  "area",
  "tel1",
  "tel2",
  "registrationDate",
  "birthday",
  "religion",
  "nationality",
  "regCode",
  "maritalStatus",
  "email",
  "division",
  "section",
  "department",
  "job",
  "status",
  "shift",
  "contractType",
  "contractFrom",
  "contractTo",
  "education",
  "university",
  "idNumber",
  "bank1Name",
  "bank1Account",
  "bank2Name",
  "bank2Account",
  "unionName",
  "unionDate",
  "insuranceNumber",
  "form1Date",
] as const;

type TextKey = (typeof TEXT_KEYS)[number];

const SNAKE_MAP: Record<TextKey, keyof HrEmployee> = {
  nameEn: "name_en",
  address: "address",
  country: "country",
  area: "area",
  tel1: "tel1",
  tel2: "tel2",
  registrationDate: "registration_date",
  birthday: "birthday",
  religion: "religion",
  nationality: "nationality",
  regCode: "reg_code",
  maritalStatus: "marital_status",
  email: "email",
  division: "division",
  section: "section",
  department: "department",
  job: "job",
  status: "status",
  shift: "shift",
  contractType: "contract_type",
  contractFrom: "contract_from",
  contractTo: "contract_to",
  education: "education",
  university: "university",
  idNumber: "id_number",
  bank1Name: "bank1_name",
  bank1Account: "bank1_account",
  bank2Name: "bank2_name",
  bank2Account: "bank2_account",
  unionName: "union_name",
  unionDate: "union_date",
  insuranceNumber: "insurance_number",
  form1Date: "form1_date",
};


function initialValues(initial?: HrEmployee | null): Record<TextKey, string> {
  const out = {} as Record<TextKey, string>;
  for (const key of TEXT_KEYS) {
    const raw = initial ? (initial[SNAKE_MAP[key]] as string | null) : null;
    out[key] = raw ?? "";
  }
  return out;
}

function EmployeePhotoField({
  employeeId,
  photoUrl,
  onChanged,
}: {
  employeeId: number | null;
  photoUrl: string | null;
  onChanged: (url: string | null) => void;
}) {
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = assetUrl(photoUrl);

  const handleFile = async (file: File) => {
    if (!token || !employeeId) return;
    setUploading(true);
    setError(null);
    try {
      const res = await api.uploadHrEmployeePhoto(token, employeeId, file);
      onChanged(res.employee.photo_url ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!token || !employeeId) return;
    setUploading(true);
    setError(null);
    try {
      const res = await api.removeHrEmployeePhoto(token, employeeId);
      onChanged(res.employee.photo_url ?? null);
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
          {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <User size={34} className="text-slate-300" />}
        </div>
      </div>
      {employeeId ? (
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
        <p className="text-center text-[11px] text-slate-400">Save the employee first to add a photo.</p>
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

type Props = {
  initial?: HrEmployee | null;
  onClose: () => void;
  onSubmit: (input: HrEmployeeInput) => Promise<void>;
};

export default function EmployeeFormModal({ initial, onClose, onSubmit }: Props) {
  const { selectedSchoolId } = useSchools();
  const isEdit = Boolean(initial);

  const [tab, setTab] = useState<TabKey>("basic");
  const [nameAr, setNameAr] = useState(initial?.name_ar ?? "");
  const [gender, setGender] = useState<"M" | "F">(initial?.gender ?? "M");
  const [salaryMethod, setSalaryMethod] = useState<"cash" | "bank">(initial?.salary_method ?? "cash");
  const [medicalCheck, setMedicalCheck] = useState(initial?.medical_check ?? "");
  const [handicap, setHandicap] = useState(Boolean(initial?.handicap));
  const [insured, setInsured] = useState(Boolean(initial?.insured));
  const [insuredWithAnother, setInsuredWithAnother] = useState(Boolean(initial?.insured_with_another));
  const [fellowshipBox, setFellowshipBox] = useState(Boolean(initial?.fellowship_box));
  const [insuredPension, setInsuredPension] = useState(Boolean(initial?.insured_pension));
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial?.photo_url ?? null);
  const [values, setValues] = useState<Record<TextKey, string>>(() => initialValues(initial));
  const [teacherSubjectId, setTeacherSubjectId] = useState<number | "">(initial?.subject_id ?? "");
  const [periodsShare, setPeriodsShare] = useState(initial?.periods_share != null ? String(initial.periods_share) : "");
  const [staffRole, setStaffRole] = useState(initial?.staff_role ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateEmployee, setDuplicateEmployee] = useState<HrEmployee | null>(null);
  const nameArInputRef = useRef<HTMLInputElement>(null);

  const [linkedUserId, setLinkedUserId] = useState(initial?.linked_user_id ?? null);
  const [staffCredentials, setStaffCredentials] = useState<{ username: string; password: string } | null>(null);
  const [configuringStaffUser, setConfiguringStaffUser] = useState(false);
  const [staffUserError, setStaffUserError] = useState<string | null>(null);
  // Tracks the employee row this form is actually attached to in the database — starts as
  // `initial`'s id when editing, and gets set the first time "Configure Staff User" silently
  // creates a brand-new employee (see handleConfigureStaffUser) so the button works as soon as
  // a Staff Role is picked, without requiring "Add Employee, then reopen to Edit" first. Once
  // set, the main Save button also switches to updating this same row in place instead of
  // asking the parent to create a second, duplicate one.
  const [savedEmployeeId, setSavedEmployeeId] = useState<number | null>(initial?.id ?? null);

  // Leave Balances — one optional numeric field per configured leave type (Configuration >
  // Leaves Balance), keyed by leave_type_id so adding a new type there shows up here too
  // without any code change. Values are the employee's current running balance for that type
  // (opening balance plus any leave already taken), reconciled via an adjustment ledger entry
  // on save rather than overwritten in place — see server/src/routes/hrLeave.ts's
  // /adjust-balance endpoint.
  const [leaveTypes, setLeaveTypes] = useState<HrValuedItem[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<Record<number, string>>({});

  // Duplicate-entry guard: an employee sharing both the same Name (Ar) and the same ID Number
  // as another one already in this school is almost certainly a double data-entry, not two
  // different people (unlike name alone, which legitimately repeats in this dataset) — so the
  // list is compared against, rather than just relying on the server to reject it.
  const { employees: schoolEmployees, refresh: refreshEmployeesList } = useHrEmployees();
  const findDuplicateEmployee = (): HrEmployee | undefined => {
    const trimmedName = nameAr.trim();
    const trimmedId = values.idNumber.trim();
    if (!trimmedName || !trimmedId) return undefined;
    return schoolEmployees.find(
      (e) => e.id !== initial?.id && e.name_ar.trim() === trimmedName && (e.id_number ?? "").trim() === trimmedId
    );
  };

  const { options: countries } = useLookupOptions("country", selectedSchoolId);
  const { options: areas } = useLookupOptions("area", selectedSchoolId);
  const { options: educations } = useLookupOptions("education", selectedSchoolId);
  const { options: universities } = useLookupOptions("university", selectedSchoolId);
  const { options: banks } = useLookupOptions("bank", selectedSchoolId);
  // "Department" primarily lists the Stages from the Student's Affair "My School" hierarchy,
  // plus any extra names added on the fly below via the (global, school-independent)
  // hr_lookup_items "department" catalog — the same catalog category Country/Area/etc. use,
  // just not previously wired up here. `addedDepartments` mirrors what was just created so a
  // brand-new name is immediately selectable without waiting on a refetch.
  const { tree: classTree } = useClasses();
  const { options: departmentLookups } = useLookupOptions("department", selectedSchoolId);
  const [addedDepartments, setAddedDepartments] = useState<string[]>([]);
  const [addingDepartment, setAddingDepartment] = useState(false);
  const departmentOptions = useMemo(() => {
    const names = [...classTree.map((s) => s.stage), ...departmentLookups.map((d) => d.name), ...addedDepartments];
    return Array.from(new Set(names));
  }, [classTree, departmentLookups, addedDepartments]);

  // Division/Section/مرحلة (Job) come from the manageable org tree (the Employees sidebar
  // tree), not a flat catalog — a cascading pick, mirroring how a student's class hierarchy
  // works. For the Teachers division specifically, Section is instead sourced from the Time
  // Table > Subjects catalog: picking one sets both values.section (the display name, so the
  // sidebar tree's grouping/counts by section text keep working) and teacherSubjectId (the
  // real subjects.id FK, persisted as hr_employees.subject_id) — the Classes's Time Table
  // cell editor matches teachers to a subject by that id, not by comparing name strings, so
  // renames/casing/Arabic-vs-English naming can never break the match.
  const { tree: orgTree } = useHrOrg();
  const orgDivision = orgTree.find((d) => d.division === values.division);
  // A real org-tree division carries an explicit, user-editable `kind` (see the HR sidebar
  // tree's grouping selector) — that's the source of truth now. Name-matching survives only as
  // a fallback for the synthetic "Staff" option, which has no real hr_org_divisions row.
  const isTeacherDivision = orgDivision ? orgDivision.kind === "teachers" : isTeacherDivisionName(values.division);
  const isPrincipalDivision = orgDivision ? orgDivision.kind === "principals" : isPrincipalDivisionName(values.division);

  // Title auto-fills from Division/Department (see deriveEmployeeTitle) but stays a normal
  // editable field — typing into it directly switches it to "manual" so further Position
  // changes stop overwriting the deliberate override (manualTitle, once set, is used verbatim
  // even if emptied — only "not yet touched" falls back to the live computed value). An
  // existing employee whose saved Title already diverges from what the formula would produce
  // from its own stored fields starts in manual mode too, so simply reopening Edit never
  // silently reverts a manual title back to the computed one.
  const autoTitle = useMemo(
    () => deriveEmployeeTitle(values.division, values.department),
    [values.division, values.department]
  );
  const [manualTitle, setManualTitle] = useState<string | null>(() => {
    if (!initial?.title) return null;
    const computed = deriveEmployeeTitle(initial.division ?? "", initial.department ?? "");
    return initial.title.trim() !== computed.trim() ? initial.title : null;
  });
  const title = manualTitle ?? autoTitle;

  const setDivision = (e: ChangeEvent<HTMLSelectElement>) => {
    setValues((v) => ({ ...v, division: e.target.value, section: "", job: "" }));
    setTeacherSubjectId("");
  };
  const setSection = (e: ChangeEvent<HTMLSelectElement>) => setValues((v) => ({ ...v, section: e.target.value, job: "" }));
  const setTeacherSubject = (e: ChangeEvent<HTMLSelectElement>) => {
    const subjectId = e.target.value ? Number(e.target.value) : "";
    setTeacherSubjectId(subjectId);
    const subjectName = subjects.find((s) => s.id === subjectId)?.name ?? "";
    setValues((v) => ({ ...v, section: subjectName, job: "" }));
  };

  const { token } = useAuth();
  const { subjects } = useSubjects();
  const handleAddDepartment = async (name: string) => {
    if (!token) throw new Error("Not signed in.");
    const res = await api.createHrLookup(token, { category: "department", name });
    setAddedDepartments((prev) => [...prev, res.item.name]);
    setValues((v) => ({ ...v, department: res.item.name }));
  };

  useEffect(() => {
    if (!token) return;
    api
      .getHrValued(token, "leave_type", selectedSchoolId ?? undefined)
      .then((res) => setLeaveTypes(res.items))
      .catch(() => setLeaveTypes([]));
  }, [token, selectedSchoolId]);

  useEffect(() => {
    if (!token || !initial) return;
    api
      .getHrLeaveLedger(token, initial.id)
      .then((res) => {
        const totals: Record<number, number> = {};
        for (const entry of res.ledger) {
          totals[entry.leave_type_id] = (totals[entry.leave_type_id] ?? 0) + entry.count;
        }
        setLeaveBalances(Object.fromEntries(Object.entries(totals).map(([id, total]) => [id, String(total)])));
      })
      .catch(() => setLeaveBalances({}));
  }, [token, initial]);

  const setField = (key: TextKey) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const buildPayload = (): HrEmployeeInput => ({
    schoolId: selectedSchoolId as number,
    nameAr: nameAr.trim(),
    gender,
    salaryMethod,
    medicalCheck: medicalCheck || undefined,
    handicap,
    insured,
    insuredWithAnother,
    fellowshipBox,
    insuredPension,
    nameEn: values.nameEn.trim() || undefined,
    address: values.address.trim() || undefined,
    country: values.country || undefined,
    area: values.area || undefined,
    tel1: values.tel1.trim() || undefined,
    tel2: values.tel2.trim() || undefined,
    registrationDate: values.registrationDate || undefined,
    birthday: values.birthday || undefined,
    religion: values.religion.trim() || undefined,
    nationality: values.nationality.trim() || undefined,
    regCode: values.regCode.trim() || undefined,
    maritalStatus: values.maritalStatus || undefined,
    email: values.email.trim() || undefined,
    division: values.division || undefined,
    section: values.section || undefined,
    subjectId: teacherSubjectId || undefined,
    periodsShare: periodsShare.trim() ? Number(periodsShare) : undefined,
    department: values.department || undefined,
    job: values.job || undefined,
    status: values.status || undefined,
    title: title || undefined,
    shift: values.shift || undefined,
    staffRole: staffRole || undefined,
    contractType: values.contractType.trim() || undefined,
    contractFrom: values.contractFrom || undefined,
    contractTo: values.contractTo || undefined,
    education: values.education || undefined,
    university: values.university || undefined,
    idNumber: values.idNumber.trim() || undefined,
    bank1Name: values.bank1Name || undefined,
    bank1Account: values.bank1Account.trim() || undefined,
    bank2Name: values.bank2Name || undefined,
    bank2Account: values.bank2Account.trim() || undefined,
    unionName: values.unionName.trim() || undefined,
    unionDate: values.unionDate || undefined,
    insuranceNumber: values.insuranceNumber.trim() || undefined,
    form1Date: values.form1Date || undefined,
  });

  // Picking a Staff Role only updates local form state — the server only sees it (and can only
  // configure a user against it) once the employee row actually exists. Saving here first means
  // clicking this one button works from an unsaved pick, instead of failing with a confusing
  // "Pick a Staff Role" error for a role that's visibly already selected — and, for a brand-new
  // employee that hasn't been saved through the main form yet at all, this silently creates the
  // row (bypassing the parent's onSubmit, which is wired to close the modal on success) so the
  // button works the moment a Staff Role is picked, not only after "Add, then reopen to Edit".
  const handleConfigureStaffUser = async () => {
    if (!token) return;
    setConfiguringStaffUser(true);
    setStaffUserError(null);
    try {
      let id = savedEmployeeId;
      if (id == null) {
        const created = await api.createHrEmployee(token, buildPayload());
        id = created.employee.id;
        setSavedEmployeeId(id);
      } else {
        await api.updateHrEmployee(token, id, buildPayload());
      }
      const res = await api.configureStaffUser(token, id);
      setStaffCredentials({ username: res.username, password: res.password });
      setLinkedUserId(res.employee.linked_user_id);
    } catch (err) {
      setStaffUserError(err instanceof ApiError ? err.message : "Could not configure the staff user.");
    } finally {
      setConfiguringStaffUser(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nameAr.trim()) {
      setError("Name (Ar) is required.");
      return;
    }
    if (!selectedSchoolId) {
      setError("Pick a school first.");
      return;
    }
    const duplicate = findDuplicateEmployee();
    if (duplicate) {
      setDuplicateEmployee(duplicate);
      return;
    }
    setSubmitting(true);
    setError(null);

    const applyLeaveBalances = async (employeeId: number) => {
      if (!token) return;
      for (const [leaveTypeIdStr, val] of Object.entries(leaveBalances)) {
        if (val.trim() === "") continue;
        await api.adjustHrLeaveBalance(token, {
          employeeId,
          schoolId: selectedSchoolId,
          leaveTypeId: Number(leaveTypeIdStr),
          targetBalance: Number(val),
        });
      }
    };

    try {
      if (!isEdit && savedEmployeeId != null) {
        // A brand-new employee was silently created mid-session via "Configure Staff User"
        // (see handleConfigureStaffUser) — update that same row in place instead of calling
        // the parent's create flow again, which would otherwise insert a duplicate.
        await applyLeaveBalances(savedEmployeeId);
        if (token) await api.updateHrEmployee(token, savedEmployeeId, buildPayload());
        await refreshEmployeesList();
        onClose();
      } else {
        if (isEdit && initial) await applyLeaveBalances(initial.id);
        await onSubmit(buildPayload());
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the employee.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRenameDuplicate = () => {
    setDuplicateEmployee(null);
    setTab("basic");
    requestAnimationFrame(() => {
      nameArInputRef.current?.focus();
      nameArInputRef.current?.select();
    });
  };

  const selectCls = useMemo(() => inputCls, []);

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
                <h2 className="text-lg font-semibold tracking-tight text-white">{isEdit ? "Edit Employee" : "New Employee"}</h2>
                <p className="text-xs text-white/50">
                  {isEdit ? `Employee #${initial?.id}` : "Fill in the details to add a new employee"}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white">
              <X size={20} />
            </button>
          </div>

          <div className="relative flex items-center gap-1 overflow-x-auto px-4 pb-2">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                    active ? "bg-white text-brand-700 shadow-md shadow-black/20" : "text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon size={13} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-6 py-5">
          {tab === "basic" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <Section title="Employee Data" icon={UserCircle2}>
                  <Field label="Name (Ar)" span={2}>
                    <input
                      ref={nameArInputRef}
                      value={nameAr}
                      onChange={(e) => setNameAr(e.target.value)}
                      className={inputCls}
                      placeholder="Employee full name"
                    />
                  </Field>
                  <Field label="Name (En)">
                    <input value={values.nameEn} onChange={setField("nameEn")} className={inputCls} />
                  </Field>
                  <Field label="Gender">
                    <div className="flex h-[38px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
                      {(["M", "F"] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setGender(g)}
                          className={`flex-1 rounded-md py-1 text-xs font-medium transition ${
                            gender === g ? "bg-white text-brand-700 shadow-sm" : "text-slate-400"
                          }`}
                        >
                          {g === "M" ? "Male" : "Female"}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Address" span={2}>
                    <input value={values.address} onChange={setField("address")} className={inputCls} />
                  </Field>
                  <Field label="Country">
                    <select value={values.country} onChange={setField("country")} className={selectCls}>
                      <option value="">—</option>
                      {countries.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Area">
                    <select value={values.area} onChange={setField("area")} className={selectCls}>
                      <option value="">—</option>
                      {areas.map((a) => (
                        <option key={a.id} value={a.name}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tel 1">
                    <input value={values.tel1} onChange={setField("tel1")} className={inputCls} />
                  </Field>
                  <Field label="Tel 2">
                    <input value={values.tel2} onChange={setField("tel2")} className={inputCls} />
                  </Field>
                  <Field label="Registration Date">
                    <input type="date" value={values.registrationDate} onChange={setField("registrationDate")} className={inputCls} />
                  </Field>
                  <Field label="Birthday Date">
                    <input type="date" value={values.birthday} onChange={setField("birthday")} className={inputCls} />
                  </Field>
                  <Field label="Religion">
                    <input value={values.religion} onChange={setField("religion")} className={inputCls} />
                  </Field>
                  <Field label="Nationality">
                    <input value={values.nationality} onChange={setField("nationality")} className={inputCls} />
                  </Field>
                  <Field label="Reg Code">
                    <input value={values.regCode} onChange={setField("regCode")} className={inputCls} />
                  </Field>
                  <Field label="Marital Status">
                    <select value={values.maritalStatus} onChange={setField("maritalStatus")} className={selectCls}>
                      <option value="">—</option>
                      <option value="single">Single</option>
                      <option value="married">Married</option>
                      <option value="divorced">Divorced</option>
                      <option value="widowed">Widowed</option>
                    </select>
                  </Field>
                  <Field label="Email">
                    <input value={values.email} onChange={setField("email")} className={inputCls} />
                  </Field>
                  <Field label="Handicap">
                    <label className="flex h-[38px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">
                      <input type="checkbox" checked={handicap} onChange={(e) => setHandicap(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                      Handicap
                    </label>
                  </Field>
                </Section>
              </div>
              <EmployeePhotoField employeeId={initial?.id ?? null} photoUrl={photoUrl} onChanged={setPhotoUrl} />
            </div>
          )}

          {tab === "position" && (
            <>
              <Section title="Position" icon={Briefcase}>
                <Field label="Division">
                  <select value={values.division} onChange={setDivision} className={selectCls} dir="rtl">
                    <option value="">—</option>
                    {orgTree.map((d) => (
                      <option key={d.id} value={d.division}>
                        {d.division}
                      </option>
                    ))}
                    {!orgTree.some((d) => d.division === STAFF_DIVISION) && (
                      <option value={STAFF_DIVISION}>Staff</option>
                    )}
                  </select>
                </Field>
                {!isPrincipalDivision && (
                  <Field label="Section">
                    {isTeacherDivision ? (
                      <select value={teacherSubjectId} onChange={setTeacherSubject} className={selectCls} disabled={!orgDivision} dir="rtl">
                        <option value="">—</option>
                        {subjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select value={values.section} onChange={setSection} className={selectCls} disabled={!orgDivision} dir="rtl">
                        <option value="">—</option>
                        {orgDivision?.sections.map((s) => (
                          <option key={s.id} value={s.section}>
                            {s.section}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                )}
                {isTeacherDivision && (
                  <Field label="Periods Share">
                    <input
                      type="number"
                      min={0}
                      value={periodsShare}
                      onChange={(e) => setPeriodsShare(e.target.value)}
                      className={inputCls}
                      placeholder="Periods per week"
                    />
                  </Field>
                )}
                <Field label="Department">
                  <div className="flex items-center gap-1.5">
                    <select value={values.department} onChange={setField("department")} className={selectCls}>
                      <option value="">—</option>
                      {departmentOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setAddingDepartment(true)}
                      title="Add a new department"
                      className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  {addingDepartment && (
                    <div className="mt-1.5">
                      <AddInline
                        placeholder="New department name"
                        onAdd={handleAddDepartment}
                        onDone={() => setAddingDepartment(false)}
                      />
                    </div>
                  )}
                </Field>
                <Field label="Status">
                  <select value={values.status} onChange={setField("status")} className={selectCls}>
                    <option value="">—</option>
                    <option value="active">Active</option>
                    <option value="on_leave">On Leave</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </Field>
                <Field label="Title" span={2}>
                  <input
                    value={title}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder="Auto-filled from Division/Section/Department — edit to override"
                    className={inputCls}
                  />
                </Field>
                {values.division === STAFF_DIVISION && (
                  <Field label="Staff Role">
                    <select value={staffRole} onChange={(e) => setStaffRole(e.target.value)} className={selectCls}>
                      <option value="">—</option>
                      {STAFF_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                          {DEPARTMENT_SCOPED_ROLES.has(r.value) && values.department ? ` — ${values.department}` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </Section>

              {isEdit && leaveTypes.length > 0 && (
                <Section title="Leave Balances" icon={Briefcase}>
                  {leaveTypes.map((t) => (
                    <Field key={t.id} label={`${t.name} Balance`}>
                      <input
                        type="number"
                        value={leaveBalances[t.id] ?? ""}
                        onChange={(e) => setLeaveBalances((v) => ({ ...v, [t.id]: e.target.value }))}
                        placeholder={`${t.amount} days/year`}
                        className={inputCls}
                      />
                    </Field>
                  ))}
                </Section>
              )}
              {isEdit && leaveTypes.length === 0 && (
                <p className="text-xs text-slate-400">
                  Add a leave type from HR &amp; Staff &gt; Configuration &gt; Leaves Balance to set balances here.
                </p>
              )}
              {!isEdit && (
                <p className="text-xs text-slate-400">Save the employee first to set leave balances.</p>
              )}

              {values.division === STAFF_DIVISION && staffRole && (
                <Section title="Staff User Account" icon={Briefcase}>
                  <Field label=" " span={2}>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={handleConfigureStaffUser}
                        disabled={configuringStaffUser}
                        className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
                      >
                        {configuringStaffUser ? "Configuring…" : linkedUserId ? "Reset Staff Password" : "Configure Staff User"}
                      </button>
                      {staffUserError && <p className="text-xs text-red-600">{staffUserError}</p>}
                      {staffCredentials && (
                        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                          User of {nameAr} (Staff) is assigned — username: <strong>{staffCredentials.username}</strong>,
                          password: <strong>{staffCredentials.password}</strong>. The user can change the password later
                          from the Users tab.
                        </p>
                      )}
                    </div>
                  </Field>
                </Section>
              )}
            </>
          )}

          {tab === "contracts" && (
            <Section title="Contracts" icon={FileText}>
              <Field label="Contract Type" span={2}>
                <input value={values.contractType} onChange={setField("contractType")} className={inputCls} />
              </Field>
              <Field label="From">
                <input type="date" value={values.contractFrom} onChange={setField("contractFrom")} className={inputCls} />
              </Field>
              <Field label="To">
                <input type="date" value={values.contractTo} onChange={setField("contractTo")} className={inputCls} />
              </Field>
            </Section>
          )}

          {tab === "education" && (
            <Section title="Education" icon={GraduationCap}>
              <Field label="Education">
                <select value={values.education} onChange={setField("education")} className={selectCls}>
                  <option value="">—</option>
                  {educations.map((e) => (
                    <option key={e.id} value={e.name}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="University">
                <select value={values.university} onChange={setField("university")} className={selectCls}>
                  <option value="">—</option>
                  {universities.map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
            </Section>
          )}

          {tab === "documentation" && (
            <div className="space-y-4">
              <Section title="Documentation" icon={Landmark}>
                <Field label="ID Number">
                  <input value={values.idNumber} onChange={setField("idNumber")} className={inputCls} />
                </Field>
                <Field label="Salary Method">
                  <div className="flex h-[38px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
                    {(["cash", "bank"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSalaryMethod(m)}
                        className={`flex-1 rounded-md py-1 text-xs font-medium capitalize transition ${
                          salaryMethod === m ? "bg-white text-brand-700 shadow-sm" : "text-slate-400"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Medical Check" span={2}>
                  <div className="flex h-[38px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
                    {(
                      [
                        ["", "—"],
                        ["accepted", "Accepted"],
                        ["unaccepted", "Unaccepted"],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setMedicalCheck(v)}
                        className={`flex-1 rounded-md py-1 text-xs font-medium transition ${
                          medicalCheck === v ? "bg-white text-brand-700 shadow-sm" : "text-slate-400"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
              </Section>

              <Section title="Bank Account">
                <Field label="Bank / Acc 1">
                  <select value={values.bank1Name} onChange={setField("bank1Name")} className={selectCls}>
                    <option value="">—</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Account No. 1">
                  <input value={values.bank1Account} onChange={setField("bank1Account")} className={inputCls} />
                </Field>
                <Field label="Bank / Acc 2">
                  <select value={values.bank2Name} onChange={setField("bank2Name")} className={selectCls}>
                    <option value="">—</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Account No. 2">
                  <input value={values.bank2Account} onChange={setField("bank2Account")} className={inputCls} />
                </Field>
              </Section>

              <Section title="Union & Insurance">
                <Field label="Union">
                  <input value={values.unionName} onChange={setField("unionName")} className={inputCls} />
                </Field>
                <Field label="Union Date">
                  <input type="date" value={values.unionDate} onChange={setField("unionDate")} className={inputCls} />
                </Field>
                <Field label="Insurance Number">
                  <input value={values.insuranceNumber} onChange={setField("insuranceNumber")} className={inputCls} />
                </Field>
                <Field label="Form 1 Date">
                  <input type="date" value={values.form1Date} onChange={setField("form1Date")} className={inputCls} />
                </Field>
                <Field label=" " span={2}>
                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" checked={insured} onChange={(e) => setInsured(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                      Insured
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={insuredWithAnother}
                        onChange={(e) => setInsuredWithAnother(e.target.checked)}
                        className="h-4 w-4 accent-brand-600"
                      />
                      Insured with Another
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={fellowshipBox}
                        onChange={(e) => setFellowshipBox(e.target.checked)}
                        className="h-4 w-4 accent-brand-600"
                      />
                      Fellowship Box
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={insuredPension}
                        onChange={(e) => setInsuredPension(e.target.checked)}
                        className="h-4 w-4 accent-brand-600"
                      />
                      مؤمن بالمعاش
                    </label>
                  </div>
                </Field>
              </Section>
            </div>
          )}

          {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="mt-4 flex items-center justify-end gap-2 pb-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
            >
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Add Employee"}
            </button>
          </div>
        </form>
      </div>

      {duplicateEmployee && (
        <div className="animate-fade-in fixed inset-0 z-40 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
          <div className="animate-rise-in w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-sm font-semibold text-slate-800">Possible Duplicate</h3>
            <p className="mt-1.5 text-sm text-slate-500">
              An employee named <strong>{duplicateEmployee.name_ar}</strong> with ID{" "}
              <strong>{duplicateEmployee.id_number}</strong> already exists. Rename this employee, or cancel adding.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDuplicateEmployee(null)}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRenameDuplicate}
                className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
