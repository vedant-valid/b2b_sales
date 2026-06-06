import { Router } from "express";
import { z } from "zod";
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
    const { campaignId, status, hasSentEmail } = req.query;
    const where = {};
    if (campaignId) where.campaignId = campaignId;
    if (status) where.status = status;
    if (hasSentEmail === "true") where.emails = { some: { status: "SENT" } };
    const leads = await prisma.lead.findMany({
      where,
      include: {
        _count: { select: { emails: true, replies: true } },
        campaign: { select: { mode: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 500
    });
    res.json({ leads });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: { emails: { orderBy: { createdAt: "desc" } }, replies: { orderBy: { receivedAt: "desc" } } }
    });
    if (!lead) return res.status(404).json({ error: "not_found" });
    res.json({ lead });
  } catch (e) { next(e); }
});

router.get("/:id/thread", async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: {
        emails: { where: { status: "SENT" }, orderBy: { sentAt: "asc" } },
        replies: { orderBy: { receivedAt: "asc" } }
      }
    });
    if (!lead) return res.status(404).json({ error: "not_found" });
    const messages = [
      ...lead.emails.map(e => ({
        id: e.id,
        direction: "outbound",
        subject: e.subject,
        body: e.body,
        timestamp: e.sentAt || e.createdAt
      })),
      ...lead.replies.map(r => ({
        id: r.id,
        direction: "inbound",
        body: r.body,
        timestamp: r.receivedAt,
        sentiment: r.sentiment
      }))
    ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    res.json({ messages });
  } catch (e) { next(e); }
});

router.post("/:id/reply", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const { body } = req.body || {};
    if (!body || !body.trim()) return res.status(400).json({ error: "missing_body" });
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: { campaign: { select: { instantlyCampaignId: true } } }
    });
    if (!lead) return res.status(404).json({ error: "not_found" });
    if (!lead.email) return res.status(422).json({ error: "lead_has_no_email" });
    if (!lead.campaign.instantlyCampaignId) return res.status(409).json({ error: "campaign_not_dispatched" });
    await instantly.sendSubsequence(lead.campaign.instantlyCampaignId, lead.email, body.trim());
    await prisma.email.create({
      data: {
        leadId: lead.id,
        subject: "Re:",
        body: body.trim(),
        status: "SENT",
        sentAt: new Date()
      }
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

const patchSchema = z.object({
  status: z.enum(["NEW","CONTACTED","REPLIED","INTERESTED","NOT_INTERESTED","NEUTRAL","CONVERTIBLE","SKIPPED"]).optional(),
  notes: z.string().optional()
});

router.patch("/:id", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const lead = await prisma.lead.update({ where: { id: req.params.id }, data: parsed.data });
    res.json({ lead });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "not_found" });
    next(e);
  }
});

export default router;
