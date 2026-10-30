import { createElement, Fragment, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";

const STORAGE_PREFIX = "column_order:";

function loadOrder(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

// Drag a table header onto another to move that column there. Optional: a table looks and works
// as before until someone drags, and the order is remembered per table (storageKey) in this
// browser. keys are the table's columns in their default order; a column the saved order doesn't
// know yet (new, or shown conditionally) keeps its default place.
export function useColumnOrder<K extends string>(storageKey: string, keys: readonly K[]) {
  const [saved, setSaved] = useState<string[]>(() => loadOrder(storageKey));
  const [dragged, setDragged] = useState<K | null>(null);
  const [over, setOver] = useState<K | null>(null);

  useEffect(() => {
    try {
      if (saved.length) localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(saved));
      else localStorage.removeItem(STORAGE_PREFIX + storageKey);
    } catch {
      // Storage unavailable: the order just isn't remembered.
    }
  }, [storageKey, saved]);

  const keysId = keys.join("\u0000");
  const order = useMemo(() => {
    const known = saved.filter((k): k is K => (keys as readonly string[]).includes(k));
    const out = [...known];
    keys.forEach((k, i) => {
      if (out.includes(k)) return;
      // Insert after the nearest earlier default column that's already placed.
      const prev = keys.slice(0, i).reverse().find((p) => out.includes(p));
      out.splice(prev === undefined ? 0 : out.indexOf(prev) + 1, 0, k);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, keysId]);

  const move = (from: K, to: K) => {
    if (from === to) return;
    const next = order.filter((k) => k !== from);
    const toIndex = next.indexOf(to);
    // Dropping on a column further along puts the dragged one after it, otherwise before it.
    next.splice(order.indexOf(from) < order.indexOf(to) ? toIndex + 1 : toIndex, 0, from);
    // Keep saved places of columns not shown right now (e.g. another stage's subjects).
    setSaved([...next, ...saved.filter((k) => !(next as string[]).includes(k))]);
  };

  // Spread onto the <th> of column `key`.
  const headerProps = (key: K) => ({
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      e.dataTransfer.effectAllowed = "move";
      setDragged(key);
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (dragged === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (over !== key) setOver(key);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (dragged === null) return;
      e.preventDefault();
      move(dragged, key);
      setDragged(null);
      setOver(null);
    },
    onDragEnd: () => {
      setDragged(null);
      setOver(null);
    },
    "data-dragging": dragged === key || undefined,
    "data-drag-over": (over === key && dragged !== key) || undefined,
  });

  return { order, headerProps, isCustom: saved.length > 0, reset: () => setSaved([]) };
}

// A row's cells in the table's column order, for tables whose cells are written out by hand:
// orderedCells(order, { name: <td>…</td>, phone: <td>…</td> }).
export function orderedCells<K extends string>(order: readonly K[], cells: Partial<Record<K, ReactNode>>) {
  return order.map((key) => createElement(Fragment, { key }, cells[key]));
}
