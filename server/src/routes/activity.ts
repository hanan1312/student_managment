import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";

export const activityRouter = Router();

activityRouter.get("/", requireAuth, requireModule("control"), (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const rows = db.prepare("SELECT * FROM activity_log ORDER BY id DESC LIMIT ?").all(limit);
  res.json({ activity: rows });
});
