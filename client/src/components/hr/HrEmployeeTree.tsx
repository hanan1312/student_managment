import { useState } from "react";
import { ChevronDown, ChevronRight, Building2, Briefcase, BookOpen, Users, UserSquare2, Plus, Pencil, Trash2, Menu } from "lucide-react";
import type { HrEmployee, HrOrgDivision, HrOrgDivisionKind, HrOrgSection, Subject } from "../../lib/types";
import { useHrOrg, type HrOrgSelection } from "../../context/HrOrgContext";
import { useHrEmployees } from "../../context/HrEmployeesContext";
import { useSchools } from "../../context/SchoolsContext";
import { useClasses } from "../../context/ClassesContext";
import { AddInline, RenameInline, ConfirmDeleteDialog, RowActionButton } from "../TreeControls";
import { isHeadmasterDivisionName, deriveEmployeeTitle } from "../../lib/hrEmployeeTitle";
import { useLookupOptions } from "../../lib/useLookupOptions";
import { useSubjects } from "../../lib/useSubjects";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

// Mirrors EmployeeFormModal.tsx's synthetic "Staff" Division option — it isn't a real
// hr_org_divisions row unless a school happens to create one literally named "Staff", so the
// tree renders a non-editable stand-in for it below (see the root component) instead of relying
// on it showing up in `tree` like every other division does.
const STAFF_DIVISION = "Staff";

