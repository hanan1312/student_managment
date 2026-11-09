import { useOutletContext } from "react-router-dom";
import { ArrowLeft, Briefcase, CalendarDays, GraduationCap, type LucideIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSchools } from "../context/SchoolsContext";
import { useSettings } from "../context/SettingsContext";
import { assetUrl } from "../lib/api";
import { useUiControl, welcomeSegments } from "../lib/uiControl";
import type { SectionKey } from "../lib/modules";
import type { LayoutContext } from "../components/DashboardLayout";

const SECTION_LOOK: Record<SectionKey, { icon: LucideIcon; caption: string }> = {
  studentsAffair: { icon: GraduationCap, caption: "الطلاب، المواد، الدرجات والشهادات" },
  hrStaff: { icon: Briefcase, caption: "الموظفون والمرتبات" },
};

// Delay between the welcome text's words, and when the cards start rising after it.
const WORD_STEP_MS = 110;

// The one value every school has, if they all share it (e.g. one إدارة for the whole app).
function shared(values: (string | null)[]): string {
  const set = new Set(values.filter((v): v is string => Boolean(v?.trim())));
  return set.size === 1 ? [...set][0] : "";
}

// The page shown after signing in: a banner with the welcome text set in التحكم (the user's
// إدارة and مدينة filled in, shown word by word) and a card per section (شئون الطلاب, …).
export default function HomePage() {
  const { user } = useAuth();
  const { schools } = useSchools();
  const { settings } = useSettings();
  const ui = useUiControl();
  const { sections, goToSection } = useOutletContext<LayoutContext>();

  // The user's own (المستخدمين); an account without them (e.g. the admin) takes the schools'.
  const place = {
    admin: user?.education_admin_name || shared(schools.map((s) => s.education_admin_name)),
    city: user?.city_name || shared(schools.map((s) => s.city_name)),
  };
  // Words in order, each knowing whether it came from {الإدارة} / {المدينة}.
  const words = welcomeSegments(ui.t("home.welcome"), place).flatMap((seg) =>
    seg.text
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => ({ word: w, highlight: seg.highlight }))
  );
  const textDone = words.length * WORD_STEP_MS + 300;

  const logoUrl = assetUrl(settings.logo_url);
  const today = new Date().toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col justify-center gap-8 px-4 py-8 sm:px-6">
      <section className="animate-rise-in relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-950 via-brand-900 to-ink-900 px-6 py-12 text-center shadow-2xl shadow-brand-900/30 ring-1 ring-white/10 sm:px-12 sm:py-16">
        {/* Soft moving lights and a faint dot grid behind the text. */}
        <div className="animate-float-slow pointer-events-none absolute -end-24 -top-24 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="animate-float-slower pointer-events-none absolute -bottom-28 -start-20 h-80 w-80 rounded-full bg-gold-500/15 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "22px 22px" }}
        />

        <div className="relative flex flex-col items-center gap-6">
          {logoUrl && (
            <span className="animate-scale-in relative">
              <span className="animate-glow-pulse absolute -inset-3 rounded-full bg-gold-400/25 blur-xl" />
              <img
                src={logoUrl}
                alt=""
                className="relative h-24 w-24 rounded-full bg-white object-contain p-1.5 shadow-xl ring-4 ring-gold-400/40 sm:h-28 sm:w-28"
              />
            </span>
          )}

          {settings.school_name && (
            <p className="animate-fade-in text-sm font-medium tracking-wide text-gold-300/90">{settings.school_name}</p>
          )}

          {words.length > 0 && (
            <h1 className="max-w-4xl text-3xl font-extrabold leading-[1.6] text-white sm:text-4xl lg:text-5xl lg:leading-[1.5]">
              {words.map((w, i) => (
                <span key={i} className="animate-word-in" style={{ animationDelay: `${300 + i * WORD_STEP_MS}ms` }}>
                  {w.highlight ? (
                    <span className="animate-shimmer bg-gradient-to-l from-gold-300 via-white to-gold-400 bg-clip-text text-transparent">
                      {w.word}
                    </span>
                  ) : (
                    w.word
                  )}
                  {i < words.length - 1 && " "}
                </span>
              ))}
            </h1>
          )}

          <span
            className="animate-line-grow h-1 w-40 origin-center rounded-full bg-gradient-to-l from-transparent via-gold-400 to-transparent"
            style={{ animationDelay: `${textDone}ms` }}
          />

          <div
            className="animate-fade-in flex flex-wrap items-center justify-center gap-2 text-xs text-white/70"
            style={{ animationDelay: `${textDone + 150}ms` }}
          >
            {user?.full_name && (
              <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">مرحبًا، {user.full_name}</span>
            )}
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
              <CalendarDays size={13} />
              {today}
            </span>
            {settings.academic_year && (
              <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                العام الدراسي {settings.academic_year}
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-center gap-5">
        {sections.map((s, i) => {
          const look = SECTION_LOOK[s.key];
          const Icon = look.icon;
          return (
            <button
              key={s.key}
              onClick={() => goToSection(s.key)}
              style={{ animationDelay: `${Math.min(textDone, 1200) + i * 120}ms` }}
              className="animate-rise-in group relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white/90 p-6 text-start shadow-sm backdrop-blur transition duration-300 hover:-translate-y-1.5 hover:border-brand-200 hover:shadow-2xl hover:shadow-brand-900/15 sm:w-[28rem]"
            >
              <span className="absolute inset-x-0 top-0 h-1 origin-right scale-x-0 bg-gradient-to-l from-brand-600 via-brand-400 to-gold-400 transition-transform duration-500 group-hover:scale-x-100" />
              <span className="pointer-events-none absolute -end-10 -top-10 h-32 w-32 rounded-full bg-brand-100/60 blur-2xl transition-opacity duration-300 group-hover:opacity-100 sm:opacity-0" />
              <div className="relative flex items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-ink-900 text-gold-300 shadow-lg shadow-brand-900/25 transition-transform duration-300 group-hover:rotate-[-6deg] group-hover:scale-110">
                  <Icon size={28} />
                </span>
                <span className="flex-1">
                  <span className="block text-xl font-bold text-slate-800">{s.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-400">{look.caption}</span>
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition duration-300 group-hover:bg-brand-600 group-hover:text-white">
                  <ArrowLeft size={18} className="transition-transform duration-300 group-hover:-translate-x-0.5" />
                </span>
              </div>
              {s.tabs.length > 0 && (
                <div className="relative mt-5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-4">
                  {s.tabs.map((t) => (
                    <span key={t.key} className="rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-500 ring-1 ring-slate-200/70">
                      {t.label}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
