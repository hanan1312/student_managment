import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Pencil, Plus, Save, Trash2, X, Undo2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { branchTargets, useClasses } from "../context/ClassesContext";
import { api } from "../lib/api";
import type { Branch, ClassStage } from "../lib/types";
import { inputCls } from "./FormLayout";
import { AddInline, ConfirmDeleteDialog, RenameInline } from "./TreeControls";

// Students > إضافة شعبة: every شعبة (البكالوريا المصرية, الثانوية العامة, and the ones users add),
// editable in place, and "+" to add one. A شعبة belongs to a section of the الهيكل (e.g. المرحلة
// الثانوية → الصف الثاني الثانوي) and is nested under it in the tree, like البكالوريا المصرية. It can
// hold sub-items (its tracks, e.g. الطب وعلوم الحياة), added and edited here too. Students are placed
// on the شعبة, or on its sub-items when it has some; each starts with its parent's subjects (المواد).

type Draft = { name: string; stageId: number | ""; parentId: number | "" };

// The sections a شعبة can belong to: every item of the stage that isn't a شعبة or inside one.
function sectionOptions(tree: ClassStage[], stageId: number | "") {
  const stage = tree.find((s) => s.id === stageId);
  return stage ? branchTargets(stage.levels) : [];
}

type ItemActions = {
  addItem: (branchId: number, name: string, parentId?: number) => Promise<void>;
  renameItem: (id: number, name: string) => Promise<void>;
  deleteItem: (item: { id: number; name: string; students: number }) => void;
};

