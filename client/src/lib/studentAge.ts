// Age is measured on 1 October of the year after the academic year's first year: the "2027" of
// the Preferences "Academic year" setting "2026 / 2027" (also for "2026" alone). Without a set
// year, the year after the current one.
export function ageReferenceDate(academicYear: string | undefined): Date {
  const year = Number(academicYear?.match(/\d{4}/)?.[0]) || new Date().getFullYear();
  return new Date(year + 1, 9, 1);
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
