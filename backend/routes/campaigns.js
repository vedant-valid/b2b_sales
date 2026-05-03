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
  rawGoal: z.string().min(5),
  mode: z.enum(["OUTREACH", "TEST"]).default("OUTREACH"),
  testEmails: z.array(z.string().email()).optional()
});

function parseNameFromEmail(email) {
  const prefix = email.split("@")[0];
  const parts = prefix.split(/[._-]/);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return parts.length >= 2
    ? { firstName: cap(parts[0]), lastName: cap(parts[1]) }
    : { firstName: cap(parts[0]), lastName: "Demo" };
}

function extractTitleFromGoal(rawGoal) {
  if (!rawGoal) return null;
  const patterns = [
    /\b(head of [\w\s]{2,30})/i,
    /\b(director of [\w\s]{2,30})/i,
    /\b(vp of [\w\s]{2,30})/i,
    /\b(vice president of [\w\s]{2,30})/i,
    /\b(manager of [\w\s]{2,30})/i,
    /\b([\w]+\s+manager)\b/i,
    /\b([\w]+\s+director)\b/i,
    /\b(cto|ceo|cfo|coo|cmo|cpo)\b/i,
    /\b(co-?founder|founder)\b/i,
  ];
  for (const pattern of patterns) {
    const match = rawGoal.match(pattern);
    if (match) {
      return match[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return null;
}

router.post("/", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const { name, rawGoal, mode, testEmails } = parsed.data;

    // TEST campaigns skip Gemini entirely — no Lusha filters needed
    if (mode === "TEST") {
      const campaign = await prisma.campaign.create({
        data: { name, rawGoal, extractedFilters: null, mode, createdById: req.user.sub }
      });
      if (testEmails?.length) {
        const title = extractTitleFromGoal(rawGoal) || "Staff";
        for (const email of testEmails) {
          const { firstName, lastName } = parseNameFromEmail(email);
          await prisma.lead.create({
            data: {
              lushaPersonId: `test-${campaign.id}-${email}`,
              firstName,
              lastName,
              email,
              title,
              company: "Newton School",
              campaignId: campaign.id
            }
          });
        }
      }
      return res.status(201).json({ campaign });
    }

    // OUTREACH — unchanged
    const brandDoc = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    const extraction = await extract(rawGoal, { brandDoc: brandDoc?.content ?? null });
    if (extraction.needsClarification) {
      return res.status(422).json({ error: "needs_clarification", clarification: extraction.clarification });
    }
    const campaign = await prisma.campaign.create({
      data: { name, rawGoal, extractedFilters: extraction.filters, mode, createdById: req.user.sub }
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

    // TEST campaigns with pre-seeded leads skip Lusha and go straight to email generation
    if (campaign.mode === "TEST") {
      const leads = await prisma.lead.findMany({
        where: { campaignId: campaign.id, email: { not: null } }
      });
      if (leads.length > 0) {
        await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "RUNNING" } });
        for (const lead of leads) {
          await boss.send("generate-email", { leadId: lead.id, autoDispatch: true });
        }
        return res.json({ jobId: null });
      }
    }

    // OUTREACH (or TEST with no pre-seeded leads) — unchanged
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

const approveLeadsSchema = z.object({
  approvedIds: z.array(z.string()).optional()
});

router.post("/:id/approve-leads", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.status !== "AWAITING_LEAD_APPROVAL") return res.status(409).json({ error: "invalid_status" });

    const parsed = approveLeadsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const { approvedIds } = parsed.data;

    const allLeads = await prisma.lead.findMany({
      where: { campaignId: campaign.id, email: { not: null } }
    });

    let leadsToProcess;
    if (approvedIds !== undefined) {
      const toSkip = allLeads.filter(l => !approvedIds.includes(l.id)).map(l => l.id);
      if (toSkip.length > 0) {
        await prisma.lead.updateMany({ where: { id: { in: toSkip } }, data: { status: "SKIPPED" } });
      }
      leadsToProcess = allLeads.filter(l => approvedIds.includes(l.id) && l.status !== "SKIPPED");
    } else {
      leadsToProcess = allLeads.filter(l => l.status !== "SKIPPED");
    }

    if (leadsToProcess.length === 0) {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "DRAFT" } });
      return res.status(409).json({ error: "no_leads_with_email" });
    }

    const boss = await getBoss();
    for (const lead of leadsToProcess) {
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

// Sync lead statuses: marks NEW leads as CONTACTED if their email was already sent (webhook missed)
router.post("/:id/sync-lead-status", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });

    // Find leads that are still NEW but have a SENT email
    const staleLeads = await prisma.lead.findMany({
      where: {
        campaignId: campaign.id,
        status: "NEW",
        emails: { some: { status: "SENT" } }
      },
      select: { id: true }
    });

    if (staleLeads.length === 0) return res.json({ updated: 0 });

    const ids = staleLeads.map(l => l.id);
    await prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: { status: "CONTACTED" }
    });

    res.json({ updated: ids.length });
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

const addTestLeadSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional().default("Test"),
  lastName:  z.string().optional().default("Recipient"),
});

router.post("/:id/add-test-lead", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ error: "not_found" });
    if (campaign.mode !== "TEST") return res.status(409).json({ error: "only_for_test_campaigns" });

    const parsed = addTestLeadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input", detail: parsed.error.flatten() });
    const { email, firstName, lastName } = parsed.data;

    const existing = await prisma.lead.findFirst({ where: { campaignId: campaign.id, email } });
    if (existing) return res.status(409).json({ error: "email_already_in_campaign" });

    const lead = await prisma.lead.create({
      data: { firstName, lastName, email, title: "Test Recipient", company: "—", campaignId: campaign.id }
    });

    const boss = await getBoss();
    await boss.send("generate-email", { leadId: lead.id, autoDispatch: true });

    res.status(201).json({ lead });
  } catch (e) { next(e); }
});

export default router;
