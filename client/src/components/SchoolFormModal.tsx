import { useEffect, useState, type FormEvent } from "react";
import { X, Building2, Plus, Pencil, Trash2, Save } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSchools } from "../context/SchoolsContext";
import { api, ApiError } from "../lib/api";
import type { School, UserCatalogItem } from "../lib/types";
import { inputCls } from "./FormLayout";
import { useColumnOrder, orderedCells } from "../lib/useColumnOrder";

// Students > إضافة مدرسة. المدينة and الإدارة come from the Users catalogs; the school's name is
// what students pick in البيانات الأساسية → المدرسة, and renaming it renames it on them too.
const COLUMN_LABELS = {
  name: "اسم المدرسة",
  address: "العنوان",
  city: "المدينة",
  education_admin: "الإدارة",
  phone: "رقم التليفون",
};
const COLUMN_KEYS = Object.keys(COLUMN_LABELS) as (keyof typeof COLUMN_LABELS)[];

const EMPTY = { name: "", address: "", cityId: "" as number | "", educationAdminId: "" as number | "", phone: "" };

export default function SchoolFormModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const { schools, createSchool, updateSchool, deleteSchool } = useSchools();
  const [cities, setCities] = useState<UserCatalogItem[]>([]);
  const [eduAdmins, setEduAdmins] = useState<UserCatalogItem[]>([]);
  const [form, setForm] = useState(EMPTY);
  const columns = useColumnOrder("schools", COLUMN_KEYS);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getUserCatalog(token, "cities").then((res) => setCities(res.items)).catch(() => {});
    api.getUserCatalog(token, "education-admins").then((res) => setEduAdmins(res.items)).catch(() => {});
  }, [token]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const startEdit = (school: School) => {
    setEditingId(school.id);
    setError(null);
    setForm({
      name: school.name,
      address: school.address ?? "",
      cityId: school.city_id ?? "",
      educationAdminId: school.education_admin_id ?? "",
      phone: school.phone ?? "",
    });
  };

  const reset = () => {
    setEditingId(null);
    setForm(EMPTY);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("اسم المدرسة مطلوب.");
      return;
    }
    setSaving(true);
    setError(null);
    const input = {
      name: form.name.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      cityId: form.cityId === "" ? null : form.cityId,
      educationAdminId: form.educationAdminId === "" ? null : form.educationAdminId,
    };
    try {
      if (editingId) await updateSchool(editingId, input);
      else await createSchool(input);
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذر الحفظ.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (school: School) => {
    if (!window.confirm(`حذف "${school.name}"؟`)) return;
    setError(null);
    try {
      await deleteSchool(school.id);
      if (editingId === school.id) reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذر الحذف.");
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800">المدارس</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold text-slate-500">{editingId ? "تعديل مدرسة" : "إضافة مدرسة"}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">اسم المدرسة</span>
                <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">رقم التليفون</span>
                <input value={form.phone} onChange={(e) => set("phone", e.target.value)} dir="ltr" className={inputCls} />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-500">العنوان</span>
                <input value={form.address} onChange={(e) => set("address", e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">المدينة</span>
                <select
                  value={form.cityId}
                  onChange={(e) => set("cityId", e.target.value ? Number(e.target.value) : "")}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">الإدارة</span>
                <select
                  value={form.educationAdminId}
                  onChange={(e) => set("educationAdminId", e.target.value ? Number(e.target.value) : "")}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {eduAdmins.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {editingId ? <Save size={15} /> : <Plus size={15} />}
                {editingId ? "حفظ" : "إضافة"}
              </button>
            </div>
          </form>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-start text-xs font-bold text-slate-500">
                <tr>
                  {columns.order.map((key) => (
                    <th key={key} {...columns.headerProps(key)} className="px-3 py-2.5 text-start">
                      {COLUMN_LABELS[key]}
                    </th>
                  ))}
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {schools.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                      لم تتم إضافة مدارس بعد.
                    </td>
                  </tr>
                ) : (
                  schools.map((school) => (
                    <tr key={school.id} className={editingId === school.id ? "bg-brand-50/60" : "hover:bg-slate-50"}>
                      {orderedCells(columns.order, {
                        name: <td className="px-3 py-2.5 font-semibold text-slate-700">{school.name}</td>,
                        address: <td className="px-3 py-2.5 text-slate-600">{school.address}</td>,
                        city: <td className="px-3 py-2.5 text-slate-600">{school.city_name}</td>,
                        education_admin: <td className="px-3 py-2.5 text-slate-600">{school.education_admin_name}</td>,
                        phone: (
                          <td className="px-3 py-2.5 text-slate-600" dir="ltr">
                            {school.phone}
                          </td>
                        ),
                      })}
                      <td className="whitespace-nowrap px-3 py-2.5 text-end">
                        <button
                          onClick={() => startEdit(school)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                          title="تعديل"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(school)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="حذف"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
