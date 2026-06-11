import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { getBoss } from "../lib/pgboss.js";
import { runPollRepliesJob } from "../workers/pollReplies.js";

const router = Router();
router.use(requireAuth);

router.post("/poll-replies", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const boss = await getBoss();
    await runPollRepliesJob({}, boss);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const boss = await getBoss();
    const job = await boss.getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: "not_found" });
    res.json({
      job: {
        id: job.id,
        name: job.name,
        state: job.state,
        data: job.data,
        output: job.output ?? null,
        createdOn: job.createdOn,
        completedOn: job.completedOn,
        retryCount: job.retryCount
      }
    });
  } catch (e) { next(e); }
});

export default router;
