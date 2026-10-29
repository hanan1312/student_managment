import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";
import type { ClassLevel, ClassStage } from "../lib/types";

export type ClassSelection =
  | { type: "all" }
  | { type: "stage"; stage: string }
  // level: the level's path, for labels; levelId identifies it (names repeat, e.g. "شعبة علمي").
  | { type: "level"; stage: string; level: string; levelId: number }
  | { type: "class"; classId: number };

type ClassesContextValue = {
  tree: ClassStage[];
  loading: boolean;
  selection: ClassSelection;
  setSelection: (selection: ClassSelection) => void;
  selectedClassIds: number[] | null;
  // Levels in the selected stage/level, for filtering students by Position (null: no filter,
  // or a single class is selected).
  selectedLevelIds: number[] | null;
  selectedClassId: number | null;
  setSelectedClassId: (id: number | null) => void;
  selectedClassName: string | null;
  createStage: (name: string) => Promise<void>;
  createLevel: (stageId: number, name: string, parentId?: number) => Promise<void>;
  createClass: (levelId: number, name: string) => Promise<void>;
  renameStage: (stageId: number, name: string) => Promise<void>;
  deleteStage: (stageId: number) => Promise<void>;
  renameLevel: (levelId: number, name: string) => Promise<void>;
  deleteLevel: (levelId: number) => Promise<void>;
  moveStage: (stageId: number, beforeId: number | null) => Promise<void>;
  // parentId null: directly under the stage; beforeId null: last among the new siblings.
  moveLevel: (levelId: number, stageId: number, parentId: number | null, beforeId: number | null) => Promise<void>;
  renameClass: (classId: number, name: string) => Promise<void>;
  deleteClass: (classId: number) => Promise<void>;
};

const ClassesContext = createContext<ClassesContextValue | null>(null);

// A level plus everything nested under it (levels arrive flat with parent_id).
export function levelAndDescendants(levels: ClassLevel[], levelId: number): ClassLevel[] {
  const out = levels.filter((l) => l.id === levelId);
  for (let i = 0; i < out.length; i++) out.push(...levels.filter((l) => l.parent_id === out[i].id));
  return out;
}

// Every place a student can be placed: the leaves, labelled with their full path.
export function positionOptions(tree: ClassStage[]) {
  return tree.map((stage) => ({
    stageId: stage.id,
    stage: stage.stage,
    levels: stage.levels.filter((l) => l.is_leaf),
  }));
}

export function ClassesProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [tree, setTree] = useState<ClassStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<ClassSelection>({ type: "all" });

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .getClasses(token)
      .then((res) => setTree(res.tree))
      .catch(() => setTree([]))
      .finally(() => setLoading(false));
  }, [token]);

  const selectedClassIds = useMemo(() => {
    if (selection.type === "all") return null;
    if (selection.type === "class") return [selection.classId];
    if (selection.type === "stage") {
      return tree
        .filter((s) => s.stage === selection.stage)
        .flatMap((s) => s.levels.flatMap((l) => l.classes.map((c) => c.id)));
    }
    return tree
      .filter((s) => s.stage === selection.stage)
      .flatMap((s) => levelAndDescendants(s.levels, selection.levelId).flatMap((l) => l.classes.map((c) => c.id)));
  }, [tree, selection]);

  const selectedLevelIds = useMemo(() => {
    if (selection.type === "all" || selection.type === "class") return null;
    return tree
      .filter((s) => s.stage === selection.stage)
      .flatMap((s) => (selection.type === "stage" ? s.levels : levelAndDescendants(s.levels, selection.levelId)).map((l) => l.id));
  }, [tree, selection]);

  const selectedClassId = selection.type === "class" ? selection.classId : null;

  const selectedClassName = useMemo(() => {
    if (selectedClassId == null) return null;
    for (const stage of tree) {
      for (const level of stage.levels) {
        const found = level.classes.find((c) => c.id === selectedClassId);
        if (found) return found.className;
      }
    }
    return null;
  }, [tree, selectedClassId]);

  const setSelectedClassId = (id: number | null) => {
    setSelection(id == null ? { type: "all" } : { type: "class", classId: id });
  };

  const createStage = async (name: string) => {
    if (!token) return;
    const res = await api.createStage(token, name);
    setTree(res.tree);
  };

  const createLevel = async (stageId: number, name: string, parentId?: number) => {
    if (!token) return;
    const res = await api.createLevel(token, stageId, name, parentId);
    setTree(res.tree);
  };

  const createClass = async (levelId: number, name: string) => {
    if (!token) return;
    const res = await api.createClass(token, levelId, name);
    setTree(res.tree);
  };

  const renameStage = async (stageId: number, name: string) => {
    if (!token) return;
    const res = await api.renameStage(token, stageId, name);
    setTree(res.tree);
  };

  const deleteStage = async (stageId: number) => {
    if (!token) return;
    const res = await api.deleteStage(token, stageId);
    setTree(res.tree);
    setSelection({ type: "all" });
  };

  const renameLevel = async (levelId: number, name: string) => {
    if (!token) return;
    const res = await api.renameLevel(token, levelId, name);
    setTree(res.tree);
  };

  const deleteLevel = async (levelId: number) => {
    if (!token) return;
    const res = await api.deleteLevel(token, levelId);
    setTree(res.tree);
    setSelection({ type: "all" });
  };

  const moveStage = async (stageId: number, beforeId: number | null) => {
    if (!token) return;
    const res = await api.moveStage(token, stageId, beforeId);
    setTree(res.tree);
  };

  const moveLevel = async (levelId: number, stageId: number, parentId: number | null, beforeId: number | null) => {
    if (!token) return;
    const res = await api.moveLevel(token, levelId, stageId, parentId, beforeId);
    setTree(res.tree);
    // The selected level's path (and maybe stage) can change with the move; refresh its labels.
    setSelection((current) => {
      if (current.type !== "level") return current;
      for (const stage of res.tree as ClassStage[]) {
        const level = stage.levels.find((l) => l.id === current.levelId);
        if (level) return { type: "level", stage: stage.stage, level: level.path, levelId: level.id };
      }
      return { type: "all" };
    });
  };

  const renameClass = async (classId: number, name: string) => {
    if (!token) return;
    const res = await api.renameClass(token, classId, name);
    setTree(res.tree);
  };

  const deleteClass = async (classId: number) => {
    if (!token) return;
    const res = await api.deleteClass(token, classId);
    setTree(res.tree);
    setSelection({ type: "all" });
  };

  const value = useMemo(
    () => ({
      tree,
      loading,
      selection,
      setSelection,
      selectedClassIds,
      selectedLevelIds,
      selectedClassId,
      setSelectedClassId,
      selectedClassName,
      createStage,
      createLevel,
      createClass,
      renameStage,
      deleteStage,
      renameLevel,
      deleteLevel,
      moveStage,
      moveLevel,
      renameClass,
      deleteClass,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, loading, selection, selectedClassIds, selectedLevelIds, selectedClassId, selectedClassName, token]
  );

  return <ClassesContext.Provider value={value}>{children}</ClassesContext.Provider>;
}

export function useClasses() {
  const ctx = useContext(ClassesContext);
  if (!ctx) throw new Error("useClasses must be used within ClassesProvider");
  return ctx;
}