// Groups this list of employees by their derived Title and renders each group as its own
// clickable row — no employee names are listed inline here anymore, since clicking a title (or
// the enclosing division/subdivision) already reveals exactly who's in it via the Employees
// table's selection filter (the same `{type: "title", ...}` HrOrgSelection every other
// Title-subdivision in this tree already uses), so listing names twice was redundant.
// Removing a Title group here clears hr_employees.title for exactly the employees shown in it
// (see api.clearHrEmployeeTitles) — Title isn't a real record, just derived/stored text, so
// "removing the sub-sub-division" means blanking that text rather than deleting anything. Once
// blank, EmployeeFormModal's existing "no stored title -> track the live Division+Department
// formula" behavior takes over: opening Edit on any of these employees shows the recomputed
// Title immediately, and saving re-persists it, which brings the group right back here in sync.
function DivisionEmployeeTitles({
  division,
  employees,
  selection,
  onSelect,
}: {
  division: string;
  employees: HrEmployee[];
  selection: HrOrgSelection;
  onSelect: (selection: HrOrgSelection) => void;
}) {
  const { token } = useAuth();
  const { refresh: refreshEmployees } = useHrEmployees();
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  if (employees.length === 0) return null;

  const groups = new Map<string, HrEmployee[]>();
  for (const e of employees) {
    const key = e.title?.trim() || "Untitled";
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  return (
    <div className="ms-3 border-s border-slate-200 ps-2">
      {Array.from(groups.entries()).map(([titleLabel, groupEmployees]) => {
        const active = selection.type === "title" && selection.division === division && selection.title === titleLabel;
        const removable = titleLabel !== "Untitled";
        return (
          <div key={titleLabel} className="group flex items-center rounded-md">
            <button
              type="button"
              onClick={() => onSelect({ type: "title", division, title: titleLabel })}
              className={`flex flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-start transition ${
                active ? "bg-gradient-to-r from-brand-50 to-brand-100/60 font-medium text-brand-700 shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <UserSquare2 size={12} className={`shrink-0 ${active ? "text-brand-600" : "text-slate-400"}`} />
              <span className="truncate" dir="rtl">
                {titleLabel}
              </span>
              <span className="ms-auto shrink-0 text-[10px] text-slate-400">{groupEmployees.length}</span>
            </button>
            {removable && (
              <RowActionButton
                title="Remove this title group from the panel"
                variant="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmingDelete(titleLabel);
                }}
              >
                <Trash2 size={11} />
              </RowActionButton>
            )}
            {confirmingDelete === titleLabel && (
              <ConfirmDeleteDialog
                title="Remove title from panel?"
                message={`"${titleLabel}" will be cleared for ${groupEmployees.length} employee(s). Their Division/Department stay unchanged — reopening and saving any of them regenerates and re-syncs it here automatically.`}
                onCancel={() => setConfirmingDelete(null)}
                onConfirm={async () => {
                  if (!token) return;
                  await api.clearHrEmployeeTitles(
                    token,
                    groupEmployees.map((e) => e.id)
                  );
                  await refreshEmployees();
                  if (active) onSelect({ type: "division", division });
                  setConfirmingDelete(null);
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// The Teachers division's own Section field is really a Subject picker (see
// EmployeeFormModal.tsx) — Subject is the subdivision here (one clickable node per Time Table >
// Subjects entry, matched by subject_id so a rename can't break the grouping), and nested inside
// each Subject, employees are grouped by their derived Title (Division+Department — see
// deriveEmployeeTitle) as a sub-subdivision, exactly like DivisionEmployeeTitles already does
// for every other division. Rename/Delete here edit the real Subjects catalog row directly (the
// same one Time Table > Subjects manages), so both stay in sync by construction.
function TeacherSubjectRow({
  division,
  subject,
  employees,
  selection,
  onSelect,
  refreshSubjects,
}: {
  division: HrOrgDivision;
  subject: Subject;
  employees: HrEmployee[];
  selection: HrOrgSelection;
  onSelect: (selection: HrOrgSelection) => void;
  refreshSubjects: () => Promise<void>;
}) {
  const { token } = useAuth();
  const { refresh: refreshEmployees } = useHrEmployees();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const subjectEmployees = employees.filter(
    (e) => e.subject_id === subject.id && (e.division ?? "").trim() === division.division.trim()
  );
  const active = selection.type === "section" && selection.division === division.division && selection.section === subject.name;

  if (editing) {
    return (
      <RenameInline
        initialValue={subject.name}
        onSave={async (name) => {
          if (!token) return;
          await api.updateSubject(token, subject.id, { name });
          await refreshSubjects();
          await refreshEmployees();
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div>
      <div
        className={`group flex items-center rounded-md transition ${
          active ? "bg-gradient-to-r from-brand-50 to-brand-100/60 shadow-sm" : "hover:bg-slate-100"
        }`}
      >
        <button
          onClick={() => {
            setOpen((o) => !o);
            onSelect({ type: "section", division: division.division, section: subject.name });
          }}
          className={`flex flex-1 items-center gap-1 px-2 py-1.5 text-start ${
            active ? "font-medium text-brand-700" : "text-slate-600"
          }`}
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} className="rtl:-scale-x-100" />}
          <BookOpen size={13} className={active ? "text-brand-600" : "text-slate-400"} />
          <span className="truncate" dir="rtl">
            {subject.name}
          </span>
        </button>
        <RowActionButton
          title="Rename subject"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          <Pencil size={12} />
        </RowActionButton>
        <RowActionButton
          title="Delete subject"
          variant="danger"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmingDelete(true);
          }}
        >
          <Trash2 size={12} />
        </RowActionButton>
      </div>

      {open && (
        <div className="ms-3 border-s border-slate-200 ps-2">
          <DivisionEmployeeTitles division={division.division} employees={subjectEmployees} selection={selection} onSelect={onSelect} />
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDeleteDialog
          title="Delete subject?"
          message={`"${subject.name}" will be removed from the Time Table Subjects catalog everywhere, not just here. Employees already assigned to it keep their current values.`}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            if (!token) return;
            await api.deleteSubject(token, subject.id);
            await refreshSubjects();
          }}
        />
      )}
    </div>
  );
}

// A Department shown as a Title-subdivision (below) can come from either the Student's Affair
// Stage catalog or the hr_lookup_items "department" catalog (see EmployeeFormModal.tsx's "+"
// button) — kept distinct so Rename/Delete know which backing store to call.
type DepartmentEntry = { source: "stage" | "lookup"; id: number; name: string };

// Teachers and Principals/deputies both derive Title as "<Division> <Department>" (see
// deriveEmployeeTitle) — Teachers' own Section/Subject picker plays no part in Title (it only
// feeds subject_id for Time Table matching), and Principals' Section picker is hidden entirely
// (see EmployeeFormModal.tsx) — so for both, each possible Department becomes a clickable
// sub-node here, pre-labeled with the exact Title an employee in that department would get.
// Matches by the employee's own stored Title text rather than recomputing per-employee, so a
// manually overridden Title (see EmployeeFormModal.tsx's editable Title field) still lands
// correctly. Renaming a Stage-sourced department also renames it in the Student's Affair class
// hierarchy (it's the same row); deleting one isn't offered here — that's a much bigger, cross-
// module action best done from Student's Affair itself, not buried in an HR tree.
function TitleSubdivisionRow({
  division,
  departmentEntry,
  employees,
  selection,
  onSelect,
  refreshDepartmentLookups,
}: {
  division: HrOrgDivision;
  departmentEntry: DepartmentEntry;
  employees: HrEmployee[];
  selection: HrOrgSelection;
  onSelect: (selection: HrOrgSelection) => void;
  refreshDepartmentLookups: () => Promise<void>;
}) {
  const { token } = useAuth();
  const { renameStage } = useClasses();
  const { refresh: refreshEmployees } = useHrEmployees();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isStage = departmentEntry.source === "stage";
  const computedTitle = deriveEmployeeTitle(division.division, departmentEntry.name);
  const titleEmployees = employees.filter(
    (e) => (e.title ?? "").trim() === computedTitle.trim() && (e.division ?? "").trim() === division.division.trim()
  );
  const active = selection.type === "title" && selection.division === division.division && selection.title === computedTitle;

  if (editing) {
    return (
      <RenameInline
        initialValue={departmentEntry.name}
        onSave={async (name) => {
          if (isStage) {
            await renameStage(departmentEntry.id, name);
          } else if (token) {
            await api.updateHrLookup(token, departmentEntry.id, { name });
            await refreshDepartmentLookups();
          }
          await refreshEmployees();
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div>
      <div
        className={`group flex items-center rounded-md transition ${
          active ? "bg-gradient-to-r from-brand-50 to-brand-100/60 shadow-sm" : "hover:bg-slate-100"
        }`}
      >
        <button
          onClick={() => onSelect({ type: "title", division: division.division, title: computedTitle })}
          className={`flex flex-1 items-center gap-1 px-2 py-1.5 text-start ${
            active ? "font-medium text-brand-700" : "text-slate-600"
          }`}
        >
          <UserSquare2 size={13} className={active ? "text-brand-600" : "text-slate-400"} />
          <span className="truncate" dir="rtl">
            {computedTitle}
          </span>
          {titleEmployees.length > 0 && <span className="ms-auto shrink-0 text-[10px] text-slate-400">{titleEmployees.length}</span>}
        </button>
        <RowActionButton
          title={isStage ? "Rename department (also renames this Stage in Student's Affair)" : "Rename department"}
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          <Pencil size={12} />
        </RowActionButton>
        {!isStage && (
          <RowActionButton
            title="Delete department"
            variant="danger"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmingDelete(true);
            }}
          >
            <Trash2 size={12} />
          </RowActionButton>
        )}
      </div>
      {confirmingDelete && (
        <ConfirmDeleteDialog
          title="Delete department?"
          message={`"${departmentEntry.name}" will be removed from the Department list. Employees already using it keep their current values.`}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            if (!token) return;
            await api.deleteHrLookup(token, departmentEntry.id);
            await refreshDepartmentLookups();
          }}
        />
      )}
    </div>
  );
}

function JobRow({
  job,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  job: string;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (editing) {
    return (
      <RenameInline
        initialValue={job}
        onSave={async (name) => {
          await onRename(name);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="group flex items-center rounded-md">
      <button
        onClick={onSelect}
        className={`flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-start transition ${
          active
            ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm shadow-brand-600/30"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        <UserSquare2 size={13} className={active ? "text-white" : "text-slate-400"} />
        <span className="truncate" dir="rtl">
          {job}
        </span>
      </button>
      <RowActionButton
        title="Rename job"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
      >
        <Pencil size={12} />
      </RowActionButton>
      <RowActionButton
        title="Delete job"
        variant="danger"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmingDelete(true);
        }}
      >
        <Trash2 size={12} />
      </RowActionButton>

      {confirmingDelete && (
        <ConfirmDeleteDialog
          title="Delete job?"
          message={`"${job}" will be removed from the tree. Employees already using it keep their current value.`}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={onDelete}
        />
      )}
    </div>
  );
}

function SectionRow({
  division,
  section,
  selection,
  onSelect,
}: {
  division: HrOrgDivision;
  section: HrOrgSection;
  selection: HrOrgSelection;
  onSelect: (selection: HrOrgSelection) => void;
}) {
  const { createJob, renameSection, deleteSection, renameJob, deleteJob } = useHrOrg();
  const { refresh: refreshEmployees } = useHrEmployees();
  const [open, setOpen] = useState(true);
  const [addingJob, setAddingJob] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const active = selection.type === "section" && selection.division === division.division && selection.section === section.section;

  if (editing) {
    return (
      <RenameInline
        initialValue={section.section}
        onSave={async (name) => {
          // A renamed Section/Job's text is mirrored onto matching hr_employees rows
          // server-side (see hrOrg.ts) — refresh the already-loaded employees list so the
          // sidebar's Title grouping and the Employees table pick up the new text right away.
          await renameSection(section.id, name);
          await refreshEmployees();
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div>
      <div
        className={`group flex items-center rounded-md transition ${
          active ? "bg-gradient-to-r from-brand-50 to-brand-100/60 shadow-sm" : "hover:bg-slate-100"
        }`}
      >
        <button
          onClick={() => {
            setOpen((o) => !o);
            onSelect({ type: "section", division: division.division, section: section.section });
          }}
          className={`flex flex-1 items-center gap-1 px-2 py-1.5 text-start ${
            active ? "font-medium text-brand-700" : "text-slate-600"
          }`}
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} className="rtl:-scale-x-100" />}
          <Briefcase size={13} className={active ? "text-brand-600" : "text-slate-400"} />
          <span className="truncate" dir="rtl">
            {section.section}
          </span>
        </button>
        <RowActionButton
          title={`Add job in ${section.section}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
            setAddingJob(true);
          }}
        >
          <Plus size={13} />
        </RowActionButton>
        <RowActionButton
          title="Rename section"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          <Pencil size={12} />
        </RowActionButton>
        <RowActionButton
          title="Delete section"
          variant="danger"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmingDelete(true);
          }}
        >
          <Trash2 size={12} />
        </RowActionButton>
      </div>

      {open && (
        <div className="ms-3 border-s border-slate-200 ps-2">
          {section.jobs.map((j) => (
            <JobRow
              key={j.id}
              job={j.job}
              active={
                selection.type === "job" &&
                selection.division === division.division &&
                selection.section === section.section &&
                selection.job === j.job
              }
              onSelect={() => onSelect({ type: "job", division: division.division, section: section.section, job: j.job })}
              onRename={async (name) => {
                await renameJob(j.id, name);
                await refreshEmployees();
              }}
              onDelete={() => deleteJob(j.id)}
            />
          ))}
          {addingJob && (
            <AddInline
              placeholder="New job name"
              onAdd={(name) => createJob(section.id, name)}
              onDone={() => setAddingJob(false)}
            />
          )}
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDeleteDialog
          title="Delete section?"
          message={`"${section.section}" and all its jobs will be removed from the tree. Employees already using them keep their current values.`}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => deleteSection(section.id)}
        />
      )}
    </div>
  );
}

function DivisionRow({
  division,
  employees,
  subjects,
  refreshSubjects,
  selection,
  onSelect,
}: {
  division: HrOrgDivision;
  employees: HrEmployee[];
  subjects: Subject[];
  refreshSubjects: () => Promise<void>;
  selection: HrOrgSelection;
  onSelect: (selection: HrOrgSelection) => void;
}) {
  const { createSection, renameDivision, setDivisionKind, deleteDivision } = useHrOrg();
  const { refresh: refreshEmployees } = useHrEmployees();
  const [open, setOpen] = useState(true);
  const [addingSection, setAddingSection] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const active = selection.type === "division" && selection.division === division.division;
  // Whether this division gets Subject-based (Teachers) or Department-based (Principals)
  // subdivisions is this explicit, persisted `kind` flag rather than name-matching — see the
  // grouping <select> below, which is how a renamed division (e.g. one that no longer literally
  // says "Teachers") gets flipped back into the right shape.
  const isTeacherDiv = division.kind === "teachers";
  const isPrincipalDiv = division.kind === "principals";
  // Teachers (Subject-subdivisions) and Principals (Department-subdivisions) both skip the
  // manageable Section/Job tree entirely — see the comments on TeacherSubjectRow and
  // TitleSubdivisionRow above.
  const usesDepartmentSubdivisions = isTeacherDiv || isPrincipalDiv;
  const { tree: classTree } = useClasses();
  // Department (Position tab) offers both the Student's Affair Stage catalog and any names
  // added on the fly via the hr_lookup_items "department" catalog (see EmployeeFormModal.tsx's
  // "+" button) — a custom-added department must show up here too, or an employee assigned to
  // it just falls through to the generic catch-all bucket below instead of getting its own
  // proper clickable subdivision.
  const { selectedSchoolId } = useSchools();
  const { options: departmentLookups, refresh: refreshDepartmentLookups } = useLookupOptions("department", selectedSchoolId);
  const departmentEntries: DepartmentEntry[] = (() => {
    const seen = new Set<string>();
    const entries: DepartmentEntry[] = [];
    for (const stage of classTree) {
      if (seen.has(stage.stage)) continue;
      seen.add(stage.stage);
      entries.push({ source: "stage", id: stage.id, name: stage.stage });
    }
    for (const item of departmentLookups) {
      if (seen.has(item.name)) continue;
      seen.add(item.name);
      entries.push({ source: "lookup", id: item.id, name: item.name });
    }
    return entries;
  })();

  if (editing) {
    return (
      <div className="ms-2">
        <RenameInline
          initialValue={division.division}
          onSave={async (name) => {
            // A renamed Division's text (and, where it changes the formula's result, each
            // affected employee's derived Title) is synced server-side onto matching
            // hr_employees rows (see hrOrg.ts) — refresh the already-loaded employees list so
            // this tree and the Employees table reflect it immediately, not after a reload.
            await renameDivision(division.id, name);
            await refreshEmployees();
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="ms-2">
      <div
        className={`group flex items-center rounded-md transition ${
          active ? "bg-gradient-to-r from-brand-50 to-brand-100/60 shadow-sm" : "hover:bg-slate-100"
        }`}
      >
        <button
          onClick={() => {
            setOpen((o) => !o);
            onSelect({ type: "division", division: division.division });
          }}
          className={`flex flex-1 items-center gap-1.5 px-2 py-1.5 text-start font-medium ${
            active ? "text-brand-700" : "text-slate-700"
          }`}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} className="rtl:-scale-x-100" />}
          <Users size={14} className={active ? "text-brand-600" : "text-slate-400"} />
          <span className="truncate" dir="rtl">
            {division.division}
          </span>
        </button>
        <select
          value={division.kind}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDivisionKind(division.id, e.target.value as HrOrgDivisionKind)}
          title="Division grouping — Teachers syncs sub-divisions with Time Table Subjects, Principals syncs them with Departments"
          className="shrink-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[10px] text-slate-400 opacity-0 outline-none transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-600 focus:opacity-100 group-hover:opacity-100"
        >
          <option value="generic">Generic</option>
          <option value="teachers">Teachers</option>
          <option value="principals">Principals</option>
        </select>
        {!usesDepartmentSubdivisions && (
          <RowActionButton
            title={`Add section in ${division.division}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
              setAddingSection(true);
            }}
          >
            <Plus size={13} />
          </RowActionButton>
        )}
        <RowActionButton
          title="Rename division"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          <Pencil size={12} />
        </RowActionButton>
        <RowActionButton
          title="Delete division"
          variant="danger"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmingDelete(true);
          }}
        >
          <Trash2 size={12} />
        </RowActionButton>
      </div>

      {open && (
        <div className="ms-3 border-s border-slate-200 ps-2">
          {isTeacherDiv ? (
            subjects.map((s) => (
              <TeacherSubjectRow
                key={s.id}
                division={division}
                subject={s}
                employees={employees}
                selection={selection}
                onSelect={onSelect}
                refreshSubjects={refreshSubjects}
              />
            ))
          ) : isPrincipalDiv ? (
            (() => {
              const departmentTitleSet = new Set(
                departmentEntries.map((entry) => deriveEmployeeTitle(division.division, entry.name).trim())
              );
              return (
                <>
                  {departmentEntries.map((entry) => (
                    <TitleSubdivisionRow
                      key={`${entry.source}-${entry.id}`}
                      division={division}
                      departmentEntry={entry}
                      employees={employees}
                      selection={selection}
                      onSelect={onSelect}
                      refreshDepartmentLookups={refreshDepartmentLookups}
                    />
                  ))}
                  {/* Catches anyone with no Department set, or a manually-overridden Title
                      that doesn't match any Department-derived one above. */}
                  <DivisionEmployeeTitles
                    division={division.division}
                    employees={employees.filter(
                      (e) =>
                        (e.division ?? "").trim() === division.division.trim() &&
                        !departmentTitleSet.has((e.title ?? "").trim())
                    )}
                    selection={selection}
                    onSelect={onSelect}
                  />
                </>
              );
            })()
          ) : (
            <>
              {division.sections.map((s) => (
                <SectionRow key={s.id} division={division} section={s} selection={selection} onSelect={onSelect} />
              ))}
              {addingSection && (
                <AddInline
                  placeholder="New section name"
                  onAdd={async (name) => {
                    await createSection(division.id, name);
                  }}
                  onDone={() => setAddingSection(false)}
                />
              )}
              {/* Headmaster's Title is always the fixed "Headmaster" label — a title grouping
                  here would just repeat what clicking the Division itself already shows. */}
              {!isHeadmasterDivisionName(division.division) && (
                <DivisionEmployeeTitles
                  division={division.division}
                  employees={employees.filter((e) => (e.division ?? "").trim() === division.division.trim())}
                  selection={selection}
                  onSelect={onSelect}
                />
              )}
            </>
          )}
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDeleteDialog
          title="Delete division?"
          message={`"${division.division}" and everything inside it (sections and jobs) will be removed from the tree. Employees already using them keep their current values.`}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => deleteDivision(division.id)}
        />
      )}
    </div>
  );
}

