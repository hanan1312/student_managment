export function isExcelFile(file: File) {
  return /\.(xlsx|xls)$/i.test(file.name);
}

export async function parseExcelFile(file: File): Promise<Record<string, string>[]> {
  const XLSX = await import("xlsx");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          resolve([]);
          return;
        }
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
        resolve(
          rows.map((row) => {
            const obj: Record<string, string> = {};
            for (const [key, value] of Object.entries(row)) {
              obj[key.trim()] = value == null ? "" : String(value).trim();
            }
            return obj;
          })
        );
      } catch {
        reject(new Error("Could not read that Excel file. Make sure it's a valid .xlsx or .xls file."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsArrayBuffer(file);
  });
}

export async function downloadExcel(filename: string, headers: string[], rows: Record<string, string | number>[]) {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  XLSX.utils.sheet_add_aoa(worksheet, [headers], { origin: "A1" });
  worksheet["!cols"] = headers.map((h) => ({
    wch: Math.min(40, Math.max(10, h.length + 4)),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
