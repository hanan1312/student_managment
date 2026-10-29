import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  ShieldCheck,
  Plus,
  Trash2,
  UserCircle,
  Upload,
  Download,
  Lock,
  Activity,
  Eye,
  EyeOff,
  MapPin,
  Landmark,
  KeyRound,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";
import { downloadExcel } from "../lib/excel";
import type { SystemUser, SystemUserInput } from "../lib/types";
import SystemUserModal, { roleLabel } from "../components/SystemUserModal";
import UserPermissionsModal from "../components/UserPermissionsModal";
import CsvImportModal, { type ImportColumn } from "../components/CsvImportModal";
import ActivityMonitor from "../components/ActivityMonitor";
import UserCatalogTab from "../components/UserCatalogTab";

type UsersTab = "users" | "activity" | "cities" | "education-admins";

const TAB_BUTTONS: { key: UsersTab; label: string; icon: typeof ShieldCheck }[] = [
  { key: "users", label: "المستخدمين", icon: ShieldCheck },
  { key: "activity", label: "النشاط", icon: Activity },
  { key: "cities", label: "مدينة", icon: MapPin },
  { key: "education-admins", label: "إدارة تعليمية", icon: Landmark },
];

type OutletCtx = { notify: (label: string) => void };

const USER_IMPORT_COLUMNS: ImportColumn[] = [
  // Arabic headers; the earlier English ones still import.
  { key: "username", label: "اسم المستخدم", required: true, example: "jsmith", aliases: ["Username"] },
  { key: "fullName", label: "الاسم بالكامل", required: true, example: "Jane Smith", aliases: ["Full Name"] },
  { key: "password", label: "كلمة المرور", required: true, example: "TempPass123", aliases: ["Password"] },
  { key: "role", label: "الدور", example: "staff", aliases: ["Role"] },
];

function mapUserImportRow(raw: Record<string, string>): { input?: SystemUserInput; error?: string } {
  return {
    input: {
      username: raw.username,
      fullName: raw.fullName,
      password: raw.password,
      role: raw.role?.trim() || "staff",
    },
  };
}

