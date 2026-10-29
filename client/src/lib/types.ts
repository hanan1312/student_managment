export type User = {
  id: number;
  username: string;
  full_name: string;
  role: string;
  modules: string[];
};

export type PresenceEntry = {
  username: string;
  fullName: string;
  role: string;
  status: "online" | "idle" | "offline";
  loginAt: string;
  offlineAt: string | null;
  sessionSeconds: number;
  idleSeconds: number;
};

export type ActivityLogEntry = {
  id: number;
  username: string;
  full_name: string;
  role: string;
  method: string;
  path: string;
  module: string | null;
  status_code: number;
  created_at: string;
};

export type ClassLeaf = {
  id: number;
  className: string;
};

// A stage's levels arrive flat, in tree order; parent_id rebuilds the nesting (e.g. الصف الثاني
// الثانوي > البكالوريا المصرية > الطب وعلوم الحياة). path is the names below the stage joined with
// " / "; only leaves (is_leaf) can be a student's Position.
export type ClassLevel = {
  id: number;
  level: string;
  parent_id: number | null;
  depth: number;
  path: string;
  is_leaf: boolean;
  classes: ClassLeaf[];
};

export type ClassStage = {
  id: number;
  stage: string;
  levels: ClassLevel[];
};

export type Student = {
  id: number;
  seq_no: number;
  gender: "M" | "F" | "U";
  name: string;
  name_en: string | null;
  tel1: string | null;
  tel2: string | null;
  national_id: string | null;
  moe_code: string | null;
  address: string | null;
  birthday: string | null;
  division: string | null;
  section: string | null;
  category: string | null;
  class_id: number | null;
  level_id: number | null;
  country: string | null;
  area: string | null;
  district: string | null;
  admission_date: string | null;
  student_no: string | null;
  religion: string | null;
  nationality: string | null;
  count_value: string | null;
  status: string | null;
  status_date: string | null;
  father_name: string | null;
  father_national_id: string | null;
  father_mobile: string | null;
  father_job: string | null;
  father_education: string | null;
  father_company: string | null;
  father_email: string | null;
  mother_name: string | null;
  mother_national_id: string | null;
  mother_mobile: string | null;
  mother_job: string | null;
  mother_education: string | null;
  mother_company: string | null;
  mother_email: string | null;
  notes: string | null;
  medical_condition: string | null;
  education_authority: string | null;
  special_case: number;
  integrated: number;
  uses_bus: number;
  emergency_name: string | null;
  emergency_tel: string | null;
  photo_url: string | null;
  transferred_from: string | null;
  transferred_in: string | null;
  school: string | null;
  enrollment_type: string | null;
  total_degrees?: number | null;
  percentage?: number | null;
};

export type StudentInput = {
  gender: "M" | "F" | "U";
  name: string;
  nameEn?: string;
  tel1?: string;
  tel2?: string;
  nationalId?: string;
  moeCode?: string;
  address?: string;
  birthday?: string;
  division?: string;
  section?: string;
  category?: string;
  classId?: number;
  country?: string;
  area?: string;
  district?: string;
  admissionDate?: string;
  studentNo?: string;
  religion?: string;
  nationality?: string;
  countValue?: string;
  status?: string;
  statusDate?: string;
  fatherName?: string;
  fatherNationalId?: string;
  fatherMobile?: string;
  fatherJob?: string;
  fatherEducation?: string;
  fatherCompany?: string;
  fatherEmail?: string;
  motherName?: string;
  motherNationalId?: string;
  motherMobile?: string;
  motherJob?: string;
  motherEducation?: string;
  motherCompany?: string;
  motherEmail?: string;
  notes?: string;
  medicalCondition?: string;
  educationAuthority?: string;
  specialCase?: boolean;
  integrated?: boolean;
  usesBus?: boolean;
  emergencyName?: string;
  emergencyTel?: string;
  transferredFrom?: string;
  transferredIn?: string;
  school?: string;
  enrollmentType?: string;
  levelId?: number | null;
};

export type StudentGrade = {
  subject_id: number;
  subject_name: string;
  max_degree: number | null;
  min_degree: number | null;
  // The student's degree (one value, out of the subject's كبرى). score_min is from the older
  // two-part degree and is no longer entered or shown.
  score: number | null;
  score_min: number | null;
  outside_total: number;
  elective_group: string | null;
};