// Stand-in for DivisionRow when no real "Staff" org division exists yet — there's no
// hr_org_divisions row to rename/delete, so instead of an inline rename, its one action turns
// it into a real division first (matching its current name), which then renders as a normal,
// fully-editable DivisionRow on the next tree refresh — that one already has real Rename/
// Delete, and (unlike renaming this placeholder to something else directly) this way any
// employee whose division is already stored as literal "Staff" text stays correctly matched.
function SyntheticStaffDivision({ employees, selection, onSelect }: { employees: HrEmployee[]; selection: HrOrgSelection; onSelect: (selection: HrOrgSelection) => void }) {
  const { createDivision } = useHrOrg();
  const [open, setOpen] = useState(true);
  const [materializing, setMaterializing] = useState(false);
  const active = selection.type === "division" && selection.division === STAFF_DIVISION;

  return (
    <div className="ms-2">
      <div
        className={`group flex items-center rounded-md transition ${
          active ? "bg-gradient-to-r from-brand-50 to-brand-100/60 shadow-sm" : "hover:bg-slate-100"
        }`}
      >
        <button
          onClick={() => {
            setOpen((o) => !o);
            onSelect({ type: "division", division: STAFF_DIVISION });
          }}
          className={`flex flex-1 items-center gap-1.5 px-2 py-1.5 text-start font-medium ${
            active ? "text-brand-700" : "text-slate-700"
          }`}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} className="rtl:-scale-x-100" />}
          <Users size={14} className={active ? "text-brand-600" : "text-slate-400"} />
          <span className="truncate">{STAFF_DIVISION}</span>
        </button>
        <RowActionButton
          title="Make this a real, editable/renameable division"
          onClick={async (e) => {
            e.stopPropagation();
            setMaterializing(true);
            try {
              await createDivision(STAFF_DIVISION);
            } finally {
              setMaterializing(false);
            }
          }}
        >
          <Pencil size={12} className={materializing ? "animate-pulse" : ""} />
        </RowActionButton>
      </div>
      {open && (
        <div className="ms-3 border-s border-slate-200 ps-2">
          <DivisionEmployeeTitles division={STAFF_DIVISION} employees={employees} selection={selection} onSelect={onSelect} />
        </div>
      )}
    </div>
  );
}

