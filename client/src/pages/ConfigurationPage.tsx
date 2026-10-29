import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  Layers,
  Rows3,
  GraduationCap,
  Globe,
  Flag,
  AlertTriangle,
  BookOpen,
  MapPin,
  Languages,
  MapPinned,
  Tags,
  Wallet,
  ReceiptText,
  Percent,
  Lock,
  TrendingDown,
  TrendingUp,
  Landmark,
  Building2,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Repeat,
} from "lucide-react";
import RibbonGroup, { type RibbonButtonDef } from "../components/RibbonGroup";
import ConfigLookupListModal from "../components/ConfigLookupListModal";
import FeeTypesModal from "../components/FeeTypesModal";
import type { ConfigLookupCategory } from "../lib/types";

type OutletCtx = { notify: (label: string) => void };

type LookupTile = { kind: "lookup"; category: ConfigLookupCategory; title: string; icon: RibbonButtonDef["icon"] };
type Tile = LookupTile;

const GENERAL: LookupTile[] = [
  { kind: "lookup", category: "country", title: "Country", icon: Globe },
  { kind: "lookup", category: "nationality", title: "Nationality", icon: Flag },
  { kind: "lookup", category: "warning", title: "Warnings", icon: AlertTriangle },
  { kind: "lookup", category: "course", title: "Course", icon: BookOpen },
  { kind: "lookup", category: "area", title: "Area", icon: MapPin },
  { kind: "lookup", category: "second_lang", title: "Second Lang", icon: Languages },
  { kind: "lookup", category: "district", title: "District", icon: MapPinned },
  { kind: "lookup", category: "education", title: "Education", icon: GraduationCap },
  { kind: "lookup", category: "student_category", title: "Category", icon: Tags },
];

const ACCOUNTING: LookupTile[] = [
  { kind: "lookup", category: "expense_level", title: "Expense Levels", icon: TrendingDown },
  { kind: "lookup", category: "revenue_level", title: "Revenue Levels", icon: TrendingUp },
];

const MINISTRY: LookupTile[] = [{ kind: "lookup", category: "ministry", title: "Ministry", icon: Landmark }];

export default function ConfigurationPage() {
  useOutletContext<OutletCtx>();
  const navigate = useNavigate();
  const [openTile, setOpenTile] = useState<Tile | null>(null);
  const [feeTypesOpen, setFeeTypesOpen] = useState(false);
  const [note, setNote] = useState(
    "Pick a tile above to manage that catalog. Divisions, Sections and Classes are managed from the class tree in the sidebar."
  );

  // DashboardLayout's notify() is a permission-denial toast ("you don't have access to X") —
  // wrong wording for these tiles, which the user *can* access but that aren't built out yet
  // (or live elsewhere), so this page keeps its own inline note instead.
  const say = (message: string) => setNote(message);

  const toButtons = (tiles: Tile[]): RibbonButtonDef[] =>
    tiles.map((t) => ({ label: t.title, icon: t.icon, onClick: () => setOpenTile(t) }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm">
        <RibbonGroup
          caption="School Hierarchy"
          buttons={[
            {
              label: "Divisions",
              icon: Layers,
              onClick: () => say("Manage Divisions from the class tree in the sidebar."),
            },
            {
              label: "Sections",
              icon: Rows3,
              onClick: () => say("Manage Sections from the class tree in the sidebar."),
            },
            {
              label: "Class",
              icon: GraduationCap,
              onClick: () => say("Manage Classes from the class tree in the sidebar."),
            },
          ]}
        />
        <RibbonGroup caption="General" buttons={toButtons(GENERAL)} />
        <RibbonGroup
          caption="Control"
          buttons={[
            { label: "Fees Items", icon: Wallet, onClick: () => setFeeTypesOpen(true) },
            { label: "Fees Items Details", icon: ReceiptText, onClick: () => say("Fees Items Details is coming soon.") },
            {
              label: "Staff Discount Percentage",
              icon: Percent,
              onClick: () => say("Staff Discount Percentage is coming soon."),
            },
            { label: "Lock Unpaid", icon: Lock, onClick: () => say("Lock Unpaid is coming soon.") },
          ]}
        />
        <RibbonGroup caption="Accounting" buttons={toButtons(ACCOUNTING)} />
        <RibbonGroup
          caption="Ministry - Schools"
          buttons={[
            ...toButtons(MINISTRY),
            { label: "Schools", icon: Building2, onClick: () => say("Schools is coming soon.") },
          ]}
        />
        <RibbonGroup
          caption="Security Map"
          buttons={[
            { label: "Users", icon: ShieldCheck, onClick: () => navigate("/users") },
            { label: "Security Management", icon: ShieldAlert, onClick: () => navigate("/users") },
            { label: "User's Password", icon: KeyRound, onClick: () => navigate("/users") },
            { label: "Language", icon: Languages, onClick: () => say("Language is coming soon.") },
            { label: "Move Grades", icon: Repeat, onClick: () => say("Move Grades is coming soon.") },
          ]}
        />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-slate-400">{note}</div>

      {openTile?.kind === "lookup" && (
        <ConfigLookupListModal
          category={openTile.category}
          title={openTile.title}
          icon={openTile.icon}
          onClose={() => setOpenTile(null)}
        />
      )}

      {feeTypesOpen && <FeeTypesModal onClose={() => setFeeTypesOpen(false)} />}
    </div>
  );
}
