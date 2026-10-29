// Age is measured on 1 October of the academic year's first calendar year (the "2026" of the
// Preferences "Academic year" setting "2026 / 2027"), falling back to the current year.
export function ageReferenceDate(academicYear: string | undefined): Date {
  const year = Number(academicYear?.match(/\d{4}/)?.[0]) || new Date().getFullYear();
  return new Date(year, 9, 1);
}

export function ageOn(birthday: string, ref: Date): string {
  const [y, m, d] = birthday.split("-").map(Number);
  if (!y || !m || !d) return "";
  let years = ref.getFullYear() - y;
  let months = ref.getMonth() + 1 - m;
  let days = ref.getDate() - d;
  if (days < 0) {
    months -= 1;
    days += new Date(ref.getFullYear(), ref.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return "";
  return `${years} سنة، ${months} شهر، ${days} يوم`;
}
