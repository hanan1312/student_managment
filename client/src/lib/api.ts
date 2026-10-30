// Falls back to the page's own hostname (not a hardcoded "localhost") so the same build
// works whether it's opened on the server itself or from another machine on the network -
// VITE_API_URL/VITE_API_PORT can still override this for a reverse-proxied domain setup.
const API_PORT = import.meta.env.VITE_API_PORT ?? "4000";
const API_URL =
  import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:${API_PORT}/api`;
const ASSET_ORIGIN = API_URL.replace(/\/api\/?$/, "");

export function assetUrl(path: string | null | undefined) {
  if (!path) return null;
  return `${ASSET_ORIGIN}${path}`;
}

export class ApiError extends Error {
  status: number;
  // The full error body, for endpoints that send more than a message (e.g. login's
  // attemptsLeft / lockedForSeconds / mustChangePassword).
  data: Record<string, unknown>;
  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let sessionExpiredHandler: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null) {
  sessionExpiredHandler = handler;
}

async function request<T>(path: string, options: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, headers, ...rest } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // A 401 on an authenticated request means the stored token is stale/expired,
    // not that these particular credentials were wrong (that's the login endpoint,
    // which never sends a token) — force a fresh sign-in instead of leaving the
    // stale session's requests failing silently in the background.
    if (res.status === 401 && token) sessionExpiredHandler?.();
    throw new ApiError(data.error ?? "Request failed", res.status, data);
  }

  return data as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: import("./types").User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  getMe: (token: string) => request<{ user: import("./types").User }>("/auth/me", { token }),

  logout: (token: string) => request<void>("/auth/logout", { method: "POST", token }),

  changeMyPassword: (token: string, body: { currentPassword: string; newPassword: string }) =>
    request<{ ok: true }>("/auth/change-password", { method: "POST", body: JSON.stringify(body), token }),

  resetPasswordWithCurrent: (body: { username: string; currentPassword: string; newPassword: string }) =>
    request<{ ok: true }>("/auth/reset-password", { method: "POST", body: JSON.stringify(body) }),

  heartbeat: (token: string, idle: boolean) =>
    request<void>("/presence/heartbeat", { method: "POST", body: JSON.stringify({ idle }), token }),

  getPresence: (token: string) =>
    request<{ presence: import("./types").PresenceEntry[] }>("/presence", { token }),

  getActivity: (token: string, limit = 200) =>
    request<{ activity: import("./types").ActivityLogEntry[] }>(`/activity?limit=${limit}`, { token }),

  // stageIds: null = every stage (المراحل); otherwise the stages the user may manage.
  getUserPermissions: (token: string, userId: number) =>
    request<{ role: string; modules: string[]; stageIds: number[] | null }>(`/permissions/${userId}`, { token }),

  updateUserPermissions: (token: string, userId: number, modules: string[], stageIds: number[] | null) =>
    request<{ role: string; modules: string[]; stageIds: number[] | null }>(`/permissions/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ modules, stageIds }),
      token,
    }),

  getClasses: (token: string) => request<{ tree: any[]; flat: any[] }>("/classes", { token }),

  createStage: (token: string, name: string) =>
    request<{ tree: any[]; flat: any[] }>("/classes/stages", { method: "POST", body: JSON.stringify({ name }), token }),

  createLevel: (token: string, stageId: number, name: string, parentId?: number) =>
    request<{ tree: any[]; flat: any[] }>(`/classes/stages/${stageId}/levels`, {
      method: "POST",
      body: JSON.stringify({ name, parentId }),
      token,
    }),

  createClass: (token: string, levelId: number, name: string) =>
    request<{ tree: any[]; flat: any[] }>(`/classes/levels/${levelId}/classes`, {
      method: "POST",
      body: JSON.stringify({ name }),
      token,
    }),

  renameStage: (token: string, stageId: number, name: string) =>
    request<{ tree: any[]; flat: any[] }>(`/classes/stages/${stageId}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
      token,
    }),

  deleteStage: (token: string, stageId: number) =>
    request<{ tree: any[]; flat: any[] }>(`/classes/stages/${stageId}`, { method: "DELETE", token }),

  renameLevel: (token: string, levelId: number, name: string) =>
    request<{ tree: any[]; flat: any[] }>(`/classes/levels/${levelId}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
      token,
    }),

  deleteLevel: (token: string, levelId: number) =>
    request<{ tree: any[]; flat: any[] }>(`/classes/levels/${levelId}`, { method: "DELETE", token }),

  moveStage: (token: string, stageId: number, beforeId: number | null) =>
    request<{ tree: any[]; flat: any[] }>(`/classes/stages/${stageId}/position`, {
      method: "PUT",
      body: JSON.stringify({ beforeId }),
      token,
    }),

  moveLevel: (token: string, levelId: number, stageId: number, parentId: number | null, beforeId: number | null) =>
    request<{ tree: any[]; flat: any[] }>(`/classes/levels/${levelId}/position`, {
      method: "PUT",
      body: JSON.stringify({ stageId, parentId, beforeId }),
      token,
    }),

  renameClass: (token: string, classId: number, name: string) =>
    request<{ tree: any[]; flat: any[] }>(`/classes/${classId}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
      token,
    }),

  deleteClass: (token: string, classId: number) =>
    request<{ tree: any[]; flat: any[] }>(`/classes/${classId}`, { method: "DELETE", token }),

  getStudents: (
    token: string,
    params: { classId?: number; classIds?: number[]; levelIds?: number[]; q?: string } = {}
  ) => {
    const search = new URLSearchParams();
    if (params.levelIds) search.set("levelIds", params.levelIds.join(","));
    else if (params.classIds) search.set("classIds", params.classIds.join(","));
    else if (params.classId) search.set("classId", String(params.classId));
    if (params.q) search.set("q", params.q);
    const qs = search.toString();
    return request<{ students: any[]; count: number }>(`/students${qs ? `?${qs}` : ""}`, { token });
  },

  createStudent: (token: string, body: unknown) =>
    request<{ student: any }>("/students", { method: "POST", body: JSON.stringify(body), token }),

  updateStudent: (token: string, id: number, body: unknown) =>
    request<{ student: any }>(`/students/${id}`, { method: "PUT", body: JSON.stringify(body), token }),

  getStudentGrades: (token: string, id: number) =>
    request<{ grades: import("./types").StudentGrade[] }>(`/students/${id}/grades`, { token }),

  saveStudentGrades: (
    token: string,
    id: number,
    grades: { subjectId: number; score: number | null; scoreMin: number | null }[]
  ) =>
    request<{ ok: true }>(`/students/${id}/grades`, { method: "PUT", body: JSON.stringify({ grades }), token }),

  getDegreesOverview: (token: string) =>
    request<{ subjects: import("./types").SubjectDegrees[]; students: import("./types").DegreesOverviewStudent[] }>(
      "/students/degrees-overview",
      { token }
    ),

  deleteStudent: (token: string, id: number) =>
    request<void>(`/students/${id}`, { method: "DELETE", token }),

  deleteStudents: (token: string, ids: number[]) =>
    request<{ ok: true; deleted: number }>("/students", {
      method: "DELETE",
      body: JSON.stringify({ ids }),
      token,
    }),

  uploadStudentPhoto: async (token: string, studentId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/students/${studentId}/photo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error ?? "Upload failed", res.status);
    return data as { student: any };
  },

  removeStudentPhoto: (token: string, studentId: number) =>
    request<{ student: any }>(`/students/${studentId}/photo`, { method: "DELETE", token }),

  getFeeTypes: (token: string) => request<{ feeTypes: any[] }>("/finance/fee-types", { token }),

  createFeeType: (token: string, body: unknown) =>
    request<{ feeType: any }>("/finance/fee-types", { method: "POST", body: JSON.stringify(body), token }),

  updateFeeType: (token: string, id: number, body: unknown) =>
    request<{ feeType: any }>(`/finance/fee-types/${id}`, { method: "PUT", body: JSON.stringify(body), token }),

  deleteFeeType: (token: string, id: number) =>
    request<void>(`/finance/fee-types/${id}`, { method: "DELETE", token }),

  getStudentFeeItems: (token: string, studentId: number) =>
    request<{ feeTypeIds: number[] }>(`/finance/students/${studentId}/fee-items`, { token }),

  setStudentFeeItems: (token: string, studentId: number, feeTypeIds: number[]) =>
    request<{ feeTypeIds: number[] }>(`/finance/students/${studentId}/fee-items`, {
      method: "PUT",
      body: JSON.stringify({ feeTypeIds }),
      token,
    }),

  getPayments: (token: string, params: { classId?: number; studentId?: number; q?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.classId) search.set("classId", String(params.classId));
    if (params.studentId) search.set("studentId", String(params.studentId));
    if (params.q) search.set("q", params.q);
    const qs = search.toString();
    return request<{ payments: any[]; count: number; total: number }>(
      `/finance/payments${qs ? `?${qs}` : ""}`,
      { token }
    );
  },

  createPayment: (token: string, body: unknown) =>
    request<{ payment: any }>("/finance/payments", { method: "POST", body: JSON.stringify(body), token }),

  updatePayment: (token: string, id: number, body: unknown) =>
    request<{ payment: any }>(`/finance/payments/${id}`, { method: "PUT", body: JSON.stringify(body), token }),

  deletePayment: (token: string, id: number) =>
    request<void>(`/finance/payments/${id}`, { method: "DELETE", token }),

  getTimetable: (token: string, classId: number) =>
    request<{ entries: any[] }>(`/timetable?classId=${classId}`, { token }),

  createTimetableEntry: (token: string, body: unknown) =>
    request<{ entry: any }>("/timetable", { method: "POST", body: JSON.stringify(body), token }),

  updateTimetableEntry: (token: string, id: number, body: unknown) =>
    request<{ entry: any }>(`/timetable/${id}`, { method: "PUT", body: JSON.stringify(body), token }),

  deleteTimetableEntry: (token: string, id: number) =>
    request<void>(`/timetable/${id}`, { method: "DELETE", token }),

  getDailyPeriods: (token: string) =>
    request<{ periods: import("./types").DailyPeriod[] }>("/timetable/daily-periods", { token }),

  createDailyPeriod: (token: string, body: { startTime: string; endTime: string }) =>
    request<{ period: import("./types").DailyPeriod }>("/timetable/daily-periods", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateDailyPeriod: (token: string, id: number, body: { startTime?: string; endTime?: string }) =>
    request<{ period: import("./types").DailyPeriod }>(`/timetable/daily-periods/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  deleteDailyPeriod: (token: string, id: number) =>
    request<void>(`/timetable/daily-periods/${id}`, { method: "DELETE", token }),

  setDailyPeriodBreak: (token: string, body: { startTime: string; durationMinutes: number }) =>
    request<{ periods: import("./types").DailyPeriod[] }>("/timetable/daily-periods/break", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  applyPeriodDuration: (token: string, body: { periodDurationMinutes: number }) =>
    request<{ periods: import("./types").DailyPeriod[] }>("/timetable/daily-periods/apply-duration", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  getTimetableTeachers: (token: string, q?: string) =>
    request<{ teachers: import("./types").TimetableTeacher[] }>(
      `/timetable/teachers${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      { token }
    ),

  setTimetableTeacherActive: (token: string, employeeId: number, active: boolean) =>
    request<{ ok: true }>(`/timetable/teachers/${employeeId}/active`, {
      method: "PUT",
      body: JSON.stringify({ active }),
      token,
    }),

  clearTimetableTeacherOverride: (token: string, employeeId: number) =>
    request<{ ok: true }>(`/timetable/teachers/${employeeId}/active`, { method: "DELETE", token }),

  getTeacherSummary: (token: string, employeeId: number) =>
    request<import("./types").TeacherSummary>(`/timetable/teachers/${employeeId}/summary`, { token }),

  getClassTimetableOverview: (token: string) =>
    request<{ overview: import("./types").ClassTimetableOverviewRow[] }>("/timetable/overview", { token }),

  getClassTimetableStatus: (token: string, classId: number) =>
    request<import("./types").ClassTimetableStatus>(`/timetable/status/${classId}`, { token }),

  toggleClassTimetablePost: (token: string, classId: number) =>
    request<{ posted: boolean }>(`/timetable/status/${classId}/toggle`, { method: "POST", token }),

  randomFillClassTimetable: (token: string, classId: number) =>
    request<{ created: number }>(`/timetable/random/${classId}`, { method: "POST", token }),

  getSubjects: (token: string, levelId?: number) =>
    request<{ subjects: import("./types").Subject[] }>(`/subjects${levelId ? `?levelId=${levelId}` : ""}`, { token }),

  createSubject: (token: string, body: import("./types").SubjectInput) =>
    request<{ subject: import("./types").Subject }>("/subjects", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateSubject: (token: string, id: number, body: Partial<import("./types").SubjectInput>) =>
    request<{ subject: import("./types").Subject }>(`/subjects/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  deleteSubject: (token: string, id: number) => request<void>(`/subjects/${id}`, { method: "DELETE", token }),

  getConfigLookup: (token: string, category: import("./types").ConfigLookupCategory) =>
    request<{ items: import("./types").ConfigLookupItem[] }>(`/configuration/lookup/${category}`, { token }),

  createConfigLookup: (token: string, body: { category: import("./types").ConfigLookupCategory; name: string; note?: string }) =>
    request<{ item: import("./types").ConfigLookupItem }>("/configuration/lookup", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateConfigLookup: (token: string, id: number, body: { name?: string; note?: string }) =>
    request<{ item: import("./types").ConfigLookupItem }>(`/configuration/lookup/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  deleteConfigLookup: (token: string, id: number) =>
    request<void>(`/configuration/lookup/${id}`, { method: "DELETE", token }),

  getBuses: (token: string) => request<{ buses: any[] }>("/buses", { token }),

  createBus: (token: string, body: unknown) =>
    request<{ bus: any }>("/buses", { method: "POST", body: JSON.stringify(body), token }),

  updateBus: (token: string, id: number, body: unknown) =>
    request<{ bus: any }>(`/buses/${id}`, { method: "PUT", body: JSON.stringify(body), token }),

  deleteBus: (token: string, id: number) => request<void>(`/buses/${id}`, { method: "DELETE", token }),

  getBusRiders: (token: string, busId: number) =>
    request<{ students: any[] }>(`/buses/${busId}/students`, { token }),

  addBusRider: (token: string, busId: number, body: unknown) =>
    request<{ ok: true }>(`/buses/${busId}/students`, { method: "POST", body: JSON.stringify(body), token }),

  removeBusRider: (token: string, busId: number, studentId: number) =>
    request<void>(`/buses/${busId}/students/${studentId}`, { method: "DELETE", token }),

  getInventory: (token: string, params: { q?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    const qs = search.toString();
    return request<{ items: any[]; count: number }>(`/inventory${qs ? `?${qs}` : ""}`, { token });
  },

  createInventoryItem: (token: string, body: unknown) =>
    request<{ item: any }>("/inventory", { method: "POST", body: JSON.stringify(body), token }),

  updateInventoryItem: (token: string, id: number, body: unknown) =>
    request<{ item: any }>(`/inventory/${id}`, { method: "PUT", body: JSON.stringify(body), token }),

  deleteInventoryItem: (token: string, id: number) =>
    request<void>(`/inventory/${id}`, { method: "DELETE", token }),

  getUsers: (token: string) => request<{ users: any[] }>("/users", { token }),

  createUser: (token: string, body: unknown) =>
    request<{ user: any; temporaryPassword: string }>("/users", { method: "POST", body: JSON.stringify(body), token }),

  getNewUserCode: (token: string) => request<{ code: string }>("/users/new-code", { token }),

  getUserCatalog: (token: string, kind: import("./types").UserCatalogKind) =>
    request<{ items: import("./types").UserCatalogItem[] }>(`/user-catalogs/${kind}`, { token }),

  createUserCatalogItem: (
    token: string,
    kind: import("./types").UserCatalogKind,
    body: { code: string; name: string; comment?: string }
  ) =>
    request<{ items: import("./types").UserCatalogItem[] }>(`/user-catalogs/${kind}`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  deleteUserCatalogItem: (token: string, kind: import("./types").UserCatalogKind, id: number) =>
    request<{ items: import("./types").UserCatalogItem[] }>(`/user-catalogs/${kind}/${id}`, { method: "DELETE", token }),

  updateUser: (token: string, id: number, body: unknown) =>
    request<{ user: any; temporaryPassword: string | null }>(`/users/${id}`, { method: "PUT", body: JSON.stringify(body), token }),

  deleteUser: (token: string, id: number) => request<void>(`/users/${id}`, { method: "DELETE", token }),

  getStaff: (token: string, params: { q?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    const qs = search.toString();
    return request<{ staff: any[]; count: number }>(`/staff${qs ? `?${qs}` : ""}`, { token });
  },

  createStaff: (token: string, body: unknown) =>
    request<{ staff: any }>("/staff", { method: "POST", body: JSON.stringify(body), token }),

  updateStaff: (token: string, id: number, body: unknown) =>
    request<{ staff: any }>(`/staff/${id}`, { method: "PUT", body: JSON.stringify(body), token }),

  deleteStaff: (token: string, id: number) => request<void>(`/staff/${id}`, { method: "DELETE", token }),

  getSettings: (token: string) => request<{ settings: Record<string, string> }>("/settings", { token }),

  updateSettings: (token: string, body: Record<string, string>) =>
    request<{ settings: Record<string, string> }>("/settings", { method: "PUT", body: JSON.stringify(body), token }),

  updateUiControl: (token: string, value: unknown) =>
    request<{ settings: Record<string, string> }>("/settings/ui-control", {
      method: "PUT",
      body: JSON.stringify({ value }),
      token,
    }),

  getPublicSettings: () => request<{ settings: Record<string, string> }>("/settings/public"),

  uploadBranding: async (token: string, kind: "logo" | "background", file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/settings/branding/${kind}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error ?? "Upload failed", res.status);
    return data as { settings: Record<string, string> };
  },

  removeBranding: (token: string, kind: "logo" | "background") =>
    request<{ settings: Record<string, string> }>(`/settings/branding/${kind}`, { method: "DELETE", token }),

  getAttendance: (token: string, params: { classId?: number; date: string }) => {
    const search = new URLSearchParams();
    if (params.classId) search.set("classId", String(params.classId));
    search.set("date", params.date);
    return request<{ records: any[] }>(`/attendance?${search.toString()}`, { token });
  },

  saveAttendanceBulk: (token: string, date: string, entries: unknown[]) =>
    request<{ ok: true; count: number }>("/attendance/bulk", {
      method: "POST",
      body: JSON.stringify({ date, entries }),
      token,
    }),

  getNoShow: (token: string, params: { classId?: number; date: string }) => {
    const search = new URLSearchParams();
    if (params.classId) search.set("classId", String(params.classId));
    search.set("date", params.date);
    return request<{ students: any[]; count: number }>(`/attendance/no-show?${search.toString()}`, { token });
  },

  getAttendanceAnalysis: (token: string, params: { classId?: number; from: string; to: string }) => {
    const search = new URLSearchParams();
    if (params.classId) search.set("classId", String(params.classId));
    search.set("from", params.from);
    search.set("to", params.to);
    return request<{ rows: any[] }>(`/attendance/analysis?${search.toString()}`, { token });
  },

  getAdmissions: (token: string, status?: string) =>
    request<{ admissions: any[] }>(`/admissions${status ? `?status=${status}` : ""}`, { token }),

  createAdmission: (token: string, body: unknown) =>
    request<{ admission: any }>("/admissions", { method: "POST", body: JSON.stringify(body), token }),

  approveAdmission: (token: string, id: number, classId?: number) =>
    request<{ student: any }>(`/admissions/${id}/approve`, {
      method: "PUT",
      body: JSON.stringify({ classId }),
      token,
    }),

  rejectAdmission: (token: string, id: number) =>
    request<{ admission: any }>(`/admissions/${id}/reject`, { method: "PUT", token }),

  deleteAdmission: (token: string, id: number) => request<void>(`/admissions/${id}`, { method: "DELETE", token }),

  getSchools: (token: string) => request<{ schools: import("./types").School[] }>("/schools", { token }),

  createSchool: (token: string, body: import("./types").SchoolInput) =>
    request<{ school: import("./types").School }>("/schools", { method: "POST", body: JSON.stringify(body), token }),

  updateSchool: (token: string, id: number, body: Partial<import("./types").SchoolInput>) =>
    request<{ school: import("./types").School }>(`/schools/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  deleteSchool: (token: string, id: number) => request<void>(`/schools/${id}`, { method: "DELETE", token }),

  getHrEmployees: (token: string, params: { schoolId: number; q?: string }) => {
    const search = new URLSearchParams({ schoolId: String(params.schoolId) });
    if (params.q) search.set("q", params.q);
    return request<{ employees: import("./types").HrEmployee[]; count: number }>(
      `/hr/employees?${search.toString()}`,
      { token }
    );
  },

  createHrEmployee: (token: string, body: import("./types").HrEmployeeInput) =>
    request<{ employee: import("./types").HrEmployee }>("/hr/employees", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateHrEmployee: (token: string, id: number, body: Partial<import("./types").HrEmployeeInput>) =>
    request<{ employee: import("./types").HrEmployee }>(`/hr/employees/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  deleteHrEmployee: (token: string, id: number) => request<void>(`/hr/employees/${id}`, { method: "DELETE", token }),

  clearHrEmployeeTitles: (token: string, ids: number[]) =>
    request<{ updated: number }>("/hr/employees/clear-titles", {
      method: "POST",
      body: JSON.stringify({ ids }),
      token,
    }),

  uploadHrEmployeePhoto: async (token: string, employeeId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/hr/employees/${employeeId}/photo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error ?? "Upload failed", res.status);
    return data as { employee: import("./types").HrEmployee };
  },

  removeHrEmployeePhoto: (token: string, employeeId: number) =>
    request<{ employee: import("./types").HrEmployee }>(`/hr/employees/${employeeId}/photo`, {
      method: "DELETE",
      token,
    }),

  configureStaffUser: (token: string, employeeId: number) =>
    request<{ username: string; password: string; employee: import("./types").HrEmployee }>(
      `/hr/employees/${employeeId}/configure-staff-user`,
      { method: "POST", token }
    ),

  getHrAttendance: (token: string, params: { schoolId: number; date: string }) =>
    request<{ records: import("./types").HrAttendanceRecord[]; closed: boolean }>(
      `/hr/attendance?schoolId=${params.schoolId}&date=${params.date}`,
      { token }
    ),

  saveHrAttendanceBulk: (token: string, schoolId: number, date: string, entries: unknown[]) =>
    request<{ ok: true; count: number }>("/hr/attendance/bulk", {
      method: "POST",
      body: JSON.stringify({ schoolId, date, entries }),
      token,
    }),

  getHrAttendanceOverall: (token: string, params: { schoolId: number; from: string; to: string }) =>
    request<{ rows: import("./types").HrOverallRow[] }>(
      `/hr/attendance/overall?schoolId=${params.schoolId}&from=${params.from}&to=${params.to}`,
      { token }
    ),

  getHrDaysClosed: (token: string, schoolId: number) =>
    request<{ daysClosed: import("./types").HrDayClosed[] }>(`/hr/attendance/days-closed?schoolId=${schoolId}`, {
      token,
    }),

  closeHrDay: (token: string, schoolId: number, date: string) =>
    request<{ daysClosed: import("./types").HrDayClosed[] }>("/hr/attendance/days-closed", {
      method: "POST",
      body: JSON.stringify({ schoolId, date }),
      token,
    }),

  reopenHrDay: (token: string, id: number) =>
    request<void>(`/hr/attendance/days-closed/${id}`, { method: "DELETE", token }),

  getHrLeaveLedger: (token: string, employeeId: number) =>
    request<{ ledger: import("./types").HrLeaveEntry[] }>(`/hr/leave/${employeeId}`, { token }),

  createHrLeaveEntry: (
    token: string,
    body: {
      employeeId: number;
      schoolId: number;
      entryDate: string;
      leaveTypeId: number;
      kind: import("./types").HrLeaveKind;
      leaveStart?: string;
      leaveEnd?: string;
      count?: number;
    }
  ) => request<{ entry: import("./types").HrLeaveEntry }>("/hr/leave", { method: "POST", body: JSON.stringify(body), token }),

  deleteHrLeaveEntry: (token: string, id: number) => request<void>(`/hr/leave/${id}`, { method: "DELETE", token }),

  getHrLeaveBalances: (token: string, schoolId: number) =>
    request<{ balances: import("./types").HrLeaveBalanceRow[] }>(`/hr/leave/balances?schoolId=${schoolId}`, { token }),

  adjustHrLeaveBalance: (
    token: string,
    body: { employeeId: number; schoolId: number; leaveTypeId: number; targetBalance: number }
  ) => request<{ balance: number }>("/hr/leave/adjust-balance", { method: "POST", body: JSON.stringify(body), token }),

  getHrLookup: (token: string, category: import("./types").HrLookupCategory, schoolId?: number) =>
    request<{ items: import("./types").HrLookupItem[] }>(
      `/hr/configuration/lookup/${category}${schoolId ? `?schoolId=${schoolId}` : ""}`,
      { token }
    ),

  createHrLookup: (
    token: string,
    body: { category: import("./types").HrLookupCategory; name: string; note?: string; schoolId?: number }
  ) =>
    request<{ item: import("./types").HrLookupItem }>("/hr/configuration/lookup", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateHrLookup: (token: string, id: number, body: { name?: string; note?: string }) =>
    request<{ item: import("./types").HrLookupItem }>(`/hr/configuration/lookup/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  deleteHrLookup: (token: string, id: number) =>
    request<void>(`/hr/configuration/lookup/${id}`, { method: "DELETE", token }),

  getHrValued: (token: string, category: import("./types").HrValuedCategory, schoolId?: number) =>
    request<{ items: import("./types").HrValuedItem[] }>(
      `/hr/configuration/valued/${category}${schoolId ? `?schoolId=${schoolId}` : ""}`,
      { token }
    ),

  createHrValued: (
    token: string,
    body: {
      category: import("./types").HrValuedCategory;
      name: string;
      amount?: number;
      isPercentage?: boolean;
      schoolId?: number;
    }
  ) =>
    request<{ item: import("./types").HrValuedItem }>("/hr/configuration/valued", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateHrValued: (token: string, id: number, body: { name?: string; amount?: number; isPercentage?: boolean }) =>
    request<{ item: import("./types").HrValuedItem }>(`/hr/configuration/valued/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  deleteHrValued: (token: string, id: number) =>
    request<void>(`/hr/configuration/valued/${id}`, { method: "DELETE", token }),

  getHrShifts: (token: string, schoolId: number) =>
    request<{ shifts: import("./types").HrShift[] }>(`/hr/configuration/shifts?schoolId=${schoolId}`, { token }),

  createHrShift: (token: string, body: { schoolId: number; name: string; startTime?: string; endTime?: string }) =>
    request<{ shift: import("./types").HrShift }>("/hr/configuration/shifts", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateHrShift: (token: string, id: number, body: { name?: string; startTime?: string; endTime?: string }) =>
    request<{ shift: import("./types").HrShift }>(`/hr/configuration/shifts/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  deleteHrShift: (token: string, id: number) =>
    request<void>(`/hr/configuration/shifts/${id}`, { method: "DELETE", token }),

  getHrHolidays: (token: string, schoolId: number) =>
    request<{ holidays: import("./types").HrHoliday[] }>(`/hr/configuration/holidays?schoolId=${schoolId}`, { token }),

  createHrHoliday: (token: string, body: { schoolId: number; name: string; date: string }) =>
    request<{ holiday: import("./types").HrHoliday }>("/hr/configuration/holidays", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateHrHoliday: (token: string, id: number, body: { name?: string; date?: string }) =>
    request<{ holiday: import("./types").HrHoliday }>(`/hr/configuration/holidays/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  deleteHrHoliday: (token: string, id: number) =>
    request<void>(`/hr/configuration/holidays/${id}`, { method: "DELETE", token }),

  getHrSalaryItems: (token: string, employeeId: number, category?: import("./types").HrSalaryCategory) =>
    request<{ items: import("./types").HrSalaryItem[] }>(
      `/hr/payroll/salary-items?employeeId=${employeeId}${category ? `&category=${category}` : ""}`,
      { token }
    ),

  createHrSalaryItem: (
    token: string,
    body: {
      employeeId: number;
      schoolId: number;
      category: import("./types").HrSalaryCategory;
      label: string;
      amount: number;
      isPercentage?: boolean;
      recurring?: boolean;
      oneOffMonth?: string;
    }
  ) =>
    request<{ item: import("./types").HrSalaryItem }>("/hr/payroll/salary-items", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  deleteHrSalaryItem: (token: string, id: number) =>
    request<void>(`/hr/payroll/salary-items/${id}`, { method: "DELETE", token }),

  setHrBasicSalary: (token: string, employeeId: number, basicSalary: number) =>
    request<{ employee: import("./types").HrEmployee }>(`/hr/payroll/basic-salary/${employeeId}`, {
      method: "PUT",
      body: JSON.stringify({ basicSalary }),
      token,
    }),

  getHrLeaveSummary: (token: string, schoolId: number, month: string) =>
    request<{ rows: import("./types").HrLeaveSummaryRow[] }>(
      `/hr/payroll/leave-summary?schoolId=${schoolId}&month=${month}`,
      { token }
    ),

  getHrPayrollPeriods: (token: string, schoolId: number) =>
    request<{ periods: import("./types").HrPayrollPeriod[] }>(`/hr/payroll/periods?schoolId=${schoolId}`, { token }),

  createHrPayrollPeriod: (token: string, schoolId: number, month: string) =>
    request<{ period: import("./types").HrPayrollPeriod }>("/hr/payroll/periods", {
      method: "POST",
      body: JSON.stringify({ schoolId, month }),
      token,
    }),

  loadHrPayroll: (token: string, periodId: number) =>
    request<{ lines: import("./types").HrPayrollLine[] }>(`/hr/payroll/periods/${periodId}/load`, {
      method: "POST",
      token,
    }),

  getHrPayrollLines: (token: string, periodId: number) =>
    request<{ lines: import("./types").HrPayrollLine[] }>(`/hr/payroll/periods/${periodId}/lines`, { token }),

  getHrOrgTree: (token: string, schoolId: number) =>
    request<{ tree: import("./types").HrOrgDivision[] }>(`/hr/org?schoolId=${schoolId}`, { token }),

  createHrOrgDivision: (token: string, schoolId: number, name: string) =>
    request<{ tree: import("./types").HrOrgDivision[] }>("/hr/org/divisions", {
      method: "POST",
      body: JSON.stringify({ schoolId, name }),
      token,
    }),

  renameHrOrgDivision: (token: string, id: number, name: string) =>
    request<{ tree: import("./types").HrOrgDivision[] }>(`/hr/org/divisions/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
      token,
    }),

  deleteHrOrgDivision: (token: string, id: number) =>
    request<{ tree: import("./types").HrOrgDivision[] }>(`/hr/org/divisions/${id}`, { method: "DELETE", token }),

  setHrOrgDivisionKind: (token: string, id: number, kind: import("./types").HrOrgDivisionKind) =>
    request<{ tree: import("./types").HrOrgDivision[] }>(`/hr/org/divisions/${id}`, {
      method: "PUT",
      body: JSON.stringify({ kind }),
      token,
    }),

  createHrOrgSection: (token: string, divisionId: number, name: string) =>
    request<{ tree: import("./types").HrOrgDivision[] }>(`/hr/org/divisions/${divisionId}/sections`, {
      method: "POST",
      body: JSON.stringify({ name }),
      token,
    }),

  renameHrOrgSection: (token: string, id: number, name: string) =>
    request<{ tree: import("./types").HrOrgDivision[] }>(`/hr/org/sections/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
      token,
    }),

  deleteHrOrgSection: (token: string, id: number) =>
    request<{ tree: import("./types").HrOrgDivision[] }>(`/hr/org/sections/${id}`, { method: "DELETE", token }),

  createHrOrgJob: (token: string, sectionId: number, name: string) =>
    request<{ tree: import("./types").HrOrgDivision[] }>(`/hr/org/sections/${sectionId}/jobs`, {
      method: "POST",
      body: JSON.stringify({ name }),
      token,
    }),

  renameHrOrgJob: (token: string, id: number, name: string) =>
    request<{ tree: import("./types").HrOrgDivision[] }>(`/hr/org/jobs/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
      token,
    }),

  deleteHrOrgJob: (token: string, id: number) =>
    request<{ tree: import("./types").HrOrgDivision[] }>(`/hr/org/jobs/${id}`, { method: "DELETE", token }),
};
