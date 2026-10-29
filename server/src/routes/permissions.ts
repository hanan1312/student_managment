import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireAdmin, getUserRole, getUserModules, getStageScope, MODULE_KEYS, isModuleKey } from "../permissions";

export const permissionsRouter = Router();

permissionsRouter.get("/:userId", requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const role = getUserRole(userId);
  if (!role) return res.status(404).json({ error: "User not found" });

  res.json({ role, modules: getUserModules(userId, role), stageIds: getStageScope({ id: userId }) });
});

permissionsRouter.put("/:userId", requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const role = getUserRole(userId);
  if (!role) return res.status(404).json({ error: "User not found" });
  if (role === "admin") {
    return res.status(400).json({ error: "Admins always have full access — there's nothing to set" });
  }

  const modules = req.body?.modules;
  if (!Array.isArray(modules) || !modules.every((m) => typeof m === "string" && isModuleKey(m))) {
    return res.status(400).json({ error: `modules must be an array made up of: ${MODULE_KEYS.join(", ")}` });
  }

  // stageIds: null (or left out) = every stage; an array limits the user to those stages.
  const stageIds = req.body?.stageIds ?? null;
  if (stageIds !== null) {
    if (!Array.isArray(stageIds) || !stageIds.every((v) => Number.isInteger(v))) {
      return res.status(400).json({ error: "stageIds must be null or an array of stage ids" });
    }
    if (stageIds.length === 0) return res.status(400).json({ error: "اختر مرحلة واحدة على الأقل" });
  }

  const tx = db.transaction((mods: string[]) => {
    db.prepare("DELETE FROM user_permissions WHERE user_id = ?").run(userId);
    const insert = db.prepare("INSERT INTO user_permissions (user_id, module) VALUES (?, ?)");
    for (const m of mods) insert.run(userId, m);

    db.prepare("DELETE FROM user_stages WHERE user_id = ?").run(userId);
    db.prepare("UPDATE users SET stages_restricted = ? WHERE id = ?").run(stageIds === null ? 0 : 1, userId);
    const insertStage = db.prepare("INSERT OR IGNORE INTO user_stages (user_id, stage_id) VALUES (?, ?)");
    for (const s of (stageIds as number[] | null) ?? []) insertStage.run(userId, s);
  });
  tx(modules as string[]);

  res.json({ role, modules: getUserModules(userId, role), stageIds: getStageScope({ id: userId }) });
});
