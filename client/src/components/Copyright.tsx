// The company's copyright line, shown at the foot of every screen (the app's status footer and the
// sign-in page). Not printed.
export default function Copyright({ className = "" }: { className?: string }) {
  return (
    <span className={`print-hidden inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      <span>جميع الحقوق محفوظة</span>
      <span aria-hidden="true">·</span>
      <span dir="ltr">
        © {new Date().getFullYear()} <span className="font-semibold">TalentX Innovations</span>
      </span>
    </span>
  );
}
