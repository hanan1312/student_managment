import { useState } from "react";
import { flushSync } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { Printer, X, GraduationCap, User } from "lucide-react";
import { useSettings } from "../context/SettingsContext";
import { assetUrl } from "../lib/api";
import { studentDisplayId } from "../lib/studentId";
import type { ClassStage, Student } from "../lib/types";

type Props = {
  students: Student[];
  tree?: ClassStage[];
  onClose: () => void;
};

function resolveClassName(tree: ClassStage[] | undefined, classId: number | null): string | null {
  if (!tree || classId == null) return null;
  for (const stage of tree) {
    for (const level of stage.levels) {
      const found = level.classes.find((c) => c.id === classId);
      if (found) return found.className;
    }
  }
  return null;
}

function CardField({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex gap-2 text-[15px] leading-tight">
      <span className="w-14 shrink-0 font-semibold text-gold-400">{label}</span>
      <span className="min-w-0 truncate font-medium text-gold-300" dir="auto">
        {value || "—"}
      </span>
    </p>
  );
}

function IdCard({
  student,
  schoolName,
  logoUrl,
  tree,
  onPrintOne,
}: {
  student: Student;
  schoolName: string;
  logoUrl: string | null;
  tree?: ClassStage[];
  onPrintOne: (id: number) => void;
}) {
  const idValue = studentDisplayId(student);
  const photoUrl = assetUrl(student.photo_url);
  const className = resolveClassName(tree, student.class_id);

  return (
    <div
      className="id-card group relative overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/20"
      style={{
        aspectRatio: "1.586",
        breakInside: "avoid",
        background: "linear-gradient(135deg, var(--color-navy-900), var(--color-navy-800) 55%, var(--color-navy-950))",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent 0 16px, var(--color-gold-500) 16px 17.5px, transparent 17.5px 38px)",
          maskImage: "linear-gradient(to bottom left, black, transparent 45%), linear-gradient(to top right, black, transparent 45%)",
          WebkitMaskImage:
            "linear-gradient(to bottom left, black, transparent 45%), linear-gradient(to top right, black, transparent 45%)",
        }}
      />

      <button
        type="button"
        onClick={() => onPrintOne(student.id)}
        title="Print this card"
        className="print-hidden absolute end-2 top-2 z-10 rounded-lg bg-white/10 p-1.5 text-white/70 opacity-0 backdrop-blur-sm transition hover:bg-white/20 hover:text-white group-hover:opacity-100"
      >
        <Printer size={13} />
      </button>

      <div className="relative flex h-full flex-col justify-between p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-1 flex-col items-center pt-0.5 text-center">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/10 ring-2 ring-gold-400">
              {logoUrl ? (
                <img src={logoUrl} alt={schoolName} className="h-full w-full object-cover" />
              ) : (
                <GraduationCap size={18} className="text-gold-300" />
              )}
            </div>
            <p className="mt-1 truncate text-[13px] font-extrabold uppercase tracking-wide text-gold-300">
              {schoolName}
            </p>
            <p className="text-[7px] uppercase tracking-[0.25em] text-gold-400/70">Student ID Card</p>
          </div>

          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-gold-400 bg-white">
            {photoUrl ? (
              <img src={photoUrl} alt={student.name} className="h-full w-full object-cover" />
            ) : (
              <User size={22} className="text-slate-300" />
            )}
          </div>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <CardField label="Name" value={student.name} />
            <CardField label="Grade" value={student.section ?? ""} />
            <CardField label="Class" value={className ?? student.division ?? ""} />
            <CardField label="Id" value={idValue} />
          </div>
          <div className="shrink-0 rounded bg-white p-0.5">
            <QRCodeSVG value={idValue} size={40} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudentCardsModal({ students, tree, onClose }: Props) {
  const { settings } = useSettings();
  const schoolName = settings.school_name || "SchoolSuite";
  const logoUrl = assetUrl(settings.logo_url);
  const [singlePrintId, setSinglePrintId] = useState<number | null>(null);

  const printOne = (id: number) => {
    flushSync(() => setSinglePrintId(id));
    window.print();
    flushSync(() => setSinglePrintId(null));
  };

  const visibleStudents = singlePrintId ? students.filter((s) => s.id === singlePrintId) : students;

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="print-hidden flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">ID Cards ({students.length})</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => window.print()}
              disabled={students.length === 0}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              <Printer size={14} />
              Print all
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="print-area overflow-y-auto bg-slate-100 px-5 py-4">
          {students.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No students in the current view to print cards for.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {visibleStudents.map((s) => (
                <IdCard key={s.id} student={s} schoolName={schoolName} logoUrl={logoUrl} tree={tree} onPrintOne={printOne} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
