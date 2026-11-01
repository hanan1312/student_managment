import {
  Users,
  Wallet,
  ShieldCheck,
  SlidersHorizontal,
  Package,
  CalendarDays,
  Bus,
  Building2,
  Settings,
  Palette,
  CalendarRange,
  type LucideIcon,
} from "lucide-react";

export type SectionKey = "studentsAffair" | "hrStaff";

export type SectionDef = {
  key: SectionKey;
  label: string;
};

export const SECTIONS: SectionDef[] = [
  { key: "studentsAffair", label: "شئون الطلاب" },
  { key: "hrStaff", label: "شئون العاملين" },
];

export type ModuleDef = {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string;
  section: SectionKey;
};

export const MODULES: ModuleDef[] = [
  { key: "students", label: "الطلاب", icon: Users, path: "/", section: "studentsAffair" },
  { key: "finance", label: "المالية", icon: Wallet, path: "/finance", section: "studentsAffair" },
  { key: "control", label: "المستخدمين", icon: ShieldCheck, path: "/users", section: "studentsAffair" },
  { key: "inventory", label: "المخازن", icon: Package, path: "/inventory", section: "studentsAffair" },
  { key: "timetable", label: "الجدول الدراسي", icon: CalendarDays, path: "/timetable", section: "studentsAffair" },
  { key: "buses", label: "الحافلات", icon: Bus, path: "/buses", section: "studentsAffair" },
  { key: "management", label: "الإدارة", icon: Building2, path: "/management", section: "hrStaff" },
  { key: "academicYears", label: "العام الدراسي", icon: CalendarRange, path: "/academic-years", section: "studentsAffair" },
  { key: "configuration", label: "الإعدادات", icon: Settings, path: "/preferences", section: "studentsAffair" },
  { key: "controlPanel", label: "التحكم", icon: SlidersHorizontal, path: "/control", section: "studentsAffair" },
  {
    key: "configurationPanel",
    label: "التهيئة",
    icon: SlidersHorizontal,
    path: "/configuration",
    section: "studentsAffair",
  },
  { key: "hrEmployees", label: "الموظفين", icon: Users, path: "/hr/employees", section: "hrStaff" },
  { key: "hrPayroll", label: "المرتبات", icon: Wallet, path: "/hr/payroll", section: "hrStaff" },
  { key: "hrConfiguration", label: "التهيئة", icon: Settings, path: "/hr/configuration", section: "hrStaff" },
  { key: "hrThemes", label: "السمات", icon: Palette, path: "/hr/themes", section: "hrStaff" },
];