// A subject's كبرى/صغرى in one section (they differ by grade year).
export type SubjectLevelMarks = {
  level_id: number;
  max_degree: number | null;
  min_degree: number | null;
  // خارج المجموع in this section, and the choose-one group the subject belongs to there (if any).
  outside_total: number;
  elective_group: string | null;
};

export type SubjectDegrees = {
  id: number;
  name: string;
  level_marks: SubjectLevelMarks[];
};

export type DegreesOverviewStudent = {
  id: number;
  seq_no: number;
  name: string;
  national_id: string | null;
  moe_code: string | null;
  division: string | null;
  section: string | null;
  school: string | null;
  level_id: number | null;
  grades: StudentGrade[];
};

export type UserCatalogKind = "cities" | "education-admins";

export type UserCatalogItem = {
  id: number;
  code: string;
  name: string;
  comment: string | null;
};

export type FeeType = {
  id: number;
  name: string;
  default_amount: number;
};

export type Payment = {
  id: number;
  student_id: number;
  student_name: string;
  class_id: number | null;
  fee_type_id: number | null;
  fee_type_name: string | null;
  amount: number;
  method: string;
  paid_on: string;
  note: string | null;
};

export type PaymentInput = {
  studentId: number;
  feeTypeId?: number;
  amount: number;
  method: string;
  paidOn: string;
  note?: string;
};

export type TimetableEntry = {
  id: number;
  class_id: number;
  day_of_week: number;
  period_no: number;
  start_time: string | null;
  end_time: string | null;
  subject: string;
  teacher_name: string | null;
  subject_id: number | null;
  teacher_id: number | null;
};

export type TimetableEntryInput = {
  classId: number;
  dayOfWeek: number;
  periodNo: number;
  startTime?: string;
  endTime?: string;
  subject?: string;
  teacherName?: string;
  subjectId?: number | null;
  teacherId?: number | null;
};

export type ConfigLookupCategory =
  | "country"
  | "nationality"
  | "warning"
  | "course"
  | "area"
  | "second_lang"
  | "district"
  | "education"
  | "student_category"
  | "expense_level"
  | "revenue_level"
  | "ministry";

export type ConfigLookupItem = {
  id: number;
  category: ConfigLookupCategory;
  name: string;
  note: string | null;
};

export type Subject = {
  id: number;
  name: string;
  color: string | null;
  ig_subject: number;
  weekly_periods: number;
  price: number;
  category: string | null;
  level_ids: number[];
  level_marks: SubjectLevelMarks[];
};

export type SubjectInput = {
  name: string;
  color?: string;
  igSubject?: boolean;
  weeklyPeriods?: number;
  price?: number;
  category?: string;
  levelIds?: number[];
  levelMarks?: { levelId: number; maxDegree: number | null; minDegree: number | null; outsideTotal?: boolean }[];
};

export type DailyPeriod = {
  id: number;
  period_no: number;
  start_time: string;
  end_time: string;
  is_break: number;
};

export type TimetableTeacher = {
  employee_id: number;
  name: string;
  employee_status: string | null;
  section: string | null;
  subject_id: number | null;
  periods_share: number | null;
  active: number;
};

export type TeacherSummary = {
  employee: { id: number; name: string; periodsShare: number };
  subject: { id: number; name: string; price: number } | null;
  classes: { class_id: number; class_name: string; sessions: number }[];
  totalActual: number;
  remaining: number;
  price: number;
};

export type ClassTimetableStatus = {
  posted: boolean;
  postedAt: string | null;
};

export type ClassTimetableOverviewRow = {
  classId: number;
  entryCount: number;
  posted: boolean;
};

export type Bus = {
  id: number;
  route_name: string;
  plate_number: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  capacity: number | null;
  notes: string | null;
  rider_count: number;
};

export type BusInput = {
  routeName: string;
  plateNumber?: string;
  driverName?: string;
  driverPhone?: string;
  capacity?: number;
  notes?: string;
};

export type BusRider = Student & { assignment_id: number; pickup_point: string | null };

export type InventoryItem = {
  id: number;
  name: string;
  category: string | null;
  quantity: number;
  unit: string | null;
  location: string | null;
  condition: string | null;
  notes: string | null;
};