export default function UsersPage() {
  useOutletContext<OutletCtx>();
  const { token, user: me } = useAuth();

  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SystemUser | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SystemUser | null>(null);
  const [managingPermissions, setManagingPermissions] = useState<SystemUser | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [tab, setTab] = useState<UsersTab>("users");
  // Shown once right after creating a user: the generated temporary password is never
  // retrievable again (only its hash is stored).
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  // Passwords are one-way hashed server-side — there's no real value to reveal here, only
  // whether the masked dots are shown at rest or on demand per row.
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const toggleRevealed = (id: number) =>
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.getUsers(token);
      setUsers(res.users);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "تعذر تحميل المستخدمين.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleCreate = async (input: SystemUserInput) => {
    if (!token) return;
    const res = await api.createUser(token, input);
    setModalOpen(false);
    setCreated({ username: res.user.username, password: res.temporaryPassword });
    await load();
  };

  const handleUpdate = async (input: SystemUserInput) => {
    if (!token || !editing) return;
    const res = await api.updateUser(token, editing.id, input);
    setEditing(null);
    if (res.temporaryPassword) setCreated({ username: res.user.username, password: res.temporaryPassword });
    await load();
  };

  const confirmDelete = async () => {
    if (!token || !pendingDelete) return;
    setErrorMsg(null);
    try {
      await api.deleteUser(token, pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : "تعذر حذف المستخدم.");
      setPendingDelete(null);
    }
  };

  const handleExport = () => {
    const headers = ["اسم المستخدم", "الاسم بالكامل", "الدور"];
    const rows = users.map((u) => ({ "اسم المستخدم": u.username, "الاسم بالكامل": u.full_name, الدور: u.role }));
    downloadExcel("system-users.xlsx", headers, rows);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col items-center border-e border-slate-200 px-3 last:border-e-0">
          <div className="flex items-center gap-1">
            {TAB_BUTTONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] transition hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 ${
                  tab === key ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-brand-50 hover:text-brand-700"
                }`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">عرض</span>
        </div>

        {tab === "users" && (
          <div className="flex flex-col items-center border-e border-slate-200 px-3 last:border-e-0">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setModalOpen(true)}
                className="flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 transition hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
              >
                <Plus size={18} />
                <span>مستخدم جديد</span>
              </button>
              <button
                onClick={() => setImportOpen(true)}
                className="flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 transition hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
              >
                <Upload size={18} />
                <span>استيراد</span>
              </button>
              <button
                onClick={handleExport}
                className="flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 transition hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0"
              >
                <Download size={18} />
                <span>تصدير</span>
              </button>
            </div>
            <span className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">التحكم في الوصول</span>
          </div>
        )}
      </div>

      {tab === "users" && (
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          <ShieldCheck size={15} className="text-brand-500" />
          <span>مستخدمو النظام وأدوارهم</span>
          <span className="text-slate-300">&middot;</span>
          <span>
            {users.length} مستخدم
          </span>
        </div>
      )}

      {tab === "activity" && (
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          <Activity size={15} className="text-brand-500" />
          <span>من المتصل أو الخامل أو غير المتصل — وآخر إجراءات الجميع</span>
        </div>
      )}

      <div className="flex-1 overflow-auto px-4 py-3">
        {tab === "users" && (
          <>
            {errorMsg && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>}

            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-sm shadow-slate-200/50 before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-0.5 before:bg-gradient-to-r before:from-brand-500 before:via-brand-400 before:to-gold-400 before:opacity-70 before:content-['']">
              <table className="min-w-full divide-y divide-slate-100 text-sm font-bold">
                <thead className="bg-slate-50/95 text-start text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">اسم المستخدم</th>
                    <th className="px-3 py-2.5">الكود</th>
                    <th className="px-3 py-2.5">الاسم بالكامل</th>
                    <th className="px-3 py-2.5">الدور</th>
                    <th className="px-3 py-2.5">مدينة</th>
                    <th className="px-3 py-2.5">إدارة تعليمية</th>
                    <th className="px-3 py-2.5">كلمة المرور</th>
                    <th className="px-3 py-2.5 text-end">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-slate-400">
                        جارٍ تحميل المستخدمين…
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    users.map((u) => (
                      <tr key={u.id} onClick={() => setEditing(u)} className="cursor-pointer hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-bold text-slate-800">
                          <div className="flex items-center gap-2">
                            <UserCircle size={16} className="text-slate-300" />
                            {u.username}
                            {u.id === me?.id && (
                              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                                أنت
                              </span>
                            )}
                            {Boolean(u.must_change_password) && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                في انتظار أول دخول
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-500">{u.code}</td>
                        <td className="px-3 py-2.5 text-slate-600">{u.full_name}</td>
                        <td className="px-3 py-2.5 text-slate-500">{roleLabel(u.role)}</td>
                        <td className="px-3 py-2.5 text-slate-500">{u.city_name}</td>
                        <td className="px-3 py-2.5 text-slate-500">{u.education_admin_name}</td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => toggleRevealed(u.id)}
                            title="كلمات المرور مشفرة ولا يمكن عرضها — هذا يُظهر/يُخفي القناع فقط"
                            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600"
                          >
                            {revealedIds.has(u.id) ? (
                              <>
                                <EyeOff size={13} />
                                <span className="tracking-widest">••••••••</span>
                              </>
                            ) : (
                              <>
                                <Eye size={13} />
                                <span className="text-xs text-slate-300">مخفية</span>
                              </>
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {(me?.role === "admin" || me?.role === "master") && (
                              <button
                                onClick={() => setManagingPermissions(u)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                                title="إدارة الصلاحيات"
                              >
                                <Lock size={15} />
                              </button>
                            )}
                            <button
                              onClick={() => setPendingDelete(u)}
                              disabled={u.id === me?.id}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent"
                              title={u.id === me?.id ? "لا يمكنك حذف حسابك" : "حذف"}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "activity" && token && <ActivityMonitor token={token} />}

        {(tab === "cities" || tab === "education-admins") && <UserCatalogTab key={tab} kind={tab} />}
      </div>

      {modalOpen && <SystemUserModal onClose={() => setModalOpen(false)} onSubmit={handleCreate} />}

      {editing && <SystemUserModal initial={editing} onClose={() => setEditing(null)} onSubmit={handleUpdate} />}

      {managingPermissions && (
        <UserPermissionsModal targetUser={managingPermissions} onClose={() => setManagingPermissions(null)} />
      )}

      {importOpen && token && (
        <CsvImportModal<SystemUserInput>
          title="استيراد مستخدمي النظام"
          description="كلمة المرور مطلوبة لكل حساب جديد — سيُطلب من المستخدم تغييرها عند أول دخول."
          templateFilename="users-template.csv"
          columns={USER_IMPORT_COLUMNS}
          mapRow={mapUserImportRow}
          onImportRow={(input) => api.createUser(token, input).then(() => {})}
          onClose={() => setImportOpen(false)}
          onFinished={load}
        />
      )}

      {created && (
        <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
          <div className="animate-rise-in w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <KeyRound size={16} className="text-brand-600" />
                بيانات الدخول
              </h3>
              <button onClick={() => setCreated(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              أعطِ هذه البيانات للمستخدم. كلمة المرور تظهر الآن فقط، ويجب عليه اختيار كلمة مرور خاصة به عند أول دخول.
            </p>
            <dl className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">اسم المستخدم</dt>
                <dd className="select-all font-mono text-slate-800">{created.username}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">كلمة المرور المؤقتة</dt>
                <dd className="select-all font-mono text-slate-800">{created.password}</dd>
              </div>
            </dl>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setCreated(null)}
                className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                تم
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
          <div className="animate-rise-in w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-sm font-semibold text-slate-800">حذف المستخدم؟</h3>
            <p className="mt-1.5 text-sm text-slate-500">
              سيتم إلغاء وصول{" "}
              <span className="font-medium text-slate-700">{pendingDelete.full_name}</span>.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
