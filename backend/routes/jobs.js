import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getBoss } from "../lib/pgboss.js";

const router = Router();
router.use(requireAuth);

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
        createdOn: job.createdOn,
        completedOn: job.completedOn,
        retryCount: job.retryCount
      }
    });
  } catch (e) { next(e); }
});

export default router;
