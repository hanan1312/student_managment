import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth";
import { requireModule } from "../permissions";
import { recordHeartbeat, listPresence } from "../presence";

export const presenceRouter = Router();

presenceRouter.post("/heartbeat", requireAuth, (req: AuthedRequest, res) => {
  recordHeartbeat(req.user!.username, Boolean(req.body?.idle));
  res.status(204).send();
});

presenceRouter.get("/", requireAuth, requireModule("control"), (_req, res) => {
  res.json({ presence: listPresence() });
});
