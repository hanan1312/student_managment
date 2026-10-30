import { useEffect, useState } from "react";
import { useUiControl } from "./uiControl";

// step -1 moves an item toward the start (the right, in Arabic), +1 toward the end.
export function moveItem<T>(list: T[], item: T, step: -1 | 1): T[] {
  const i = list.indexOf(item);
  const j = i + step;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// Signature captions at the foot of a printout (e.g. شئون الطلاب, مدير الإدارة). They are edited
// in any print preview and remembered in this browser for the next printout. The defaults are set
// in التحكم.
const SIGNATURES_KEY = "print-signatures-v1";

function loadSignatures(defaults: string[]): string[] {
  try {
    const raw = localStorage.getItem(SIGNATURES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) return defaults;
    // The second default used to be مدير المدرسة; captions saved before the rename follow it.
    return parsed.map((n) => (n === "مدير المدرسة" ? "مدير الإدارة" : n));
  } catch {
    return defaults;
  }
}

export function useSignatures(shownByDefault: boolean) {
  const { t } = useUiControl();
  const defaults = [t("print.signature1"), t("print.signature2")].filter((n) => n.trim());
  const [names, setNames] = useState<string[]>(() => loadSignatures(defaults));
  const [shown, setShown] = useState(shownByDefault);
  useEffect(() => {
    try {
      localStorage.setItem(SIGNATURES_KEY, JSON.stringify(names));
    } catch {
      // ignore storage failures (private browsing, quota, etc.)
    }
  }, [names]);
  return { names, setNames, shown, setShown, reset: () => setNames(defaults) };
}

export type Signatures = ReturnType<typeof useSignatures>;
