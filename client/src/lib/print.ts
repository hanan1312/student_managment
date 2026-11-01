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

function loadSignatures(key: string, defaults: string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) return defaults;
    // The second default used to be مدير المدرسة; captions saved before the rename follow it.
    return parsed.map((n) => (n === "مدير المدرسة" ? "مدير الإدارة" : n));
  } catch {
    return defaults;
  }
}

// `custom` gives a printout its own captions (e.g. an official result form's), remembered under
// its own key; without it, the shared captions whose defaults are set in التحكم.
export function useSignatures(shownByDefault: boolean, custom?: { key: string; defaults: string[] }) {
  const { t } = useUiControl();
  const key = custom ? `${SIGNATURES_KEY}:${custom.key}` : SIGNATURES_KEY;
  const defaults = custom?.defaults ?? [t("print.signature1"), t("print.signature2")].filter((n) => n.trim());
  const [names, setNames] = useState<string[]>(() => loadSignatures(key, defaults));
  const [shown, setShown] = useState(shownByDefault);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(names));
    } catch {
      // ignore storage failures (private browsing, quota, etc.)
    }
  }, [key, names]);
  return { names, setNames, shown, setShown, reset: () => setNames(defaults) };
}

// الختم: an empty, labelled place for the stamp under مدير الإدارة's signature, on every printout
// with signatures. It can be dragged in the preview; where it was put is remembered in this
// browser and used for every printout.
const STAMP_KEY = "print-stamp-v1";
export type StampState = { shown: boolean; x: number; y: number };

function loadStamp(): StampState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STAMP_KEY) ?? "null") as Partial<StampState> | null;
    if (parsed && typeof parsed.x === "number" && typeof parsed.y === "number") {
      return { shown: parsed.shown !== false, x: parsed.x, y: parsed.y };
    }
  } catch {
    // fall through to the default
  }
  return { shown: true, x: 0, y: 0 };
}

let stampState: StampState | null = null;
const stampListeners = new Set<(s: StampState) => void>();

export function setStamp(update: (s: StampState) => StampState) {
  stampState = update(stampState ?? loadStamp());
  try {
    localStorage.setItem(STAMP_KEY, JSON.stringify(stampState));
  } catch {
    // ignore storage failures
  }
  stampListeners.forEach((l) => l(stampState!));
}

// Every stamp on the sheet (one per certificate) moves together.
export function useStamp(): StampState {
  const [state, setState] = useState<StampState>(() => (stampState ??= loadStamp()));
  useEffect(() => {
    stampListeners.add(setState);
    return () => {
      stampListeners.delete(setState);
    };
  }, []);
  return state;
}

// مدير الإدارة / يعتمد مدير الادارة / مدير عام الإدارة: the signature the stamp goes under.
export function isAdministrationManager(caption: string): boolean {
  const loose = caption.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/\s+/g, "");
  return loose.includes("مدير") && loose.includes("الاداره");
}

export type Signatures = ReturnType<typeof useSignatures>;
