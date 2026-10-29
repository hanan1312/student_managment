import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { CalendarDays, ListChecks, BookMarked, GraduationCap, Link2, Clock3 } from "lucide-react";
import { useClasses } from "../context/ClassesContext";
import RibbonGroup from "../components/RibbonGroup";
import ClassTimetableCards from "../components/timetable/ClassTimetableCards";
import ClassTimetableEditor from "../components/timetable/ClassTimetableEditor";
import SubjectSetupModal from "../components/timetable/SubjectSetupModal";
import TeachersModal from "../components/timetable/TeachersModal";
import TeachersLinkModal from "../components/timetable/TeachersLinkModal";
import DailyPeriodsModal from "../components/timetable/DailyPeriodsModal";

type OutletCtx = { notify: (label: string) => void };

type View = "idle" | "cards" | { classId: number | "blank" };

export default function TimeTablePage() {
  useOutletContext<OutletCtx>();
  const { selectedClassName } = useClasses();

  const [view, setView] = useState<View>("idle");
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [teachersOpen, setTeachersOpen] = useState(false);
  const [teachersLinkOpen, setTeachersLinkOpen] = useState(false);
  const [dailyPeriodsOpen, setDailyPeriodsOpen] = useState(false);
  const note = "Pick a ribbon icon above to manage timetables, subjects and teachers.";

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm">
        <RibbonGroup
          caption="Time Tables"
          buttons={[
            { label: "Time Table", icon: CalendarDays, onClick: () => setView("cards") },
            { label: "Time Table Management", icon: ListChecks, onClick: () => setView({ classId: "blank" }) },
          ]}
        />
        <RibbonGroup
          caption="Configuration"
          buttons={[
            { label: "Subjects", icon: BookMarked, onClick: () => setSubjectsOpen(true) },
            { label: "Teachers", icon: GraduationCap, onClick: () => setTeachersOpen(true) },
            { label: "Teachers Link", icon: Link2, onClick: () => setTeachersLinkOpen(true) },
            { label: "Daily Period", icon: Clock3, onClick: () => setDailyPeriodsOpen(true) },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="font-medium text-slate-700">My School</span>
          {selectedClassName && (
            <>
              <span>/</span>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                {selectedClassName}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-4 py-3">
        {view === "idle" && (
          <div className="flex h-full items-center justify-center text-center text-sm text-slate-400">{note}</div>
        )}
        {view === "cards" && (
          <ClassTimetableCards
            onSelectClass={(classId) => setView({ classId })}
          />
        )}
        {typeof view === "object" && (
          <ClassTimetableEditor
            initialClassId={typeof view.classId === "number" ? view.classId : null}
            onBack={() => setView("cards")}
          />
        )}
      </div>

      {subjectsOpen && <SubjectSetupModal onClose={() => setSubjectsOpen(false)} />}
      {teachersOpen && <TeachersModal onClose={() => setTeachersOpen(false)} />}
      {teachersLinkOpen && <TeachersLinkModal onClose={() => setTeachersLinkOpen(false)} />}
      {dailyPeriodsOpen && <DailyPeriodsModal onClose={() => setDailyPeriodsOpen(false)} />}
    </div>
  );
}
