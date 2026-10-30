import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";
import type { UserCatalogItem, UserCatalogKind } from "../lib/types";
import { inputCls } from "./FormLayout";
import { useColumnOrder, orderedCells } from "../lib/useColumnOrder";

const CATALOG_COLUMN_KEYS = ["code", "name", "comment"] as const;

// Users > مدينة / إدارة تعليمية: a table of entries plus an "add new" row. The two catalogs
// only differ in what their code column is called.
const LABELS: Record<UserCatalogKind, { code: string; title: string }> = {
  cities: { code: "الرقم البريدي", title: "مدينة" },
  "education-admins": { code: "الكود", title: "إدارة تعليمية" },
};

export default function UserCatalogTab({ kind }: { kind: UserCatalogKind }) {
  const { token } = useAuth();
  const labels = LABELS[kind];
  const columns = useColumnOrder(`catalog:${kind}`, CATALOG_COLUMN_KEYS);
  const headerLabels = { code: labels.code, name: "الاسم", comment: "ملاحظات" };
  const [items, setItems] = useState<UserCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    api
      .getUserCatalog(token, kind)
      .then((res) => setItems(res.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : "تعذر التحميل."))
      .finally(() => setLoading(false));
  }, [token, kind]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!code.trim() || !name.trim()) {
      setError(`${labels.code} والاسم مطلوبان.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.createUserCatalogItem(token, kind, {
        code: code.trim(),
        name: name.trim(),
        comment: comment.trim() || undefined,
      });
      setItems(res.items);
      setCode("");
      setName("");
      setComment("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذر الإضافة.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: UserCatalogItem) => {
    if (!token || !window.confirm(`حذف "${item.name}"؟`)) return;
    setError(null);
    try {
      const res = await api.deleteUserCatalogItem(token, kind, item.id);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذر الحذف.");
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleAdd} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.title} جديدة</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr_1fr_auto]">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={labels.code} className={inputCls} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم" className={inputCls} />
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="ملاحظات" className={inputCls} />
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            <Plus size={15} />
            إضافة
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-sm">
        <table className="min-w-full divide-y divide-slate-100 text-sm font-bold">
          <thead className="bg-slate-50/95 text-start text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              {columns.order.map((key) => (
                <th key={key} {...columns.headerProps(key)} className="px-3 py-2.5">
                  {headerLabels[key]}
                </th>
              ))}
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                  جارٍ التحميل…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                  لم تتم إضافة شيء بعد.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  {orderedCells(columns.order, {
                    code: <td className="px-3 py-2.5 font-bold text-slate-700">{item.code}</td>,
                    name: <td className="px-3 py-2.5 text-slate-700">{item.name}</td>,
                    comment: <td className="px-3 py-2.5 text-slate-500">{item.comment}</td>,
                  })}
                  <td className="px-3 py-2.5 text-end">
                    <button
                      onClick={() => handleDelete(item)}
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
  );
}