export type InventoryItemInput = {
  name: string;
  category?: string;
  quantity?: number;
  unit?: string;
  location?: string;
  condition?: string;
  notes?: string;
};

export type SystemUser = {
  id: number;
  username: string;
  full_name: string;
  role: string;
  code: string | null;
  city_id: number | null;
  education_admin_id: number | null;
  city_name: string | null;
  education_admin_name: string | null;
  must_change_password: number;
};

export type SystemUserInput = {
  username?: string;
  password?: string;
  fullName: string;
  role: string;
  cityId?: number;
  educationAdminId?: number;
  code?: string;
  resetPassword?: boolean;
};

export type StaffMember = {
  id: number;
  name: string;
  position: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  national_id: string | null;
  hire_date: string | null;
  address: string | null;
  notes: string | null;
};

export type StaffMemberInput = {
  name: string;
  position?: string;
  department?: string;
  phone?: string;
  email?: string;
  nationalId?: string;
  hireDate?: string;
  address?: string;
  notes?: string;
};

export type SchoolSettings = Record<string, string>;

export type AttendanceStatus = "present" | "absent" | "late";

export type AttendanceRecord = {
  id: number;
  student_id: number;
  class_id: number | null;
  date: string;
  status: AttendanceStatus;
  note: string | null;
};

export type AttendanceEntryInput = {
  studentId: number;
  classId?: number;
  status: AttendanceStatus;
  note?: string;
};

export type AttendanceAnalysisRow = {
  student_id: number;
  student_name: string;
  seq_no: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  marked_count: number;
  attendance_rate: number | null;
};

export type AdmissionStatus = "pending" | "approved" | "rejected";

export type Admission = {
  id: number;
  name: string;
  gender: "M" | "F";
  guardian_name: string | null;
  guardian_phone: string | null;
  desired_class_id: number | null;
  notes: string | null;
  status: AdmissionStatus;
  created_at: string;
};

export type AdmissionInput = {
  name: string;
  gender: "M" | "F";
  guardianName?: string;
  guardianPhone?: string;
  desiredClassId?: number;
  notes?: string;
};

export type School = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  governorate: string | null;
  directorate: string | null;
  logo_url: string | null;
  city_id: number | null;
  education_admin_id: number | null;
  city_name: string | null;
  education_admin_name: string | null;
};

export type SchoolInput = {
  name: string;
  address?: string;
  phone?: string;
  governorate?: string;
  directorate?: string;
  cityId?: number | null;
  educationAdminId?: number | null;
};

export type HrEmployee = {
  id: number;
  school_id: number;
  name_ar: string;
  name_en: string | null;
  address: string | null;
  country: string | null;
  area: string | null;
  tel1: string | null;
  tel2: string | null;
  registration_date: string | null;
  birthday: string | null;
  gender: "M" | "F";
  religion: string | null;
  nationality: string | null;
  reg_code: string | null;
  marital_status: string | null;
  email: string | null;
  handicap: number;
  division: string | null;
  section: string | null;
  subject_id: number | null;
  department: string | null;
  job: string | null;
  status: string | null;
  title: string | null;
  shift: string | null;
  contract_type: string | null;
  contract_from: string | null;
  contract_to: string | null;
  education: string | null;
  university: string | null;
  id_number: string | null;
  salary_method: "cash" | "bank";
  medical_check: string | null;
  bank1_name: string | null;
  bank1_account: string | null;
  bank2_name: string | null;
  bank2_account: string | null;
  union_name: string | null;
  union_date: string | null;
  insurance_number: string | null;
  insured: number;
  form1_date: string | null;
  insured_with_another: number;
  fellowship_box: number;
  insured_pension: number;
  basic_salary: number;
  periods_share: number | null;
  staff_role: string | null;
  linked_user_id: number | null;
  photo_url: string | null;
};