// The sub-items of a شعبة (e.g. its tracks), each with rename, delete and + for an item inside it.
function BranchItems({ branch, actions }: { branch: Branch; actions: ItemActions }) {
  const [renaming, setRenaming] = useState<number | null>(null);
  // The item a new sub-item is being added under (the شعبة itself: its id).
  const [addingUnder, setAddingUnder] = useState<number | null>(null);
  const add = (parentId: number) => (
    <div style={{ paddingInlineStart: `${(parentId === branch.id ? 0 : (branch.items.find((i) => i.id === parentId)?.depth ?? 0)) * 1.25 + 1.25}rem` }}>
      <AddInline
        placeholder="اسم الفرع الجديد (مثال: الطب وعلوم الحياة)"
        onAdd={(name) => actions.addItem(branch.id, name, parentId === branch.id ? undefined : parentId)}
        onDone={() => setAddingUnder(null)}
      />
    </div>
  );
  return (
    <div className="space-y-0.5 py-1 text-sm">
      {branch.items.length === 0 && addingUnder === null && (
        <p className="px-2 py-1 text-xs text-slate-400">لا توجد فروع داخل الشعبة؛ يُسكَّن الطلاب على الشعبة نفسها.</p>
      )}
      {branch.items.map((item) => (
        <div key={item.id}>
          {renaming === item.id ? (
            <div style={{ paddingInlineStart: `${(item.depth - 1) * 1.25}rem` }}>
              <RenameInline
                initialValue={item.name}
                onSave={async (name) => {
                  await actions.renameItem(item.id, name);
                  setRenaming(null);
                }}
                onCancel={() => setRenaming(null)}
              />
            </div>
          ) : (
            <div
              className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-50"
              style={{ paddingInlineStart: `${(item.depth - 1) * 1.25 + 0.5}rem` }}
            >
              <span className="text-slate-300">└</span>
              <span className="flex-1 text-slate-700">{item.name}</span>
              <span className="w-20 text-center text-xs text-slate-500">{item.students} طالب</span>
              <span className="w-20 text-center text-xs text-slate-500">{item.subjects} مادة</span>
              <button
                onClick={() => setAddingUnder(item.id)}
                title={`إضافة فرع داخل ${item.name}`}
                className="rounded p-1 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
              >
                <Plus size={13} />
              </button>
              <button
                onClick={() => setRenaming(item.id)}
                title="إعادة تسمية"
                className="rounded p-1 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={() => actions.deleteItem(item)}
                title="حذف"
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
          {addingUnder === item.id && add(item.id)}
        </div>
      ))}
      {addingUnder === branch.id ? (
        add(branch.id)
      ) : (
        <button
          onClick={() => setAddingUnder(branch.id)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
        >
          <Plus size={13} />
          فرع داخل {branch.name}
        </button>
      )}
    </div>
  );
}

function BranchRow({
  branch,
  tree,
  onSave,
  onDelete,
  actions,
}: {
  branch: Branch;
  tree: ClassStage[];
  onSave: (draft: Draft) => Promise<void>;
  onDelete: () => void;
  actions: ItemActions;
}) {
  const [open, setOpen] = useState(branch.items.length > 0);
  const initial: Draft = { name: branch.name, stageId: branch.stage_id, parentId: branch.parent_id ?? "" };
  const [draft, setDraft] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    draft.name.trim() !== branch.name || draft.stageId !== branch.stage_id || draft.parentId !== (branch.parent_id ?? "");

  useEffect(() => {
    setDraft({ name: branch.name, stageId: branch.stage_id, parentId: branch.parent_id ?? "" });
  }, [branch.name, branch.stage_id, branch.parent_id]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <tr className={dirty ? "bg-amber-50/60" : "hover:bg-slate-50"}>
      <td className="w-6 ps-2 align-top">
        <button
          onClick={() => setOpen((o) => !o)}
          title={open ? "إخفاء الفروع" : "عرض الفروع"}
          className="mt-2.5 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} className="rtl:-scale-x-100" />}
        </button>
      </td>
      <DraftCells draft={draft} setDraft={setDraft} tree={tree} error={error} />
      <td className="px-3 py-2 text-center text-slate-600">{branch.students}</td>
      <td className="px-3 py-2 text-center text-slate-600">{branch.subjects}</td>
      <td className="whitespace-nowrap px-3 py-2 text-end">
        {dirty && (
          <>
            <button
              onClick={save}
              disabled={saving}
              title="حفظ"
              className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50 disabled:opacity-50"
            >
              <Save size={15} />
            </button>
            <button
              onClick={() => {
                setDraft(initial);
                setError(null);
              }}
              title="تراجع"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <Undo2 size={15} />
            </button>
          </>
        )}
        <button onClick={onDelete} title="حذف" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
          <Trash2 size={15} />
        </button>
      </td>
    </tr>
    {open && (
      <tr className="bg-slate-50/40">
        <td />
        <td colSpan={6} className="px-3 pb-2">
          <BranchItems branch={branch} actions={actions} />
        </td>
      </tr>
    )}
    </>
  );
}

// اسم الشعبة, المرحلة and الصف as inputs, shared by the rows and the new-شعبة row.
function DraftCells({
  draft,
  setDraft,
  tree,
  error,
  autoFocus = false,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  tree: ClassStage[];
  error: string | null;
  autoFocus?: boolean;
}) {
  const sections = sectionOptions(tree, draft.stageId);
  return (
    <>
      <td className="px-3 py-2 align-top">
        <input
          value={draft.name}
          autoFocus={autoFocus}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="مثال: علمي"
          className={`${inputCls} min-w-[9rem]`}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
      <td className="px-3 py-2 align-top">
        <select
          value={draft.stageId}
          onChange={(e) => setDraft({ ...draft, stageId: e.target.value ? Number(e.target.value) : "", parentId: "" })}
          className={`${inputCls} min-w-[9rem]`}
        >
          <option value="">اختر المرحلة</option>
          {tree.map((s) => (
            <option key={s.id} value={s.id}>
              {s.stage}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 align-top">
        <select
          value={draft.parentId}
          disabled={!draft.stageId}
          onChange={(e) => setDraft({ ...draft, parentId: e.target.value ? Number(e.target.value) : "" })}
          className={`${inputCls} min-w-[12rem]`}
        >
          <option value="">اختر الصف</option>
          {sections.map((l) => (
            <option key={l.id} value={l.id}>
              {"  ".repeat(l.depth)}
              {l.path}
            </option>
          ))}
        </select>
      </td>
    </>
  );
}

export default function BranchesModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const { tree, replaceTree, deleteLevel, renameLevel } = useClasses();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<Draft | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<{ id: number; label: string; students: number; items: number } | null>(null);

  const load = () => {
    if (!token) return;
    api
      .getBranches(token)
      .then((res) => setBranches(res.branches))
      .catch(() => setBranches([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [token]);

  const valid = (d: Draft): d is { name: string; stageId: number; parentId: number } => {
    if (!d.name.trim()) throw new Error("اكتب اسم الشعبة.");
    if (!d.stageId) throw new Error("اختر المرحلة.");
    if (!d.parentId) throw new Error("اختر الصف.");
    return true;
  };

  const saveBranch = async (id: number, d: Draft) => {
    if (!token || !valid(d)) return;
    const res = await api.updateBranch(token, id, { name: d.name.trim(), stageId: d.stageId, parentId: d.parentId });
    replaceTree(res.tree);
    setBranches(res.branches);
  };

  const addBranch = async () => {
    if (!token || !adding) return;
    setSaving(true);
    setAddError(null);
    try {
      if (!valid(adding)) return;
      const res = await api.createBranch(token, { name: adding.name.trim(), stageId: adding.stageId, parentId: adding.parentId });
      replaceTree(res.tree);
      setBranches(res.branches);
      setAdding(null);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "تعذّرت الإضافة.");
    } finally {
      setSaving(false);
    }
  };

  const itemActions: ItemActions = {
    addItem: async (branchId, name, parentId) => {
      if (!token) return;
      const res = await api.addBranchItem(token, branchId, name, parentId);
      replaceTree(res.tree);
      setBranches(res.branches);
    },
    renameItem: async (id, name) => {
      await renameLevel(id, name);
      load();
    },
    deleteItem: (item) => setDeleting({ id: item.id, label: item.name, students: item.students, items: 0 }),
  };

  // Grouped by stage, as in the الهيكل.
  const byStage = useMemo(() => {
    const groups = new Map<string, Branch[]>();
    for (const b of branches) groups.set(b.stage, [...(groups.get(b.stage) ?? []), b]);
    return [...groups.entries()];
  }, [branches]);

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div className="animate-rise-in flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <GitBranch size={18} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800">الشعب</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setAdding({ name: "", stageId: tree.length === 1 ? tree[0].id : "", parentId: "" });
                setAddError(null);
              }}
              disabled={adding !== null}
              title="إضافة شعبة"
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Plus size={15} />
              شعبة
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <p className="text-xs leading-5 text-slate-500">
            تظهر الشعبة في الهيكل داخل صفها، مثل البكالوريا المصرية داخل الصف الثاني الثانوي. يمكن إضافة أكثر من شعبة لنفس الصف،
            وإضافة فروع داخل الشعبة (مثل الطب وعلوم الحياة) من السهم بجانبها. تبدأ الشعبة وفروعها بمواد ما فوقها، ولكل منها موادها
            الخاصة تُعدَّل من المواد.
          </p>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                <tr>
                  <th className="w-6" />
                  <th className="px-3 py-2.5 text-start">اسم الشعبة</th>
                  <th className="px-3 py-2.5 text-start">المرحلة</th>
                  <th className="px-3 py-2.5 text-start">الصف</th>
                  <th className="px-3 py-2.5">الطلاب</th>
                  <th className="px-3 py-2.5">المواد</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {adding && (
                  <tr className="bg-brand-50/60">
                    <td />
                    <DraftCells draft={adding} setDraft={setAdding} tree={tree} error={addError} autoFocus />
                    <td className="px-3 py-2 text-center text-slate-400">—</td>
                    <td className="px-3 py-2 text-center text-slate-400">—</td>
                    <td className="whitespace-nowrap px-3 py-2 text-end">
                      <button
                        onClick={addBranch}
                        disabled={saving}
                        title="إضافة"
                        className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                      >
                        <Save size={15} />
                      </button>
                      <button
                        onClick={() => setAdding(null)}
                        title="إلغاء"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      >
                        <X size={15} />
                      </button>
                    </td>
                  </tr>
                )}
                {!loading && branches.length === 0 && !adding && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                      لم تتم إضافة شعب بعد. اضغط + لإضافة شعبة.
                    </td>
                  </tr>
                )}
                {byStage.map(([stage, rows]) => [
                  <tr key={`stage-${stage}`} className="bg-slate-50/70">
                    <td colSpan={7} className="px-3 py-1.5 text-xs font-bold text-slate-600">
                      {stage}
                    </td>
                  </tr>,
                  ...rows.map((b) => (
                    <BranchRow
                      key={b.id}
                      branch={b}
                      tree={tree}
                      onSave={(d) => saveBranch(b.id, d)}
                      onDelete={() => setDeleting({ id: b.id, label: b.path, students: b.students + b.items.reduce((n, i) => n + i.students, 0), items: b.items.length })}
                      actions={itemActions}
                    />
                  )),
                ])}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {deleting && (
        <ConfirmDeleteDialog
          title={`حذف ${deleting.label}؟`}
          message={`${deleting.items > 0 ? `يُحذف معها كل ما بداخلها (${deleting.items}). ` : ""}${
            deleting.students > 0 ? `سيبقى الطلاب (${deleting.students}) ولكن بدون تسكين، ` : ""
          }وتُحذف روابط المواد.`}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteLevel(deleting.id);
            setDeleting(null);
            load();
          }}
        />
      )}
    </div>
  );
}
