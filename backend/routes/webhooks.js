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
    const configuredSecret = getWebhookSecret();
    if (configuredSecret) {
      const secret = req.headers["x-webhook-secret"];
      if (!secret || secret !== configuredSecret) {
        return res.status(401).json({ error: "unauthorized" });
      }
    }
    const payload = req.body || {};
    const eventName = payload.event_type || payload.event;
    // Instantly v1/v2: lead_email, email, or nested lead.email
    const leadEmail = payload.lead_email || payload.email || payload.lead?.email;
    // Instantly v1/v2: reply_text, body, or nested reply.text
    const replyBody = payload.reply_text || payload.reply?.text || payload.body;
    // Instantly: timestamp, received_at, or nested reply.received_at
    const receivedAt = payload.timestamp || payload.received_at || payload.reply?.received_at || new Date().toISOString();

    if (eventName === "email_sent") {
      await prisma.lead.updateMany({
        where: { email: leadEmail, status: "NEW" },
        data: { status: "CONTACTED" }
      });
      return res.json({ ok: true });
    }

    if (eventName === "email_bounced" || eventName === "bounced") {
      await prisma.lead.updateMany({
        where: { email: leadEmail },
        data: { status: "NOT_INTERESTED" }
      });
      return res.json({ ok: true });
    }

    if (eventName === "unsubscribed" || eventName === "opt_out") {
      await prisma.lead.updateMany({
        where: { email: leadEmail },
        data: { status: "NOT_INTERESTED" }
      });
      return res.json({ ok: true });
    }

    if (eventName !== "reply_received") return res.json({ ok: true });

    const boss = await getBoss();
    const jobId = await boss.send("process-reply", {
      leadEmail,
      body: replyBody,
      receivedAt
    });
    res.status(202).json({ jobId });
  } catch (e) { next(e); }
});

export default router;
