// An Egyptian national ID (14 digits) starts with the birth date: C YY MM DD, where C is the
// century (2 = 1900s, 3 = 2000s). E.g. 28812131900228 → 1988-12-13. Returns "YYYY-MM-DD", or ""
// when the ID isn't 14 digits or doesn't hold a real date.
export function birthdayFromNationalId(nationalId: string): string {
  const match = nationalId.trim().match(/^([23])(\d{2})(\d{2})(\d{2})\d{7}$/);
  if (!match) return "";
  const [, century, yy, mm, dd] = match;
  const year = (century === "2" ? 1900 : 2000) + Number(yy);
  const month = Number(mm);
  const day = Number(dd);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return `${year}-${mm}-${dd}`;
}
