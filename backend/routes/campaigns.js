import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { extractFilters as realExtractFilters } from "../services/prompt.js";
import { getBoss } from "../lib/pgboss.js";
import { env } from "../config/env.js";

let extract = realExtractFilters;
export function __setExtractFilters(fn) { extract = fn; }

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1),
  rawGoal: z.string().min(5)
});

router.post("/", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const brandDoc = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    const extraction = await extract(parsed.data.rawGoal, { brandDoc: brandDoc?.content ?? null });
    if (extraction.needsClarification) {
      return res.status(422).json({ error: "needs_clarification", clarification: extraction.clarification });
    }
    const campaign = await prisma.campaign.create({
      data: {
        name: parsed.data.name,
        rawGoal: parsed.data.rawGoal,
        extractedFilters: extraction.filters,
        createdById: req.user.sub
      }
    });
    res.status(201).json({ campaign });
  } catch (e) { next(e); }
});

router.get("/", async (req, res, next) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { leads: true } } }
    });
    res.json({ campaigns });
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { leads: true } } }
    });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    res.json({ campaign });
  } catch (e) { next(e); }
});

router.post("/:id/run", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status === "RUNNING") return res.status(409).json({ error: "already_running" });
    const boss = await getBoss();
    const jobId = await boss.send("fetch-leads", { campaignId: campaign.id });
    res.json({ jobId });
  } catch (e) { next(e); }
});

router.patch("/:id/pause", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.update({
      where: { id: req.params.id }, data: { status: "PAUSED" }
    });
    res.json({ campaign });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "not_found" });
    next(e);
  }
});

router.post("/:id/approve-leads", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_LEAD_APPROVAL") return res.status(409).json({ error: "invalid_status" });
    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id, email: { not: null } } });
    if (leads.length === 0) {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "DRAFT" } });
      return res.status(409).json({ error: "no_leads_with_email" });
    }
    const boss = await getBoss();
    for (const lead of leads) {
      await boss.send("generate-email", { leadId: lead.id, autoDispatch: true });
    }
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "RUNNING" } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/:id/reject-leads", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_LEAD_APPROVAL") return res.status(409).json({ error: "invalid_status" });
    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id }, select: { id: true } });
    const leadIds = leads.map(l => l.id);
    await prisma.reply.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.email.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "DRAFT" } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/:id/approve-emails", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_EMAIL_APPROVAL") return res.status(409).json({ error: "invalid_status" });
    if (campaign.instantlyCampaignId) return res.status(409).json({ error: "already_dispatched" });
    const boss = await getBoss();
    await boss.send("dispatch-to-instantly", { campaignId: campaign.id });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "RUNNING" } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/:id/reject-emails", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_EMAIL_APPROVAL") return res.status(409).json({ error: "invalid_status" });
    const leads = await prisma.lead.findMany({ where: { campaignId: campaign.id }, select: { id: true } });
    const leadIds = leads.map(l => l.id);
    await prisma.reply.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.email.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "DRAFT" } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Dev-only: seed a test lead so you can verify the full email pipeline locally
router.post("/:id/dev-seed-lead", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  if (env.DEV_MODE !== "true") return res.status(403).json({ error: "only_available_in_dev_mode" });
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    const devEmail = env.DEV_EMAIL || "madnevedant15@gmail.com";
    const existing = await prisma.lead.findFirst({ where: { campaignId: campaign.id, email: devEmail } });
    if (existing) return res.json({ lead: existing });
    const lead = await prisma.lead.create({
      data: {
        firstName: "Dev",
        lastName: "Test",
        email: devEmail,
        title: "Test Lead",
        company: "Dev Sandbox",
        campaignId: campaign.id
      }
    });
    res.status(201).json({ lead });
  } catch (e) { next(e); }
});

export default router;
