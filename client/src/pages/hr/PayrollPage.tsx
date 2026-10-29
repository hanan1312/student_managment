import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Wallet,
  Gift,
  Award,
  HeartHandshake,
  Sparkles,
  GraduationCap,
  TrendingUp,
  AlertTriangle,
  MinusCircle,
  CalendarRange,
  DollarSign,
  Percent,
} from "lucide-react";
import RibbonGroup, { type RibbonButtonDef } from "../../components/RibbonGroup";
import BasicSalaryModal from "../../components/hr/BasicSalaryModal";
import SalaryItemAssignmentModal from "../../components/hr/SalaryItemAssignmentModal";
import LeaveCalculationModal from "../../components/hr/LeaveCalculationModal";
import LoadSalaryModal from "../../components/hr/LoadSalaryModal";
import type { HrSalaryCategory } from "../../lib/types";

type OutletCtx = { notify: (label: string) => void };

type AssignmentTile = { category: HrSalaryCategory; title: string; icon: RibbonButtonDef["icon"] };

export default function PayrollPage() {
  useOutletContext<OutletCtx>();
  const [basicOpen, setBasicOpen] = useState(false);
  const [assignmentTile, setAssignmentTile] = useState<AssignmentTile | null>(null);
  const [leaveCalcOpen, setLeaveCalcOpen] = useState(false);
  const [loadSalaryOpen, setLoadSalaryOpen] = useState(false);

  const additional: AssignmentTile[] = [
    { category: "allowance", title: "Allowance", icon: Gift },
    { category: "reward", title: "Rewards", icon: Award },
    { category: "benefit", title: "Benefits", icon: HeartHandshake },
    { category: "incentive", title: "Incentive", icon: Sparkles },
    { category: "teachers_club", title: "Teachers Club", icon: GraduationCap },
    { category: "increase", title: "Increase", icon: TrendingUp },
  ];

  const deduction: AssignmentTile[] = [
    { category: "misconduct", title: "Misconduct", icon: AlertTriangle },
    { category: "deduction", title: "Deduction", icon: MinusCircle },
  ];

  const taxTile: AssignmentTile = { category: "tax", title: "Tax Settlement", icon: Percent };

  const toButtons = (tiles: AssignmentTile[]): RibbonButtonDef[] =>
    tiles.map((t) => ({ label: t.title, icon: t.icon, onClick: () => setAssignmentTile(t) }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm">
        <RibbonGroup caption="Basic ..." buttons={[{ label: "Basic", icon: Wallet, onClick: () => setBasicOpen(true) }]} />
        <RibbonGroup caption="Additional" buttons={toButtons(additional)} />
        <RibbonGroup caption="Deduction" buttons={toButtons(deduction)} />
        <RibbonGroup
          caption="Salary Calculation"
          buttons={[
            { label: "Leves Calculation", icon: CalendarRange, onClick: () => setLeaveCalcOpen(true) },
            { label: "Load Salary", icon: DollarSign, onClick: () => setLoadSalaryOpen(true) },
            { label: "Tax Settlement", icon: Percent, onClick: () => setAssignmentTile(taxTile) },
          ]}
        />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-slate-400">
        Pick a tile above to manage pay components, or Load Salary to run this month's payroll.
      </div>

      {basicOpen && <BasicSalaryModal onClose={() => setBasicOpen(false)} />}
      {assignmentTile && (
        <SalaryItemAssignmentModal
          category={assignmentTile.category}
          title={assignmentTile.title}
          icon={assignmentTile.icon}
          onClose={() => setAssignmentTile(null)}
        />
      )}
      {leaveCalcOpen && <LeaveCalculationModal onClose={() => setLeaveCalcOpen(false)} />}
      {loadSalaryOpen && <LoadSalaryModal onClose={() => setLoadSalaryOpen(false)} />}
    </div>
  );
}
