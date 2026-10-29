import { createContext, useContext, useState, type DragEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  School,
  Layers,
  Users,
  Plus,
  Pencil,
  Trash2,
  Menu,
  GripVertical,
  ArrowUpDown,
} from "lucide-react";
import type { ClassLevel, ClassStage } from "../lib/types";
import { useClasses, levelAndDescendants, type ClassSelection } from "../context/ClassesContext";
import { AddInline, RenameInline, ConfirmDeleteDialog, RowActionButton } from "./TreeControls";
import { SHOW_EXTENDED_FEATURES } from "../lib/features";

// Arranging mode (the ترتيب toggle in the header): stages and levels can be dragged to a new place.
// A stage drops before/after another stage. A level drops before/after another level, or inside
// it (the middle of the row) or inside a stage (appended to its top-level items).
type DragItem = { kind: "stage"; id: number } | { kind: "level"; id: number; stageId: number };
type DropZone = "before" | "after" | "inside";

const ArrangeContext = createContext<{
  arranging: boolean;
  dragging: DragItem | null;
  setDragging: (item: DragItem | null) => void;
  target: { key: string; zone: DropZone } | null;
  setTarget: (target: { key: string; zone: DropZone } | null) => void;
  run: (move: () => Promise<void>) => void;
}>({
  arranging: false,
  dragging: null,
  setDragging: () => {},
  target: null,
  setTarget: () => {},
  run: () => {},
});

function zoneAt(e: DragEvent<HTMLElement>, allowInside: boolean): DropZone {
  const rect = e.currentTarget.getBoundingClientRect();
  const y = (e.clientY - rect.top) / rect.height;
  if (!allowInside) return y < 0.5 ? "before" : "after";
  return y < 0.25 ? "before" : y > 0.75 ? "after" : "inside";
}

// Drag-and-drop props for a tree row, plus the drop indicator and grip to render in it.
function useArrangeRow(
  key: string,
  item: DragItem,
  zoneFor: (e: DragEvent<HTMLDivElement>, dragging: DragItem) => DropZone | null,
  onDrop: (zone: DropZone, dragging: DragItem) => Promise<void>
) {
  const { arranging, dragging, setDragging, target, setTarget, run } = useContext(ArrangeContext);
  if (!arranging) return { rowProps: {}, indicator: null, grip: null, insideActive: false };

  const zone = target?.key === key ? target.zone : null;
  return {
    rowProps: {
      draggable: true,
      onDragStart: (e: DragEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        setDragging(item);
      },
      onDragEnd: () => {
        setDragging(null);
        setTarget(null);
      },
      onDragOver: (e: DragEvent<HTMLDivElement>) => {
        const z = dragging && zoneFor(e, dragging);
        if (!z) return;
        e.preventDefault();
        e.stopPropagation();
        if (zone !== z) setTarget({ key, zone: z });
      },
      onDrop: (e: DragEvent<HTMLDivElement>) => {
        const z = dragging && zoneFor(e, dragging);
        e.preventDefault();
        e.stopPropagation();
        const moved = dragging;
        setDragging(null);
        setTarget(null);
        if (z && moved) run(() => onDrop(z, moved));
      },
    },
    indicator:
      zone === "before" || zone === "after" ? (
        <span
          className={`pointer-events-none absolute inset-x-1 h-0.5 rounded bg-brand-500 ${
            zone === "before" ? "top-0" : "bottom-0"
          }`}
        />
      ) : null,
    grip: <GripVertical size={12} className="ms-1 shrink-0 cursor-grab text-slate-300" />,
    insideActive: zone === "inside",
  };
}

