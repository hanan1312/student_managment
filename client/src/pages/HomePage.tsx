import { useOutletContext } from "react-router-dom";
import { Briefcase, ChevronLeft, GraduationCap, type LucideIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSchools } from "../context/SchoolsContext";
import { useUiControl, welcomeText } from "../lib/uiControl";
import type { SectionKey } from "../lib/modules";
import type { LayoutContext } from "../components/DashboardLayout";

const SECTION_ICONS: Record<SectionKey, LucideIcon> = { studentsAffair: GraduationCap, hrStaff: Briefcase };

// The one value every school has, if they all share it (e.g. one إدارة for the whole app).
function shared(values: (string | null)[]): string {
  const set = new Set(values.filter((v): v is string => Boolean(v?.trim())));
  return set.size === 1 ? [...set][0] : "";
}

// The page shown after signing in: a card per section (شئون الطلاب, …) and, under them, the
// welcome text set in التحكم with the user's إدارة and مدينة.
export default function HomePage() {
  const { user } = useAuth();
  const { schools } = useSchools();
  const ui = useUiControl();
  const { sections, goToSection } = useOutletContext<LayoutContext>();

  // The user's own (المستخدمين); an account without them (e.g. the admin) takes the schools'.
  const place = {
    admin: user?.education_admin_name || shared(schools.map((s) => s.education_admin_name)),
    city: user?.city_name || shared(schools.map((s) => s.city_name)),
  };
  const welcome = welcomeText(ui.t("home.welcome"), place);

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center gap-10 px-4 py-10">
      <div className="flex w-full flex-wrap justify-center gap-5">
        {sections.map((s) => {
          const Icon = SECTION_ICONS[s.key];
          return (
            <button
              key={s.key}
              onClick={() => goToSection(s.key)}
              className="group relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-start shadow-sm sm:w-[26rem] transition hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-900/10"
            >
              <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-brand-600 via-brand-400 to-gold-400" />
              <div className="flex items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-ink-900 text-gold-300 shadow-md shadow-brand-900/20 transition-transform group-hover:scale-105">
                  <Icon size={28} />
                </span>
                <span className="flex-1 text-xl font-bold text-slate-800">{s.label}</span>
                <ChevronLeft size={20} className="text-slate-300 transition group-hover:-translate-x-1 group-hover:text-brand-600" />
              </div>
              {s.tabs.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {s.tabs.map((t) => (
                    <span key={t.key} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
                      {t.label}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {welcome && (
        <p className="max-w-3xl text-center text-2xl font-bold leading-relaxed text-ink-900 sm:text-3xl">{welcome}</p>
      )}
    </div>
  );
}
