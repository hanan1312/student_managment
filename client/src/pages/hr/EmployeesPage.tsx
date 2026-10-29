import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  UserPlus,
  Table2,
  CalendarCheck,
  ClipboardList,
  Building2,
  Search,
  X,
  Upload,
  Download,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSchools } from "../../context/SchoolsContext";
import { useHrEmployees } from "../../context/HrEmployeesContext";
import { useHrOrg, type HrOrgSelection } from "../../context/HrOrgContext";
import { useSubjects } from "../../lib/useSubjects";
import { api, ApiError } from "../../lib/api";
import { downloadExcel } from "../../lib/excel";
import type { HrEmployee, HrEmployeeInput, HrOrgDivision } from "../../lib/types";
import RibbonGroup from "../../components/RibbonGroup";
import EmployeeFormModal from "../../components/hr/EmployeeFormModal";
import HrEmployeeTable from "../../components/hr/HrEmployeeTable";
import HrAttendanceModal from "../../components/hr/HrAttendanceModal";
import HrLeaveModal from "../../components/hr/HrLeaveModal";
import SchoolsSwitcherModal from "../../components/hr/SchoolsSwitcherModal";
import CsvImportModal, { type ImportColumn, type MappedRow } from "../../components/CsvImportModal";

const COLUMNS_STORAGE_KEY = "hr-employees-table-columns-v1";

type OutletCtx = { notify: (label: string) => void };

const UNSPECIFIED = "Unspecified";

const HR_EMPLOYEE_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "nameAr", label: "Name (Ar)", required: true, example: "أحمد محمد علي" },
  { key: "nameEn", label: "Name (En)" },
  { key: "gender", label: "Gender", example: "M", aliases: ["Sex"] },
  { key: "idNumber", label: "ID Number", aliases: ["ID"] },
  { key: "tel1", label: "Tel 1" },
  { key: "tel2", label: "Tel 2" },
  { key: "email", label: "Email" },
  { key: "address", label: "Address" },
  { key: "birthday", label: "Birthday", example: "1990-01-15" },
  { key: "division", label: "Division" },
  { key: "section", label: "Section" },
  { key: "department", label: "Department" },
  { key: "job", label: "مرحلة", aliases: ["Job"] },
  { key: "status", label: "Status" },
];

function mapEmployeeImportRow(
  raw: Record<string, string>
): { input?: Omit<HrEmployeeInput, "schoolId">; error?: string; warning?: string } {
  const genderRaw = raw.gender?.trim().toUpperCase();
  const gender: "M" | "F" = genderRaw === "F" || genderRaw === "FEMALE" ? "F" : "M";

  return {
    input: {
      nameAr: raw.nameAr,
      gender,
      nameEn: raw.nameEn || undefined,
      idNumber: raw.idNumber || undefined,
      tel1: raw.tel1 || undefined,
      tel2: raw.tel2 || undefined,
      email: raw.email || undefined,
      address: raw.address || undefined,
      birthday: raw.birthday || undefined,
      division: raw.division || undefined,
      section: raw.section || undefined,
      department: raw.department || undefined,
      job: raw.job || undefined,
      status: raw.status || undefined,
    },
    warning: !genderRaw ? "Gender not in file — imported as Male" : undefined,
  };
}

function selectionLabel(selection: HrOrgSelection): string | null {
  if (selection.type === "all") return null;
  if (selection.type === "division") return selection.division;
  // The Title is already a self-describing, fully-composed label (e.g. "Prencipal رياض
  // اطفال") — prefixing it with the division again would just repeat it.
  if (selection.type === "title") return selection.title;
  if (selection.type === "section") return `${selection.division} / ${selection.section}`;
  return `${selection.division} / ${selection.section} / ${selection.job}`;
}

// "Year of contract"_"Year of birth"_"last 4 digits of ID" — a quick-reference code shown
// right after the employee index, blank pieces just collapse to "—" rather than the string "undefined".
function matchesSelection(e: HrEmployee, selection: HrOrgSelection): boolean {
  if (selection.type === "all") return true;
  if ((e.division || UNSPECIFIED) !== selection.division) return false;
  if (selection.type === "division") return true;
  if (selection.type === "title") return (e.title || UNSPECIFIED) === selection.title;
  if ((e.section || UNSPECIFIED) !== selection.section) return false;
  if (selection.type === "section") return true;
  return (e.job || UNSPECIFIED) === selection.job;
}

