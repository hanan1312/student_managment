import { useMemo } from "react";
import { FileText, type LucideIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { MODULES, SECTIONS, type SectionKey } from "./modules";
import { CORE_MODULE_KEYS, SHOW_EXTENDED_FEATURES } from "./features";

// The التحكم tab's configuration, kept in the `ui_control` setting (one JSON value) and edited in
// ControlPage. It hides tabs from other users, renames tabs and other texts (ribbon buttons, print
// texts), adds simple tabs of its own, and links a tab under another one (يتبع).

export type TabControl = {
  hidden?: boolean;
  // Empty or missing: the tab's own name.
  label?: string;
  // The tab this one follows: it sits right after it in the tab row and is hidden with it.
  parent?: string;
};

// A tab added in التحكم: a page with a title and free text, at /custom/<key>.
export type CustomTab = { key: string; label: string; section: SectionKey; body: string };

export type UiControl = {
  tabs: Record<string, TabControl>;
  customTabs: CustomTab[];
  texts: Record<string, string>;
};

export const EMPTY_UI_CONTROL: UiControl = { tabs: {}, customTabs: [], texts: {} };

export function parseUiControl(raw: string | undefined): UiControl {
  if (!raw) return EMPTY_UI_CONTROL;
  try {
    const parsed = JSON.parse(raw) as Partial<UiControl>;
    return {
      tabs: parsed.tabs && typeof parsed.tabs === "object" ? parsed.tabs : {},
      customTabs: Array.isArray(parsed.customTabs) ? parsed.customTabs : [],
      texts: parsed.texts && typeof parsed.texts === "object" ? parsed.texts : {},
    };
  } catch {
    return EMPTY_UI_CONTROL;
  }
}

export const TEXT_GROUPS = [
  { key: "sections", label: "الأقسام الرئيسية" },
  { key: "ribbon", label: "أزرار شريط الطلاب" },
  { key: "print", label: "نصوص الطباعة (PDF)" },
] as const;

type TextDef = { group: (typeof TEXT_GROUPS)[number]["key"]; label: string; default: string };

// Every text التحكم can change. The tab names are edited with the tabs themselves.
export const TEXTS = {
  "section.studentsAffair": { group: "sections", label: "قسم شئون الطلاب", default: "شئون الطلاب" },
  "section.hrStaff": { group: "sections", label: "قسم شئون العاملين", default: "شئون العاملين" },
  "ribbon.caption": { group: "ribbon", label: "عنوان مجموعة الأزرار", default: "الطلاب" },
  "ribbon.newStudent": { group: "ribbon", label: "زر طالب جديد", default: "طالب جديد" },
  "ribbon.import": { group: "ribbon", label: "زر الاستيراد", default: "استيراد" },
  "ribbon.export": { group: "ribbon", label: "زر التصدير", default: "تصدير" },
  "ribbon.print": { group: "ribbon", label: "زر الطباعة", default: "طباعة" },
  "ribbon.subjects": { group: "ribbon", label: "زر المواد", default: "المواد" },
  "ribbon.degrees": { group: "ribbon", label: "زر ملف الدرجات", default: "ملف الدرجات" },
  "ribbon.schools": { group: "ribbon", label: "زر إضافة مدرسة", default: "إضافة مدرسة" },
  "print.certificateTitle": { group: "print", label: "عنوان شهادة الطالب", default: "بيان نجاح طالب" },
  "print.directorate": { group: "print", label: "السطر الأول في رأس الشهادة", default: "مديرية التربية و التعليم" },
  "print.adminPrefix": { group: "print", label: "قبل اسم الإدارة في رأس الشهادة", default: "إدارة" },
  "print.studentsTitle": { group: "print", label: "عنوان كشف بيانات الطلاب", default: "كشف بيانات الطلاب" },
  "print.degreesTitle": { group: "print", label: "عنوان كشف الدرجات", default: "كشف درجات الطلاب" },
  "print.printedAt": { group: "print", label: "تاريخ الطباعة", default: "تاريخ الطباعة" },
  "print.signature1": { group: "print", label: "التوقيع الأول (الافتراضي)", default: "شئون الطلاب" },
  "print.signature2": { group: "print", label: "التوقيع الثاني (الافتراضي)", default: "مدير الإدارة" },
} satisfies Record<string, TextDef>;

export type TextKey = keyof typeof TEXTS;

export type AppTab = {
  key: string;
  // The name shown (التحكم's name if set, otherwise defaultLabel).
  label: string;
  defaultLabel: string;
  icon: LucideIcon;
  path: string;
  section: SectionKey;
  custom: boolean;
  // Shown in the tab row. المستخدمين is reached from the Students ribbon instead.
  inNav: boolean;
};

// The tabs the app has now: the modules that are switched on, then the tabs added in التحكم.
export function buildTabs(config: UiControl): AppTab[] {
  const name = (key: string, fallback: string) => config.tabs[key]?.label?.trim() || fallback;
  const builtIn = MODULES.filter((m) => SHOW_EXTENDED_FEATURES || CORE_MODULE_KEYS.includes(m.key)).map((m) => ({
    key: m.key,
    label: name(m.key, m.label),
    defaultLabel: m.label,
    icon: m.icon,
    path: m.path,
    section: m.section,
    custom: false,
    inNav: m.key !== "control",
  }));
  const custom = config.customTabs.map((c) => ({
    key: c.key,
    label: name(c.key, c.label),
    defaultLabel: c.label,
    icon: FileText,
    path: `/custom/${c.key}`,
    section: c.section,
    custom: true,
    inNav: true,
  }));
  return [...builtIn, ...custom];
}

// The chain of tabs a tab follows (its parent, the parent's parent, …). Stops on a loop.
export function ancestorsOf(config: UiControl, key: string): string[] {
  const chain: string[] = [];
  let parent = config.tabs[key]?.parent;
  while (parent && parent !== key && !chain.includes(parent)) {
    chain.push(parent);
    parent = config.tabs[parent]?.parent;
  }
  return chain;
}

// A tab is hidden when it is, or when a tab it follows is.
export function isHiddenIn(config: UiControl, key: string): boolean {
  return [key, ...ancestorsOf(config, key)].some((k) => config.tabs[k]?.hidden);
}

// Tabs in tab-row order: each tab followed by the tabs that follow it (depth 1, 2, …).
export function orderWithChildren(config: UiControl, tabs: AppTab[]): { tab: AppTab; depth: number }[] {
  const keys = new Set(tabs.map((t) => t.key));
  const parentOf = (t: AppTab) => {
    const p = config.tabs[t.key]?.parent;
    return p && keys.has(p) && !ancestorsOf(config, p).includes(t.key) && p !== t.key ? p : null;
  };
  const out: { tab: AppTab; depth: number }[] = [];
  const add = (tab: AppTab, depth: number) => {
    out.push({ tab, depth });
    for (const child of tabs.filter((c) => parentOf(c) === tab.key)) add(child, depth + 1);
  };
  for (const tab of tabs.filter((t) => !parentOf(t))) add(tab, 0);
  return out;
}

export function useUiControl() {
  const { settings } = useSettings();
  const { user } = useAuth();
  return useMemo(() => {
    const config = parseUiControl(settings.ui_control);
    const tabs = buildTabs(config);
    const byKey = new Map(tabs.map((t) => [t.key, t]));
    // Whoever manages التحكم keeps seeing hidden tabs (marked as hidden), so they can't lock
    // themselves out. Hiding is for everyone else.
    const managesControl =
      user?.role === "master" || user?.role === "admin" || Boolean(user?.modules?.includes("controlPanel"));
    const isHidden = (key: string) => isHiddenIn(config, key);
    return {
      config,
      tabs,
      managesControl,
      isHidden,
      isTabVisible: (key: string) => managesControl || !isHidden(key),
      tabLabel: (key: string) => byKey.get(key)?.label ?? MODULES.find((m) => m.key === key)?.label ?? key,
      sectionLabel: (key: SectionKey) =>
        config.texts[`section.${key}`]?.trim() || SECTIONS.find((s) => s.key === key)?.label || key,
      t: (key: TextKey) => config.texts[key]?.trim() || TEXTS[key].default,
    };
  }, [settings.ui_control, user]);
}
