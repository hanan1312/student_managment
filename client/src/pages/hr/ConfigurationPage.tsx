import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  Globe,
  MapPin,
  Landmark,
  GraduationCap,
  BookOpen,
  UserX,
  MessageSquare,
  Gift,
  Clock3,
  Award,
  AlertTriangle,
  HeartHandshake,
  Percent,
  MinusCircle,
  Clock,
  CalendarDays,
  CalendarClock,
  ShieldCheck,
  UsersRound,
  Building2,
} from "lucide-react";
import RibbonGroup, { type RibbonButtonDef } from "../../components/RibbonGroup";
import LookupListModal from "../../components/hr/LookupListModal";
import ValuedListModal from "../../components/hr/ValuedListModal";
import ShiftsListModal from "../../components/hr/ShiftsListModal";
import HolidaysListModal from "../../components/hr/HolidaysListModal";
import SchoolsSwitcherModal from "../../components/hr/SchoolsSwitcherModal";
import LeaveBalanceModal from "../../components/hr/LeaveBalanceModal";
import type { HrLookupCategory, HrValuedCategory } from "../../lib/types";

type OutletCtx = { notify: (label: string) => void };

type LookupTile = {
  kind: "lookup";
  category: HrLookupCategory;
  title: string;
  icon: RibbonButtonDef["icon"];
  perSchool?: boolean;
  withNote?: boolean;
};
type ValuedTile = {
  kind: "valued";
  category: HrValuedCategory;
  title: string;
  icon: RibbonButtonDef["icon"];
  amountLabel?: string;
};
type Tile = LookupTile | ValuedTile;

// Division/Section/Position (Job) are managed via the Employees sidebar tree instead of a
// flat catalog here — see client/src/components/hr/HrEmployeeTree.tsx.
const BASIC_DATA: LookupTile[] = [
  { kind: "lookup", category: "country", title: "Country", icon: Globe },
  { kind: "lookup", category: "area", title: "Area", icon: MapPin },
  { kind: "lookup", category: "bank", title: "Banks", icon: Landmark },
  { kind: "lookup", category: "university", title: "Universities", icon: GraduationCap },
  { kind: "lookup", category: "education", title: "Educations", icon: BookOpen },
  { kind: "lookup", category: "outside_employee", title: "Outside Employees", icon: UserX, perSchool: true },
  { kind: "lookup", category: "message", title: "Message", icon: MessageSquare, perSchool: true, withNote: true },
];

const PAYROLL_SETUP: ValuedTile[] = [
  { kind: "valued", category: "allowance", title: "Allowance", icon: Gift },
  { kind: "valued", category: "overtime", title: "Over Time", icon: Clock3 },
  { kind: "valued", category: "reward", title: "Rewards", icon: Award },
  { kind: "valued", category: "misconduct", title: "Misconduct", icon: AlertTriangle },
  { kind: "valued", category: "benefit", title: "Benefits", icon: HeartHandshake },
  { kind: "valued", category: "tax", title: "Tax", icon: Percent },
  { kind: "valued", category: "deduction", title: "Deductions", icon: MinusCircle },
];

export default function HrConfigurationPage() {
  useOutletContext<OutletCtx>();
  const navigate = useNavigate();
  const [openTile, setOpenTile] = useState<Tile | null>(null);
  const [shiftsOpen, setShiftsOpen] = useState(false);
  const [holidaysOpen, setHolidaysOpen] = useState(false);
  const [schoolsOpen, setSchoolsOpen] = useState(false);
  const [leaveBalanceOpen, setLeaveBalanceOpen] = useState(false);

  const toButtons = (tiles: Tile[]): RibbonButtonDef[] =>
    tiles.map((t) => ({ label: t.title, icon: t.icon, onClick: () => setOpenTile(t) }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm">
        <RibbonGroup caption="Basic Data" buttons={toButtons(BASIC_DATA)} />
        <RibbonGroup caption="Payroll Setup" buttons={toButtons(PAYROLL_SETUP)} />
        <RibbonGroup
          caption="Attendance Setup"
          buttons={[
            { label: "Shifts", icon: Clock, onClick: () => setShiftsOpen(true) },
            { label: "Official Holidays", icon: CalendarDays, onClick: () => setHolidaysOpen(true) },
            { label: "Leves Balance", icon: CalendarClock, onClick: () => setLeaveBalanceOpen(true) },
          ]}
        />
        <RibbonGroup
          caption="Security"
          buttons={[
            { label: "Users", icon: ShieldCheck, onClick: () => navigate("/users") },
            { label: "Group Function", icon: UsersRound, onClick: () => navigate("/users") },
          ]}
        />
        <RibbonGroup
          caption="Multi Properties"
          buttons={[{ label: "Schools", icon: Building2, onClick: () => setSchoolsOpen(true) }]}
        />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-slate-400">
        Pick a tile above to manage that catalog.
      </div>

      {openTile?.kind === "lookup" && (
        <LookupListModal
          category={openTile.category}
          title={openTile.title}
          icon={openTile.icon}
          perSchool={openTile.perSchool}
          withNote={openTile.withNote}
          onClose={() => setOpenTile(null)}
        />
      )}

      {openTile?.kind === "valued" && (
        <ValuedListModal
          category={openTile.category}
          title={openTile.title}
          icon={openTile.icon}
          amountLabel={openTile.amountLabel}
          onClose={() => setOpenTile(null)}
        />
      )}

      {shiftsOpen && <ShiftsListModal onClose={() => setShiftsOpen(false)} />}
      {holidaysOpen && <HolidaysListModal onClose={() => setHolidaysOpen(false)} />}
      {schoolsOpen && <SchoolsSwitcherModal onClose={() => setSchoolsOpen(false)} />}
      {leaveBalanceOpen && <LeaveBalanceModal onClose={() => setLeaveBalanceOpen(false)} />}
    </div>
  );
}
