import { useEffect, useMemo, useState } from "react";
import { GitBranch, Plus, Save, Trash2, X, Undo2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useClasses } from "../context/ClassesContext";
import { api } from "../lib/api";
import type { Branch, ClassStage } from "../lib/types";
import { inputCls } from "./FormLayout";
import { ConfirmDeleteDialog } from "./TreeControls";

// Students > إضافة شعبة: every شعبة added by users, editable in place, and "+" to add one. A شعبة
// belongs to a section of the الهيكل (e.g. المرحلة الثانوية → الصف الثاني الثانوي) and shows in the
// tree as الصف الثاني الثانوي "علمي". Students are placed on it and it has its own subjects in
// المواد (it starts with its section's).

type Draft = { name: string; stageId: number | ""; parentId: number | "" };

// The sections a شعبة can belong to: every item of the stage that isn't itself a شعبة.
function sectionOptions(tree: ClassStage[], stageId: number | "") {
  const stage = tree.find((s) => s.id === stageId);
  return stage ? stage.levels.filter((l) => !l.is_branch) : [];
}

function BranchRow({
  branch,
  tree,
  onSave,
  onDelete,
}: {
  branch: Branch;
  tree: ClassStage[];
  onSave: (draft: Draft) => Promise<void>;
  onDelete: () => void;
}) {
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
    <tr className={dirty ? "bg-amber-50/60" : "hover:bg-slate-50"}>
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
  const { tree, replaceTree, deleteLevel } = useClasses();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<Draft | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Branch | null>(null);

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
            تظهر الشعبة في الهيكل تحت صفها، مثل: الصف الثاني الثانوي "علمي". يمكن إضافة أكثر من شعبة لنفس الصف. تبدأ الشعبة بمواد صفها،
            ولكل شعبة موادها الخاصة تُعدَّل من المواد.
          </p>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                <tr>
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
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                      لم تتم إضافة شعب بعد. اضغط + لإضافة شعبة.
                    </td>
                  </tr>
                )}
                {byStage.map(([stage, rows]) => [
                  <tr key={`stage-${stage}`} className="bg-slate-50/70">
                    <td colSpan={6} className="px-3 py-1.5 text-xs font-bold text-slate-600">
                      {stage}
                    </td>
                  </tr>,
                  ...rows.map((b) => (
                    <BranchRow
                      key={b.id}
                      branch={b}
                      tree={tree}
                      onSave={(d) => saveBranch(b.id, d)}
                      onDelete={() => setDeleting(b)}
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
          title={`حذف الشعبة ${deleting.path}؟`}
          message={
            deleting.students > 0
              ? `سيبقى طلابها (${deleting.students}) ولكن بدون تسكين، وتُحذف روابط موادها.`
              : "تُحذف الشعبة وروابط موادها."
          }
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
