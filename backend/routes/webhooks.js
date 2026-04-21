import { Router } from "express";
import { getBoss as realGetBoss } from "../lib/pgboss.js";
import { prisma } from "../lib/prisma.js";

let getBoss = realGetBoss;
export function __setBossImpl(impl) { getBoss = impl; }

let _webhookSecret = null;
export function __setWebhookSecret(s) { _webhookSecret = s; }
function getWebhookSecret() { return _webhookSecret ?? process.env.INSTANTLY_WEBHOOK_SECRET; }

const router = Router();

router.post("/instantly", async (req, res, next) => {
  try {
    const secret = req.headers["x-webhook-secret"];
    if (!secret || secret !== getWebhookSecret()) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const { event, event_type, lead_email, body, received_at } = req.body || {};
    const eventName = event_type || event;

    if (eventName === "email_sent") {
      const lead = await prisma.lead.findFirst({ where: { email: lead_email } });
      if (lead && lead.status === "NEW") {
        await prisma.lead.update({ where: { id: lead.id }, data: { status: "CONTACTED" } });
      }
      return res.json({ ok: true });
    }

    if (eventName !== "reply_received") return res.json({ ok: true });

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
