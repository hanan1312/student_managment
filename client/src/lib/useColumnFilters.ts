import { useMemo, useState } from "react";
import type { FilterOption } from "../components/ColumnFilterMenu";

// Generic per-column filter state + the "distinct values, scoped to every OTHER active
// filter" computation the Students table pioneered — factored out so any row/column-key
// shaped table can filter the same way instead of reimplementing this each time.
export function useColumnFilters<Row, Key extends string>(rows: Row[], getValue: (row: Row, key: Key) => string) {
  const [columnFilters, setColumnFilters] = useState<Partial<Record<Key, Set<string>>>>({});

  const filteredRows = useMemo(() => {
    const active = Object.entries(columnFilters) as [Key, Set<string>][];
    if (active.length === 0) return rows;
    return rows.filter((row) => active.every(([key, set]) => set.has(getValue(row, key) || "(Blank)")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columnFilters]);

  const optionsFor = (key: Key): FilterOption[] => {
    const otherFilters = Object.entries(columnFilters).filter(([k]) => k !== key) as [Key, Set<string>][];
    const scoped = otherFilters.length
      ? rows.filter((row) => otherFilters.every(([k, set]) => set.has(getValue(row, k) || "(Blank)")))
      : rows;
    const counts = new Map<string, number>();
    for (const row of scoped) {
      const val = getValue(row, key) || "(Blank)";
      counts.set(val, (counts.get(val) ?? 0) + 1);
    }
    return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value));
  };

  const setFilter = (key: Key, next: Set<string> | null) =>
    setColumnFilters((prev) => {
      const copy = { ...prev };
      if (next === null) delete copy[key];
      else copy[key] = next;
      return copy;
    });

  const hasFilter = (key: Key) => Boolean(columnFilters[key]);

  return { columnFilters, filteredRows, optionsFor, setFilter, hasFilter };
}
