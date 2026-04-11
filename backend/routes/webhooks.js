import { Router } from "express";
import { getBoss } from "../lib/pgboss.js";

const router = Router();

router.post("/instantly", async (req, res, next) => {
  try {
    const secret = req.headers["x-webhook-secret"];
    if (!secret || secret !== process.env.INSTANTLY_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const { event, lead_email, body, received_at } = req.body || {};
    if (event !== "reply_received") return res.json({ ok: true });

    const boss = await getBoss();
    const jobId = await boss.send("process-reply", {
      leadEmail: lead_email,
      body,
      receivedAt: received_at
    });
    res.status(202).json({ jobId });
  } catch (e) { next(e); }
});

export default router;
