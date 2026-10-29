import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Users, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useHrEmployees } from "../context/HrEmployeesContext";
import { api } from "../lib/api";
import type { HrEmployee, HrEmployeeInput } from "../lib/types";
import EmployeeFormModal from "../components/hr/EmployeeFormModal";
import HrEmployeeTable from "../components/hr/HrEmployeeTable";

const HR_STAFF_COLUMNS_STORAGE_KEY = "management-hr-staff-table-columns-v1";
// Matches EmployeeFormModal.tsx's synthetic "Staff" Division option — employees assigned
// there via HR & Staff show up here automatically. Editing happens back in that same HR
// Employee form (opened here read-only-from-Management's-side, on row click).
const STAFF_DIVISION = "Staff";

type OutletCtx = { notify: (label: string) => void };

export default function ManagementPage() {
  useOutletContext<OutletCtx>();
  const { token } = useAuth();
  const { employees, refresh } = useHrEmployees();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [editing, setEditing] = useState<HrEmployee | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const staffEmployees = useMemo(() => {
    const scoped = employees.filter((e) => e.division === STAFF_DIVISION);
    if (!debouncedQuery) return scoped;
    return scoped.filter(
      (e) =>
        e.name_ar.toLowerCase().includes(debouncedQuery) ||
        e.name_en?.toLowerCase().includes(debouncedQuery) ||
        e.id_number?.toLowerCase().includes(debouncedQuery) ||
        e.job?.toLowerCase().includes(debouncedQuery)
    );
  }, [employees, debouncedQuery]);

  const handleUpdate = async (input: HrEmployeeInput) => {
    if (!token || !editing) return;
    await api.updateHrEmployee(token, editing.id, input);
    setEditing(null);
    await refresh();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Users size={15} className="text-brand-500" />
          <span className="font-medium text-slate-700">Management</span>
          <span className="text-slate-300">&middot;</span>
          <span>
            {staffEmployees.length} member{staffEmployees.length === 1 ? "" : "s"}
          </span>
          <span className="text-xs text-slate-400">— employees assigned as Staff in HR &amp; Staff</span>
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
        <HrEmployeeTable
          employees={staffEmployees}
          onRowClick={setEditing}
          storageKey={HR_STAFF_COLUMNS_STORAGE_KEY}
          emptyLabel="No employees assigned as Staff yet."
        />
      </div>

      {editing && <EmployeeFormModal initial={editing} onClose={() => setEditing(null)} onSubmit={handleUpdate} />}
    </div>
  );
}
