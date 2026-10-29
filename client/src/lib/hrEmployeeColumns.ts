import type { HrEmployee } from "./types";

export type HrEmployeeColumnKey =
  | "code"
  | "name"
  | "name_en"
  | "gender"
  | "id_number"
  | "country"
  | "division"
  | "section"
  | "department"
  | "job"
  | "status"
  | "title"
  | "tel1"
  | "tel2"
  | "email"
  | "birthday"
  | "contract_from"
  | "contract_to"
  | "periods_share"
  | "staff_role";

export type HrEmployeeColumn = {
  key: HrEmployeeColumnKey;
  label: string;
  defaultVisible: boolean;
  get: (e: HrEmployee) => string;
};

// "Year of contract"_"Year of birth"_"last 4 digits of ID" — a quick-reference code shown
// right after the row index; blank pieces just collapse to "—" rather than the string "undefined".
export function employeeCode(e: HrEmployee): string {
  const contractYear = e.contract_from?.slice(0, 4) || "—";
  const birthYear = e.birthday?.slice(0, 4) || "—";
  const last4Id = e.id_number ? e.id_number.replace(/\D/g, "").slice(-4) || "—" : "—";
  return `${contractYear}_${birthYear}_${last4Id}`;
}

export const HR_EMPLOYEE_COLUMNS: HrEmployeeColumn[] = [
  { key: "code", label: "Contract_Birth_ID", defaultVisible: true, get: employeeCode },
  { key: "name", label: "Name", defaultVisible: true, get: (e) => e.name_ar },
  { key: "name_en", label: "Name (En)", defaultVisible: false, get: (e) => e.name_en ?? "" },
  { key: "gender", label: "Gender", defaultVisible: true, get: (e) => e.gender },
  { key: "id_number", label: "ID", defaultVisible: true, get: (e) => e.id_number ?? "" },
  { key: "country", label: "Country", defaultVisible: true, get: (e) => e.country ?? "" },
  { key: "division", label: "Division", defaultVisible: true, get: (e) => e.division ?? "" },
  { key: "section", label: "Section", defaultVisible: true, get: (e) => e.section ?? "" },
  { key: "department", label: "Department", defaultVisible: true, get: (e) => e.department ?? "" },
  { key: "job", label: "مرحلة", defaultVisible: true, get: (e) => e.job ?? "" },
  { key: "status", label: "Status", defaultVisible: true, get: (e) => e.status ?? "" },
  { key: "title", label: "Title", defaultVisible: true, get: (e) => e.title ?? "" },
  { key: "tel1", label: "Tel 1", defaultVisible: false, get: (e) => e.tel1 ?? "" },
  { key: "tel2", label: "Tel 2", defaultVisible: false, get: (e) => e.tel2 ?? "" },
  { key: "email", label: "Email", defaultVisible: false, get: (e) => e.email ?? "" },
  { key: "birthday", label: "Birthday", defaultVisible: false, get: (e) => e.birthday ?? "" },
  { key: "contract_from", label: "Contract From", defaultVisible: false, get: (e) => e.contract_from ?? "" },
  { key: "contract_to", label: "Contract To", defaultVisible: false, get: (e) => e.contract_to ?? "" },
  { key: "periods_share", label: "Periods Share", defaultVisible: false, get: (e) => String(e.periods_share ?? "") },
  { key: "staff_role", label: "Staff Role", defaultVisible: false, get: (e) => e.staff_role ?? "" },
];

export const DEFAULT_VISIBLE_HR_EMPLOYEE_COLUMNS: HrEmployeeColumnKey[] = HR_EMPLOYEE_COLUMNS.filter(
  (c) => c.defaultVisible
).map((c) => c.key);

export const HR_EMPLOYEE_COLUMN_MAP = new Map(HR_EMPLOYEE_COLUMNS.map((c) => [c.key, c]));
