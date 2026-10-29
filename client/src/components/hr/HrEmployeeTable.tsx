import { useEffect, useMemo, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, GripVertical, Settings2, Trash2 } from "lucide-react";
import type { HrEmployee } from "../../lib/types";
import {
  HR_EMPLOYEE_COLUMNS,
  DEFAULT_VISIBLE_HR_EMPLOYEE_COLUMNS,
  type HrEmployeeColumnKey,
} from "../../lib/hrEmployeeColumns";
import { useColumnFilters } from "../../lib/useColumnFilters";
import ManageColumnsModal, {
  loadVisibleColumnKeys,
  saveVisibleColumnKeys,
  loadColumnOrder,
  saveColumnOrder,
} from "../ManageColumnsModal";
import ColumnFilterMenu from "../ColumnFilterMenu";

const DEFAULT_COLUMN_ORDER = HR_EMPLOYEE_COLUMNS.map((c) => c.key);

// One shared employees table — columns, per-column filters and row-click-to-edit — reused by
// both the main HR Employees grid and Management's Staff-only view, so the two stay in sync
// by construction instead of by copy-paste discipline.
export default function HrEmployeeTable({
  employees,
  onRowClick,
  storageKey,
  onDelete,
  emptyLabel = "No employees yet.",
}: {
  employees: HrEmployee[];
  onRowClick: (e: HrEmployee) => void;
  storageKey: string;
  onDelete?: (e: HrEmployee) => void;
  emptyLabel?: string;
}) {
  const [manageColumnsOpen, setManageColumnsOpen] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<HrEmployeeColumnKey[]>(() =>
    loadVisibleColumnKeys(storageKey, DEFAULT_VISIBLE_HR_EMPLOYEE_COLUMNS)
  );
  const [columnOrder, setColumnOrder] = useState<HrEmployeeColumnKey[]>(() =>
    loadColumnOrder(storageKey, DEFAULT_COLUMN_ORDER)
  );
  const [draggedKey, setDraggedKey] = useState<HrEmployeeColumnKey | null>(null);
  const [dragOverKey, setDragOverKey] = useState<HrEmployeeColumnKey | null>(null);
  const [openFilterKey, setOpenFilterKey] = useState<HrEmployeeColumnKey | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  useEffect(() => saveVisibleColumnKeys(storageKey, visibleKeys), [storageKey, visibleKeys]);
  useEffect(() => saveColumnOrder(storageKey, columnOrder), [storageKey, columnOrder]);

  const visibleColumnSet = useMemo(() => new Set(visibleKeys), [visibleKeys]);
  const columnMap = useMemo(() => new Map(HR_EMPLOYEE_COLUMNS.map((c) => [c.key, c])), []);
  const orderedVisibleColumns = useMemo(
    () => columnOrder.map((k) => columnMap.get(k)).filter((c): c is (typeof HR_EMPLOYEE_COLUMNS)[number] => !!c && visibleColumnSet.has(c.key)),
    [columnOrder, columnMap, visibleColumnSet]
  );
  const toggleColumn = (key: HrEmployeeColumnKey) =>
    setVisibleKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const resetColumns = () => {
    setVisibleKeys(DEFAULT_VISIBLE_HR_EMPLOYEE_COLUMNS);
    setColumnOrder(DEFAULT_COLUMN_ORDER);
  };
  // Drag a header to reorder columns — drop position becomes the dragged column's new slot.
  const moveColumn = (dragKey: HrEmployeeColumnKey, dropKey: HrEmployeeColumnKey) => {
    if (dragKey === dropKey) return;
    setColumnOrder((prev) => {
      const next = prev.filter((k) => k !== dragKey);
      const dropIndex = next.indexOf(dropKey);
      next.splice(dropIndex, 0, dragKey);
      return next;
    });
  };
  const handleColumnDragStart = (key: HrEmployeeColumnKey) => (e: DragEvent<HTMLTableCellElement>) => {
    setDraggedKey(key);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleColumnDragOver = (key: HrEmployeeColumnKey) => (e: DragEvent<HTMLTableCellElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedKey && draggedKey !== key) setDragOverKey(key);
  };
  const handleColumnDrop = (key: HrEmployeeColumnKey) => (e: DragEvent<HTMLTableCellElement>) => {
    e.preventDefault();
    if (draggedKey) moveColumn(draggedKey, key);
    setDraggedKey(null);
    setDragOverKey(null);
  };
  const handleColumnDragEnd = () => {
    setDraggedKey(null);
    setDragOverKey(null);
  };
  const getValue = (e: HrEmployee, key: HrEmployeeColumnKey) => columnMap.get(key)?.get(e) ?? "";
  const { filteredRows, optionsFor, setFilter, hasFilter, columnFilters } = useColumnFilters(employees, getValue);

  const handleHeaderClick = (key: HrEmployeeColumnKey, e: ReactMouseEvent<HTMLButtonElement>) => {
    if (openFilterKey === key) {
      setOpenFilterKey(null);
      return;
    }
    setAnchorRect(e.currentTarget.getBoundingClientRect());
    setOpenFilterKey(key);
  };

  useEffect(() => {
    if (!openFilterKey) return;
    const closeIfOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-col-filter-popover]") || target.closest("[data-col-filter-trigger]")) return;
      setOpenFilterKey(null);
    };
    document.addEventListener("mousedown", closeIfOutside);
    return () => document.removeEventListener("mousedown", closeIfOutside);
  }, [openFilterKey]);

  const columnCount = orderedVisibleColumns.length + 1 + (onDelete ? 1 : 0);

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          onClick={() => setManageColumnsOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
        >
          <Settings2 size={13} />
          Columns
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">#</th>
              {orderedVisibleColumns.map((col) => (
                <th
                  key={col.key}
                  draggable
                  onDragStart={handleColumnDragStart(col.key)}
                  onDragOver={handleColumnDragOver(col.key)}
                  onDrop={handleColumnDrop(col.key)}
                  onDragEnd={handleColumnDragEnd}
                  className={`whitespace-nowrap px-3 py-2 transition ${draggedKey === col.key ? "opacity-40" : ""} ${
                    dragOverKey === col.key ? "bg-brand-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <GripVertical size={12} className="shrink-0 cursor-grab text-slate-300 active:cursor-grabbing" />
                    <button
                      type="button"
                      data-col-filter-trigger
                      onClick={(e) => handleHeaderClick(col.key, e)}
                      className={`-mx-1 flex items-center gap-1 rounded px-1 py-0.5 uppercase transition hover:bg-slate-100 ${
                        hasFilter(col.key) ? "text-brand-700" : ""
                      }`}
                    >
                      {col.label}
                      <ChevronDown size={12} className={hasFilter(col.key) ? "text-brand-600" : "text-slate-400"} />
                    </button>
                  </div>
                </th>
              ))}
              {onDelete && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-3 py-6 text-center text-slate-400">
                  {emptyLabel}
                </td>
              </tr>
            )}
            {filteredRows.map((e) => (
              <tr key={e.id} onClick={() => onRowClick(e)} className="cursor-pointer hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-400">{e.id}</td>
                {orderedVisibleColumns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 text-slate-500 ${col.key === "name" ? "font-medium text-slate-700" : ""}`}
                  >
                    {col.get(e) || "—"}
                  </td>
                ))}
                {onDelete && (
                  <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex justify-end">
                      <button onClick={() => onDelete(e)} className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openFilterKey &&
        anchorRect &&
        createPortal(
          <ColumnFilterMenu
            anchorRect={anchorRect}
            label={columnMap.get(openFilterKey)?.label ?? ""}
            options={optionsFor(openFilterKey)}
            active={columnFilters[openFilterKey] ?? null}
            onChange={(next) => setFilter(openFilterKey, next)}
            onClose={() => setOpenFilterKey(null)}
          />,
          document.body
        )}

      {manageColumnsOpen && (
        <ManageColumnsModal
          columns={HR_EMPLOYEE_COLUMNS}
          visible={visibleColumnSet}
          onToggle={toggleColumn}
          onClose={() => setManageColumnsOpen(false)}
          onReset={resetColumns}
        />
      )}
    </div>
  );
}