export type HrEmployeeInput = {
  schoolId: number;
  nameAr: string;
  nameEn?: string;
  address?: string;
  country?: string;
  area?: string;
  tel1?: string;
  tel2?: string;
  registrationDate?: string;
  birthday?: string;
  gender: "M" | "F";
  religion?: string;
  nationality?: string;
  regCode?: string;
  maritalStatus?: string;
  email?: string;
  handicap?: boolean;
  division?: string;
  section?: string;
  subjectId?: number;
  department?: string;
  job?: string;
  status?: string;
  title?: string;
  shift?: string;
  contractType?: string;
  contractFrom?: string;
  contractTo?: string;
  education?: string;
  university?: string;
  idNumber?: string;
  salaryMethod?: "cash" | "bank";
  medicalCheck?: string;
  bank1Name?: string;
  bank1Account?: string;
  bank2Name?: string;
  bank2Account?: string;
  unionName?: string;
  unionDate?: string;
  insuranceNumber?: string;
  insured?: boolean;
  form1Date?: string;
  insuredWithAnother?: boolean;
  fellowshipBox?: boolean;
  insuredPension?: boolean;
  periodsShare?: number;
  staffRole?: string;
};

export type HrAttendanceStatus = "present" | "absent" | "late";

export type HrAttendanceRecord = {
  id: number | null;
  employee_id: number;
  name_ar: string;
  job: string | null;
  date: string | null;
  status: HrAttendanceStatus | null;
  check_in: string | null;
  check_out: string | null;
  note: string | null;
};

export type HrDayClosed = {
  id: number;
  school_id: number;
  date: string;
  closed_by: string | null;
  closed_at: string;
};

export type HrOverallRow = {
  employee_id: number;
  employee_name: string;
  present_count: number;
  absent_count: number;
  late_count: number;
  marked_count: number;
  attendance_rate: number | null;
};

export type HrLeaveKind = "opening_balance" | "leave";

export type HrLeaveEntry = {
  id: number;
  employee_id: number;
  school_id: number;
  entry_date: string;
  leave_type_id: number;
  leave_type_name: string;
  leave_start: string | null;
  leave_end: string | null;
  count: number;
  kind: HrLeaveKind;
};

export type HrLookupCategory =
  | "country"
  | "area"
  | "bank"
  | "university"
  | "education"
  | "department"
  | "outside_employee"
  | "message";

export type HrOrgJob = {
  id: number;
  job: string;
};

export type HrOrgSection = {
  id: number;
  section: string;
  jobs: HrOrgJob[];
};

export type HrOrgDivisionKind = "generic" | "teachers" | "principals";

export type HrOrgDivision = {
  id: number;
  division: string;
  kind: HrOrgDivisionKind;
  sections: HrOrgSection[];
};

export type HrLookupItem = {
  id: number;
  category: HrLookupCategory;
  school_id: number | null;
  name: string;
  note: string | null;
};

export type HrValuedCategory =
  | "allowance"
  | "overtime"
  | "reward"
  | "misconduct"
  | "benefit"
  | "tax"
  | "deduction"
  | "leave_type"
  | "incentive"
  | "teachers_club"
  | "increase";

export type HrValuedItem = {
  id: number;
  category: HrValuedCategory;
  school_id: number | null;
  name: string;
  amount: number;
  is_percentage: number;
};

export type HrLeaveBalanceRow = {
  employee_id: number;
  leave_type_id: number;
  balance: number;
};

export type HrShift = {
  id: number;
  school_id: number;
  name: string;
  start_time: string | null;
  end_time: string | null;
};

export type HrHoliday = {
  id: number;
  school_id: number;
  name: string;
  date: string;
};

export type HrSalaryCategory =
  | "allowance"
  | "reward"
  | "benefit"
  | "incentive"
  | "teachers_club"
  | "increase"
  | "misconduct"
  | "deduction"
  | "tax";

export type HrSalaryItem = {
  id: number;
  employee_id: number;
  school_id: number;
  category: HrSalaryCategory;
  label: string;
  amount: number;
  is_percentage: number;
  recurring: number;
  one_off_month: string | null;
};

export type HrPayrollPeriod = {
  id: number;
  school_id: number;
  month: string;
};

export type HrPayrollLine = {
  id: number;
  period_id: number;
  employee_id: number;
  employee_name: string;
  basic_salary: number;
  additions_total: number;
  deductions_total: number;
  leave_deduction: number;
  tax_total: number;
  net_salary: number;
};

export type HrLeaveSummaryRow = {
  employee_id: number;
  employee_name: string;
  leave_days: number;
};
