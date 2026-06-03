import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { sendFollowUp as realSendFollowUp } from "../services/mailer.js";

let mailer = { sendFollowUp: realSendFollowUp };
export function __setMailerImpl(impl) { mailer = impl; }

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const { sentiment, campaignId } = req.query;
    const where = { approvedAt: null };
    if (sentiment) where.sentiment = sentiment;
    if (campaignId) where.lead = { campaignId };
    const replies = await prisma.reply.findMany({
      where,
      include: { lead: true },
      orderBy: { receivedAt: "desc" },
      take: 500
    });
    // Deduplicate by (lead email, body, receivedAt) — same person may exist as a
    // lead in multiple campaigns, producing duplicate reply rows for one actual reply.
    const seen = new Set();
    const deduped = replies.filter(r => {
      const key = `${r.lead.email}:${r.body}:${r.receivedAt.toISOString()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    res.json({ replies: deduped });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const reply = await prisma.reply.findUnique({
      where: { id: req.params.id },
      include: { lead: { include: { campaign: true } } }
    });
    if (!reply) return res.status(404).json({ error: "not_found" });
    res.json({ reply });
  } catch (e) { next(e); }
});

router.post("/:id/approve", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const reply = await prisma.reply.findUnique({
      where: { id: req.params.id },
      include: { lead: { include: { emails: { orderBy: { createdAt: "asc" }, take: 1 } } } }
    });
    if (!reply) return res.status(404).json({ error: "not_found" });

    const { body } = req.body || {};
    const outgoing = body || reply.draftFollowUp;
    if (!outgoing) return res.status(400).json({ error: "missing_body" });

    const originalSubject = reply.lead.emails[0]?.subject ?? "Follow-up";
    const followUpSubject = originalSubject.startsWith("Re:") ? originalSubject : `Re: ${originalSubject}`;

    await mailer.sendFollowUp({ to: reply.lead.email, subject: followUpSubject, body: outgoing });

    await prisma.reply.update({
      where: { id: reply.id },
      data: { approvedAt: new Date() }
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