function ClassRow({
  className,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  className: string;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (editing) {
    return (
      <RenameInline
        initialValue={className}
        onSave={async (name) => {
          await onRename(name);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="group flex items-center rounded-md">
      <button
        onClick={onSelect}
        className={`flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-start transition ${
          active
            ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm shadow-brand-600/30"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        <Users size={13} className={active ? "text-white" : "text-slate-400"} />
        <span className="truncate">{className}</span>
      </button>
      <RowActionButton
        title="إعادة تسمية الفصل"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
      >
        <Pencil size={12} />
      </RowActionButton>
      <RowActionButton
        title="حذف الفصل"
        variant="danger"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmingDelete(true);
        }}
      >
        <Trash2 size={12} />
      </RowActionButton>

      {confirmingDelete && (
        <ConfirmDeleteDialog
          title="حذف الفصل؟"
          message={`سيتم حذف "${className}". سيبقى طلابه ولكن بدون فصل.`}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={onDelete}
        />
      )}
    </div>
  );
}

// Levels nest (e.g. الصف الثاني الثانوي > البكالوريا المصرية > الطب وعلوم الحياة); a level with
// sub-levels is a group, and only leaves are a student's Position.
function LevelRow({
  stage,
  level,
  selection,
  onSelect,
}: {
  stage: ClassStage;
  level: ClassLevel;
  selection: ClassSelection;
  onSelect: (selection: ClassSelection) => void;
}) {
  const { createLevel, createClass, renameLevel, deleteLevel, renameClass, deleteClass, moveLevel } = useClasses();
  const [open, setOpen] = useState(level.depth === 0);
  const [addingChild, setAddingChild] = useState(false);
  const [addingClass, setAddingClass] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const active = selection.type === "level" && selection.levelId === level.id;
  const children = stage.levels.filter((l) => l.parent_id === level.id);
  // Classes only exist on leaves, and only show while SHOW_EXTENDED_FEATURES is on.
  const showClasses = SHOW_EXTENDED_FEATURES && children.length === 0;
  const expandable = children.length > 0 || showClasses || addingChild;
  const arrange = useArrangeRow(
    `level-${level.id}`,
    { kind: "level", id: level.id, stageId: stage.id },
    (e, dragging) => {
      if (dragging.kind !== "level") return null;
      // A level can't be dropped on itself or anywhere inside its own branch.
      if (dragging.stageId === stage.id && levelAndDescendants(stage.levels, dragging.id).some((l) => l.id === level.id)) {
        return null;
      }
      return zoneAt(e, true);
    },
    async (zone, dragging) => {
      if (zone === "inside") {
        setOpen(true);
        return moveLevel(dragging.id, stage.id, level.id, null);
      }
      const siblings = stage.levels.filter((l) => l.parent_id === level.parent_id && l.id !== dragging.id);
      const beforeId =
        zone === "before" ? level.id : siblings[siblings.findIndex((l) => l.id === level.id) + 1]?.id ?? null;
      return moveLevel(dragging.id, stage.id, level.parent_id, beforeId);
    }
  );

  if (editing) {
    return (
      <RenameInline
        initialValue={level.level}
        onSave={async (name) => {
          await renameLevel(level.id, name);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div>
      <div
        {...arrange.rowProps}
        className={`group relative flex items-center rounded-md transition ${
          active ? "bg-gradient-to-r from-brand-50 to-brand-100/60 shadow-sm" : "hover:bg-slate-100"
        } ${arrange.insideActive ? "ring-2 ring-brand-400" : ""}`}
      >
        {arrange.indicator}
        {arrange.grip}
        <button
          onClick={() => {
            setOpen((o) => !o);
            onSelect({ type: "level", stage: stage.stage, level: level.path, levelId: level.id });
          }}
          className={`flex flex-1 items-center gap-1 px-2 py-1.5 text-start ${
            active ? "font-medium text-brand-700" : children.length > 0 ? "text-slate-700" : "text-slate-600"
          }`}
        >
          {expandable ? (
            open ? (
              <ChevronDown size={13} />
            ) : (
              <ChevronRight size={13} className="rtl:-scale-x-100" />
            )
          ) : (
            <span className="w-[13px] shrink-0" />
          )}
          <span className="truncate">{level.level}</span>
        </button>
        <RowActionButton
          title={`إضافة فرع داخل ${level.level}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
            setAddingChild(true);
          }}
        >
          <Plus size={13} />
        </RowActionButton>
        {showClasses && (
          <RowActionButton
            title={`إضافة فصل في ${level.level}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
              setAddingClass(true);
            }}
          >
            <Users size={12} />
          </RowActionButton>
        )}
        <RowActionButton
          title="إعادة تسمية"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          <Pencil size={12} />
        </RowActionButton>
        <RowActionButton
          title="حذف"
          variant="danger"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmingDelete(true);
          }}
        >
          <Trash2 size={12} />
        </RowActionButton>
      </div>

      {open && expandable && (
        <div className="ms-3 border-s border-slate-200 ps-2">
          {children.map((child) => (
            <LevelRow key={child.id} stage={stage} level={child} selection={selection} onSelect={onSelect} />
          ))}
          {addingChild && (
            <AddInline
              placeholder="اسم الفرع الجديد"
              onAdd={(name) => createLevel(stage.id, name, level.id)}
              onDone={() => setAddingChild(false)}
            />
          )}
          {showClasses &&
            level.classes.map((cls) => (
              <ClassRow
                key={cls.id}
                className={cls.className}
                active={selection.type === "class" && selection.classId === cls.id}
                onSelect={() => onSelect({ type: "class", classId: cls.id })}
                onRename={(name) => renameClass(cls.id, name)}
                onDelete={() => deleteClass(cls.id)}
              />
            ))}
          {showClasses && addingClass && (
            <AddInline
              placeholder="اسم الفصل الجديد"
              onAdd={(name) => createClass(level.id, name)}
              onDone={() => setAddingClass(false)}
            />
          )}
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDeleteDialog
          title={`حذف "${level.level}"؟`}
          message={
            children.length > 0
              ? `سيتم حذف "${level.level}" وكل ما بداخله. سيبقى الطلاب ولكن بدون تسكين.`
              : `سيتم حذف "${level.level}". سيبقى طلابه ولكن بدون تسكين.`
          }
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => deleteLevel(level.id)}
        />
      )}
    </div>
  );
}

function StageRow({
  stage,
  nextStageId,
  selection,
  onSelect,
}: {
  stage: ClassStage;
  nextStageId: number | null;
  selection: ClassSelection;
  onSelect: (selection: ClassSelection) => void;
}) {
  const { createLevel, renameStage, deleteStage, moveStage, moveLevel } = useClasses();
  const [open, setOpen] = useState(true);
  const arrange = useArrangeRow(
    `stage-${stage.id}`,
    { kind: "stage", id: stage.id },
    (e, dragging) => {
      if (dragging.kind === "level") return "inside";
      return dragging.id === stage.id ? null : zoneAt(e, false);
    },
    async (zone, dragging) => {
      if (dragging.kind === "level") {
        setOpen(true);
        return moveLevel(dragging.id, stage.id, null, null);
      }
      const beforeId = zone === "before" ? stage.id : nextStageId === dragging.id ? null : nextStageId;
      return moveStage(dragging.id, beforeId);
    }
  );
  const [addingLevel, setAddingLevel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const active = selection.type === "stage" && selection.stage === stage.stage;

  if (editing) {
    return (
      <div className="ms-2">
        <RenameInline
          initialValue={stage.stage}
          onSave={async (name) => {
            await renameStage(stage.id, name);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="ms-2">
      <div
        {...arrange.rowProps}
        className={`group relative flex items-center rounded-md transition ${
          active ? "bg-gradient-to-r from-brand-50 to-brand-100/60 shadow-sm" : "hover:bg-slate-100"
        } ${arrange.insideActive ? "ring-2 ring-brand-400" : ""}`}
      >
        {arrange.indicator}
        {arrange.grip}
        <button
          onClick={() => {
            setOpen((o) => !o);
            onSelect({ type: "stage", stage: stage.stage });
          }}
          className={`flex flex-1 items-center gap-1 px-2 py-1.5 text-start ${
            active ? "font-medium text-brand-700" : "text-slate-700"
          }`}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} className="rtl:-scale-x-100" />}
          <span className="truncate" dir="rtl">
            {stage.stage}
          </span>
        </button>
        <RowActionButton
          title={`إضافة صف في ${stage.stage}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
            setAddingLevel(true);
          }}
        >
          <Plus size={13} />
        </RowActionButton>
        <RowActionButton
          title="إعادة تسمية المرحلة"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          <Pencil size={12} />
        </RowActionButton>
        <RowActionButton
          title="حذف المرحلة"
          variant="danger"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmingDelete(true);
          }}
        >
          <Trash2 size={12} />
        </RowActionButton>
      </div>

      {open && (
        <div className="ms-3 border-s border-slate-200 ps-2">
          {stage.levels.filter((level) => level.parent_id === null).map((level) => (
            <LevelRow key={level.id} stage={stage} level={level} selection={selection} onSelect={onSelect} />
          ))}
          {addingLevel && (
            <AddInline
              placeholder="اسم الصف الجديد"
              onAdd={(name) => createLevel(stage.id, name)}
              onDone={() => setAddingLevel(false)}
            />
          )}
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDeleteDialog
          title="حذف المرحلة؟"
          message={`سيتم حذف "${stage.stage}" وكل ما بداخلها. سيبقى طلابها ولكن بدون تسكين.`}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => deleteStage(stage.id)}
        />
      )}
    </div>
  );
}

export default function ClassTree({
  collapsed = false,
  onToggleCollapsed,
}: {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const { tree, selection, setSelection, createStage } = useClasses();
  const [addingStage, setAddingStage] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [target, setTarget] = useState<{ key: string; zone: DropZone } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const run = (move: () => Promise<void>) => {
    setMoveError(null);
    move().catch((err) => setMoveError(err instanceof Error ? err.message : "تعذّر النقل."));
  };

  return (
    <ArrangeContext.Provider value={{ arranging, dragging, setDragging, target, setTarget, run }}>
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
            <Layers size={11} />
          </span>
          {!collapsed && <span className="flex-1 truncate">الهيكل</span>}
          {!collapsed && (
            <button
              type="button"
              onClick={() => {
                setArranging((a) => !a);
                setMoveError(null);
              }}
              title={arranging ? "إنهاء تعديل الترتيب" : "تعديل الترتيب بالسحب والإفلات"}
              className={`shrink-0 rounded-md p-1 transition ${
                arranging ? "bg-brand-100 text-brand-700" : "text-slate-400 hover:bg-brand-50 hover:text-brand-600"
              }`}
            >
              <ArrowUpDown size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={collapsed ? "توسيع اللوحة" : "طي اللوحة"}
            className="ms-auto shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
          >
            <Menu size={14} />
          </button>
        </div>

        {!collapsed && arranging && (
          <div className="border-b border-slate-200 bg-brand-50/60 px-3 py-1.5 text-[11px] text-brand-700">
            اسحب أي مرحلة أو فرع لتغيير مكانه. أفلته على منتصف عنصر لنقله داخله.
            {moveError && <div className="mt-1 text-red-600">{moveError}</div>}
          </div>
        )}

        {!collapsed && (
          <div className="flex-1 overflow-y-auto px-1.5 py-2 text-sm">
            <div className="group mb-1 flex items-center rounded-md">
              <button
                onClick={() => setSelection({ type: "all" })}
                className={`flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-start font-medium transition ${
                  selection.type === "all"
                    ? "bg-gradient-to-r from-brand-50 to-brand-100/60 text-brand-700 shadow-sm"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <School size={15} className="text-brand-600" />
                المراحل
              </button>
              <button
                type="button"
                onClick={() => setAddingStage(true)}
                title="إضافة مرحلة"
                className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
              >
                <Plus size={14} />
              </button>
            </div>

            {addingStage && (
              <AddInline placeholder="اسم المرحلة الجديدة" onAdd={createStage} onDone={() => setAddingStage(false)} />
            )}

            {tree.map((stageNode, i) => (
              <StageRow
                key={stageNode.id}
                stage={stageNode}
                nextStageId={tree[i + 1]?.id ?? null}
                selection={selection}
                onSelect={setSelection}
              />
            ))}
          </div>
        )}
      </div>
    </ArrangeContext.Provider>
  );
}