export default function EmployeesPage() {
  useOutletContext<OutletCtx>();
  const { token } = useAuth();
  const { schools, selectedSchool } = useSchools();
  const { employees, loading, refresh } = useHrEmployees();
  const { tree: orgTree, selection, setSelection, createDivision, createSection } = useHrOrg();
  const { subjects, refresh: refreshSubjects } = useSubjects();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HrEmployee | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HrEmployee | null>(null);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [schoolsOpen, setSchoolsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // A single confirm-queue shape reused for every catalog value an import file can reference
  // that doesn't exist yet — Division, Subject (a Teacher-kind division's "Section" field), and
  // a plain org-tree Section (a Generic-kind division's "Section" field). See
  // handleBeforeImportEmployees for why each kind resolves to a different underlying catalog.
  const [pendingCatalogConfirm, setPendingCatalogConfirm] = useState<{
    kind: "division" | "subject" | "section";
    name: string;
    divisionName?: string;
    count: number;
    resolve: (create: boolean) => void;
  } | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const visibleEmployees = useMemo(() => {
    const scoped = employees.filter((e) => matchesSelection(e, selection));
    if (!debouncedQuery) return scoped;
    return scoped.filter(
      (e) =>
        e.name_ar.toLowerCase().includes(debouncedQuery) ||
        e.name_en?.toLowerCase().includes(debouncedQuery) ||
        e.id_number?.toLowerCase().includes(debouncedQuery) ||
        e.job?.toLowerCase().includes(debouncedQuery)
    );
  }, [employees, selection, debouncedQuery]);

  const scopeName = selectionLabel(selection);

  const handleExport = () => {
    const headers = [
      "Code",
      "Name (Ar)",
      "Name (En)",
      "Gender",
      "ID Number",
      "Tel 1",
      "Tel 2",
      "Email",
      "Country",
      "Division",
      "Section",
      "Department",
      "مرحلة",
      "Status",
    ];
    const rows = visibleEmployees.map((e) => ({
      Code: e.id,
      "Name (Ar)": e.name_ar,
      "Name (En)": e.name_en ?? "",
      Gender: e.gender,
      "ID Number": e.id_number ?? "",
      "Tel 1": e.tel1 ?? "",
      "Tel 2": e.tel2 ?? "",
      Email: e.email ?? "",
      Country: e.country ?? "",
      Division: e.division ?? "",
      Section: e.section ?? "",
      Department: e.department ?? "",
      مرحلة: e.job ?? "",
      Status: e.status ?? "",
    }));
    downloadExcel("employees.xlsx", headers, rows);
  };

  const handleCreate = async (input: HrEmployeeInput) => {
    if (!token) return;
    await api.createHrEmployee(token, input);
    setModalOpen(false);
    await refresh();
  };

  const handleUpdate = async (input: HrEmployeeInput) => {
    if (!token || !editing) return;
    await api.updateHrEmployee(token, editing.id, input);
    setEditing(null);
    await refresh();
  };

  const confirmCatalogEntry = (
    entry: { kind: "division" | "subject" | "section"; name: string; divisionName?: string; count: number }
  ): Promise<boolean> => new Promise((resolve) => setPendingCatalogConfirm({ ...entry, resolve }));

  // Import rows carry raw Division/Section strings with no guarantee they match anything real
  // (the sidebar tree / Position tab only ever offer existing values — see HrOrgContext.tsx —
  // but an imported spreadsheet can name anything). For each distinct not-yet-known value found
  // in the file, ask once whether to add it to the matching catalog (so it gets a real sidebar
  // node going forward) or drop it from the rows that used it — never silently accept an
  // unlisted value, and never silently discard the rows that used it.
  //
  // Division is a flat, per-school catalog. Section is more nuanced: what it even *means*
  // depends on the row's (possibly just-created) Division's kind, exactly like the Position tab
  // (see EmployeeFormModal.tsx) —
  //   - "teachers": Section is really a Time Table Subject; an unrecognized one offers to create
  //     a real Subject, and every row (recognized or newly created) gets subjectId linked too,
  //     the same as picking it from the Position tab's Subject picker would.
  //   - "principals": Section isn't used at all (hidden from the Position tab), so it's passed
  //     through untouched — nothing to confirm.
  //   - "generic": Section is a real hr_org_sections row scoped to that specific division.
  const handleBeforeImportEmployees = async (
    rows: MappedRow<Omit<HrEmployeeInput, "schoolId">>[]
  ): Promise<MappedRow<Omit<HrEmployeeInput, "schoolId">>[] | null> => {
    // ---- Pass 1: Division ----
    const divisionByName = new Map<string, HrOrgDivision>();
    for (const d of orgTree) divisionByName.set(d.division.trim().toLowerCase(), d);

    const unknownDivisions = new Map<string, number>();
    for (const r of rows) {
      const division = r.input?.division?.trim();
      if (!division || divisionByName.has(division.toLowerCase())) continue;
      unknownDivisions.set(division, (unknownDivisions.get(division) ?? 0) + 1);
    }

    const discardedDivisions = new Set<string>();
    for (const [name, count] of unknownDivisions) {
      const create = await confirmCatalogEntry({ kind: "division", name, count });
      if (create) {
        const created = await createDivision(name);
        if (created) divisionByName.set(created.division.trim().toLowerCase(), created);
      } else {
        discardedDivisions.add(name);
      }
    }

    let resolvedRows = rows.map((r) => {
      const division = r.input?.division?.trim();
      if (r.input && division && discardedDivisions.has(division)) {
        return { ...r, input: { ...r.input, division: undefined } };
      }
      return r;
    });

    // ---- Pass 2: Section (Subject for "teachers", org-tree section for "generic") ----
    const subjectByName = new Map<string, { id: number; name: string }>();
    for (const s of subjects) subjectByName.set(s.name.trim().toLowerCase(), s);
    const sectionsByDivision = new Map<number, Map<string, { id: number; section: string }>>();
    for (const d of divisionByName.values()) {
      sectionsByDivision.set(d.id, new Map(d.sections.map((s) => [s.section.trim().toLowerCase(), s])));
    }

    const unknownSubjects = new Map<string, number>();
    const unknownOrgSections = new Map<string, { divisionId: number; divisionName: string; name: string; count: number }>();
    for (const r of resolvedRows) {
      const divisionName = r.input?.division?.trim();
      const section = r.input?.section?.trim();
      if (!divisionName || !section) continue;
      const division = divisionByName.get(divisionName.toLowerCase());
      if (!division || division.kind === "principals") continue;

      if (division.kind === "teachers") {
        if (!subjectByName.has(section.toLowerCase())) {
          unknownSubjects.set(section, (unknownSubjects.get(section) ?? 0) + 1);
        }
      } else {
        if (!sectionsByDivision.get(division.id)?.has(section.toLowerCase())) {
          const key = `${division.id}::${section.toLowerCase()}`;
          const count = unknownOrgSections.get(key)?.count ?? 0;
          unknownOrgSections.set(key, { divisionId: division.id, divisionName: division.division, name: section, count: count + 1 });
        }
      }
    }

    const discardedSubjects = new Set<string>();
    for (const [name, count] of unknownSubjects) {
      const create = await confirmCatalogEntry({ kind: "subject", name, count });
      if (create && token) {
        const res = await api.createSubject(token, { name });
        subjectByName.set(res.subject.name.trim().toLowerCase(), res.subject);
        refreshSubjects();
      } else {
        discardedSubjects.add(name.trim().toLowerCase());
      }
    }

    const discardedOrgSections = new Set<string>();
    for (const { divisionId, divisionName, name, count } of unknownOrgSections.values()) {
      const create = await confirmCatalogEntry({ kind: "section", name, divisionName, count });
      const key = `${divisionId}::${name.trim().toLowerCase()}`;
      if (create) {
        const created = await createSection(divisionId, name);
        if (created) sectionsByDivision.get(divisionId)?.set(created.section.trim().toLowerCase(), created);
      } else {
        discardedOrgSections.add(key);
      }
    }

    resolvedRows = resolvedRows.map((r) => {
      if (!r.input) return r;
      const divisionName = r.input.division?.trim();
      const section = r.input.section?.trim();
      if (!divisionName || !section) return r;
      const division = divisionByName.get(divisionName.toLowerCase());
      if (!division) return r;

      if (division.kind === "teachers") {
        if (discardedSubjects.has(section.toLowerCase())) {
          return { ...r, input: { ...r.input, section: undefined, subjectId: undefined } };
        }
        const subject = subjectByName.get(section.toLowerCase());
        return subject ? { ...r, input: { ...r.input, section: subject.name, subjectId: subject.id } } : r;
      }

      if (division.kind === "generic" && discardedOrgSections.has(`${division.id}::${section.toLowerCase()}`)) {
        return { ...r, input: { ...r.input, section: undefined } };
      }
      return r;
    });

    return resolvedRows;
  };

  const confirmDelete = async () => {
    if (!token || !pendingDelete) return;
    setErrorMsg(null);
    try {
      await api.deleteHrEmployee(token, pendingDelete.id);
      setPendingDelete(null);
      await refresh();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "Could not delete this employee.");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm">
        <RibbonGroup
          caption="Employees Management"
          buttons={[
            { label: "New Employee", icon: UserPlus, onClick: () => setModalOpen(true) },
            { label: "Import", icon: Upload, onClick: () => setImportOpen(true) },
            { label: "Export", icon: Download, onClick: handleExport },
            { label: "Employees", icon: Table2, onClick: () => refresh() },
          ]}
        />
        <RibbonGroup
          caption="Attendance Management"
          buttons={[{ label: "Attendance", icon: CalendarCheck, onClick: () => setAttendanceOpen(true) }]}
        />
        <RibbonGroup caption="Leaves" buttons={[{ label: "Leves Request", icon: ClipboardList, onClick: () => setLeaveOpen(true) }]} />
        <RibbonGroup caption="Multi Properties" buttons={[{ label: "Schools", icon: Building2, onClick: () => setSchoolsOpen(true) }]} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="font-medium text-slate-700">{selectedSchool?.name ?? "No school selected"}</span>
          {scopeName && (
            <>
              <span>/</span>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">{scopeName}</span>
              <button onClick={() => setSelection({ type: "all" })} className="text-slate-400 hover:text-slate-600" title="Clear filter">
                <X size={14} />
              </button>
            </>
          )}
          <span className="text-slate-300">&middot;</span>
          <span>
            {visibleEmployees.length} employee{visibleEmployees.length === 1 ? "" : "s"}
          </span>
          {schools.length > 1 && (
            <button onClick={() => setSchoolsOpen(true)} className="text-xs text-brand-600 hover:underline">
              Switch school
            </button>
          )}
        </div>

        <div className="relative w-full max-w-xs">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter text to search…"
            className="w-full rounded-lg border border-slate-200 py-2 ps-9 pe-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        {errorMsg && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>}

        <HrEmployeeTable
          employees={visibleEmployees}
          onRowClick={setEditing}
          onDelete={setPendingDelete}
          storageKey={COLUMNS_STORAGE_KEY}
          emptyLabel={loading ? "Loading…" : "No employees yet."}
        />
      </div>

      {modalOpen && <EmployeeFormModal onClose={() => setModalOpen(false)} onSubmit={handleCreate} />}
      {editing && <EmployeeFormModal initial={editing} onClose={() => setEditing(null)} onSubmit={handleUpdate} />}
      {attendanceOpen && <HrAttendanceModal onClose={() => setAttendanceOpen(false)} />}
      {leaveOpen && <HrLeaveModal employees={employees} onClose={() => setLeaveOpen(false)} />}
      {schoolsOpen && <SchoolsSwitcherModal onClose={() => setSchoolsOpen(false)} />}

      {importOpen && token && selectedSchool && (
        <CsvImportModal<Omit<HrEmployeeInput, "schoolId">>
          title="Import Employees"
          templateFilename="employees-template.csv"
          columns={HR_EMPLOYEE_IMPORT_COLUMNS}
          mapRow={mapEmployeeImportRow}
          onBeforeImport={handleBeforeImportEmployees}
          onImportRow={(input) => api.createHrEmployee(token, { ...input, schoolId: selectedSchool.id }).then(() => {})}
          onClose={() => setImportOpen(false)}
          onFinished={() => refresh()}
        />
      )}

      {pendingCatalogConfirm && (
        <div className="animate-fade-in fixed inset-0 z-40 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
          <div className="animate-rise-in w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-sm font-semibold text-slate-800">
              New {pendingCatalogConfirm.kind === "division" ? "division" : pendingCatalogConfirm.kind === "subject" ? "subject" : "section"}{" "}
              found in file
            </h3>
            <p className="mt-1.5 text-sm text-slate-500">
              <span className="font-medium text-slate-700">"{pendingCatalogConfirm.name}"</span>
              {pendingCatalogConfirm.kind === "section" && (
                <>
                  {" "}
                  under Division <span className="font-medium text-slate-700">"{pendingCatalogConfirm.divisionName}"</span>
                </>
              )}{" "}
              doesn't exist yet — {pendingCatalogConfirm.count} row{pendingCatalogConfirm.count === 1 ? "" : "s"} use it.{" "}
              {pendingCatalogConfirm.kind === "division" &&
                "Add it as a real division (it'll appear in the left panel), or discard it from those rows (they'll import with Division left blank)?"}
              {pendingCatalogConfirm.kind === "subject" &&
                "Add it as a real Time Table Subject (so it can sync as a sub-division under this Teachers division), or discard it from those rows (Section left blank)?"}
              {pendingCatalogConfirm.kind === "section" &&
                "Add it to that division's tree (it'll appear in the left panel), or discard it from those rows (Section left blank)?"}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  pendingCatalogConfirm.resolve(false);
                  setPendingCatalogConfirm(null);
                }}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel (discard)
              </button>
              <button
                onClick={() => {
                  pendingCatalogConfirm.resolve(true);
                  setPendingCatalogConfirm(null);
                }}
                className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Confirm (add)
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
          <div className="animate-rise-in w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-sm font-semibold text-slate-800">Remove employee?</h3>
            <p className="mt-1.5 text-sm text-slate-500">
              This will permanently delete <span className="font-medium text-slate-700">{pendingDelete.name_ar}</span>.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button onClick={confirmDelete} className="rounded-lg bg-red-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
