import { useEffect, useState } from "react";

// step -1 moves an item toward the start (the right, in Arabic), +1 toward the end.
export function moveItem<T>(list: T[], item: T, step: -1 | 1): T[] {
  const i = list.indexOf(item);
  const j = i + step;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// Signature captions at the foot of a printout (e.g. شئون الطلاب, مدير المدرسة). They are edited
// in any print preview and remembered in this browser for the next printout.
const SIGNATURES_KEY = "print-signatures-v1";
const DEFAULT_SIGNATURES = ["شئون الطلاب", "مدير المدرسة"];

function loadSignatures(): string[] {
  try {
    const raw = localStorage.getItem(SIGNATURES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) && parsed.every((v) => typeof v === "string") ? parsed : DEFAULT_SIGNATURES;
  } catch {
    return DEFAULT_SIGNATURES;
  }
}

export function useSignatures(shownByDefault: boolean) {
  const [names, setNames] = useState<string[]>(loadSignatures);
  const [shown, setShown] = useState(shownByDefault);
  useEffect(() => {
    try {
      localStorage.setItem(SIGNATURES_KEY, JSON.stringify(names));
    } catch {
      // ignore storage failures (private browsing, quota, etc.)
    }
  }, [names]);
  return { names, setNames, shown, setShown, reset: () => setNames(DEFAULT_SIGNATURES) };
}

export type Signatures = ReturnType<typeof useSignatures>;
