import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { sendSubsequence as realSendSubsequence } from "../services/instantly.js";

let instantly = { sendSubsequence: realSendSubsequence };
export function __setInstantlyImpl(impl) { instantly = impl; }

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const { sentiment, campaignId } = req.query;
    const where = {};
    if (sentiment) where.sentiment = sentiment;
    if (campaignId) where.lead = { campaignId };
    const replies = await prisma.reply.findMany({
      where,
      include: { lead: true },
      orderBy: { receivedAt: "desc" },
      take: 500
    });
    res.json({ replies });
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
      include: { lead: { include: { campaign: true } } }
    });
    if (!reply) return res.status(404).json({ error: "not_found" });
    const { body } = req.body || {};
    const outgoing = body || reply.draftFollowUp;
    if (!outgoing) return res.status(400).json({ error: "missing_body" });
    const cmpId = reply.lead.campaign.instantlyCampaignId;
    if (!cmpId) return res.status(409).json({ error: "campaign_not_dispatched" });
    await instantly.sendSubsequence(cmpId, reply.lead.email, outgoing);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
