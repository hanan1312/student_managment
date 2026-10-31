// Reading values typed into imported spreadsheets.

// Arabic-Indic digits (٠-٩) and the Arabic decimal comma read as plain digits.
export function toNumber(value: string | undefined): number | null {
  const text = (value ?? "")
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace("٫", ".");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function isYes(value: string | undefined): boolean {
  return ["نعم", "yes", "y", "true", "1", "✓", "x"].includes((value ?? "").trim().toLowerCase());
}

// Names match ignoring extra spaces and the أ / إ / آ / ا spelling.
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) => (s ?? "").replace(/[أإآ]/g, "ا").replace(/\s+/g, " ").trim();
  return norm(a) !== "" && norm(a) === norm(b);
}