export default function HrEmployeeTree({
  collapsed = false,
  onToggleCollapsed,
}: {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const { tree, selection, setSelection, createDivision } = useHrOrg();
  const { employees } = useHrEmployees();
  const { subjects, refresh: refreshSubjects } = useSubjects();
  const { selectedSchool } = useSchools();
  const [addingDivision, setAddingDivision] = useState(false);
  const hasStaffDivision = tree.some((d) => d.division.trim() === STAFF_DIVISION);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
          <Building2 size={11} />
        </span>
        {!collapsed && <span className="flex-1 truncate">Employees</span>}
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand panel" : "Collapse panel"}
          className="ms-auto shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
        >
          <Menu size={14} />
        </button>
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-1.5 py-2 text-sm">
          <div className="group mb-1 flex items-center rounded-md">
            <button
              onClick={() => setSelection({ type: "all" })}
              className={`flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-start font-medium transition ${
                selection.type === "all"
                  ? "bg-gradient-to-r from-brand-50 to-brand-100/60 text-brand-700 shadow-sm"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Building2 size={15} className="text-brand-600" />
              <span className="truncate">{selectedSchool?.name ?? "My School"}</span>
            </button>
            <button
              type="button"
              onClick={() => setAddingDivision(true)}
              title="Add division"
              className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
            >
              <Plus size={14} />
            </button>
          </div>

          {addingDivision && (
            <AddInline
              placeholder="New division name"
              onAdd={async (name) => {
                await createDivision(name);
              }}
              onDone={() => setAddingDivision(false)}
            />
          )}

          {tree.map((division) => (
            <DivisionRow
              key={division.id}
              division={division}
              employees={employees}
              subjects={subjects}
              refreshSubjects={refreshSubjects}
              selection={selection}
              onSelect={setSelection}
            />
          ))}
          {!hasStaffDivision && (
            <SyntheticStaffDivision
              employees={employees.filter((e) => (e.division ?? "").trim() === STAFF_DIVISION)}
              selection={selection}
              onSelect={setSelection}
            />
          )}
        </div>
      )}
    </div>
  );
}
