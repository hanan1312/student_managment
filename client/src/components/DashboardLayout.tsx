import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { GraduationCap, LogOut, ChevronDown, KeyRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import ClassTree from "./ClassTree";
import HrEmployeeTree from "./hr/HrEmployeeTree";
import { useSettings } from "../context/SettingsContext";
import { assetUrl } from "../lib/api";
import { MODULES, SECTIONS, type SectionKey } from "../lib/modules";
import { CORE_MODULE_KEYS, SHOW_EXTENDED_FEATURES } from "../lib/features";
import BackgroundWatermark from "./BackgroundWatermark";
import ChangePasswordModal from "./ChangePasswordModal";
import { roleLabel } from "./SystemUserModal";

function sectionForPath(pathname: string): SectionKey {
  const match = MODULES.find((m) => m.path === pathname || (m.path !== "/" && pathname.startsWith(m.path)));
  return match?.section ?? "studentsAffair";
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function StatusFooter({ userLabel, licenseTo, academicYear }: { userLabel: string; licenseTo: string; academicYear: string }) {
  const now = useClock();
  return (
    // z-[5]: above the watermark (z-0) but below the content area (z-10), so full-screen dialogs
    // opened from a page aren't covered by this bar.
    <footer className="relative z-[5] flex items-center justify-between border-t border-slate-200 bg-white/95 px-4 py-1.5 text-[11px] text-slate-500 shadow-[0_-1px_6px_rgba(15,23,42,0.04)] backdrop-blur-sm">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" />
        التاريخ: {now.toLocaleDateString()} &nbsp;|&nbsp; الوقت: {now.toLocaleTimeString()}
      </span>
      <span className="hidden sm:inline">
        مرخص لـ: {licenseTo} &middot; {academicYear} &middot; v1.0.0
      </span>
      <span>
        المستخدم: <span className="font-medium text-slate-700">{userLabel}</span>
      </span>
    </footer>
  );
}

export default function DashboardLayout() {
  const { user, logout, hasModule } = useAuth();
  const { settings } = useSettings();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>(() => sectionForPath(pathname));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountMenuRect, setAccountMenuRect] = useState<DOMRect | null>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const accountBtnRef = useRef<HTMLButtonElement>(null);
  const accountMenuPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountMenuRect) return;
    const closeIfOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (accountBtnRef.current?.contains(target) || accountMenuPanelRef.current?.contains(target)) return;
      setAccountMenuRect(null);
    };
    document.addEventListener("mousedown", closeIfOutside);
    return () => document.removeEventListener("mousedown", closeIfOutside);
  }, [accountMenuRect]);

  useEffect(() => {
    setActiveSection(sectionForPath(pathname));
  }, [pathname]);

  // "Users" (key "control") stays a real, reachable module — it's just hidden from this tab
  // row per product request, not removed from permissions/routing.
  const sectionModules = MODULES.filter(
    (m) =>
      m.section === activeSection &&
      m.key !== "control" &&
      (SHOW_EXTENDED_FEATURES || CORE_MODULE_KEYS.includes(m.key))
  );
  const visibleSections = SHOW_EXTENDED_FEATURES
    ? SECTIONS
    : SECTIONS.filter((sec) => MODULES.some((m) => m.section === sec.key && CORE_MODULE_KEYS.includes(m.key)));

  // A section tab is chrome, not a page by itself — switching it has to navigate into that
  // section's first accessible module, otherwise the module-tab row, sidebar tree and section
  // highlight all flip immediately (they just key off activeSection) while the actual page
  // content underneath keeps rendering whatever route you were last on.
  const goToSection = (key: SectionKey) => {
    setActiveSection(key);
    const target =
      MODULES.find((m) => m.section === key && hasModule(m.key)) ?? MODULES.find((m) => m.section === key);
    if (target) navigate(target.path);
  };

  const schoolName = settings.school_name || "SchoolSuite";
  const logoUrl = assetUrl(settings.logo_url);
  const backgroundUrl = assetUrl(settings.background_url);

  const notify = (label: string) => {
    setNotice(`ليس لديك صلاحية للوصول إلى "${label}". اطلب من مدير النظام منحها من صفحة المستخدمين.`);
    window.setTimeout(() => setNotice(null), 3200);
  };

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-slate-50">
      <BackgroundWatermark src={backgroundUrl} opacity={0.07} />

      <header className="relative z-10 flex items-center justify-between overflow-hidden border-b border-slate-200 bg-gradient-to-r from-ink-950 via-ink-900 to-brand-900 px-4 py-2.5 shadow-md">
        <div className="animate-float-slow pointer-events-none absolute -start-10 -top-12 h-32 w-32 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={schoolName}
              className="h-8 w-8 rounded-lg object-cover ring-1 ring-white/15 transition-transform hover:scale-105"
            />
          ) : (
            <div className="animate-gradient-pan flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-gold-300 via-gold-500 to-gold-600 text-ink-950 shadow-md shadow-black/30 transition-transform hover:scale-105">
              <GraduationCap size={18} />
            </div>
          )}
          <span className="text-base font-semibold tracking-tight text-gold-300">{schoolName}</span>
        </div>

        <div className="relative flex items-center gap-3">
          <div className="relative">
            <button
              ref={accountBtnRef}
              onClick={() =>
                setAccountMenuRect((prev) => (prev ? null : accountBtnRef.current?.getBoundingClientRect() ?? null))
              }
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-white/10"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-semibold text-white ring-2 ring-white/15">
                {user?.full_name?.slice(0, 1) ?? "?"}
              </div>
              <span className="hidden flex-col items-start leading-tight sm:flex">
                <span className="text-sm font-medium text-white">{user?.full_name}</span>
                <span className="text-[10px] text-white/50">
                  {user?.username} &middot; {roleLabel(user?.role ?? "")}
                </span>
              </span>
              <ChevronDown size={14} className="text-white/50" />
            </button>

            {accountMenuRect &&
              createPortal(
                <div
                  ref={accountMenuPanelRef}
                  // The page is right-to-left, so the account button sits at the left end of the header:
                  // open the menu from its left edge so it stays on screen.
                  style={{ position: "fixed", top: accountMenuRect.bottom + 8, left: accountMenuRect.left }}
                  className="animate-scale-in z-50 w-52 origin-top-left rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5"
                >
                  {user?.role === "master" ? (
                    <p className="px-3 py-2 text-xs text-slate-400">
                      تُغيَّر كلمة مرور الحساب الرئيسي من ملف master-account.json.
                    </p>
                  ) : (
                    <button
                      onClick={() => {
                        setAccountMenuRect(null);
                        setChangePasswordOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-brand-50 hover:text-brand-700"
                    >
                      <KeyRound size={14} />
                      تغيير كلمة المرور
                    </button>
                  )}
                </div>,
                document.body
              )}
          </div>
          <button
            onClick={() => {
              if (window.confirm(`تسجيل الخروج من ${schoolName}؟`)) logout();
            }}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70 transition hover:-translate-y-0.5 hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300 hover:shadow-sm active:translate-y-0"
          >
            <LogOut size={14} />
            تسجيل الخروج
          </button>
        </div>
      </header>

      <div className="relative z-10 flex items-center gap-1 border-b border-slate-200 bg-slate-100/80 px-3 pt-1.5 backdrop-blur-sm">
        {visibleSections.map((s) => (
          <button
            key={s.key}
            onClick={() => goToSection(s.key)}
            className={`relative shrink-0 rounded-t-lg px-4 py-1.5 text-sm font-medium transition ${
              activeSection === s.key
                ? "bg-white text-brand-700 shadow-[0_-1px_0_rgba(15,23,42,0.04)]"
                : "text-slate-500 hover:bg-white/60 hover:text-slate-700"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <nav className="relative z-10 flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur-sm">
        {sectionModules.map((m) => {
          const Icon = m.icon;
          if (!hasModule(m.key)) {
            return (
              <button
                key={m.key}
                onClick={() => notify(m.label)}
                title="ليس لديك صلاحية للوصول إلى هذا القسم"
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-slate-100"
              >
                <Icon size={15} />
                {m.label}
              </button>
            );
          }
          return (
            <NavLink
              key={m.key}
              to={m.path}
              className={({ isActive }) =>
                `group relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-md shadow-brand-600/25"
                    : "text-slate-600 hover:-translate-y-0.5 hover:bg-slate-100"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={15} className="transition-transform group-hover:scale-110" />
                  {m.label}
                  {isActive && (
                    <span className="animate-underline-in absolute inset-x-2 -bottom-[7px] h-0.5 rounded-full bg-gold-400" />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {notice && (
        <div className="animate-scale-in absolute end-4 top-16 z-20 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 shadow-lg shadow-amber-900/10">
          {notice}
        </div>
      )}

      <div className="relative z-10 flex min-h-0 flex-1">
        <aside
          className={`hidden shrink-0 border-e border-slate-200 bg-white/95 shadow-sm transition-[width] duration-200 md:block ${
            sidebarCollapsed ? "w-12" : "w-80"
          }`}
        >
          {activeSection === "hrStaff" ? (
            <HrEmployeeTree
              collapsed={sidebarCollapsed}
              onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
            />
          ) : (
            <ClassTree collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed((v) => !v)} />
          )}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div key={pathname} className="animate-fade-in h-full">
            <Outlet context={{ notify }} />
          </div>
        </main>
      </div>

      <StatusFooter
        userLabel={user?.username ?? ""}
        licenseTo={settings.license_to || schoolName}
        academicYear={settings.academic_year || ""}
      />

      {changePasswordOpen && <ChangePasswordModal onClose={() => setChangePasswordOpen(false)} />}
    </div>
  );
}
